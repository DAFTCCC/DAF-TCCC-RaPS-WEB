(() => {
'use strict';

const RESULT_TO_DB = Object.freeze({pass:'pass',fail:'fail',nt:'not_observed',na:'not_applicable'});
const RESULT_FROM_DB = Object.freeze({pass:'pass',fail:'fail',not_observed:'nt',not_applicable:'nt'});
let busy=false;
let criteriaCache=new Map();
let timers=new Map();

const getClient=()=>window.RAPS_SUPABASE;
const getCloud=()=>window.RAPS_CLOUD;
const getStore=()=>window.RAPS_CLASS_STORE;

function permissionContext(c, action) {
  const permissions = window.RAPS_PERMISSIONS;
  if (!permissions?.snapshot || !permissions?.isCurrent || !permissions?.canClass?.(action, c)) return null;
  const identity = permissions.snapshot();
  const check = () => {
    const current = getStore()?.getClass?.(c.id);
    if (!permissions.isCurrent(identity) || !permissions.canClass(action, current || c)
      || getStore()?.isLocalCopyHidden?.(c.id) || (getStore()?.getClass && !current)) {
      throw new Error('Session or class permissions changed. Sign in and sync again.');
    }
  };
  try { check(); } catch { return null; }
  return boundRequestContext(identity, check);
}
// Each operation owns its JWT. The shared SDK may adopt another tab's
// session before the cloud identity event reaches this tab.
let requestClientId = 0;
function boundRequestContext(identity, scopeCheck) {
  const source = getClient();
  if (!source?.auth?.getSession) return null;
  let bound = null, accessToken = '', preparation = null, abandoned = false;
  const abort = () => {
    abandoned = true;
    const error = new Error('Your sign-in session changed. Sign in and sync again.');
    error.code = 'RAPS_SESSION_CHANGED';
    throw error;
  };
  const check = () => {
    if (abandoned || source !== getClient()) abort();
    scopeCheck();
  };
  const session = async () => {
    check();
    let result;
    try {result = await source.auth.getSession();} catch {abort();}
    check();
    const value = result?.data?.session;
    if (result?.error || typeof value?.access_token !== 'string' || !value.access_token.trim()
      || value.user?.id !== identity.userId
      || (value.expires_at != null && (!Number.isFinite(Number(value.expires_at)) || Number(value.expires_at) * 1000 <= Date.now()))) abort();
    return value.access_token;
  };
  const verify = async () => {
    if (!accessToken || await session() !== accessToken) abort();
    check();
  };
  const ready = () => preparation ||= (async () => {
    accessToken = await session();
    const config = window.RAPS_CLOUD_CONFIG;
    if (!config?.projectUrl || !config?.publishableKey || !window.supabase?.createClient) abort();
    bound = window.supabase.createClient(config.projectUrl, config.publishableKey, {
      auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:`raps-grading-request-${++requestClientId}`},
      global:{headers:{Authorization:`Bearer ${accessToken}`}}
    });
    await verify();
  })();
  const wrap = query => new Proxy(query, {
    get(target, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve()
        .then(verify).then(() => target)
        .then(async result => {await verify(); return result;}).then(resolve, reject);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? (...args) => {check(); return wrap(value.apply(target, args));} : value;
    }
  });
  return {identity, check, ready, verify, client:{from(table) {
    check();
    if (!bound) abort();
    return wrap(bound.from(table));
  }, rpc(name, args) {
    check();
    if (!bound) abort();
    return wrap(bound.rpc(name, args));
  }}};
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
function localGradingSignature(a) {
  const defaults = {id:'',attemptNo:1,startedAt:null,finalizedAt:null,voidedAt:null,finalResult:null,section:'',
    ratings:{},methods:{},stamps:{},ntReasons:{},failureDetails:{},observations:{},notes:{},timerForced:{},timers:{},
    events:[],instants:{},trainerSign:'',evaluatorId:'',studentSign:'',overallNotes:'',showNt:false,observeMode:true,
    remediation:null,appVersion:'',contentVersion:'',scenarioVersion:'1'};
  return JSON.stringify(canonical(Object.fromEntries(Object.entries(defaults).map(([key,value]) => [key,a?.[key] ?? value]))));
}

function canEditEvaluation(c, a, remote) {
  const userId = String(getCloud()?.user?.id || '');
  return !!userId && !!window.RAPS_PERMISSIONS?.canClass?.('evaluate', c)
    && String(remote?.evaluator_id || '') === userId
    && (!a?.cloudEvaluatorUserId || String(a.cloudEvaluatorUserId) === userId)
    && (!a?.startedByUserId || String(a.startedByUserId) === userId);
}
function classWithServerScope(c, row) {
  return {...c, created_by:row.created_by || '', cloudSync:{...c.cloudSync,createdBy:row.created_by || ''},
    localCreatedByUserId:'', cloudScope:{baseId:row.base_id, baseCode:row.bases?.code || '', majcomId:row.bases?.majcom_id || ''}};
}

async function evaluationBelongsToClass(c, s, row, client) {
  if(String(row?.participant_id || '')!==String(s?.id || '') || !row?.event_id)return false;
  const {data:event,error}=await client.from('evaluation_events').select('id,class_id').eq('id',row.event_id).maybeSingle();
  if(error)throw error;
  return !!event && String(event.class_id || '')===String(c.id);
}

function iso(ms){if(ms===null||ms===undefined||ms==='')return null;const n=Number(ms);return Number.isFinite(n)?new Date(n).toISOString():null}
function ms(v){const n=v?Date.parse(v):NaN;return Number.isFinite(n)?n:0}
function err(e){return String(e?.message||e||'Unknown sync error').slice(0,240)}
function tierFor(c){return c?.tierSnapshot||window.TCCC_TIERS?.[String(c?.tierId||'')]||null}
function allItems(t){return t?.sections?.flatMap(s=>s.items.map(i=>({...i,section:s.code})))||[]}
function score(t,a){
  const items=allItems(t);
  const pass=items.filter(i=>a.ratings?.[i.id]==='pass').length;
  const fail=items.filter(i=>a.ratings?.[i.id]==='fail').length;
  return {pass,fail,denom:pass+fail};
}
function evalStatus(a){
  if(a?.voidedAt)return 'voided';
  if(a?.finalizedAt)return 'finalized';
  return a?.startedAt?'in_progress':'draft';
}
function finalResult(a){
  if(!a?.finalizedAt||!a?.finalResult)return null;
  const x=String(a.finalResult).toLowerCase();
  return x==='pass'?'pass':x==='fail'?'fail':null;
}
function attemptState(a){a.cloudGrading=a.cloudGrading||{status:'local',error:'',lastSyncedAt:0,remoteModifiedAt:0};return a.cloudGrading}
function persist(){getStore()?.persistCloudMerge?.()}
function patchAttempt(a,patch){a.cloudGrading={...attemptState(a),...patch};persist()}
function cloneJson(value){return JSON.parse(JSON.stringify(value))}
function jsonObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
// Keep extension metadata while letting the current record map determine which
// observations/details still exist. Empty tags and false review flags remain
// deliberate local edits rather than being filled back in from the server.
function preserveRecordMetadata(current,...previous){
  return Object.fromEntries(Object.entries(jsonObject(current)).map(([key,value])=>[
    key,Object.assign({},...previous.map(map=>jsonObject(jsonObject(map)[key])),jsonObject(value))
  ]));
}
function snapshotLocalAttempt(a){
  const copy=cloneJson(a||{});
  delete copy.conflictRecoveryHistory;
  return {
    capturedAt:Date.now(),
    attempt:copy
  };
}
function saveConflictRecovery(a,inspection,strategy){
  const history=Array.isArray(a?.conflictRecoveryHistory)?a.conflictRecoveryHistory:[];
  history.push({
    capturedAt:Date.now(),
    strategy,
    local:snapshotLocalAttempt(a),
    server:cloneJson(inspection)
  });
  a.conflictRecoveryHistory=history.slice(-3);
  persist();
}
function removeLocalAttemptByEvaluationId(c,s,evaluationId){
  if(!s?.attempts||!evaluationId)return false;
  let removed=false,attemptNumber=null;
  for(const [key,attempt] of Object.entries(s.attempts)){
    if(!attempt||String(attempt.id||'')!==String(evaluationId))continue;
    if(attemptNumber===null)attemptNumber=Number(attempt.attemptNo||key||1);
    delete s.attempts[key];
    removed=true;
  }
  if(removed){
    persist();
    window.dispatchEvent(new CustomEvent('raps-evaluation-tombstoned',{detail:{
      classId:c?.id||'',
      participantId:s?.id||'',
      evaluationId:String(evaluationId),
      attemptNumber:Number(attemptNumber||1)
    }}));
  }
  return removed;
}

async function curriculumIdFor(c,client=getClient()){
  const courseMap={'1':'ASM','2':'CLS','3':'CMC','4':'CPP'};
  const t=tierFor(c),course=courseMap[String(c.tierId)];
  const {data,error}=await client.from('curriculum_versions').select('id')
    .eq('course_type',course).eq('version',t?.source||'').eq('published',true).maybeSingle();
  if(error)throw error;if(!data?.id)throw new Error('Published curriculum version not found.');
  return data.id;
}
async function criteriaFor(curriculumId,client=getClient(),check=()=>{}){
  check();
  if(criteriaCache.has(curriculumId))return criteriaCache.get(curriculumId);
  const {data,error}=await client.from('criteria')
    .select('id,criterion_code,critical,timer_required,timer_standard_ms')
    .eq('curriculum_version_id',curriculumId).eq('active',true);
  if(error)throw error;
  const byCode=new Map((data||[]).map(r=>[r.criterion_code,r]));
  const byId=new Map((data||[]).map(r=>[r.id,r]));
  const out={rows:data||[],byCode,byId};check();criteriaCache.set(curriculumId,out);return out;
}
function timerDuration(def,x){
  if(Number.isFinite(Number(x?.finalDurationMs)))return Math.round(Number(x.finalDurationMs));
  if(x?.wallStart&&x?.wallStop)return Math.max(0,Math.round(x.wallStop-x.wallStart));
  return null;
}
function timerStandardMs(def){
  if(Number.isFinite(Number(def?.seconds)))return Math.round(Number(def.seconds)*1000);
  if(Number.isFinite(Number(def?.maxSeconds)))return Math.round(Number(def.maxSeconds)*1000);
  if(Number.isFinite(Number(def?.minSeconds)))return Math.round(Number(def.minSeconds)*1000);
  return null;
}

async function pushEvaluation(c,s,a,options={}){
  const cloud=getCloud(),context=permissionContext(c,'evaluate');
  if(!getClient()||!context)return false;
  await context.ready();
  const client=context.client;
  const userId=String(cloud?.user?.id || '');
  const liveAttempt=a, uploadSignature=localGradingSignature(a);
  a=cloneJson(a);
  const forceConflict=options?.forceConflict===true;
  const expectedRemoteModifiedAt=Number(options?.expectedRemoteModifiedAt||0);
  const skipRosterSync=options?.skipRosterSync===true;
  if(!client||!cloud?.user?.id||!navigator.onLine)return false;
  if(c?.deletedAt||getStore()?.getClass?.(c?.id)?.deletedAt)return false;

  // Closed classes are server-authoritative retention records. Never write
  // grading data after closure, including from a stale browser.
  if(c?.closedAt||c?.status==='closed'){
    return false;
  }
  const {data:classRow,error:classError}=await client.from('classes')
    .select('status,created_by,base_id,bases(id,code,majcom_id)').eq('id',c.id).maybeSingle();
  if(classError)throw classError;
  if(!classRow || !window.RAPS_PERMISSIONS.canClass('evaluate',classWithServerScope(c,classRow)))return false;
  if(classRow?.status==='archived')return false;
  if(classRow?.status==='completed'){
    patchAttempt(liveAttempt,{status:'conflict',error:'Class is closed on the server. Pull authoritative state before continuing.'});
    return false;
  }

  // Terminal lifecycle is server-authoritative in v3.4.11+.
  // Criteria/timers are pushed before finalize/void; once the server marks
  // the parent terminal, background sync must not attempt a direct rewrite.
  // Exception: a field record sealed offline uploads its evidence once during
  // reconciliation, while the server row is still in progress.
  const sealedFieldUpload=options?.offlineReconcile===true&&a?.pendingServerFinalization&&!a?.voidedAt;
  if((a?.finalizedAt&&!sealedFieldUpload)||a?.voidedAt){
    return false;
  }

  if(attemptState(a).status==='conflict'&&!forceConflict){
    patchAttempt(liveAttempt,{
      status:'conflict',
      error:attemptState(a).error||'Resolve the grading conflict before syncing this evaluation.'
    });
    return false;
  }

  // Assigned evaluators can grade their claimed records without editing the
  // class event or everybody else's participant metadata. The existing server
  // evaluation, participant link, and event/class relation are verified below.
  const managesRoster=window.RAPS_PERMISSIONS.canClass('manageRoster',classWithServerScope(c,classRow));
  if(!skipRosterSync&&managesRoster&&window.RAPS_ROSTER_SYNC?.pushClassRosterAndShells){
    if(await window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(c)===false)return false;
    await context.verify();
    const store=getStore(),current=store?.getClass?.(c.id);
    if(store?.getClass&&!current)return false;
    c=current||c;
    if(c.deletedAt||c.closedAt||c.status==='closed')return false;
    const {data:latestClass,error:latestClassError}=await client.from('classes')
      .select('status,created_by,base_id,bases(id,code,majcom_id)').eq('id',c.id).maybeSingle();
    if(latestClassError)throw latestClassError;
    if(!latestClass || !window.RAPS_PERMISSIONS.canClass('evaluate',classWithServerScope(c,latestClass)))return false;
    if(latestClass?.status==='archived'||latestClass?.status==='completed')return false;
  }

  const curriculumId=await curriculumIdFor(c,client);
  context.check();
  const crit=await criteriaFor(curriculumId,client,context.check);
  context.check();
  if(!crit.rows.length)throw new Error('Supabase criteria catalog is empty for this curriculum.');

  const {data:remote,error:remoteError}=await client.from('evaluations')
    .select('id,event_id,participant_id,curriculum_version_id,status,client_modified_at,updated_at,source_device_id,evaluator_id,app_data')
    .eq('id',a.id).maybeSingle();
  if(remoteError)throw remoteError;
  if(!remote || String(remote.curriculum_version_id || '')!==String(curriculumId) || !canEditEvaluation(c,liveAttempt,remote) || ['finalized','voided'].includes(String(remote.status)))return false;
  if(!await evaluationBelongsToClass(c,s,remote,client))return false;
  context.check();

  const localMs=Number(a.modifiedAt||a.startedAt||Date.now());
  const remoteMs=ms(remote?.client_modified_at||remote?.updated_at);
  const lastSeen=Number(attemptState(a).remoteModifiedAt||0);
  // A LOCAL conflict winner is a new authoritative revision, not a replay of
  // the older offline timestamp. Publish it strictly after both branches so
  // every other device can observe and pull the chosen winner.
  const publishMs=forceConflict
    ? Math.max(Date.now(),localMs+1,remoteMs+1,expectedRemoteModifiedAt+1)
    : localMs;

  if(forceConflict&&expectedRemoteModifiedAt&&Math.abs(remoteMs-expectedRemoteModifiedAt)>10){
    patchAttempt(liveAttempt,{
      status:'conflict',
      error:'Cloud evaluation changed again while resolving the conflict. Review the latest server version before choosing again.',
      remoteModifiedAt:remoteMs
    });
    return false;
  }

  if(!forceConflict&&remote&&remote.source_device_id&&remote.source_device_id!==getStore()?.deviceId?.()&&remoteMs>localMs+1000&&remoteMs>lastSeen+1000){
    patchAttempt(liveAttempt,{status:'conflict',error:'Newer cloud evaluation exists. Pull before overwriting.',remoteModifiedAt:remoteMs});
    return false;
  }

  patchAttempt(liveAttempt,{status:'syncing',error:''});
  const t=tierFor(c),sc=score(t,a);
  const cachedApp=jsonObject(a.cloudAppData),remoteApp=jsonObject(remote?.app_data);
  const failureDetails=preserveRecordMetadata(a.failureDetails,cachedApp.failureDetails,remoteApp.failureDetails);
  const observations=preserveRecordMetadata(a.observations,cachedApp.observations,remoteApp.observations);
  const {data:existingCrit,error:existingCritError}=await client.from('criterion_results')
    .select('id,criterion_id,app_data').eq('evaluation_id',a.id);
  if(existingCritError)throw existingCritError;
  const existingCritById=new Map((existingCrit||[]).map(r=>[r.criterion_id,r]));

  const criterionRows=[];
  const currentCriterionIds=new Set();
  for(const [code,rating] of Object.entries(a.ratings||{})){
    const cr=crit.byCode.get(code),dbResult=RESULT_TO_DB[rating];
    if(!cr||!dbResult){
      patchAttempt(liveAttempt,{status:'error',error:'A local rating does not match the published criteria catalog. Pull the current curriculum before syncing.'});
      return false;
    }
    currentCriterionIds.add(cr.id);
    const previousApp=jsonObject(existingCritById.get(cr.id)?.app_data);
    const fd={...jsonObject(previousApp.failureDetail),...jsonObject(failureDetails[code])};
    if(rating==='fail')failureDetails[code]=fd;
    criterionRows.push({
      evaluation_id:a.id,
      criterion_id:cr.id,
      result:dbResult,
      failure_mode:rating==='fail'?(fd.mode||null):null,
      primary_contributor:rating==='fail'?(fd.contributor||null):null,
      evaluator_note:a.notes?.[code]||null,
      graded_at:iso(a.stamps?.[code]),
      app_data:{
        ...previousApp,
        method:a.methods?.[code]||'',
        ntReason:a.ntReasons?.[code]||null,
        failureDetail:rating==='fail'?fd:null
      },
      client_modified_at:iso(a.stamps?.[code]||localMs),
      source_device_id:getStore()?.deviceId?.()||null
    });
  }
  if(criterionRows.length){
    const {error}=await client.from('criterion_results')
      .upsert(criterionRows,{onConflict:'evaluation_id,criterion_id'});
    if(error)throw error;
  }
  const staleCrit=(existingCrit||[]).filter(r=>!currentCriterionIds.has(r.criterion_id)).map(r=>r.id);
  if(staleCrit.length){
    const {error}=await client.from('criterion_results').delete().in('id',staleCrit);
    if(error)throw error;
  }

  const timerRows=[];
  const liveTimerKeys=new Set();
  const defs=new Map((t?.timers||[]).map(d=>[d.id,d]));
  for(const [timerId,store] of Object.entries(a.timers||{})){
    const def=defs.get(timerId);if(!def){
      if((store?.instances||[]).some(x=>x?.wallStart)){
        patchAttempt(liveAttempt,{status:'error',error:'A local timer does not match the published curriculum. Pull the current curriculum before syncing.'});
        return false;
      }
      continue;
    }
    const linked=def.linkedItemId?crit.byCode.get(def.linkedItemId):null;
    for(const x of (store?.instances||[])){
      if(!x?.wallStart)continue;
      const key=`${timerId}:${x.id||x.index||1}`;liveTimerKeys.add(key);
      const elapsed=timerDuration(def,x);
      timerRows.push({
        evaluation_id:a.id,
        criterion_id:linked?.id||null,
        timer_name:`${def.label} #${x.index||1}`,
        started_at:iso(x.wallStart),
        stopped_at:iso(x.wallStop),
        elapsed_ms:elapsed,
        standard_ms:timerStandardMs(def),
        standard_met:x.wallStop?(x.result==='met'):null,
        sync_key:key,
        app_data:{timerId,definition:{label:def.label,standard:def.standard,mode:def.mode,gradingClock:def.gradingClock||'active'},instance:x},
        client_modified_at:iso(x.wallStop||localMs),
        source_device_id:getStore()?.deviceId?.()||null
      });
    }
  }
  if(timerRows.length){
    const {error}=await client.from('timer_results')
      .upsert(timerRows,{onConflict:'evaluation_id,sync_key'});
    if(error)throw error;
  }
  const {data:existingTimers,error:existingTimerError}=await client.from('timer_results')
    .select('id,sync_key').eq('evaluation_id',a.id);
  if(existingTimerError)throw existingTimerError;
  const staleTimers=(existingTimers||[]).filter(r=>!liveTimerKeys.has(r.sync_key)).map(r=>r.id);
  if(staleTimers.length){
    const {error}=await client.from('timer_results').delete().in('id',staleTimers);
    if(error)throw error;
  }

  const appData={
    ...cachedApp,
    ...remoteApp,
    schemaVersion:2,
    shellOnly:false,
    localClassId:c.id,
    localParticipantId:s.id,
    localAttemptId:a.id,
    section:a.section||'',
    methods:a.methods||{},
    stamps:a.stamps||{},
    ntReasons:a.ntReasons||{},
    failureDetails,
    observations,
    notes:a.notes||{},
    timerForced:a.timerForced||{},
    events:a.events||[],
    instants:a.instants||{},
    trainerSign:a.trainerSign||'',
    evaluatorId:a.evaluatorId||'',
    cloudEvaluatorUserId:userId,
    startedByUserId:a.startedByUserId||userId,
    startedByDeviceId:a.startedByDeviceId||getStore()?.deviceId?.()||'',
    studentSign:a.studentSign||'',
    overallNotes:a.overallNotes||'',
    showNt:!!a.showNt,
    observeMode:a.observeMode!==false,
    remediation:a.remediation||null,
    appVersion:a.appVersion||'',
    contentVersion:a.contentVersion||'',
    scenarioVersion:a.scenarioVersion||'1',
    // Field evidence: when the assessment really happened on the device.
    // Kept separately from server claim/finalization/verification times.
    ...(a.fieldStartedAt?{fieldStartedAt:Number(a.fieldStartedAt)}:{}),
    ...(a.fieldFinalizedAt?{fieldFinalizedAt:Number(a.fieldFinalizedAt)}:{}),
    ...(a.fieldFinalResult?{fieldFinalResult:String(a.fieldFinalResult).toUpperCase()}:{}),
    ...(a.offlineStarted?{offlineStarted:true}:{})
  };

  const {data:updated,error:updateError}=await client.from('evaluations').update({
    evaluator_id:remote?.evaluator_id||userId,
    status:a?.startedAt?'in_progress':'draft',
    overall_result:null,
    score_numerator:sc.pass,
    score_denominator:sc.denom,
    started_at:iso(a.startedAt),
    completed_at:null,
    app_data:appData,
    client_modified_at:iso(publishMs),
    source_device_id:getStore()?.deviceId?.()||null
  }).eq('id',a.id).select('client_modified_at,updated_at').single();
  if(updateError)throw updateError;

  context.check();
  liveAttempt.cloudAppData=cloneJson(appData);
  const acceptedMs=ms(updated?.client_modified_at||updated?.updated_at)||publishMs;
  if(forceConflict){
    if(localGradingSignature(liveAttempt)===uploadSignature){
      liveAttempt.modifiedAt=acceptedMs;
      liveAttempt.lastModifiedDeviceId=getStore()?.deviceId?.()||liveAttempt.lastModifiedDeviceId||'';
      liveAttempt.syncStatus='CLOUD';
    }
  }
  const unchanged=localGradingSignature(liveAttempt)===uploadSignature;
  patchAttempt(liveAttempt,{status:unchanged?'synced':'pending',error:'',lastSyncedAt:Date.now(),remoteModifiedAt:acceptedMs,
    baseGradingSignature:uploadSignature,syncedByUserId:userId});
  return true;
}

function freshTimerStore(t){
  const out={};for(const d of (t?.timers||[]))out[d.id]={instances:[],currentIndex:-1};return out;
}
function finalizedCopyMatchesServer(local,server,row){
  if(!local.finalizedAt||local.voidedAt||row.status!=='finalized'||!server.finalizedAt
    ||!['PASS','FAIL'].includes(server.finalResult)||local.finalResult!==server.finalResult)return false;
  const candidate=cloneJson(server);
  // These are read-only display preferences, not unsynchronized assessment data.
  for(const key of ['section','showNt','observeMode'])candidate[key]=local[key];
  // Older finalize responses used a client-time fallback. The canonical server
  // completion still represents that same terminal result, not a local edit.
  candidate.finalizedAt=local.finalizedAt;
  if(JSON.stringify(canonical(candidate.events))!==JSON.stringify(canonical(local.events||[]))){
    if(row.score_numerator==null||row.score_denominator==null)return false;
    const pass=Number(row.score_numerator),denom=Number(row.score_denominator);
    if(!Number.isInteger(pass)||!Number.isInteger(denom)||pass<0||denom<pass)return false;
    const finalEvent={at:local.finalizedAt,elapsed:Math.max(0,local.finalizedAt-local.startedAt),
      label:'Evaluation finalized',detail:`Server-authoritative ${server.finalResult} · ${pass}/${denom}`};
    candidate.events=[...candidate.events,finalEvent];
  }
  return localGradingSignature(candidate)===localGradingSignature(local);
}
async function verifyEvaluationForLocalRemoval(c,s,a){
  return pullEvaluation(c,s,a,{verifyForLocalRemoval:true});
}
async function pullEvaluation(c,s,a,options={}){
  const context=permissionContext(c,'readClass');
  if(!getClient()||!context)return false;
  await context.ready();
  const client=context.client;
  const initialSignature=localGradingSignature(a);
  const verifyRemoval=options?.verifyForLocalRemoval===true;
  const force=options?.force===true;
  const originalAttempt=a;
  const currentRemovalTarget=()=>getStore()?.getClass?.(c.id)===c
    &&(c.students||[]).includes(s)&&Object.values(s.attempts||{}).includes(originalAttempt);
  if(verifyRemoval&&(!currentRemovalTarget()||a.cloudShellOnly||!a.finalizedAt||a.voidedAt))return false;
  // Never replace a field record that has not completed reconciliation.
  if(!options?.afterReconcile&&(a.pendingServerClaim||a.pendingServerFinalization||a.syncConflict))return false;
  const {data:row,error}=await client.from('evaluations')
    .select('id,event_id,participant_id,attempt_number,status,overall_result,score_numerator,score_denominator,started_at,completed_at,app_data,client_modified_at,updated_at,source_device_id,curriculum_version_id,evaluator_id')
    .eq('id',a.id).maybeSingle();
  if(error)throw error;if(!row)return false;
  if(!await evaluationBelongsToClass(c,s,row,client))return false;
  context.check();
  if(verifyRemoval){
    if(String(row.id)!==String(a.id)||row.status!=='finalized'
      ||(a.cloudEvaluatorUserId&&String(row.evaluator_id)!==String(a.cloudEvaluatorUserId))
      ||(a.startedByUserId&&String(row.evaluator_id)!==String(a.startedByUserId)))return false;
    const {data:classRow,error:classError}=await client.from('classes')
      .select('status,created_by,base_id,bases(id,code,majcom_id)').eq('id',c.id).maybeSingle();
    if(classError)throw classError;
    if(!classRow||!window.RAPS_PERMISSIONS.canClass('readClass',classWithServerScope(c,classRow)))return false;
    if(String(row.curriculum_version_id)!==String(await curriculumIdFor(c,client)))return false;
    context.check();
  }

  // VOID is a server tombstone, not a resumable evaluation. Remove only
  // the matching local evaluation UUID; never delete a newer replacement
  // attempt that happens to reuse the same A1/A2 attempt number.
  if(String(row.status||'').toLowerCase()==='voided'){
    return removeLocalAttemptByEvaluationId(c,s,row.id);
  }

  const remoteMs=ms(row.client_modified_at||row.updated_at);
  const localMs=Number(a.modifiedAt||0);
  const state=verifyRemoval?(a.cloudGrading||{}):attemptState(a);
  const lastSeen=Number(state.remoteModifiedAt||0);
  if(!verifyRemoval&&!force&&!a.cloudShellOnly&&state.baseGradingSignature&&initialSignature!==state.baseGradingSignature)return false;
  if(!verifyRemoval&&!force&&!a.cloudShellOnly&&lastSeen&&localMs>lastSeen+10)return false;
  if(!verifyRemoval&&!force&&!a.cloudShellOnly&&!lastSeen&&localMs>remoteMs+1000)return false;
  const verifyLegacy=!verifyRemoval&&!force&&!a.cloudShellOnly&&!state.baseGradingSignature&&lastSeen&&remoteMs<=lastSeen+10;
  if(!verifyRemoval&&!force&&!a.cloudShellOnly&&remoteMs<=lastSeen+10&&state.baseGradingSignature)return false;

  const crit=await criteriaFor(row.curriculum_version_id,client,context.check);
  context.check();
  const [{data:cr,error:crErr},{data:tr,error:trErr}]=await Promise.all([
    client.from('criterion_results').select('criterion_id,result,failure_mode,primary_contributor,evaluator_note,graded_at,app_data,client_modified_at').eq('evaluation_id',a.id),
    client.from('timer_results').select('criterion_id,timer_name,started_at,stopped_at,elapsed_ms,standard_ms,standard_met,sync_key,app_data,client_modified_at,source_device_id').eq('evaluation_id',a.id)
  ]);
  if(crErr)throw crErr;if(trErr)throw trErr;
  context.check();
  if(localGradingSignature(a)!==initialSignature)return false;

  const liveAttempt=a;
  a=cloneJson(a);
  const app=jsonObject(row.app_data);
  a.cloudAppData=cloneJson(app);
  a.observations=cloneJson(jsonObject(app.observations));
  a.ratings={};a.methods={};a.stamps={};a.ntReasons={};a.failureDetails=cloneJson(jsonObject(app.failureDetails));a.notes={};
  for(const r of cr||[]){
    const code=crit.byId.get(r.criterion_id)?.criterion_code;if(!code)continue;
    a.ratings[code]=RESULT_FROM_DB[r.result]||'nt';
    a.stamps[code]=ms(r.graded_at||r.client_modified_at)||remoteMs;
    a.methods[code]=r.app_data?.method||'cloud';
    if(r.app_data?.ntReason)a.ntReasons[code]=r.app_data.ntReason;
    if(r.result==='fail')a.failureDetails[code]={
      ...cloneJson(jsonObject(jsonObject(app.failureDetails)[code])),
      mode:r.failure_mode||'',contributor:r.primary_contributor||'',
      ...cloneJson(jsonObject(r.app_data?.failureDetail))
    };
    if(r.evaluator_note)a.notes[code]=r.evaluator_note;
  }

  const t=tierFor(c),stores=freshTimerStore(t);
  for(const r of tr||[]){
    const app=r.app_data||{},timerId=app.timerId;
    if(!timerId||!stores[timerId])continue;
    const x=app.instance||{};
    if(!x.id)x.id=(r.sync_key||'cloud').split(':').slice(1).join(':')||r.sync_key;
    if(!x.wallStart)x.wallStart=ms(r.started_at)||null;
    if(!x.wallStop)x.wallStop=ms(r.stopped_at)||null;
    if(x.finalDurationMs==null&&r.elapsed_ms!=null)x.finalDurationMs=Number(r.elapsed_ms);
    if(!x.result&&r.standard_met!=null)x.result=r.standard_met?'met':'notmet';
    stores[timerId].instances.push(x);
  }
  for(const store of Object.values(stores)){
    store.instances.sort((x,y)=>(x.index||0)-(y.index||0));
    store.currentIndex=store.instances.length-1;
  }
  a.timers=stores;

  const appDefaults={section:'',timerForced:{},events:[],instants:{},trainerSign:'',evaluatorId:'',
    startedByUserId:row.evaluator_id||'',startedByDeviceId:'',studentSign:'',overallNotes:'',remediation:null};
  for(const [key,value] of Object.entries(appDefaults))a[key]=cloneJson(app[key]??value);
  a.cloudEvaluatorUserId=row.evaluator_id||'';
  for(const key of ['fieldStartedAt','fieldFinalizedAt'])a[key]=Number(app[key])||null;
  a.fieldFinalResult=app.fieldFinalResult?String(app.fieldFinalResult).toUpperCase():null;
  a.offlineStarted=!!app.offlineStarted;
  a.serverAuditConfirmation=app.serverAuditConfirmation?cloneJson(app.serverAuditConfirmation):null;
  a.showNt=!!app.showNt;
  a.observeMode=app.observeMode!==false;
  a.fieldMode=a.observeMode;
  a.attemptNo=Number(row.attempt_number||1);
  a.startedAt=ms(row.started_at)||null;
  a.voidedAt=null;
  a.finalizedAt=ms(row.completed_at)||null;
  a.finalResult=row.overall_result?String(row.overall_result).toUpperCase():null;
  a.modifiedAt=remoteMs||Date.now();
  a.lastModifiedDeviceId=row.source_device_id||'';
  a.syncStatus='CLOUD';
  a.cloudShellOnly=false;
  if(verifyRemoval){
    // A clone starts with local metadata. Replace every remaining signed field
    // from the server before comparing, so local-only version edits cannot be
    // mistaken for server-confirmed data.
    a.appVersion=app.appVersion||'';
    a.contentVersion=app.contentVersion||'';
    a.scenarioVersion=app.scenarioVersion||'1';
    await context.verify();
    if(!currentRemovalTarget()||localGradingSignature(liveAttempt)!==initialSignature
      ||!finalizedCopyMatchesServer(liveAttempt,a,row))return false;
    // This receipt belongs only to the pending removal. Persisting the proof
    // here could overwrite another tab's newer database before the remover
    // gets to compare browser storage with its original local copy.
    return {status:'synced',error:'',lastSyncedAt:Date.now(),remoteModifiedAt:remoteMs,
      baseGradingSignature:initialSignature,syncedByUserId:String(context.identity.userId)};
  }
  const serverSignature=localGradingSignature(a);
  if(verifyLegacy&&serverSignature!==initialSignature)return false;
  context.check();
  if(localGradingSignature(liveAttempt)!==initialSignature)return false;
  a.cloudGrading={status:'synced',error:'',lastSyncedAt:Date.now(),remoteModifiedAt:remoteMs,
    baseGradingSignature:serverSignature,syncedByUserId:String(getCloud()?.user?.id||'')};
  Object.assign(liveAttempt,a);
  persist();
  return true;
}

async function inspectConflict(c,s,a){
  const context=permissionContext(c,'readClass');
  if(!getClient()||!context)throw new Error('You do not have permission to read this evaluation.');
  await context.ready();
  const client=context.client;
  if(!client||!navigator.onLine)throw new Error('Conflict resolution requires an online connection.');

  const {data:row,error}=await client.from('evaluations')
    .select('id,event_id,participant_id,evaluator_id,curriculum_version_id,attempt_number,status,overall_result,score_numerator,score_denominator,started_at,completed_at,app_data,client_modified_at,updated_at,source_device_id')
    .eq('id',a.id).maybeSingle();
  if(error)throw error;
  if(!row)throw new Error('The server evaluation no longer exists.');
  if(!await evaluationBelongsToClass(c,s,row,client))throw new Error('The evaluation does not belong to this class and participant.');
  context.check();

  const crit=await criteriaFor(row.curriculum_version_id||await curriculumIdFor(c,client),client,context.check);
  context.check();
  const [{data:cr,error:crErr},{data:tr,error:trErr}]=await Promise.all([
    client.from('criterion_results')
      .select('criterion_id,result,failure_mode,primary_contributor,evaluator_note,graded_at,app_data,client_modified_at,source_device_id')
      .eq('evaluation_id',a.id),
    client.from('timer_results')
      .select('criterion_id,timer_name,started_at,stopped_at,elapsed_ms,standard_ms,standard_met,sync_key,app_data,client_modified_at,source_device_id')
      .eq('evaluation_id',a.id)
  ]);
  if(crErr)throw crErr;
  if(trErr)throw trErr;
  context.check();

  const remoteRatings={};
  for(const r of cr||[]){
    const code=crit.byId.get(r.criterion_id)?.criterion_code;
    if(code)remoteRatings[code]=RESULT_FROM_DB[r.result]||'nt';
  }

  return {
    evaluationId:a.id,
    remoteModifiedAt:ms(row.client_modified_at||row.updated_at),
    remoteDeviceId:row.source_device_id||'',
    remoteStatus:row.status||'',
    localModifiedAt:Number(a.modifiedAt||0),
    localDeviceId:getStore()?.deviceId?.()||'',
    localRatings:cloneJson(a.ratings||{}),
    remoteRatings,
    localTimerKeys:Object.entries(a.timers||{}).flatMap(([timerId,store])=>
      (store?.instances||[]).filter(x=>x?.wallStart).map(x=>`${timerId}:${x.id||x.index||1}`)
    ).sort(),
    remoteTimerKeys:(tr||[]).map(r=>r.sync_key).filter(Boolean).sort(),
    serverSnapshot:{
      capturedAt:Date.now(),
      evaluation:cloneJson(row),
      criteria:cloneJson(cr||[]),
      timers:cloneJson(tr||[])
    }
  };
}

async function resolveConflict(c,s,a,strategy){
  const context=permissionContext(c,'readClass');
  if(!context)throw new Error('You do not have permission to resolve this evaluation.');
  await context.ready();
  strategy=String(strategy||'').toLowerCase();
  if(!['server','local'].includes(strategy))throw new Error('Conflict resolution must choose SERVER or LOCAL.');
  if(attemptState(a).status!=='conflict')throw new Error('This evaluation is not currently in conflict.');

  const inspection=await inspectConflict(c,s,a);
  await context.verify();
  if(strategy==='local'&&!canEditEvaluation(c,a,inspection.serverSnapshot?.evaluation))throw new Error('Only the assigned evaluator can publish this evaluation.');
  const expected=Number(attemptState(a).remoteModifiedAt||0);
  if(expected&&Math.abs(inspection.remoteModifiedAt-expected)>10){
    patchAttempt(a,{
      status:'conflict',
      error:'Cloud evaluation changed again while resolving the conflict. Review the latest server version before choosing again.',
      remoteModifiedAt:inspection.remoteModifiedAt
    });
    throw new Error('The server evaluation changed again. Review the conflict again before resolving it.');
  }

  saveConflictRecovery(a,inspection,strategy);

  if(strategy==='server'){
    const ok=await pullEvaluation(c,s,a,{force:true});
    await context.verify();
    if(!ok)throw new Error('Unable to load the authoritative server evaluation.');
    a.conflictResolution={
      resolvedAt:Date.now(),
      strategy:'server',
      preservedBackup:true,
      previousRemoteModifiedAt:inspection.remoteModifiedAt
    };
    persist();
    return true;
  }

  const ok=await pushEvaluation(c,s,a,{
    forceConflict:true,
    expectedRemoteModifiedAt:inspection.remoteModifiedAt,
    skipRosterSync:true
  });
  await context.verify();
  if(!ok)throw new Error(attemptState(a).error||'Unable to preserve this device as the authoritative grading version.');
  a.conflictResolution={
    resolvedAt:Date.now(),
    strategy:'local',
    preservedBackup:true,
    previousRemoteModifiedAt:inspection.remoteModifiedAt
  };
  persist();
  return true;
}

// ---------- Offline field record reconciliation ----------
// Runs one record at a time: claim -> upload evidence -> server finalization ->
// field-time audit confirmation -> adopt the canonical server record. Every
// step can be repeated safely. A failure leaves the sealed field record on the
// device; nothing is marked synced until the server confirms it.
function needsReconcile(a){return !!a&&!!a.id&&!a.cloudShellOnly&&!a.voidedAt&&!a.syncConflict&&(a.pendingServerClaim||a.pendingServerFinalization);}
function rpcMissing(error){const m=String(error?.message||'');return error?.code==='PGRST202'||error?.code==='42883'||/could not find the function|does not exist/i.test(m);}
function markSyncConflict(a,kind,message,extra={}){
  a.syncConflict={kind,message,detectedAt:Date.now(),...extra};
  a.serverVerificationStatus='conflict';
  patchAttempt(a,{status:'conflict',error:message});
}
async function serverAttempt1State(client,c,s){
  const {data,error}=await client.from('evaluations').select('id,status,overall_result,evaluator_id')
    .eq('event_id',c.id).eq('participant_id',s.id).in('attempt_number',[1]);
  if(error)throw error;
  const rows=(data||[]).filter(r=>String(r.status)!=='voided');
  return rows.find(r=>String(r.status)==='finalized')||rows[0]||null;
}
async function reconcileOfflineAttempt(c,s,a){
  const cloud=getCloud(),store=getStore(),context=permissionContext(c,'evaluate');
  if(!getClient()||!context||!cloud?.user?.id||!navigator.onLine||!needsReconcile(a))return false;
  await context.ready();
  const client=context.client,userId=String(cloud.user.id),deviceId=store?.deviceId?.()||null;
  if(attemptEvaluatorId(a)&&attemptEvaluatorId(a)!==userId){
    patchAttempt(a,{status:'error',error:'Sign in as the evaluator who recorded this assessment to sync it.'});return false;
  }
  patchAttempt(a,{status:'syncing',error:'Syncing field record…'});
  try{
    // 1. Server claim (idempotent: a repeat returns this same evaluation).
    if(a.pendingServerClaim){
      const {data:eventRow,error:eventError}=await client.from('evaluation_events').select('id,curriculum_version_id,status').eq('id',c.id).maybeSingle();
      if(eventError)throw eventError;
      if(!eventRow?.curriculum_version_id)throw new Error('The class event is not ready on the server. A class manager must Sync Classes first.');
      let claim,claimError;
      try{({data:claim,error:claimError}=await client.rpc('claim_evaluation_authoritatively',{
        p_evaluation_id:a.id,p_event_id:c.id,p_participant_id:s.id,p_curriculum_version_id:eventRow.curriculum_version_id,
        p_attempt_number:Number(a.attemptNo||1),p_source_device_id:deviceId}));}
      catch(error){claimError=error;}
      context.check();
      const claimMessage=String(claimError?.message||'');
      if(claimError&&/different evaluator/i.test(claimMessage)){
        markSyncConflict(a,'same_evaluator_retest','The server rejected this retest: Attempt 2 must be evaluated by a different evaluator than Attempt 1.');return false;
      }
      if(claimError&&Number(a.attemptNo)!==2)throw claimError;
      claim=claim||{};
      const canonicalId=String(claim.evaluationId||claim.existingEvaluationId||'');
      if(claim.claimed&&(!canonicalId||canonicalId===String(a.id))){
        a.pendingServerClaim=false;a.waitingForAttempt1=false;
        a.serverClaimMode='authoritative-v1';a.serverClaimedAt=ms(claim.startedAt)||Date.now();a.serverClaimedBy=userId;
        a.fieldStartedAt=a.fieldStartedAt||a.startedAt;
        persist();
      }else if(claim.claimed||claim.reason==='evaluation_owned_by_other_evaluator'||(canonicalId&&canonicalId!==String(a.id))){
        markSyncConflict(a,'duplicate_attempt','Another evaluator already recorded Attempt '+Number(a.attemptNo||1)+' for this student. The server record is official; this phone\'s record was kept for review.',{canonicalEvaluationId:canonicalId});
        return false;
      }else if(claim.reason==='active_evaluation_exists'){
        patchAttempt(a,{status:'error',error:'You have another evaluation in progress on the server. Finalize or void it, then Sync Classes again.'});return false;
      }else if(Number(a.attemptNo)===2){
        // The retest waits until the Attempt 1 FAIL from another phone reaches the server.
        const first=await serverAttempt1State(client,c,s);
        if(first&&String(first.status)==='finalized'&&String(first.overall_result||'').toLowerCase()==='pass'){
          markSyncConflict(a,'retest_after_pass','The server shows Attempt 1 as PASS, so this retest is not allowed. The record was kept for review.');return false;
        }
        if(first&&String(first.status)==='finalized'&&String(first.evaluator_id)===userId){
          markSyncConflict(a,'same_evaluator_retest','You evaluated Attempt 1, so you cannot conduct the retest. The record was kept for review.');return false;
        }
        a.waitingForAttempt1=true;
        patchAttempt(a,{status:'pending',error:'Waiting for the Attempt 1 FAIL from another phone to sync. Have that evaluator Sync Classes, then sync again.'});
        return false;
      }else{
        markSyncConflict(a,'claim_rejected','The server did not accept this field record ('+String(claim.reason||claimMessage||'unknown reason')+'). The record was kept for review.');return false;
      }
    }

    // 2. Upload criteria, timers, and field evidence, unless an earlier
    // interrupted run already finalized this record on the server.
    const {data:row,error:rowError}=await client.from('evaluations').select('id,status,overall_result,completed_at,evaluator_id').eq('id',a.id).maybeSingle();
    if(rowError)throw rowError;
    if(!row)throw new Error('The server claim for this field record was not found. Sync Classes again.');
    if(String(row.status)!=='finalized'){
      const pushed=await pushEvaluation(c,s,a,{skipRosterSync:true,offlineReconcile:true});
      context.check();
      if(!pushed)throw new Error(attemptState(a).error||'Field evidence did not upload.');
    }else if(String(row.evaluator_id)!==userId){
      markSyncConflict(a,'duplicate_attempt','This record is finalized on the server by another evaluator. The record on this phone was kept for review.',{canonicalEvaluationId:String(row.id)});return false;
    }
    if(!a.pendingServerFinalization){patchAttempt(a,{status:'synced',error:''});return true;}

    // 3. Server finalization, unless an earlier interrupted run already did it.
    let serverResult='',completedAt=0;
    if(String(row?.status)==='finalized'){
      serverResult=String(row.overall_result||'').toUpperCase();completedAt=ms(row.completed_at);
    }else{
      const {data:fin,error:finError}=await client.rpc('finalize_evaluation_authoritatively',{p_evaluation_id:a.id,p_source_device_id:deviceId});
      context.check();
      if(finError)throw finError;
      if(!fin?.finalized){
        const issues=Array.isArray(fin?.issues)?fin.issues:[];
        markSyncConflict(a,'server_rejected','The server did not verify this evaluation: '+(issues.length?issues.slice(0,5).join(' | '):String(fin?.reason||'unknown reason'))+'. The record was kept for review.',{issues});
        return false;
      }
      serverResult=String(fin.result||'').toUpperCase();completedAt=ms(fin.completedAt)||Date.now();
      a.serverFinalization={mode:'server_authoritative',finalizedAt:completedAt,result:serverResult,
        scoreNumerator:Number(fin.scoreNumerator||0),scoreDenominator:Number(fin.scoreDenominator||0),
        criticalFailureCount:Number(fin.criticalFailureCount||0),globalTimerNotMet:!!fin.globalTimerNotMet};
    }

    // 4. Confirm the field start/finish times and field result on the server.
    const fieldResult=String(a.fieldFinalResult||a.finalResult||'').toUpperCase();
    const {data:audit,error:auditError}=await client.rpc('confirm_offline_evaluation_audit',{
      p_evaluation_id:a.id,p_field_started_at:iso(a.fieldStartedAt||a.startedAt),p_field_finalized_at:iso(a.fieldFinalizedAt||a.finalizedAt),
      p_field_result:fieldResult||serverResult,p_source_device_id:deviceId});
    context.check();
    if(auditError){
      if(rpcMissing(auditError))throw new Error('The RaPS server needs the offline evaluation update before field records can be verified. Contact the administrator.');
      throw auditError;
    }
    a.serverResultDiffers=false;
    if(!audit?.confirmed){
      if(audit?.reason==='field_result_mismatch'){
        a.serverResultDiffers=true;
      }else{
        markSyncConflict(a,'audit_rejected','The server could not confirm the field times for this record ('+String(audit?.reason||'unknown reason')+'). The record was kept for review.');return false;
      }
    }

    // 5. Done: adopt the canonical server record.
    a.pendingServerFinalization=false;a.waitingForAttempt1=false;
    a.serverVerificationStatus='verified';
    a.finalResult=serverResult||fieldResult;
    a.events=a.events||[];
    a.events.push({at:completedAt||Date.now(),elapsed:Math.max(0,(a.fieldFinalizedAt||a.finalizedAt)-(a.fieldStartedAt||a.startedAt)),
      label:'Server verification completed',detail:`${a.finalResult} · verified after field finalization on device`+(a.serverResultDiffers?` · server result differs from field result ${fieldResult}`:'')});
    patchAttempt(a,{status:'synced',error:a.serverResultDiffers?`The server result (${serverResult}) differs from the result shown on this phone (${fieldResult}). The server result is official; review the record.`:''});
    try{await pullEvaluation(c,s,a,{force:true,afterReconcile:true});}catch(error){console.warn('Canonical pull after reconciliation failed',a.id,error);}
    return true;
  }catch(error){
    if(error?.code==='RAPS_SESSION_CHANGED')throw error;
    patchAttempt(a,{status:navigator.onLine?'error':'offline',error:navigator.onLine?err(error):'Connection lost during sync. The field record is safe on this device.'});
    console.warn('Offline field record reconciliation failed',a.id,error);
    return false;
  }
}
function attemptEvaluatorId(a){return String(a?.cloudEvaluatorUserId||a?.startedByUserId||'');}
async function reconcilePendingOffline(){
  const store=getStore(),permissions=window.RAPS_PERMISSIONS;
  if(!store||!permissions?.snapshot||!navigator.onLine||!getCloud()?.user?.id)return {synced:0,remaining:0};
  const identity=permissions.snapshot();if(!permissions.isCurrent(identity))return {synced:0,remaining:0};
  const pending=[];
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled&&!x.deletedAt&&!x.closedAt&&x.status!=='closed'&&!store.isLocalCopyHidden?.(x.id))){
    for(const s of c.students||[])for(const a of Object.values(s.attempts||{}))if(needsReconcile(a))pending.push({c,s,a});
  }
  // Sealed records first (each releases the evaluator's server lock when it
  // finalizes), oldest field start first, Attempt 1 before Attempt 2; an
  // unfinished offline start is claimed last because it stays active.
  pending.sort((x,y)=>(x.a.pendingServerFinalization?0:1)-(y.a.pendingServerFinalization?0:1)
    ||Number(x.a.attemptNo||1)-Number(y.a.attemptNo||1)
    ||Number(x.a.fieldStartedAt||x.a.startedAt||0)-Number(y.a.fieldStartedAt||y.a.startedAt||0));
  let synced=0;
  for(const {c,s,a} of pending){
    if(!permissions.isCurrent(identity)||!navigator.onLine)break;
    try{if(await reconcileOfflineAttempt(c,s,a))synced++;}
    catch(error){if(error?.code==='RAPS_SESSION_CHANGED'||!permissions.isCurrent(identity))break;}
  }
  const remaining=pending.filter(x=>needsReconcile(x.a)).length;
  window.dispatchEvent(new CustomEvent('raps-offline-reconcile-complete',{detail:{synced,remaining}}));
  return {synced,remaining};
}

