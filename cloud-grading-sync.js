(() => {
'use strict';

const RESULT_TO_DB = Object.freeze({pass:'pass',fail:'fail',nt:'not_observed',na:'not_applicable'});
const RESULT_FROM_DB = Object.freeze({pass:'pass',fail:'fail',not_observed:'nt',not_applicable:'nt'});
let busy=false;
let rerunRequested=false;
let criteriaCache=new Map();
let timers=new Map();

const getClient=()=>window.RAPS_SUPABASE;
const getCloud=()=>window.RAPS_CLOUD;
const getStore=()=>window.RAPS_CLASS_STORE;

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

async function curriculumIdFor(c){
  const courseMap={'1':'ASM','2':'CLS','3':'CMC','4':'CPP'};
  const t=tierFor(c),course=courseMap[String(c.tierId)];
  const {data,error}=await getClient().from('curriculum_versions').select('id')
    .eq('course_type',course).eq('version',t?.source||'').eq('published',true).maybeSingle();
  if(error)throw error;if(!data?.id)throw new Error('Published curriculum version not found.');
  return data.id;
}
async function criteriaFor(curriculumId){
  if(criteriaCache.has(curriculumId))return criteriaCache.get(curriculumId);
  const {data,error}=await getClient().from('criteria')
    .select('id,criterion_code,critical,timer_required,timer_standard_ms')
    .eq('curriculum_version_id',curriculumId).eq('active',true);
  if(error)throw error;
  const byCode=new Map((data||[]).map(r=>[r.criterion_code,r]));
  const byId=new Map((data||[]).map(r=>[r.id,r]));
  const out={rows:data||[],byCode,byId};criteriaCache.set(curriculumId,out);return out;
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
  const client=getClient(),cloud=getCloud();
  const forceConflict=options?.forceConflict===true;
  const expectedRemoteModifiedAt=Number(options?.expectedRemoteModifiedAt||0);
  const skipRosterSync=options?.skipRosterSync===true;
  if(!client||!cloud?.user?.id||!navigator.onLine)return false;

  // Closed classes are server-authoritative retention records. Never write
  // grading data after closure, including from a stale browser.
  if(c?.closedAt||c?.status==='closed'){
    patchAttempt(a,{status:'synced',error:'',lastSyncedAt:Date.now()});
    return true;
  }
  const {data:classRow,error:classError}=await client.from('classes')
    .select('status').eq('id',c.id).maybeSingle();
  if(classError)throw classError;
  if(classRow?.status==='completed'){
    patchAttempt(a,{status:'conflict',error:'Class is closed on the server. Pull authoritative state before continuing.'});
    return false;
  }

  // Terminal lifecycle is server-authoritative in v3.4.11+.
  // Criteria/timers are pushed before finalize/void; once the server marks
  // the parent terminal, background sync must not attempt a direct rewrite.
  if((a?.finalizedAt&&!a?.pendingServerFinalization)||a?.voidedAt){
    patchAttempt(a,{status:'synced',error:'',lastSyncedAt:Date.now()});
    return true;
  }

  if(attemptState(a).status==='conflict'&&!forceConflict){
    patchAttempt(a,{
      status:'conflict',
      error:attemptState(a).error||'Resolve the grading conflict before syncing this evaluation.'
    });
    return false;
  }

  if(!skipRosterSync&&window.RAPS_ROSTER_SYNC?.pushClassRosterAndShells) await window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(c);

  const curriculumId=await curriculumIdFor(c);
  const crit=await criteriaFor(curriculumId);
  if(!crit.rows.length)throw new Error('Supabase criteria catalog is empty for this curriculum.');

  const {data:remote,error:remoteError}=await client.from('evaluations')
    .select('id,client_modified_at,updated_at,source_device_id,evaluator_id')
    .eq('id',a.id).maybeSingle();
  if(remoteError)throw remoteError;

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
    patchAttempt(a,{
      status:'conflict',
      error:'Cloud evaluation changed again while resolving the conflict. Review the latest server version before choosing again.',
      remoteModifiedAt:remoteMs
    });
    return false;
  }

  if(!forceConflict&&remote&&remote.source_device_id&&remote.source_device_id!==getStore()?.deviceId?.()&&remoteMs>localMs+1000&&remoteMs>lastSeen+1000){
    patchAttempt(a,{status:'conflict',error:'Newer cloud evaluation exists. Pull before overwriting.',remoteModifiedAt:remoteMs});
    return false;
  }

  patchAttempt(a,{status:'syncing',error:''});
  const t=tierFor(c),sc=score(t,a);

  const criterionRows=[];
  const currentCriterionIds=new Set();
  for(const [code,rating] of Object.entries(a.ratings||{})){
    const cr=crit.byCode.get(code),dbResult=RESULT_TO_DB[rating];
    if(!cr||!dbResult)continue;
    currentCriterionIds.add(cr.id);
    const fd=a.failureDetails?.[code]||{};
    criterionRows.push({
      evaluation_id:a.id,
      criterion_id:cr.id,
      result:dbResult,
      failure_mode:rating==='fail'?(fd.mode||null):null,
      primary_contributor:rating==='fail'?(fd.contributor||null):null,
      evaluator_note:a.notes?.[code]||null,
      graded_at:iso(a.stamps?.[code]),
      app_data:{
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
  const {data:existingCrit,error:existingCritError}=await client.from('criterion_results')
    .select('id,criterion_id').eq('evaluation_id',canonicalId);
  if(existingCritError)throw existingCritError;
  const staleCrit=(existingCrit||[]).filter(r=>!currentCriterionIds.has(r.criterion_id)).map(r=>r.id);
  if(staleCrit.length){
    const {error}=await client.from('criterion_results').delete().in('id',staleCrit);
    if(error)throw error;
  }

  const timerRows=[];
  const liveTimerKeys=new Set();
  const defs=new Map((t?.timers||[]).map(d=>[d.id,d]));
  for(const [timerId,store] of Object.entries(a.timers||{})){
    const def=defs.get(timerId);if(!def)continue;
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
    .select('id,sync_key').eq('evaluation_id',canonicalId);
  if(existingTimerError)throw existingTimerError;
  const staleTimers=(existingTimers||[]).filter(r=>!liveTimerKeys.has(r.sync_key)).map(r=>r.id);
  if(staleTimers.length){
    const {error}=await client.from('timer_results').delete().in('id',staleTimers);
    if(error)throw error;
  }

  const appData={
    schemaVersion:2,
    shellOnly:false,
    localClassId:c.id,
    localParticipantId:s.id,
    localAttemptId:a.id,
    section:a.section||'',
    methods:a.methods||{},
    stamps:a.stamps||{},
    ntReasons:a.ntReasons||{},
    failureDetails:a.failureDetails||{},
    notes:a.notes||{},
    timerForced:a.timerForced||{},
    events:a.events||[],
    instants:a.instants||{},
    trainerSign:a.trainerSign||'',
    evaluatorId:a.evaluatorId||'',
    cloudEvaluatorUserId:cloud.user.id,
    startedByUserId:a.startedByUserId||cloud.user.id,
    startedByDeviceId:a.startedByDeviceId||getStore()?.deviceId?.()||'',
    studentSign:a.studentSign||'',
    overallNotes:a.overallNotes||'',
    showNt:!!a.showNt,
    observeMode:a.observeMode!==false,
    remediation:a.remediation||null,
    fieldStartedAt:a.fieldStartedAt||a.startedAt||a.createdAt||null,
    fieldFinalizedAt:a.fieldFinalizedAt||null,
    fieldFinalResult:a.fieldFinalResult||null,
    offlineStarted:!!a.offlineStarted,
    serverClaimMode:a.serverClaimMode||'',
    serverVerificationStatus:a.serverVerificationStatus||'',
    appVersion:a.appVersion||'',
    contentVersion:a.contentVersion||'',
    scenarioVersion:a.scenarioVersion||'1'
  };

  const {data:updated,error:updateError}=await client.from('evaluations').update({
    evaluator_id:remote?.evaluator_id||cloud.user.id,
    status:a?.startedAt?'in_progress':'draft',
    overall_result:null,
    score_numerator:sc.pass,
    score_denominator:sc.denom,
    started_at:iso(a.fieldStartedAt||a.startedAt||a.createdAt),
    completed_at:null,
    app_data:appData,
    client_modified_at:iso(publishMs),
    source_device_id:getStore()?.deviceId?.()||null
  }).eq('id',a.id).select('client_modified_at,updated_at').single();
  if(updateError)throw updateError;

  const acceptedMs=ms(updated?.client_modified_at||updated?.updated_at)||publishMs;
  if(forceConflict){
    a.modifiedAt=acceptedMs;
    a.lastModifiedDeviceId=getStore()?.deviceId?.()||a.lastModifiedDeviceId||'';
    a.syncStatus='CLOUD';
  }
  patchAttempt(a,{status:'synced',error:'',lastSyncedAt:Date.now(),remoteModifiedAt:acceptedMs});
  return true;
}

function freshTimerStore(t){
  const out={};for(const d of (t?.timers||[]))out[d.id]={instances:[],currentIndex:-1};return out;
}
async function pullEvaluation(c,s,a,options={}){
  const client=getClient();
  const force=options?.force===true;
  const {data:row,error}=await client.from('evaluations')
    .select('id,status,overall_result,score_numerator,score_denominator,started_at,completed_at,app_data,client_modified_at,updated_at,source_device_id,curriculum_version_id,evaluator_id')
    .eq('id',a.id).maybeSingle();
  if(error)throw error;if(!row)return false;

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
  if(!force&&!a.cloudShellOnly&&lastSeen&&localMs>lastSeen+10)return false;
  if(!force&&!a.cloudShellOnly&&!lastSeen&&localMs>remoteMs+1000)return false;
  if(!force&&!a.cloudShellOnly&&remoteMs<=lastSeen+10)return false;

  const crit=await criteriaFor(row.curriculum_version_id);
  const [{data:cr,error:crErr},{data:tr,error:trErr}]=await Promise.all([
    client.from('criterion_results').select('criterion_id,result,failure_mode,primary_contributor,evaluator_note,graded_at,app_data,client_modified_at').eq('evaluation_id',canonicalId),
    client.from('timer_results').select('criterion_id,timer_name,started_at,stopped_at,elapsed_ms,standard_ms,standard_met,sync_key,app_data,client_modified_at,source_device_id').eq('evaluation_id',canonicalId)
  ]);
  if(crErr)throw crErr;if(trErr)throw trErr;

  a.ratings={};a.methods={};a.stamps={};a.ntReasons={};a.failureDetails={};a.notes={};
  for(const r of cr||[]){
    const code=crit.byId.get(r.criterion_id)?.criterion_code;if(!code)continue;
    a.ratings[code]=RESULT_FROM_DB[r.result]||'nt';
    a.stamps[code]=ms(r.graded_at||r.client_modified_at)||remoteMs;
    a.methods[code]=r.app_data?.method||'cloud';
    if(r.app_data?.ntReason)a.ntReasons[code]=r.app_data.ntReason;
    if(r.result==='fail')a.failureDetails[code]=r.app_data?.failureDetail||{mode:r.failure_mode||'',contributor:r.primary_contributor||''};
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

  const app=row.app_data||{};
  for(const k of ['section','timerForced','events','instants','trainerSign','evaluatorId','cloudEvaluatorUserId','startedByUserId','startedByDeviceId','studentSign','overallNotes','remediation'])if(app[k]!==undefined)a[k]=app[k];
  if(!a.cloudEvaluatorUserId&&row.evaluator_id)a.cloudEvaluatorUserId=row.evaluator_id;
  if(!a.startedByUserId&&a.cloudEvaluatorUserId)a.startedByUserId=a.cloudEvaluatorUserId;
  if(app.showNt!==undefined)a.showNt=!!app.showNt;
  if(app.observeMode!==undefined){a.observeMode=!!app.observeMode;a.fieldMode=a.observeMode;}
  a.startedAt=ms(row.started_at)||a.startedAt;
  a.finalizedAt=ms(row.completed_at)||null;
  a.finalResult=row.overall_result?String(row.overall_result).toUpperCase():null;
  a.modifiedAt=remoteMs||Date.now();
  a.lastModifiedDeviceId=row.source_device_id||'';
  a.syncStatus='CLOUD';
  a.cloudShellOnly=false;
  a.cloudGrading={status:'synced',error:'',lastSyncedAt:Date.now(),remoteModifiedAt:remoteMs};
  persist();
  return true;
}

async function inspectConflict(c,s,a){
  const client=getClient();
  if(!client||!navigator.onLine)throw new Error('Conflict resolution requires an online connection.');

  const {data:row,error}=await client.from('evaluations')
    .select('id,event_id,participant_id,evaluator_id,curriculum_version_id,attempt_number,status,overall_result,score_numerator,score_denominator,started_at,completed_at,app_data,client_modified_at,updated_at,source_device_id')
    .eq('id',a.id).maybeSingle();
  if(error)throw error;
  if(!row){
    const fallback=await client.from('evaluations')
      .select('id,event_id,participant_id,evaluator_id,curriculum_version_id,attempt_number,status,overall_result,score_numerator,score_denominator,started_at,completed_at,app_data,client_modified_at,updated_at,source_device_id')
      .eq('event_id',c.id)
      .eq('participant_id',s.id)
      .eq('attempt_number',Number(a.attemptNo||1))
      .neq('status','voided')
      .maybeSingle();
    if(fallback.error)throw fallback.error;
    row=fallback.data||null;
  }
  if(!row)throw new Error('No authoritative server evaluation exists for this student and attempt.');

  const canonicalId=String(row.id);
  const crit=await criteriaFor(row.curriculum_version_id||await curriculumIdFor(c));
  const [{data:cr,error:crErr},{data:tr,error:trErr}]=await Promise.all([
    client.from('criterion_results')
      .select('criterion_id,result,failure_mode,primary_contributor,evaluator_note,graded_at,app_data,client_modified_at,source_device_id')
      .eq('evaluation_id',canonicalId),
    client.from('timer_results')
      .select('criterion_id,timer_name,started_at,stopped_at,elapsed_ms,standard_ms,standard_met,sync_key,app_data,client_modified_at,source_device_id')
      .eq('evaluation_id',canonicalId)
  ]);
  if(crErr)throw crErr;
  if(trErr)throw trErr;

  const remoteRatings={};
  for(const r of cr||[]){
    const code=crit.byId.get(r.criterion_id)?.criterion_code;
    if(code)remoteRatings[code]=RESULT_FROM_DB[r.result]||'nt';
  }

  return {
    evaluationId:canonicalId,
    localEvaluationId:String(a.id||''),
    canonicalEvaluationId:canonicalId,
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
  strategy=String(strategy||'').toLowerCase();
  if(!['server','local'].includes(strategy))throw new Error('Conflict resolution must choose SERVER or LOCAL.');
  if(attemptState(a).status!=='conflict')throw new Error('This evaluation is not currently in conflict.');

  const inspection=await inspectConflict(c,s,a);
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
    if(!ok)throw new Error('Unable to load the authoritative server evaluation.');
    const serverRow=inspection.serverSnapshot?.evaluation||{};
    const serverApp=serverRow.app_data||{};
    a.pendingServerClaim=false;
    a.pendingServerFinalization=false;
    if(serverApp.fieldStartedAt!==undefined)a.fieldStartedAt=Number(serverApp.fieldStartedAt)||a.fieldStartedAt||null;
    if(serverApp.fieldFinalizedAt!==undefined)a.fieldFinalizedAt=Number(serverApp.fieldFinalizedAt)||a.fieldFinalizedAt||null;
    if(serverApp.fieldFinalResult!==undefined)a.fieldFinalResult=String(serverApp.fieldFinalResult||'').toUpperCase()||a.fieldFinalResult||null;
    if(serverApp.offlineStarted!==undefined)a.offlineStarted=!!serverApp.offlineStarted;
    if(serverApp.serverClaimedAt!==undefined)a.serverClaimedAt=serverApp.serverClaimedAt;
    if(serverApp.serverAuditConfirmation!==undefined)a.serverAuditConfirmation=cloneJson(serverApp.serverAuditConfirmation);
    a.serverVerificationStatus=String(serverApp.serverVerificationStatus||(String(serverRow.status||'').toLowerCase()==='finalized'?'verified':'')).toLowerCase()||'server';
    patchAttempt(a,{status:'synced',error:'',lastSyncedAt:Date.now(),remoteModifiedAt:inspection.remoteModifiedAt});
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
  const store=getStore();if(!store)return 0;let n=0;
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled)){
    for(const s of c.students||[]){
      for(const a of Object.values(s.attempts||{})){
        if(!a?.id)continue;
        if(a.pendingServerClaim||a.pendingServerFinalization)continue;
        try{if(await pullEvaluation(c,s,a))n++;}catch(e){console.warn('Evaluation pull failed',a.id,e)}
      }
    }
  }
  return n;
}
async function reconcileOfflineAttempt(c,s,a){
  const client=getClient(),cloud=getCloud(),store=getStore();
  if(!client||!cloud?.user?.id||!navigator.onLine)return false;
  if(!a?.id||a.cloudShellOnly)return false;
  if(!(a.pendingServerClaim||a.pendingServerFinalization))return false;

  patchAttempt(a,{status:'syncing',error:'Reconciling offline field evaluation…'});

  try{
    if(window.RAPS_ROSTER_SYNC?.pushClassRosterAndShells){
      const prepared=await window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(c,{skipEvaluationShells:true});
      if(!prepared)throw new Error('Class/event/roster preparation did not complete.');
    }

    if(a.pendingServerClaim){
      const {data:eventRow,error:eventError}=await client.from('evaluation_events')
        .select('id,curriculum_version_id,status')
        .eq('id',c.id)
        .maybeSingle();
      if(eventError)throw eventError;
      if(!eventRow?.curriculum_version_id)throw new Error('Authoritative evaluation event is not ready.');

      const {data,error}=await client.rpc('claim_evaluation_authoritatively',{
        p_evaluation_id:a.id,
        p_event_id:c.id,
        p_participant_id:s.id,
        p_curriculum_version_id:eventRow.curriculum_version_id,
        p_attempt_number:Number(a.attemptNo||1),
        p_source_device_id:store?.deviceId?.()||null
      });
      if(error)throw error;

      const claim=data||{};
      if(!claim.claimed){
        a.serverVerificationStatus='conflict';
        patchAttempt(a,{
          status:'conflict',
          error:claim.reason==='evaluation_owned_by_other_evaluator'
            ? 'Offline evaluation conflicts with an attempt already owned by another evaluator. Review required; no data was overwritten.'
            : claim.reason==='active_evaluation_exists'
              ? 'Another active server evaluation blocks this offline record. Review required; no data was overwritten.'
              : 'Server claim rejected: '+String(claim.reason||'unknown reason')+'. Review required.'
        });
        return false;
      }

      const canonicalId=String(claim.evaluationId||a.id);
      if(canonicalId!==String(a.id)){
        a.serverVerificationStatus='conflict';
        patchAttempt(a,{
          status:'conflict',
          error:'The server already has a different canonical evaluation UUID for this student/attempt. Review required; RaPS did not overwrite either record.'
        });
        return false;
      }

      a.pendingServerClaim=false;
      a.serverClaimMode='authoritative-v1';
      a.fieldStartedAt=a.fieldStartedAt||a.startedAt||a.createdAt||Date.now();
      a.serverClaimedAt=ms(claim.startedAt)||Date.now();
      a.serverClaimedBy=cloud.user.id;
      a.serverVerificationStatus=a.pendingServerFinalization?'pending':'claimed';
      persist();
    }

    const pushed=await pushEvaluation(c,s,a,{skipRosterSync:true});
    if(!pushed)throw new Error(attemptState(a).error||'Offline evaluation upload did not complete.');

    if(a.pendingServerFinalization){
      const {data,error}=await client.rpc('finalize_evaluation_authoritatively',{
        p_evaluation_id:a.id,
        p_source_device_id:store?.deviceId?.()||null
      });
      if(error)throw error;
      const result=data||{};
      if(!result.finalized){
        const issues=Array.isArray(result.issues)?result.issues:[];
        a.serverVerificationStatus='conflict';
        patchAttempt(a,{
          status:'conflict',
          error:issues.length
            ? 'Server verification rejected the locally finalized evaluation: '+issues.slice(0,5).join(' | ')
            : 'Server verification rejected the locally finalized evaluation: '+String(result.reason||'unknown reason')
        });
        return false;
      }

      const serverResult=String(result.result||'').toUpperCase();
      const fieldResult=String(a.fieldFinalResult||a.finalResult||'').toUpperCase();
      a.serverFinalization={
        mode:'server_authoritative',
        finalizedAt:ms(result.completedAt)||Date.now(),
        result:serverResult,
        scoreNumerator:Number(result.scoreNumerator||0),
        scoreDenominator:Number(result.scoreDenominator||0),
        criticalFailureCount:Number(result.criticalFailureCount||0),
        globalTimerNotMet:!!result.globalTimerNotMet
      };
      if(serverResult&&fieldResult&&serverResult!==fieldResult){
        a.serverVerificationStatus='conflict';
      }else{
        const fieldStartedIso=iso(a.fieldStartedAt||a.startedAt||a.createdAt);
        const fieldFinalizedIso=iso(a.fieldFinalizedAt||a.finalizedAt);
        const {data:auditData,error:auditError}=await client.rpc('confirm_offline_evaluation_audit',{
          p_evaluation_id:a.id,
          p_field_started_at:fieldStartedIso,
          p_field_finalized_at:fieldFinalizedIso,
          p_field_result:fieldResult||serverResult,
          p_source_device_id:store?.deviceId?.()||null
        });
        if(auditError)throw auditError;
        if(!auditData?.confirmed){
          a.serverVerificationStatus='conflict';
          patchAttempt(a,{
            status:'conflict',
            error:'Server audit confirmation rejected the offline field evidence: '+String(auditData?.reason||'unknown reason')+'. Record preserved for review.'
          });
          return false;
        }
        a.serverVerificationStatus='verified';
        a.serverAuditConfirmation={
          confirmedAt:ms(auditData.confirmedAt)||Date.now(),
          serverModifiedAt:ms(auditData.serverModifiedAt)||Date.now()
        };
      }
      a.pendingServerFinalization=false;
      a.finalizedAt=a.fieldFinalizedAt||a.finalizedAt||Date.now();
      if(!a.fieldFinalizedAt)a.fieldFinalizedAt=a.finalizedAt;
      if(!a.fieldFinalResult)a.fieldFinalResult=fieldResult||serverResult;
      a.finalResult=serverResult||fieldResult;
      a.events=a.events||[];
      a.events.push({
        at:a.serverFinalization.finalizedAt,
        elapsed:Math.max(0,(a.fieldFinalizedAt||a.finalizedAt)-(a.fieldStartedAt||a.startedAt)),
        label:'Server verification completed',
        detail:`${serverResult||fieldResult} · authoritative verification after offline field finalization`
      });

      if(a.serverVerificationStatus==='conflict'){
        patchAttempt(a,{
          status:'conflict',
          error:`Server result ${serverResult} differs from field result ${fieldResult}. Record preserved for review.`
        });
        return false;
      }
    }

    patchAttempt(a,{status:'synced',error:'',lastSyncedAt:Date.now()});
    persist();
    return true;
  }catch(error){
    if(!navigator.onLine){
      patchAttempt(a,{status:'offline',error:'Connectivity lost during reconciliation; local field record remains preserved.'});
      return false;
    }
    patchAttempt(a,{status:'error',error:err(error)});
    console.warn('Offline evaluation reconciliation failed',a.id,error);
    return false;
  }
}

async function reconcilePendingOffline(){
  const store=getStore();if(!store||!navigator.onLine||!getCloud()?.user?.id)return 0;
  const pending=[];
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled&&!x?.closedAt&&x?.status!=='closed')){
    for(const s of c.students||[]){
      for(const a of Object.values(s.attempts||{})){
        if(a?.id&&(a.pendingServerClaim||a.pendingServerFinalization)){
          pending.push({c,s,a});
        }
      }
    }
  }
  pending.sort((x,y)=>Number(x.a.startedAt||x.a.createdAt||0)-Number(y.a.startedAt||y.a.createdAt||0));
  let n=0;
  for(const item of pending){
    if(!navigator.onLine)break;
    if(await reconcileOfflineAttempt(item.c,item.s,item.a))n++;
    if(item.a.cloudGrading?.status==='conflict')break;
    if(item.a.pendingServerClaim||item.a.pendingServerFinalization)break;
  }
  return n;
}

async function pushAll(){
  const store=getStore();if(!store)return 0;let n=0;
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled && !x?.closedAt && x?.status!=='closed')){
    for(const s of c.students||[]){
      for(const a of Object.values(s.attempts||{})){
        if(!a?.id||a.cloudShellOnly)continue;
        const state=attemptState(a),localMs=Number(a.modifiedAt||0),remoteMs=Number(state.remoteModifiedAt||0);
        if(state.status==='conflict')continue;
        if(state.status==='synced'&&remoteMs&&localMs<=remoteMs+10)continue;
        try{if(await pushEvaluation(c,s,a))n++;}catch(e){patchAttempt(a,{status:'error',error:err(e)});console.warn('Evaluation push failed',a.id,e)}
      }
    }
  }
  return n;
}
async function syncAll(){
  if(!navigator.onLine||!getCloud()?.user?.id)return;
  if(busy){
    rerunRequested=true;
    return;
  }
  busy=true;
  rerunRequested=false;
  try{
    // After a network transition, cloud-auth may still be refreshing the
    // persisted Supabase session. If identity is still in cached/offline mode,
    // wait for the raps-cloud-identity event rather than racing the old token.
    if(getCloud()?.offlineCached===true){
      rerunRequested=true;
      return;
    }
    await reconcilePendingOffline();
    await pullAll();
    await pushAll();
  }
  finally{
    busy=false;
    if(rerunRequested&&navigator.onLine){
      rerunRequested=false;
      setTimeout(()=>syncAll(),250);
    }
  }
}
function queue(classId){
  clearTimeout(timers.get(classId));
  timers.set(classId,setTimeout(()=>syncAll(),900));
}

window.addEventListener('raps-local-class-change',e=>queue(e.detail?.classId));
window.addEventListener('raps-class-sync-complete',()=>syncAll());
window.addEventListener('raps-cloud-identity',()=>syncAll());
window.addEventListener('online',()=>{
  rerunRequested=true;
  setTimeout(()=>syncAll(),250);
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>syncAll(),{once:true});
else syncAll();

window.RAPS_GRADING_SYNC_BUILD='3.4.12-offline-field-ops.2';
window.RAPS_GRADING_SYNC=Object.freeze({
  syncAll,
  reconcilePendingOffline,
  reconcileOfflineAttempt,
  pushEvaluation,
  pullEvaluation,
  pullAll,
  pushAll,
  inspectConflict,
  resolveConflict
});
})();
