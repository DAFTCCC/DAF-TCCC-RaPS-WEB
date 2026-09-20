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

function iso(ms){return Number.isFinite(Number(ms))?new Date(Number(ms)).toISOString():null}
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

async function pushEvaluation(c,s,a){
  const client=getClient(),cloud=getCloud();
  if(!client||!cloud?.user?.id||!navigator.onLine)return false;

  if(window.RAPS_ROSTER_SYNC?.pushClassRosterAndShells) await window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(c);

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
  if(remote&&remote.source_device_id&&remote.source_device_id!==getStore()?.deviceId?.()&&remoteMs>localMs+1000&&remoteMs>lastSeen+1000){
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
    .select('id,criterion_id').eq('evaluation_id',a.id);
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
    .select('id,sync_key').eq('evaluation_id',a.id);
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
    evaluator_id:remote?.evaluator_id||cloud.user.id,
    status:evalStatus(a),
    overall_result:finalResult(a),
    score_numerator:sc.pass,
    score_denominator:sc.denom,
    started_at:iso(a.startedAt),
    completed_at:iso(a.finalizedAt),
    app_data:appData,
    client_modified_at:iso(localMs),
    source_device_id:getStore()?.deviceId?.()||null
  }).eq('id',a.id).select('client_modified_at,updated_at').single();
  if(updateError)throw updateError;

  patchAttempt(a,{status:'synced',error:'',lastSyncedAt:Date.now(),remoteModifiedAt:ms(updated?.client_modified_at||updated?.updated_at)||localMs});
  return true;
}

function freshTimerStore(t){
  const out={};for(const d of (t?.timers||[]))out[d.id]={instances:[],currentIndex:-1};return out;
}
async function pullEvaluation(c,s,a){
  const client=getClient();
  const {data:row,error}=await client.from('evaluations')
    .select('id,status,overall_result,score_numerator,score_denominator,started_at,completed_at,app_data,client_modified_at,updated_at,source_device_id,curriculum_version_id')
    .eq('id',a.id).maybeSingle();
  if(error)throw error;if(!row)return false;

  const remoteMs=ms(row.client_modified_at||row.updated_at);
  const localMs=Number(a.modifiedAt||0);
  if(!a.cloudShellOnly&&localMs>remoteMs+1000)return false;
  if(!a.cloudShellOnly&&remoteMs<=Number(attemptState(a).remoteModifiedAt||0)+500)return false;

  const crit=await criteriaFor(row.curriculum_version_id);
  const [{data:cr,error:crErr},{data:tr,error:trErr}]=await Promise.all([
    client.from('criterion_results').select('criterion_id,result,failure_mode,primary_contributor,evaluator_note,graded_at,app_data,client_modified_at').eq('evaluation_id',a.id),
    client.from('timer_results').select('criterion_id,timer_name,started_at,stopped_at,elapsed_ms,standard_ms,standard_met,sync_key,app_data,client_modified_at,source_device_id').eq('evaluation_id',a.id)
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
  for(const k of ['section','timerForced','events','instants','trainerSign','evaluatorId','studentSign','overallNotes','remediation'])if(app[k]!==undefined)a[k]=app[k];
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

async function pullAll(){
  const store=getStore();if(!store)return 0;let n=0;
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled)){
    for(const s of c.students||[]){
      for(const a of Object.values(s.attempts||{})){
        if(!a?.id)continue;
        try{if(await pullEvaluation(c,s,a))n++;}catch(e){console.warn('Evaluation pull failed',a.id,e)}
      }
    }
  }
  return n;
}
async function pushAll(){
  const store=getStore();if(!store)return 0;let n=0;
  for(const c of store.getClasses().filter(x=>x?.cloudSync?.enabled)){
    for(const s of c.students||[]){
      for(const a of Object.values(s.attempts||{})){
        if(!a?.id||a.cloudShellOnly)continue;
        try{if(await pushEvaluation(c,s,a))n++;}catch(e){patchAttempt(a,{status:'error',error:err(e)});console.warn('Evaluation push failed',a.id,e)}
      }
    }
  }
  return n;
}
async function syncAll(){
  if(busy||!navigator.onLine||!getCloud()?.user?.id)return;
  busy=true;
  try{await pullAll();await pushAll();}
  finally{busy=false}
}
function queue(classId){
  clearTimeout(timers.get(classId));
  timers.set(classId,setTimeout(()=>syncAll(),900));
}

window.addEventListener('raps-local-class-change',e=>queue(e.detail?.classId));
window.addEventListener('raps-class-sync-complete',()=>syncAll());
window.addEventListener('raps-cloud-identity',()=>syncAll());
window.addEventListener('online',()=>syncAll());

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>syncAll(),{once:true});
else syncAll();

window.RAPS_GRADING_SYNC=Object.freeze({syncAll,pushEvaluation,pullEvaluation,pullAll,pushAll});
})();