async function pullAll(){
  const store=getStore(),permissions=window.RAPS_PERMISSIONS;if(!store||!permissions?.snapshot)return 0;
  const identity=permissions.snapshot();if(!permissions.isCurrent(identity))return 0;let n=0;
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled&&!store.isLocalCopyHidden?.(x.id)&&permissions.canClass('readClass',x))){
    for(const s of c.students||[]){
      for(const a of Object.values(s.attempts||{})){
        if(!permissions.isCurrent(identity))return n;
        if(!a?.id)continue;
        try{if(await pullEvaluation(c,s,a))n++;}catch(e){if(e?.code==='RAPS_SESSION_CHANGED'||!permissions.isCurrent(identity))return n;console.warn('Evaluation pull failed',a.id,e)}
      }
    }
  }
  return n;
}
async function pushAll(){
  const store=getStore(),permissions=window.RAPS_PERMISSIONS;if(!store||!permissions?.snapshot)return 0;
  const identity=permissions.snapshot();if(!permissions.isCurrent(identity))return 0;let n=0;
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled && !x?.deletedAt && !x?.closedAt && x?.status!=='closed'&&!store.isLocalCopyHidden?.(x.id)&&permissions.canClass('evaluate',x))){
    for(const s of c.students||[]){
      for(const a of Object.values(s.attempts||{})){
        if(!permissions.isCurrent(identity))return n;
        if(!a?.id||a.cloudShellOnly||a.pendingServerClaim||a.pendingServerFinalization||a.syncConflict)continue;
        const state=attemptState(a),localMs=Number(a.modifiedAt||0),remoteMs=Number(state.remoteModifiedAt||0);
        if(state.status==='conflict')continue;
        if(state.status==='synced'&&state.baseGradingSignature===localGradingSignature(a)&&remoteMs&&localMs<=remoteMs+10)continue;
        try{if(await pushEvaluation(c,s,a))n++;}catch(e){if(e?.code==='RAPS_SESSION_CHANGED'||!permissions.isCurrent(identity))return n;patchAttempt(a,{status:'error',error:err(e)});console.warn('Evaluation push failed',a.id,e)}
      }
    }
  }
  return n;
}
let rerunRequested=false,currentRun=null;
// One sync at a time. A request made while a run is active schedules exactly
// one follow-up run instead of starting a competing one.
async function syncAll(){
  if(!navigator.onLine||!getCloud()?.user?.id)return;
  if(busy){rerunRequested=true;return currentRun;}
  busy=true;rerunRequested=false;
  const identity=window.RAPS_PERMISSIONS?.snapshot?.();
  currentRun=(async()=>{
    try{
      await pullAll();
      if(identity&&window.RAPS_PERMISSIONS?.isCurrent?.(identity))await reconcilePendingOffline();
      if(identity&&window.RAPS_PERMISSIONS?.isCurrent?.(identity))await pushAll();
      if(identity&&window.RAPS_PERMISSIONS?.isCurrent?.(identity))await window.RAPS_CLOSURE_GATE?.reportAll?.();
    }catch(error){if(identity&&window.RAPS_PERMISSIONS?.isCurrent?.(identity))console.warn('Grading sync failed',error);}
    finally{busy=false;currentRun=null;if(rerunRequested&&navigator.onLine){rerunRequested=false;setTimeout(()=>syncAll(),150);}}
  })();
  return currentRun;
}
function queue(classId){
  clearTimeout(timers.get(classId));
  timers.set(classId,setTimeout(()=>syncAll(),900));
}

window.addEventListener('raps-local-class-change',e=>queue(e.detail?.classId));
window.addEventListener('raps-class-sync-complete',()=>syncAll());
window.addEventListener('raps-cloud-identity',()=>{
  criteriaCache.clear();
  for(const timeout of timers.values())clearTimeout(timeout);
  timers.clear();
  syncAll();
});
window.addEventListener('online',()=>syncAll());
window.addEventListener('raps-offline-evaluation-sealed',()=>{if(navigator.onLine)syncAll();});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>syncAll(),{once:true});
else syncAll();

window.RAPS_GRADING_SYNC_BUILD='3.4.13-web.1';
window.RAPS_GRADING_SYNC=Object.freeze({
  syncAll,
  pushEvaluation,
  pullEvaluation,
  verifyEvaluationForLocalRemoval,
  pullAll,
  pushAll,
  reconcilePendingOffline,
  reconcileOfflineAttempt,
  inspectConflict,
  resolveConflict,
  localGradingSignature
});
})();
