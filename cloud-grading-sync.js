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
  if(a?.finalizedAt||a?.voidedAt){
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
    scenarioVersion:a.scenarioVersion||'1'
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
async function pullEvaluation(c,s,a,options={}){
  const context=permissionContext(c,'readClass');
  if(!getClient()||!context)return false;
  await context.ready();
  const client=context.client;
  const initialSignature=localGradingSignature(a);
  const force=options?.force===true;
  const {data:row,error}=await client.from('evaluations')
    .select('id,event_id,participant_id,attempt_number,status,overall_result,score_numerator,score_denominator,started_at,completed_at,app_data,client_modified_at,updated_at,source_device_id,curriculum_version_id,evaluator_id')
    .eq('id',a.id).maybeSingle();
  if(error)throw error;if(!row)return false;
  if(!await evaluationBelongsToClass(c,s,row,client))return false;
  context.check();

  // VOID is a server tombstone, not a resumable evaluation. Remove only
  // the matching local evaluation UUID; never delete a newer replacement
  // attempt that happens to reuse the same A1/A2 attempt number.
  if(String(row.status||'').toLowerCase()==='voided'){
    return removeLocalAttemptByEvaluationId(c,s,row.id);
  }

  const remoteMs=ms(row.client_modified_at||row.updated_at);
  const localMs=Number(a.modifiedAt||0);
  const state=attemptState(a);
  const lastSeen=Number(state.remoteModifiedAt||0);
  if(!force&&!a.cloudShellOnly&&state.baseGradingSignature&&initialSignature!==state.baseGradingSignature)return false;
  if(!force&&!a.cloudShellOnly&&lastSeen&&localMs>lastSeen+10)return false;
  if(!force&&!a.cloudShellOnly&&!lastSeen&&localMs>remoteMs+1000)return false;
  const verifyLegacy=!force&&!a.cloudShellOnly&&!state.baseGradingSignature&&lastSeen&&remoteMs<=lastSeen+10;
  if(!force&&!a.cloudShellOnly&&remoteMs<=lastSeen+10&&state.baseGradingSignature)return false;

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
        if(!a?.id||a.cloudShellOnly)continue;
        const state=attemptState(a),localMs=Number(a.modifiedAt||0),remoteMs=Number(state.remoteModifiedAt||0);
        if(state.status==='conflict')continue;
        if(state.status==='synced'&&state.baseGradingSignature===localGradingSignature(a)&&remoteMs&&localMs<=remoteMs+10)continue;
        try{if(await pushEvaluation(c,s,a))n++;}catch(e){if(e?.code==='RAPS_SESSION_CHANGED'||!permissions.isCurrent(identity))return n;patchAttempt(a,{status:'error',error:err(e)});console.warn('Evaluation push failed',a.id,e)}
      }
    }
  }
  return n;
}
async function syncAll(){
  if(busy||!navigator.onLine||!getCloud()?.user?.id)return;
  busy=true;
  const identity=window.RAPS_PERMISSIONS?.snapshot?.();
  try{await pullAll();if(identity&&window.RAPS_PERMISSIONS?.isCurrent?.(identity))await pushAll();}
  catch(error){if(identity&&window.RAPS_PERMISSIONS?.isCurrent?.(identity))console.warn('Grading sync failed',error);}
  finally{busy=false}
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

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>syncAll(),{once:true});
else syncAll();

window.RAPS_GRADING_SYNC_BUILD='3.4.12-web.10';
window.RAPS_GRADING_SYNC=Object.freeze({
  syncAll,
  pushEvaluation,
  pullEvaluation,
  pullAll,
  pushAll,
  inspectConflict,
  resolveConflict,
  localGradingSignature
});
})();
