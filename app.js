(() => {
'use strict';
const TIERS = window.TCCC_TIERS;
const LOCATION_DATA = window.TCCC_INSTALLATION_DATA || {catalogVersion:'unknown',commands:[],installations:[]};
const ANALYTICS_SCHEMA_VERSION = 'TCCC_ANALYTICS_3.0';
const APP_VERSION = window.TCCC_BUILD?.versionName;
if(!APP_VERSION) throw new Error('Missing TCCC build version. Ensure version.js loads before app.js.');
const DB_KEY = 'TCCC_SUITE_DB';
const LEGACY_DB_KEYS = ['TCCC_SUITE_V215_DB'];
const $ = id => document.getElementById(id);
const deep = x => JSON.parse(JSON.stringify(x));
const now = () => Date.now();
const monoNow = () => (typeof performance !== 'undefined' && Number.isFinite(performance.now?.())) ? performance.now() : null;
const uuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const h = [...bytes].map(b => b.toString(16).padStart(2, '0'));

  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
};
const RUNTIME_ID = `runtime-${uuid()}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe = s => String(s||'record').replace(/[^a-z0-9_-]+/gi,'_');
const fmt = ms => { const s=Math.max(0,Math.floor((ms||0)/1000)); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
const wall = ms => ms ? new Date(ms).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';
const iso = ms => ms ? new Date(ms).toISOString() : '';
let db = null;
let currentClassId=null, currentStudentId=null, currentAttemptNo=1;
let rosterFilter='all', rosterSearchTerm='';
let managementFilters={majcom:'',installationId:'',tierId:'',courseType:''};
let homeArea='evaluate';
let tick=null;
const SYNC_LOCAL='LOCAL';
const SYNC_PENDING='PENDING';
const SYNCED='SYNCED';
const LEGACY_FAILURE_MODE_MAP={
  'omitted':'omitted','incorrect-technique':'incorrect','incorrect':'incorrect',
  'delayed':'delayed-sequence','wrong-sequence':'delayed-sequence','timing':'delayed-sequence','delayed-sequence':'delayed-sequence',
  'incomplete':'incomplete','unsafe':'unsafe-other','other':'unsafe-other','unsafe-other':'unsafe-other','unclassified':'unclassified'
};
const LEGACY_CONTRIBUTOR_MAP={
  'knowledge':'knowledge',
  'cue-recognition':'recognition-judgment','judgment':'recognition-judgment','recognition-judgment':'recognition-judgment',
  'psychomotor':'skill-execution','skill-execution':'skill-execution',
  'prioritization':'prioritization-teamwork','communication':'prioritization-teamwork','prioritization-teamwork':'prioritization-teamwork',
  'equipment':'environment-system','stress':'environment-system','scenario':'environment-system','training':'environment-system','evaluator':'environment-system','other':'environment-system','environment-system':'environment-system'
};
const FAILURE_MODE_LABELS={
  'omitted':'Omitted','incorrect':'Incorrect','delayed-sequence':'Delayed / Wrong Sequence','incomplete':'Incomplete','unsafe-other':'Unsafe / Other','unclassified':'Unclassified / review later'
};
const CONTRIBUTOR_LABELS={
  'knowledge':'Knowledge','recognition-judgment':'Recognition / Judgment','skill-execution':'Skill / Execution','prioritization-teamwork':'Prioritization / Teamwork','environment-system':'Environment / System'
};

function ensureSyncMeta(rec,createdFallback=now(),deviceFallback=''){
  if(!rec||typeof rec!=='object')return rec;
  rec.createdAt=rec.createdAt||createdFallback||now();
  rec.modifiedAt=rec.modifiedAt||rec.createdAt;
  rec.deviceId=rec.deviceId||deviceFallback||'';
  rec.lastModifiedDeviceId=rec.lastModifiedDeviceId||rec.deviceId||deviceFallback||'';
  rec.syncStatus=rec.syncStatus||SYNC_LOCAL;
  return rec;
}
function migrateFailureDetail(d){
  if(!d||typeof d!=='object')return d;
  const oldMode=d.mode||'';const oldContributor=d.contributor||'';
  const mode=LEGACY_FAILURE_MODE_MAP[oldMode]||oldMode||'unclassified';
  const contributor=LEGACY_CONTRIBUTOR_MAP[oldContributor]||oldContributor||'';
  if(oldMode&&oldMode!==mode&&!d.legacyMode)d.legacyMode=oldMode;
  if(oldContributor&&oldContributor!==contributor&&!d.legacyContributor)d.legacyContributor=oldContributor;
  d.mode=mode;d.modeLabel=FAILURE_MODE_LABELS[mode]||d.modeLabel||mode;
  d.contributor=contributor;d.contributorLabel=CONTRIBUTOR_LABELS[contributor]||d.contributorLabel||'';
  if(!d.comment&&d.contributingFactor)d.comment=d.contributingFactor;
  return d;
}
function normalizeDb(x){
  if(!x||!Array.isArray(x.classes)) return null;
  x.schemaVersion=5;
  x.deviceId=x.deviceId||`device-${uuid()}`;
  x.createdAt=x.createdAt||now();x.modifiedAt=x.modifiedAt||x.createdAt;x.syncStatus=x.syncStatus||SYNC_LOCAL;
  x.classes.forEach(c=>{
    ensureSyncMeta(c,c.createdAt||now(),x.deviceId);c.deviceId=c.deviceId||x.deviceId;c.lastModifiedDeviceId=c.lastModifiedDeviceId||c.deviceId;c.appVersion=c.appVersion||APP_VERSION;
    c.deletedAt=c.deletedAt||null;
    c.cloudSync=c.cloudSync||{enabled:false,status:'local',error:'',createdBy:'',lastSyncedAt:0,localModifiedAt:0,remoteModifiedAt:0};
    c.closedAt=c.closedAt||null;
    c.closedBy=c.closedBy||'';
    c.courseType=c.courseType||'initial';
    c.siteCode=c.siteCode||'';
    c.evaluatorId=c.evaluatorId||'';
    c.scenarioDifficulty=c.scenarioDifficulty||'standard';
    c.scenarioProfile=c.scenarioProfile||'';
    c.curriculumId=c.curriculumId||`TCCC-TIER${c.tierId||''}`;
    c.contentVersion=c.contentVersion||`${c.tierSnapshot?.source||TIERS[c.tierId]?.source||''} | app ${c.appVersion||APP_VERSION}`;
    if(c.tierSnapshot){
      if(Array.isArray(c.tierSnapshot.ratings))c.tierSnapshot.ratings=c.tierSnapshot.ratings.filter(r=>r?.key!=='no');
      if(typeof c.tierSnapshot.instructions==='string')c.tierSnapshot.instructions=c.tierSnapshot.instructions.replace(/PASS \/ FAIL \/ NT \/ N\/O/g,'PASS / FAIL / NT').replace(/N\/O remains unresolved until adjudicated\. ?/g,'Blank criteria remain unresolved until graded. ');
      if(typeof c.tierSnapshot.passRule==='string')c.tierSnapshot.passRule=c.tierSnapshot.passRule.replace('_no_unresolved_no','');
    }
    ensureLocationFields(c);
    (c.students||[]).forEach(st=>{
      ensureSyncMeta(st,st.createdAt||c.createdAt||now(),c.deviceId||x.deviceId);st.deviceId=st.deviceId||c.deviceId||x.deviceId;st.lastModifiedDeviceId=st.lastModifiedDeviceId||st.deviceId;st.classId=st.classId||c.id;st.appVersion=st.appVersion||c.appVersion||APP_VERSION;st.contentVersion=st.contentVersion||c.contentVersion||'';
      st.attempts=st.attempts||{};
      Object.values(st.attempts).filter(Boolean).forEach(a=>{
        ensureSyncMeta(a,a.startedAt||st.createdAt||now(),st.deviceId||c.deviceId||x.deviceId);a.deviceId=a.deviceId||st.deviceId||c.deviceId||x.deviceId;a.lastModifiedDeviceId=a.lastModifiedDeviceId||a.deviceId;a.classId=a.classId||c.id;a.participantId=a.participantId||st.id;a.appVersion=a.appVersion||st.appVersion||c.appVersion||APP_VERSION;a.contentVersion=a.contentVersion||st.contentVersion||c.contentVersion||'';
        a.id=a.id||uuid();
        a.ntReasons=a.ntReasons||{};
        a.failureDetails=a.failureDetails||{};
        a.methods=a.methods||{};
        a.stamps=a.stamps||{};
        a.notes=a.notes||{};
        a.noteOpen=a.noteOpen||{};
        a.observeMode=a.observeMode!==undefined?a.observeMode:(a.fieldMode!==undefined?a.fieldMode:true);
        a.fieldMode=a.observeMode; // compatibility with v2.x backups
        a.remediation=a.remediation||null;
        a.cloudEvaluatorUserId=a.cloudEvaluatorUserId||'';
        a.startedByUserId=a.startedByUserId||a.cloudEvaluatorUserId||'';
        a.startedByDeviceId=a.startedByDeviceId||a.deviceId||'';
        a.timerForced=a.timerForced||{};
        a.legacyRatings=a.legacyRatings||{};
        Object.entries(a.ratings||{}).forEach(([itemId,rating])=>{
          if(rating==='no'){
            a.legacyRatings[itemId]={rating:'no',method:a.methods?.[itemId]||'',stamp:a.stamps?.[itemId]||null,migratedAt:now(),migratedBy:APP_VERSION};
            delete a.ratings[itemId];
          }
        });
        Object.values(a.failureDetails).forEach(migrateFailureDetail);
        Object.values(a.timers||{}).forEach(store=>(store.instances||[]).forEach(xi=>{
          if(xi.finalDurationMs===undefined)xi.finalDurationMs=null;
          if(xi.runtimeId===undefined)xi.runtimeId=null;
          if(xi.wallStartMono===undefined)xi.wallStartMono=null;
          if(xi.activeStartedMono===undefined)xi.activeStartedMono=null;
          if(xi.pauseStartedMono===undefined)xi.pauseStartedMono=null;
        }));
      });
    });
    if(c.closedAt)c.status='closed';
    else if(!c.status||c.status==='active') c.status=(c.students||[]).some(st=>Object.values(st.attempts||{}).some(a=>a?.startedAt))?'active':'draft';
  });
  return x;
}
function loadDb(){
  for(const key of [DB_KEY,...LEGACY_DB_KEYS]){
    try{
      const x=normalizeDb(JSON.parse(localStorage.getItem(key)));
      if(x){ if(key!==DB_KEY)localStorage.setItem(DB_KEY,JSON.stringify(x)); return x; }
    }catch{}
  }
  const ts=now();return {schemaVersion:5,appVersion:APP_VERSION,deviceId:`device-${uuid()}`,createdAt:ts,modifiedAt:ts,syncStatus:SYNC_LOCAL,classes:[]};
}
db = loadDb();

function saveDb(){
  const ts=now();db.schemaVersion=5;db.appVersion=APP_VERSION;db.modifiedAt=ts;db.syncStatus=SYNC_LOCAL;
  if(!db.deviceId)db.deviceId=`device-${uuid()}`;
  const c=cls();if(c){ensureSyncMeta(c,c.createdAt||ts,db.deviceId);c.modifiedAt=ts;c.lastModifiedDeviceId=db.deviceId;c.syncStatus=SYNC_LOCAL;
    const st=student();if(st){ensureSyncMeta(st,st.createdAt||ts,db.deviceId);st.modifiedAt=ts;st.lastModifiedDeviceId=db.deviceId;st.syncStatus=SYNC_LOCAL;
      const a=evalState();if(a){ensureSyncMeta(a,a.startedAt||ts,db.deviceId);a.modifiedAt=ts;a.lastModifiedDeviceId=db.deviceId;a.syncStatus=SYNC_LOCAL;}
    }
  }
  if(c){
    const state=c.cloudSync||{};
    if(state.enabled===true && state.status!=='syncing'){
      state.status=navigator.onLine?'pending':'offline';
      state.error='';
      state.localModifiedAt=ts;
      c.cloudSync=state;
    }
  }
  localStorage.setItem(DB_KEY,JSON.stringify(db));
  if(c?.cloudSync?.enabled===true && c.cloudSync.status!=='syncing'){
    window.dispatchEvent(new CustomEvent('raps-local-class-change',{detail:{classId:c.id,at:ts}}));
  }
}
function cls(){ return db.classes.find(c=>c.id===currentClassId); }
function tier(){ const c=cls(); return c ? (c.tierSnapshot||TIERS[c.tierId]) : null; }
function student(){ const c=cls(); return c?.students.find(s=>s.id===currentStudentId); }
function evalState(){ return student()?.attempts?.[String(currentAttemptNo)] || null; }
function currentCloudUserId(){return String(window.RAPS_CLOUD?.user?.id||'');}
function attemptBelongsToCurrentEvaluator(a){
  if(!a||a.finalizedAt||a.voidedAt||a.cloudShellOnly)return false;
  const uid=currentCloudUserId();
  if(uid){
    if(a.cloudEvaluatorUserId)return String(a.cloudEvaluatorUserId)===uid;
    if(a.startedByUserId)return String(a.startedByUserId)===uid;
  }
  if(a.startedByDeviceId)return String(a.startedByDeviceId)===String(db.deviceId||'');
  return !!a.deviceId&&String(a.deviceId)===String(db.deviceId||'');
}
function findActiveEvaluationLock(){
  const locks=[];
  (db.classes||[]).filter(c=>!c.deletedAt&&!isClassClosed(c)).forEach(c=>{
    (c.students||[]).forEach(s=>{
      Object.values(s.attempts||{}).filter(Boolean).forEach(a=>{
        if(!a.startedAt||a.finalizedAt||a.voidedAt||a.cloudShellOnly||!attemptBelongsToCurrentEvaluator(a))return;
        locks.push({
          classId:c.id,className:c.name||'Untitled Class',
          studentId:s.id,studentName:s.name||'Student',studentRank:s.rank||'',
          attemptNo:Number(a.attemptNo||1),attemptId:a.id||'',
          startedAt:Number(a.startedAt||0)
        });
      });
    });
  });
  locks.sort((x,y)=>(y.startedAt||0)-(x.startedAt||0));
  return locks[0]||null;
}
function evaluationTargetMatchesLock(lock,classId,studentId,attemptNo){
  return !!lock&&String(lock.classId)===String(classId)&&String(lock.studentId)===String(studentId)&&Number(lock.attemptNo)===Number(attemptNo);
}
function activeEvaluationLockText(lock){
  if(!lock)return '';
  const who=`${lock.studentRank?`${lock.studentRank} `:''}${lock.studentName}`;
  return `${who} · Attempt ${lock.attemptNo} · ${lock.className}`;
}
function resumeActiveEvaluation(lock=findActiveEvaluationLock()){
  if(!lock)return false;
  const c=db.classes.find(x=>x.id===lock.classId),s=c?.students?.find(x=>x.id===lock.studentId),a=s?.attempts?.[String(lock.attemptNo)];
  if(!c||!s||!a||a.finalizedAt)return false;
  currentClassId=c.id;currentStudentId=s.id;currentAttemptNo=lock.attemptNo;
  renderEval();showView('evalView');requestEvalWakeLock();return true;
}
function renderActiveEvaluationLockBanner(){
  const el=$('activeEvaluationLockBanner');if(!el)return;
  const lock=findActiveEvaluationLock();
  if(!lock){el.classList.add('hidden');el.innerHTML='';return;}
  el.classList.remove('hidden');
  el.innerHTML=`<div><b>EVALUATION LOCK ACTIVE</b><span>${esc(activeEvaluationLockText(lock))}. Finalize or Void this attempt before opening any other evaluation.</span></div><button id="resumeActiveEvaluationBtn" class="action compact primary" type="button">Resume Current Evaluation</button>`;
  const b=$('resumeActiveEvaluationBtn');if(b)b.onclick=()=>resumeActiveEvaluation(lock);
}
function allItems(t=tier()){ return t ? t.sections.flatMap(s=>s.items.map(i=>({...i,section:s.code,sectionTitle:s.title}))) : []; }
function itemById(id){ return allItems().find(i=>i.id===id); }
function timerDef(id){ return (tier()?.timers||[]).find(d=>d.id===id); }
function timersForItem(id){ return (tier()?.timers||[]).filter(d=>d.linkedItemId===id); }
function hasStartedClass(c){ return (c.students||[]).some(s=>Object.values(s.attempts||{}).some(a=>a?.startedAt)); }
function isClassClosed(c=cls()){ return !!c && (c.status==='closed'||!!c.closedAt); }
function lifecycleStatus(c){ return isClassClosed(c)?'CLOSED':hasStartedClass(c)?'ACTIVE':'DRAFT'; }
function installationById(id){return (LOCATION_DATA.installations||[]).find(x=>x.id===id)||null;}
function commandById(id){return (LOCATION_DATA.commands||[]).find(x=>x.id===id)||null;}
function commandName(id){return commandById(id)?.name||id||'—';}
function installationDisplay(i){if(!i)return '';const suffix=i.state?`, ${i.state}`:(i.country&&i.country!=='USA'?`, ${i.country}`:'');return `${i.name}${suffix}`;}
function inferInstallationId(text){const n=String(text||'').trim().toLowerCase();if(!n)return '';const hit=(LOCATION_DATA.installations||[]).find(i=>[i.name,i.shortName,...(i.aliases||[])].some(v=>String(v||'').trim().toLowerCase()===n));return hit?.id||'';}
function ensureLocationFields(c){
  c.component=c.component||'ACTIVE_DUTY';c.majcom=c.majcom||'';c.unit=c.unit||'';c.exercise=c.exercise||'';
  const legacy=String(c.location||'').trim();
  if(!c.homeInstallationId&&legacy)c.homeInstallationId=inferInstallationId(legacy);
  const home=installationById(c.homeInstallationId);
  c.homeInstallationName=c.homeInstallationName||home?.name||legacy||'';
  c.homeInstallationState=c.homeInstallationState||home?.state||'';c.homeInstallationCountry=c.homeInstallationCountry||home?.country||'';
  if(!c.majcom&&home)c.majcom=(home.commands||[])[0]||home.hostCommand||'';
  c.trainingLocationType=c.trainingLocationType||'SAME_AS_HOME';
  if(c.trainingLocationType==='SAME_AS_HOME'){
    c.trainingInstallationId=c.homeInstallationId||'';c.trainingLocationName=c.homeInstallationName||legacy||'';c.trainingLocationState=c.homeInstallationState||'';c.trainingLocationCountry=c.homeInstallationCountry||'';
  }else{
    const tr=installationById(c.trainingInstallationId);
    c.trainingLocationName=c.trainingLocationName||tr?.name||legacy||c.homeInstallationName||'';
    c.trainingLocationState=c.trainingLocationState||tr?.state||'';c.trainingLocationCountry=c.trainingLocationCountry||tr?.country||'';
  }
  c.location=c.trainingLocationName||c.homeInstallationName||legacy||'';
  return c;
}
function applyClassLocationFields(c,data){
  c.component='ACTIVE_DUTY';c.majcom=String(data.majcom||'').trim();c.unit=String(data.unit||'').trim();c.exercise=String(data.exercise||'').trim();
  const homeId=String(data.homeInstallationId||'');const home=homeId&&homeId!=='__OTHER__'?installationById(homeId):null;
  c.homeInstallationId=home?.id||'';c.homeInstallationName=home?.name||String(data.customHomeLocation||'').trim();c.homeInstallationState=home?.state||String(data.customHomeRegion||'').trim();c.homeInstallationCountry=home?.country||String(data.customHomeCountry||'').trim();
  const same=String(data.sameTrainingLocation||'')==='on';const trainId=String(data.trainingInstallationId||'');
  if(same){c.trainingLocationType='SAME_AS_HOME';c.trainingInstallationId=c.homeInstallationId;c.trainingLocationName=c.homeInstallationName;c.trainingLocationState=c.homeInstallationState;c.trainingLocationCountry=c.homeInstallationCountry;}
  else if(trainId==='__OTHER__'||!trainId){c.trainingLocationType='CUSTOM';c.trainingInstallationId='';c.trainingLocationName=String(data.customTrainingLocation||'').trim();c.trainingLocationState=String(data.customTrainingRegion||'').trim();c.trainingLocationCountry=String(data.customTrainingCountry||'').trim();}
  else{const tr=installationById(trainId);c.trainingLocationType='INSTALLATION';c.trainingInstallationId=tr?.id||'';c.trainingLocationName=tr?.name||'';c.trainingLocationState=tr?.state||'';c.trainingLocationCountry=tr?.country||'';}
  c.location=c.trainingLocationName||c.homeInstallationName||'';return c;
}
const CLASS_LOCATION_HEADERS=['component','operational_majcom','home_installation_id','home_installation_name','home_installation_host_command','unit','site_code','training_location_type','training_installation_id','training_location_name','training_location_region','training_location_country','exercise'];
function classLocationExportValues(c){ensureLocationFields(c);const home=installationById(c.homeInstallationId);return [c.component||'ACTIVE_DUTY',c.majcom||'',c.homeInstallationId||'',c.homeInstallationName||'',home?.hostCommand||'',c.unit||'',c.siteCode||'',c.trainingLocationType||'',c.trainingInstallationId||'',c.trainingLocationName||'',c.trainingLocationState||'',c.trainingLocationCountry||'',c.exercise||''];}

function makeTimerStore(t){
  const out={};
  (t.timers||[]).forEach(d=>out[d.id]={instances:[],currentIndex:-1});
  return out;
}
function makeAttempt(c,s,attemptNo){
  const t=c.tierSnapshot||TIERS[c.tierId];
  const ratings={}, methods={}, stamps={};
  const ntReasons={};
  (c.scenarioNT||[]).forEach(id=>{ const i=t.sections.flatMap(x=>x.items).find(x=>x.id===id); if(i&&!i.critical){ratings[id]='nt';methods[id]='scenario-default';stamps[id]=now();ntReasons[id]={code:'scenario-profile',label:'Class scenario profile — criterion not triggered',detail:'',at:stamps[id]};} });
  return {
    id:uuid(),attemptNo,startedAt:now(),finalizedAt:null,finalResult:null,section:t.sections[0].code,
    ratings,methods,stamps,ntReasons,failureDetails:{},notes:{},noteOpen:{},observeMode:true,fieldMode:true,timerForced:{},timers:makeTimerStore(t),events:[],instants:{},
    trainerSign:c.leadEvaluator||'',evaluatorId:c.evaluatorId||'',studentSign:'',overallNotes:'',showNt:false,appVersion:APP_VERSION,createdAt:now(),modifiedAt:now(),deviceId:db.deviceId,lastModifiedDeviceId:db.deviceId,syncStatus:SYNC_LOCAL,classId:c.id,participantId:s.id,
    startedByUserId:currentCloudUserId(),startedByDeviceId:db.deviceId,cloudEvaluatorUserId:currentCloudUserId(),
    curriculumId:c.curriculumId||`TCCC-TIER${c.tierId}`,contentVersion:c.contentVersion,scenarioVersion:c.scenarioVersion||'1',remediation:null
  };
}
function ensureAttempt(){
  const s=student(), c=cls(); if(!s||!c) return null;
  s.attempts=s.attempts||{};
  const k=String(currentAttemptNo);
  if(!s.attempts[k]){
    if(isClassClosed(c))return null;
    const lock=findActiveEvaluationLock();
    if(lock&&!evaluationTargetMatchesLock(lock,c.id,s.id,currentAttemptNo))return null;
    if(currentAttemptNo===2 && s.attempts?.['1']?.finalResult!=='FAIL')return null;
    c.status='active';s.attempts[k]=makeAttempt(c,s,currentAttemptNo);saveDb();
  }
  return s.attempts[k];
}
function sessionElapsed(st=evalState()){ return st?.startedAt ? now()-st.startedAt : 0; }
function event(label,detail=''){
  const st=evalState(); if(!st) return;
  st.events.push({at:now(),elapsed:sessionElapsed(st),label,detail}); saveDb(); renderTimeline();
}

// ---------- Classes / roster ----------
function createClass(data){
  const source=TIERS[data.tierId];
  const ts=now();const c={id:uuid(),name:String(data.name||'').trim(),tierId:data.tierId,roster:String(data.roster||'').trim(),scenario:String(data.scenario||'').trim(),scenarioVersion:String(data.scenarioVersion||'1').trim()||'1',date:data.date,siteCode:String(data.siteCode||'').trim(),courseType:String(data.courseType||'initial'),scenarioDifficulty:String(data.scenarioDifficulty||'standard'),scenarioProfile:String(data.scenarioProfile||'').trim(),leadEvaluator:String(data.leadEvaluator||'').trim(),evaluatorId:String(data.evaluatorId||'').trim(),curriculumId:`TCCC-TIER${data.tierId}`,appVersion:APP_VERSION,createdAt:ts,modifiedAt:ts,deviceId:db.deviceId,lastModifiedDeviceId:db.deviceId,syncStatus:SYNC_LOCAL,status:'draft',closedAt:null,closedBy:'',deletedAt:null,scenarioNT:[],students:[],cloudSync:{enabled:true,status:navigator.onLine?'pending':'offline',error:'',createdBy:'',lastSyncedAt:0,localModifiedAt:ts,remoteModifiedAt:0},contentVersion:`${source.source} | app ${APP_VERSION}`,tierSnapshot:deep(source)};
  applyClassLocationFields(c,data);db.classes.unshift(c);saveDb();
  localStorage.setItem(DB_KEY,JSON.stringify(db));
  window.dispatchEvent(new CustomEvent('raps-local-class-change',{detail:{classId:c.id,at:ts}}));
  return c;
}
function classStats(c){
  let started=0,completed=0,qualified=0,failed=0;
  c.students.forEach(s=>{
    const attempts=Object.values(s.attempts||{}).filter(Boolean); if(attempts.length) started++;
    const finals=attempts.filter(a=>a.finalizedAt);
    if(finals.length){ completed++; const last=finals.sort((a,b)=>a.attemptNo-b.attemptNo).at(-1); if(last.finalResult==='PASS')qualified++; else failed++; }
  });
  return {started,completed,qualified,failed,total:c.students.length};
}
function showView(id){ ['homeView','classView','evalView'].forEach(v=>$(v).classList.toggle('hidden',v!==id)); window.scrollTo(0,0); }
function showHome(){ releaseEvalWakeLock();currentClassId=currentStudentId=null; renderHome(); showView('homeView'); }
function setHomeArea(area){
  homeArea=['evaluate','manage','readiness','program'].includes(area)?area:'evaluate';
  document.querySelectorAll('[data-app-area]').forEach(el=>el.classList.toggle('hidden',el.dataset.appArea!==homeArea));
  document.querySelectorAll('[data-home-area]').forEach(b=>{const active=b.dataset.homeArea===homeArea;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function cloudSyncBadge(c){
  const s=c?.cloudSync||{};
  if(!s.enabled)return '<span class="syncBadge local">LOCAL</span>';
  const status=String(s.status||'pending').toLowerCase();
  const label=status==='synced'?'SYNCED':status==='syncing'?'SYNCING':status==='offline'?'OFFLINE':status==='conflict'?'CONFLICT':status==='error'?'SYNC ERROR':'PENDING';
  return `<span class="syncBadge ${esc(status)}" title="${esc(s.error||'')}">${label}</span>`;
}
function currentAccessRole(){return String(window.RAPS_CLOUD?.role||document.body?.dataset?.rapsRole||'');}
function hasEnterpriseAccess(){return currentAccessRole()==='enterprise_admin';}
function currentCloudClient(){return window.RAPS_CLOUD?.client||window.RAPS_SUPABASE||null;}
function archiveDate(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():'—';}
function archiveIntegrityShort(value){return value?String(value).slice(0,12)+'…':'—';}
function renderHome(){
  const active=db.classes.filter(c=>!c.deletedAt),trash=db.classes.filter(c=>c.deletedAt),enterprise=hasEnterpriseAccess();
  active.forEach(ensureLocationFields);
  $('classCount').textContent=`${active.length} class${active.length===1?'':'es'}`;
  $('classList').innerHTML=active.length?active.map(c=>{
    const st=classStats(c),t=c.tierSnapshot||TIERS[c.tierId],life=lifecycleStatus(c).toLowerCase(),loc=c.homeInstallationName||c.location||'Location not set',cmd=c.majcom?commandName(c.majcom):'MAJCOM not set';
    return `<div class="classRow"><div><div class="rowTitle">${esc(c.name||'Untitled Class')} <span class="statusPill ${life}">${life.toUpperCase()}</span> ${cloudSyncBadge(c)}</div><div class="rowSub">${esc(cmd)} · ${esc(loc)} · Tier ${c.tierId} ${esc(t.shortName)}<br>${esc(c.roster||'No roster #')} · ${esc(c.scenario||'Scenario not named')} · ${st.completed}/${st.total} finalized · ${st.qualified} qualified${c.closedAt?` · Closed ${new Date(c.closedAt).toLocaleDateString()}`:''}</div></div><div class="rowActions"><button class="action compact" data-open-class="${c.id}">${isClassClosed(c)?'View':'Open'}</button></div></div>`;
  }).join(''):'<div class="empty">No classes yet. Create a class to begin.</div>';
  if($('manageClassList'))$('manageClassList').innerHTML=$('classList').innerHTML;
  $('trashCard').classList.toggle('hidden',!enterprise||trash.length===0);
  $('trashCount').textContent=enterprise?`${trash.length}`:'0';
  $('trashList').innerHTML=enterprise?trash.map(c=>`<div class="classRow"><div><div class="rowTitle">${esc(c.name)} <span class="statusPill trash">LOCAL TRASH</span></div><div class="rowSub">${lifecycleStatus(c)} · Removed locally ${new Date(c.deletedAt).toLocaleString()}</div></div><div class="rowActions"><button class="action compact" data-restore-class="${c.id}">Restore</button><button class="ghost small danger" data-purge-class="${c.id}">Remove Local Copy</button></div></div>`).join(''):'';
  document.querySelectorAll('[data-open-class]').forEach(b=>b.onclick=()=>openClass(b.dataset.openClass));
  if(enterprise){
    document.querySelectorAll('[data-restore-class]').forEach(b=>b.onclick=()=>restoreDeletedClass(b.dataset.restoreClass));
    document.querySelectorAll('[data-purge-class]').forEach(b=>b.onclick=()=>purgeDeletedClass(b.dataset.purgeClass));
  }
  renderManagementDashboard();
  setHomeArea(homeArea);
}
function restoreDeletedClass(id){
  if(!hasEnterpriseAccess()){alert('Enterprise Administrator access is required to restore deleted local classes.');return;}
  const c=db.classes.find(x=>x.id===id);if(!c)return;
  if(isClassClosed(c)){alert('Closed classes are retention records and are not restored through Local Trash. Open the closed class and use the audited archive controls instead.');return;}
  c.deletedAt=null;saveDb();renderHome();
}
function purgeDeletedClass(id){
  if(!hasEnterpriseAccess()){alert('Enterprise Administrator access is required to remove local class copies.');return;}
  const c=db.classes.find(x=>x.id===id);if(!c)return;
  if(isClassClosed(c)){alert('Closed classes cannot be locally purged. Use the audited closed-class archive deletion workflow.');return;}
  const token=prompt(`Remove the local copy of "${c.name}" from this browser/device?\n\nThis does not replace authoritative cloud retention controls.\n\nType REMOVE LOCAL to continue.`);
  if(token!=='REMOVE LOCAL')return;
  db.classes=db.classes.filter(x=>x.id!==id);localStorage.setItem(DB_KEY,JSON.stringify(db));renderHome();
}
function openClass(id){releaseEvalWakeLock();const c=db.classes.find(x=>x.id===id);if(!c||c.deletedAt){renderHome();return;}currentClassId=id;currentStudentId=null;renderClass();showView('classView');}
function finalStatusForStudent(s){
  const a1=s.attempts?.['1'],a2=s.attempts?.['2'];
  if(a2&&!a2.finalizedAt)return 'A2 IN PROGRESS';
  if(a1&&!a1.finalizedAt)return 'A1 IN PROGRESS';
  const best=a2?.finalizedAt?a2:a1?.finalizedAt?a1:null;
  return best?best.finalResult:'NOT STARTED';
}
function rosterMatches(s){
  const q=rosterSearchTerm.trim().toLowerCase();
  if(q&&!`${s.name||''} ${s.rank||''} ${s.trainingId||''}`.toLowerCase().includes(q))return false;
  const a1=s.attempts?.['1'],a2=s.attempts?.['2'],status=finalStatusForStudent(s);
  if(rosterFilter==='not-started')return !a1;
  if(rosterFilter==='in-progress')return !!((a1&&!a1.finalizedAt)||(a2&&!a2.finalizedAt));
  if(rosterFilter==='failed')return status==='FAIL';
  if(rosterFilter==='remediation')return !!(a1?.finalizedAt&&a1.finalResult==='FAIL'&&(!a2?.finalizedAt||a2.finalResult!=='PASS'));
  if(rosterFilter==='qualified')return status==='PASS';
  return true;
}
function median(nums){const a=nums.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function criticalFailCount(t,a){return allItems(t).filter(i=>i.critical&&a?.ratings?.[i.id]==='fail').length;}
function classAnalytics(c,t){
  const a1Rows=(c.students||[]).map(s=>({s,a:s.attempts?.['1']})).filter(x=>x.a?.finalizedAt);
  const a1Pass=a1Rows.filter(x=>x.a.finalResult==='PASS').length,a1Fail=a1Rows.filter(x=>x.a.finalResult==='FAIL').length;
  const finals=(c.students||[]).map(s=>({s,a:finalAttemptForStudent(s)})).filter(x=>x.a);
  const finalPass=finals.filter(x=>x.a.finalResult==='PASS').length;
  const remediationEligible=(c.students||[]).filter(s=>s.attempts?.['1']?.finalizedAt&&s.attempts['1'].finalResult==='FAIL');
  const remediationStarted=remediationEligible.filter(s=>!!s.attempts?.['2']).length;
  const remediationFinal=remediationEligible.filter(s=>s.attempts?.['2']?.finalizedAt).length;
  const remediationPass=remediationEligible.filter(s=>s.attempts?.['2']?.finalizedAt&&s.attempts['2'].finalResult==='PASS').length;
  const criticalStudents=a1Rows.filter(x=>criticalFailCount(t,x.a)>0).length;
  let tested=0,nt=0; a1Rows.forEach(({a})=>allItems(t).forEach(i=>{const r=a.ratings[i.id];if(r==='pass'||r==='fail')tested++;else if(r==='nt')nt++;}));
  const attemptsToPass=finals.filter(x=>x.a.finalResult==='PASS').map(x=>x.a.attemptNo||1);
  return {a1Final:a1Rows.length,a1Pass,a1Fail,a1Rate:a1Rows.length?a1Pass/a1Rows.length:null,finalized:finals.length,finalPass,finalRate:finals.length?finalPass/finals.length:null,remediationEligible:remediationEligible.length,remediationStarted,remediationFinal,remediationPass,remediationRate:a1Rows.length?a1Fail/a1Rows.length:null,remediationSuccess:remediationFinal?remediationPass/remediationFinal:null,repeatFailureRate:remediationFinal?(remediationFinal-remediationPass)/remediationFinal:null,criticalStudents,criticalRate:a1Rows.length?criticalStudents/a1Rows.length:null,coverage:(tested+nt)?tested/(tested+nt):null,medianAttempts:median(attemptsToPass)};
}
function criterionGapStats(c,t){
  const arr=classAttempt1s(c),items=allItems(t);
  return items.map(i=>{let pass=0,fail=0,nt=0;arr.forEach(a=>{const r=a.ratings[i.id];if(r==='pass')pass++;else if(r==='fail')fail++;else if(r==='nt')nt++;});const tested=pass+fail,total=tested+nt;return {item:i,pass,fail,nt,tested,failRate:tested?fail/tested:null,ntRate:total?nt/total:null,coverage:total?tested/total:null};}).filter(x=>x.tested||x.nt).sort((a,b)=>(b.failRate??-1)-(a.failRate??-1)||b.tested-a.tested);
}
function rootCauseStats(c,t){
  const counts={},modes={};let total=0,classified=0;
  classAttempt1s(c).forEach(a=>allItems(t).forEach(i=>{if(a.ratings[i.id]!=='fail')return;const d=a.failureDetails?.[i.id];const label=d?.contributorLabel||d?.contributor||'Unclassified',mode=d?.modeLabel||d?.mode||'Unclassified';counts[label]=(counts[label]||0)+1;modes[mode]=(modes[mode]||0)+1;if(d?.contributor)classified++;total++;}));
  const rows=Object.entries(counts).map(([label,count])=>({label,count,pct:total?count/total:0})).sort((a,b)=>b.count-a.count);
  const modeRows=Object.entries(modes).map(([label,count])=>({label,count,pct:total?count/total:0})).sort((a,b)=>b.count-a.count);
  return {total,classified,rows,modeRows};
}
function evaluatorSignalStats(c,t){
  const groups={};
  (c.students||[]).forEach(st=>{const a=st.attempts?.['1'];if(!a?.finalizedAt)return;const key=(a.evaluatorId||a.trainerSign||c.evaluatorId||c.leadEvaluator||'Unspecified').trim()||'Unspecified';const g=groups[key]||(groups[key]={evaluator:key,students:0,passObs:0,failObs:0,ntObs:0,criticalFailStudents:0});g.students++;let hasCrit=false;allItems(t).forEach(i=>{const r=a.ratings[i.id];if(r==='pass')g.passObs++;else if(r==='fail'){g.failObs++;if(i.critical)hasCrit=true;}else if(r==='nt')g.ntObs++;});if(hasCrit)g.criticalFailStudents++;});
  return Object.values(groups).map(g=>({...g,failRate:(g.passObs+g.failObs)?g.failObs/(g.passObs+g.failObs):null,ntRate:(g.passObs+g.failObs+g.ntObs)?g.ntObs/(g.passObs+g.failObs+g.ntObs):null,criticalRate:g.students?g.criticalFailStudents/g.students:null})).sort((a,b)=>b.students-a.students);
}
function sectionHeatStatus(sec,a){
  if(!a?.finalizedAt)return {cls:'heat-none',label:'—',title:'No finalized Attempt 1'};
  let pass=0,fail=0,nt=0;sec.items.forEach(i=>{const r=a.ratings[i.id];if(r==='pass')pass++;else if(r==='fail')fail++;else if(r==='nt')nt++;});
  if(fail)return {cls:'heat-fail',label:'FAIL',title:`${pass} pass · ${fail} fail · ${nt} NT`};
  if(pass)return {cls:'heat-pass',label:'PASS',title:`${pass} pass · ${nt} NT`};
  if(nt)return {cls:'heat-nt',label:'NT',title:`${nt} NT · no tested criteria`};
  return {cls:'heat-none',label:'—',title:'No data'};
}
function renderClassAnalytics(c,t){
  const a=classAnalytics(c,t),fmtPct=x=>x==null?'—':`${Math.round(x*100)}%`;
  $('classAnalyticsKpis').innerHTML=[
    ['Students',c.students.length,'Roster size'],['First-pass',fmtPct(a.a1Rate),`${a.a1Pass}/${a.a1Final||0} A1 PASS`],['Final pass',fmtPct(a.finalRate),`${a.finalPass}/${a.finalized||0} qualified`],['Remediation',fmtPct(a.remediationRate),`${a.remediationEligible} required A2`],['Remediation success',fmtPct(a.remediationSuccess),`${a.remediationPass}/${a.remediationFinal||0} finalized A2`],['Repeat failure',fmtPct(a.repeatFailureRate),`${Math.max(0,a.remediationFinal-a.remediationPass)}/${a.remediationFinal||0} persistent A2`],['Critical failure',fmtPct(a.criticalRate),`${a.criticalStudents} A1 students`],['Scenario coverage',fmtPct(a.coverage),'PASS/FAIL vs NT'],['Median attempts',a.medianAttempts==null?'—':String(a.medianAttempts),'to final PASS']
  ].map(([k,v,h])=>`<div class="analyticsKpi"><small>${esc(k)}</small><strong>${esc(v)}</strong><span>${esc(h)}</span></div>`).join('');
  const gaps=criterionGapStats(c,t).filter(x=>x.fail>0).slice(0,8);
  const coverageGaps=criterionGapStats(c,t).filter(x=>x.nt>0).sort((a,b)=>(b.ntRate??0)-(a.ntRate??0)||b.nt-a.nt).slice(0,5);
  $('classGapTable').innerHTML=(gaps.length?`<div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Criterion</th><th>Tested</th><th>Pass when tested</th><th>Fail when tested</th><th>NT</th></tr></thead><tbody>${gaps.map(g=>`<tr><td><b>${esc(g.item.id)}</b>${g.item.critical?' <span class="crit tiny">CRITICAL</span>':''}<div>${esc(g.item.text)}</div></td><td>${fmtPct(g.coverage)} <small>(${g.tested}/${g.tested+g.nt})</small></td><td>${fmtPct(g.tested?g.pass/g.tested:null)}</td><td class="${g.failRate>=.25?'bad':g.failRate>=.1?'warnText':''}">${fmtPct(g.failRate)}</td><td>${fmtPct(g.ntRate)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="analyticsEmpty">No failed criteria in finalized Attempt 1 evaluations.</div>')+(coverageGaps.length?`<h4 class="analyticsSubhead">Scenario coverage gaps — highest NT rate</h4><div class="analyticsTableWrap"><table class="analyticsTable coverageTable"><thead><tr><th>Criterion</th><th>Tested</th><th>Pass when tested</th><th>NT</th></tr></thead><tbody>${coverageGaps.map(g=>`<tr><td><b>${esc(g.item.id)}</b><div>${esc(g.item.text)}</div></td><td>${fmtPct(g.coverage)} <small>(${g.tested}/${g.tested+g.nt})</small></td><td>${fmtPct(g.tested?g.pass/g.tested:null)}</td><td>${fmtPct(g.ntRate)}</td></tr>`).join('')}</tbody></table></div>`:'');
  const roots=rootCauseStats(c,t);
  $('classRootCauses').innerHTML=roots.rows.length?`<div class="classificationRate">Contributor classified: <b>${roots.total?Math.round(roots.classified/roots.total*100):0}%</b> (${roots.classified}/${roots.total})</div>${roots.rows.slice(0,8).map(r=>`<div class="rootCauseRow"><div><span>${esc(r.label)}</span><b>${Math.round(r.pct*100)}%</b></div><div class="rootCauseBar"><i style="width:${Math.max(3,Math.round(r.pct*100))}%"></i></div><small>${r.count} failure${r.count===1?'':'s'}</small></div>`).join('')}<h4 class="analyticsSubhead">Failure modes</h4>${roots.modeRows.slice(0,6).map(r=>`<div class="rootCauseRow mode"><div><span>${esc(r.label)}</span><b>${Math.round(r.pct*100)}%</b></div><div class="rootCauseBar"><i style="width:${Math.max(3,Math.round(r.pct*100))}%"></i></div></div>`).join('')}`:'<div class="analyticsEmpty">No observed performance-contributor classifications yet.</div>';
  const compare=(c.students||[]).map(st=>{const a1=st.attempts?.['1'],fin=finalAttemptForStudent(st),s1=a1?scoreStats(t,a1):null,sf=fin?scoreStats(t,fin):null,gain=a1&&fin&&fin.attemptNo>1&&s1.denom&&sf.denom?(sf.percent-s1.percent)*100:null;return {st,a1,fin,s1,sf,gain,cf:a1?criticalFailCount(t,a1):0};});
  $('studentComparison').innerHTML=compare.length?`<div class="analyticsTableWrap"><table class="analyticsTable studentCompare"><thead><tr><th>Student</th><th>A1</th><th>Final</th><th>Critical</th><th>Remediation gain</th></tr></thead><tbody>${compare.map(x=>`<tr><td><b>${esc(x.st.rank?`${x.st.rank} `:'')}${esc(x.st.name)}</b></td><td>${x.a1?.finalizedAt?`${esc(x.a1.finalResult)} · ${x.s1.percentText}`:'—'}</td><td>${x.fin?`${esc(x.fin.finalResult)} · ${x.sf.percentText}`:'—'}</td><td>${x.cf}</td><td>${x.gain==null?'—':`${x.gain>=0?'+':''}${x.gain.toFixed(1)}%`}</td></tr>`).join('')}</tbody></table></div>`:'<div class="analyticsEmpty">No students loaded.</div>';
  $('classHeatmap').innerHTML=compare.length?`<div class="heatLegend"><span class="heat-pass">Pass</span><span class="heat-fail">Fail present</span><span class="heat-nt">NT only</span><span class="heat-none">No finalized A1</span></div><div class="heatScroll"><table class="heatTable"><thead><tr><th>Student</th>${t.sections.map(sec=>`<th title="${esc(sec.title)}">${esc(sec.code)}</th>`).join('')}</tr></thead><tbody>${compare.map(x=>`<tr><th>${esc(x.st.rank?`${x.st.rank} `:'')}${esc(x.st.name)}</th>${t.sections.map(sec=>{const h=sectionHeatStatus(sec,x.a1);return `<td class="${h.cls}" title="${esc(sec.code)} — ${esc(h.title)}">${h.label==='FAIL'?'●':h.label==='PASS'?'●':h.label==='NT'?'NT':'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`:'';
  const evalSignals=evaluatorSignalStats(c,t);$('evaluatorSignals').innerHTML=evalSignals.length?`<h3>Evaluator pattern signals <small>Descriptive only — not inter-rater agreement</small></h3><div class="analyticsTableWrap"><table class="analyticsTable evaluatorTable"><thead><tr><th>Evaluator</th><th>Students</th><th>Observation fail rate</th><th>NT rate</th><th>Critical-fail students</th></tr></thead><tbody>${evalSignals.map(g=>`<tr><td><b>${esc(g.evaluator)}</b></td><td>${g.students}</td><td>${fmtPct(g.failRate)}</td><td>${fmtPct(g.ntRate)}</td><td>${fmtPct(g.criticalRate)}</td></tr>`).join('')}</tbody></table></div>`:'';
}
function fmtRate(x){return x==null?'—':`${Math.round(x*100)}%`;}
function managementScopeClasses(){
  return db.classes.filter(c=>!c.deletedAt).filter(c=>{ensureLocationFields(c);return (!managementFilters.majcom||c.majcom===managementFilters.majcom)&&(!managementFilters.installationId||(managementFilters.installationId.startsWith('CUSTOM:')?(!c.homeInstallationId&&c.homeInstallationName===managementFilters.installationId.slice(7)):c.homeInstallationId===managementFilters.installationId))&&(!managementFilters.tierId||String(c.tierId)===managementFilters.tierId)&&(!managementFilters.courseType||c.courseType===managementFilters.courseType);});
}
function aggregateManagement(classes){
  const out={classes:classes.length,students:0,a1Final:0,a1Pass:0,finalized:0,finalPass:0,remediationEligible:0,remediationFinal:0,remediationPass:0,criticalStudents:0,failObs:0,classifiedFailObs:0,rootCounts:{},modeCounts:{},gaps:{}};
  classes.forEach(c=>{const t=c.tierSnapshot||TIERS[c.tierId];out.students+=(c.students||[]).length;(c.students||[]).forEach(st=>{
    const a1=st.attempts?.['1'];if(a1?.finalizedAt){out.a1Final++;if(a1.finalResult==='PASS')out.a1Pass++;if(criticalFailCount(t,a1)>0)out.criticalStudents++;if(a1.finalResult==='FAIL')out.remediationEligible++;
      t.sections.forEach(sec=>sec.items.forEach(i=>{const r=a1.ratings?.[i.id],key=`${c.tierId}:${i.id}`,g=out.gaps[key]||(out.gaps[key]={tierId:String(c.tierId),itemId:i.id,section:sec.code,text:i.text||'',critical:!!i.critical,pass:0,fail:0,nt:0});if(r==='pass')g.pass++;else if(r==='fail'){g.fail++;out.failObs++;const d=a1.failureDetails?.[i.id];if(d?.contributor){out.classifiedFailObs++;const lab=d.contributorLabel||d.contributor;out.rootCounts[lab]=(out.rootCounts[lab]||0)+1;}if(d?.mode){const lab=d.modeLabel||d.mode;out.modeCounts[lab]=(out.modeCounts[lab]||0)+1;}}else if(r==='nt')g.nt++;}));
    }
    const fin=finalAttemptForStudent(st);if(fin){out.finalized++;if(fin.finalResult==='PASS')out.finalPass++;}
    const a2=st.attempts?.['2'];if(a2?.finalizedAt){out.remediationFinal++;if(a2.finalResult==='PASS')out.remediationPass++;}
  });});
  out.a1Rate=out.a1Final?out.a1Pass/out.a1Final:null;out.finalRate=out.finalized?out.finalPass/out.finalized:null;out.remediationRate=out.a1Final?out.remediationEligible/out.a1Final:null;out.remediationSuccess=out.remediationFinal?out.remediationPass/out.remediationFinal:null;out.criticalRate=out.a1Final?out.criticalStudents/out.a1Final:null;out.rcaRate=out.failObs?out.classifiedFailObs/out.failObs:null;
  out.rootRows=Object.entries(out.rootCounts).map(([label,count])=>({label,count,pct:out.failObs?count/out.failObs:0})).sort((a,b)=>b.count-a.count);
  out.gapRows=Object.values(out.gaps).map(g=>{const tested=g.pass+g.fail,total=tested+g.nt;return {...g,tested,total,passRate:tested?g.pass/tested:null,failRate:tested?g.fail/tested:null,coverage:total?tested/total:null,ntRate:total?g.nt/total:null};}).filter(g=>g.fail>0).sort((a,b)=>(b.failRate??-1)-(a.failRate??-1)||b.tested-a.tested);
  return out;
}
function managementGroupRows(classes,kind){
  const groups={};classes.forEach(c=>{ensureLocationFields(c);let key,label,sub='';if(kind==='majcom'){key=c.majcom||'UNSPECIFIED';label=c.majcom?commandName(c.majcom):'Unspecified MAJCOM';}else{key=`${c.majcom||''}|${c.homeInstallationId||c.homeInstallationName||'UNSPECIFIED'}`;label=c.homeInstallationName||'Unspecified installation';sub=c.majcom?commandName(c.majcom):'MAJCOM not set';}const g=groups[key]||(groups[key]={key,label,sub,classes:[],bases:new Set()});g.classes.push(c);if(c.homeInstallationId||c.homeInstallationName)g.bases.add(c.homeInstallationId||c.homeInstallationName);});return Object.values(groups).map(g=>({...g,a:aggregateManagement(g.classes)})).sort((a,b)=>b.a.students-a.a.students||a.label.localeCompare(b.label));
}
function renderManagementFilters(classes){
  const cmdSel=$('managementMajcom'),instSel=$('managementInstallation');if(!cmdSel||!instSel)return;
  cmdSel.innerHTML=`<option value="">All MAJCOMs / commands</option>${(LOCATION_DATA.commands||[]).map(x=>`<option value="${esc(x.id)}" ${managementFilters.majcom===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}`;
  const ids=new Set(classes.filter(c=>!managementFilters.majcom||c.majcom===managementFilters.majcom).map(c=>c.homeInstallationId).filter(Boolean));
  const listed=(LOCATION_DATA.installations||[]).filter(i=>ids.has(i.id)).sort((a,b)=>installationDisplay(a).localeCompare(installationDisplay(b)));
  const customs=classes.filter(c=>(!managementFilters.majcom||c.majcom===managementFilters.majcom)&&!c.homeInstallationId&&c.homeInstallationName).map(c=>c.homeInstallationName).filter((v,i,a)=>a.indexOf(v)===i).sort();
  instSel.innerHTML=`<option value="">All home installations</option>${listed.map(i=>`<option value="${esc(i.id)}" ${managementFilters.installationId===i.id?'selected':''}>${esc(installationDisplay(i))}</option>`).join('')}${customs.map(n=>`<option value="CUSTOM:${esc(n)}">${esc(n)} (custom)</option>`).join('')}`;
  if(managementFilters.installationId&&!instSel.querySelector(`option[value="${CSS.escape(managementFilters.installationId)}"]`))managementFilters.installationId='';
  if($('managementTier'))$('managementTier').value=managementFilters.tierId;if($('managementCourseType'))$('managementCourseType').value=managementFilters.courseType;
}
function renderManagementDashboard(){
  if(!$('managementKpis'))return;const all=db.classes.filter(c=>!c.deletedAt);all.forEach(ensureLocationFields);renderManagementFilters(all);let scope=managementScopeClasses();
  const selectedInst=$('managementInstallation')?.value||managementFilters.installationId;
  const a=aggregateManagement(scope),maj=managementGroupRows(scope,'majcom'),inst=managementGroupRows(scope,'installation');
  const labels=[];if(managementFilters.majcom)labels.push(commandName(managementFilters.majcom));if(selectedInst)labels.push(selectedInst.startsWith('CUSTOM:')?selectedInst.slice(7):(installationById(selectedInst)?.name||selectedInst));if(managementFilters.tierId)labels.push(`Tier ${managementFilters.tierId}`);if(managementFilters.courseType)labels.push(managementFilters.courseType.replace(/-/g,' '));$('managementScopeLabel').textContent=labels.length?labels.join(' · '):'All local classes';
  $('managementKpis').innerHTML=[['Classes',a.classes,'In current scope'],['Students',a.students,'Rostered locally'],['First-pass',fmtRate(a.a1Rate),`${a.a1Pass}/${a.a1Final||0} finalized A1`],['Final pass',fmtRate(a.finalRate),`${a.finalPass}/${a.finalized||0} final`],['Remediation',fmtRate(a.remediationRate),`${a.remediationEligible} required A2`],['Remediation success',fmtRate(a.remediationSuccess),`${a.remediationPass}/${a.remediationFinal||0}`],['Critical failure',fmtRate(a.criticalRate),`${a.criticalStudents} A1 students`],['Contributor classified',fmtRate(a.rcaRate),`${a.classifiedFailObs}/${a.failObs||0} failed observations`]].map(([k,v,h])=>`<div class="analyticsKpi"><small>${esc(k)}</small><strong>${esc(v)}</strong><span>${esc(h)}</span></div>`).join('');
  $('managementMajcomTable').innerHTML=maj.length?`<h3>MAJCOM / Command</h3><div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>MAJCOM</th><th>Bases</th><th>Classes</th><th>Students</th><th>First pass</th><th>Final pass</th><th>Critical</th><th>Contributor</th></tr></thead><tbody>${maj.map(g=>`<tr><td><b>${esc(g.label)}</b></td><td>${g.bases.size}</td><td>${g.a.classes}</td><td>${g.a.students}</td><td>${fmtRate(g.a.a1Rate)}</td><td>${fmtRate(g.a.finalRate)}</td><td>${fmtRate(g.a.criticalRate)}</td><td>${fmtRate(g.a.rcaRate)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="analyticsEmpty">No classes in this scope.</div>';
  $('managementInstallationTable').innerHTML=inst.length?`<h3>Home installation</h3><div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Installation</th><th>Supported command</th><th>Classes</th><th>Students</th><th>First pass</th><th>Final pass</th><th>Remed success</th><th>Critical</th><th>Top contributor</th></tr></thead><tbody>${inst.map(g=>`<tr><td><b>${esc(g.label)}</b></td><td>${esc(g.sub)}</td><td>${g.a.classes}</td><td>${g.a.students}</td><td>${fmtRate(g.a.a1Rate)}</td><td>${fmtRate(g.a.finalRate)}</td><td>${fmtRate(g.a.remediationSuccess)}</td><td>${fmtRate(g.a.criticalRate)}</td><td>${esc(g.a.rootRows[0]?.label||'—')}</td></tr>`).join('')}</tbody></table></div>`:'';
  $('managementRootCauses').innerHTML=a.rootRows.length?`<div class="classificationRate">Contributor classified: <b>${fmtRate(a.rcaRate)}</b> (${a.classifiedFailObs}/${a.failObs})</div>${a.rootRows.slice(0,8).map(r=>`<div class="rootCauseRow"><div><span>${esc(r.label)}</span><b>${r.count}</b></div><div class="rootCauseBar"><i style="width:${Math.max(3,Math.round(r.pct*100))}%"></i></div></div>`).join('')}`:'<div class="analyticsEmpty">No observed performance-contributor classifications in this scope.</div>';
  $('managementGapTable').innerHTML=a.gapRows.length?`<div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Tier / criterion</th><th>Tested</th><th>Pass when tested</th><th>Fail when tested</th><th>NT</th></tr></thead><tbody>${a.gapRows.slice(0,10).map(g=>`<tr><td><b>T${esc(g.tierId)} · ${esc(g.itemId)}</b>${g.critical?' <span class="crit tiny">CRITICAL</span>':''}<div>${esc(g.text)}</div></td><td>${fmtRate(g.coverage)} <small>(${g.tested}/${g.total})</small></td><td>${fmtRate(g.passRate)}</td><td class="${g.failRate>=.25?'bad':g.failRate>=.1?'warnText':''}">${fmtRate(g.failRate)}</td><td>${fmtRate(g.ntRate)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="analyticsEmpty">No failed finalized Attempt 1 criteria in this scope.</div>';
  const missingMaj=scope.filter(c=>!c.majcom).length,missingBase=scope.filter(c=>!c.homeInstallationId&&!c.homeInstallationName).length,custom=scope.filter(c=>!c.homeInstallationId&&c.homeInstallationName).length,missingRca=Math.max(0,a.failObs-a.classifiedFailObs);
  $('managementDataQuality').innerHTML=`<h3>Data quality</h3><div class="dataQualityGrid"><div class="dataQualityItem ${missingMaj?'bad':'good'}"><b>${missingMaj}</b><span>classes missing MAJCOM</span></div><div class="dataQualityItem ${missingBase?'bad':'good'}"><b>${missingBase}</b><span>classes missing home installation</span></div><div class="dataQualityItem ${custom?'warn':'good'}"><b>${custom}</b><span>custom / not-listed installations</span></div><div class="dataQualityItem ${missingRca?'warn':'good'}"><b>${missingRca}</b><span>failed observations missing contributor</span></div></div><small>Location and performance-contributor completeness directly affect installation/MAJCOM comparisons. Local analytics are descriptive and are not an authoritative DAF system of record.</small>`;
}
async function renderClosedArchiveStatus(c){
  const panel=$('closedArchiveStatus'),deleteBtn=$('deleteClassBtn');
  if(!panel)return;
  if(!c||!isClassClosed(c)){
    panel.classList.add('hidden');panel.removeAttribute('data-state');panel.innerHTML='';
    return;
  }
  panel.classList.remove('hidden');
  if(!hasEnterpriseAccess()){
    panel.dataset.state='retained';
    panel.innerHTML='<b>SERVER RETENTION ENABLED</b><span>Closed classes are automatically archived as CSV on the RaPS NUC in monthly folders. Archive deletion is restricted to Enterprise Administrator access.</span>';
    return;
  }
  if(deleteBtn){deleteBtn.classList.remove('hidden');deleteBtn.textContent='Request Archive Deletion';deleteBtn.disabled=true;}
  const cloud=window.RAPS_CLOUD,client=currentCloudClient();
  if(!cloud?.connected||!client){
    panel.dataset.state='offline';
    panel.innerHTML='<b>ARCHIVE STATUS UNAVAILABLE OFFLINE</b><span>The closed class remains locked. Reconnect to verify the NUC archive or request deletion.</span>';
    return;
  }
  panel.dataset.state='checking';
  panel.innerHTML='<b>CHECKING SERVER ARCHIVE</b><span>Verifying closed-class retention on the RaPS NUC…</span>';
  const {data,error}=await client.from('closed_class_archives')
    .select('original_class_id,archive_status,closed_at,archived_at,sha256,size_bytes,deletion_requested_at,deletion_reason,deleted_at,worker_error')
    .eq('original_class_id',c.id)
    .maybeSingle();
  if(currentClassId!==c.id)return;
  if(error){
    panel.dataset.state='error';
    panel.innerHTML=`<b>ARCHIVE STATUS ERROR</b><span>${esc(error.message||String(error))}</span>`;
    return;
  }
  if(!data){
    panel.dataset.state='pending';
    panel.innerHTML='<b>ARCHIVE PENDING</b><span>The class is closed. The server archive record will appear after cloud grading sync completes and the archive worker validates the class.</span>';
    return;
  }
  const status=String(data.archive_status||'pending');
  panel.dataset.state=status;
  if(deleteBtn){
    deleteBtn.disabled=status!=='archived';
    deleteBtn.classList.toggle('hidden',status==='deleted');
    deleteBtn.textContent=status==='deletion_requested'?'Archive Deletion Requested':status==='deleted'?'Archive Deleted':'Request Archive Deletion';
  }
  if(status==='archived'){
    panel.innerHTML=`<b>SERVER ARCHIVE: ARCHIVED</b><span>Archived ${esc(archiveDate(data.archived_at))} · ${Number(data.size_bytes||0).toLocaleString()} bytes · SHA-256 ${esc(archiveIntegrityShort(data.sha256))}</span>`;
  }else if(status==='deletion_requested'){
    panel.innerHTML=`<b>SERVER ARCHIVE: DELETION REQUESTED</b><span>Requested ${esc(archiveDate(data.deletion_requested_at))}${data.deletion_reason?` · Reason: ${esc(data.deletion_reason)}`:''}. The archive worker will perform and audit the filesystem deletion.</span>`;
  }else if(status==='deleted'){
    panel.innerHTML=`<b>SERVER ARCHIVE: DELETED</b><span>Deleted ${esc(archiveDate(data.deleted_at))}. The deletion request and worker action remain in the audit log.</span>`;
  }else if(status==='error'){
    panel.innerHTML=`<b>SERVER ARCHIVE: ERROR</b><span>${esc(data.worker_error||'The archive worker reported an error. Enterprise review is required.')}</span>`;
  }else{
    panel.innerHTML='<b>SERVER ARCHIVE: PENDING</b><span>The NUC archive worker is waiting for the class/event/evaluation data to finish syncing.</span>';
  }
}
async function requestClosedClassArchiveDeletion(c){
  if(!c||!isClassClosed(c))return;
  if(!hasEnterpriseAccess()){alert('Only an Enterprise Administrator may request deletion of a closed-class archive.');return;}
  const cloud=window.RAPS_CLOUD,client=currentCloudClient();
  if(!cloud?.connected||!client){alert('Archive deletion requires an online Enterprise session. Reconnect and try again.');return;}
  const reason=prompt(`ENTERPRISE ARCHIVE DELETION REQUEST\n\nClass: ${c.name||'Untitled Class'}\n\nEnter the required deletion reason:`);
  if(!reason||!reason.trim())return;
  const token=prompt('This permanently removes the retained CSV from the NUC after the server worker processes the request.\n\nType DELETE ARCHIVE to continue.');
  if(token!=='DELETE ARCHIVE')return;
  const {error}=await client.rpc('request_closed_class_archive_deletion',{p_class_id:c.id,p_reason:reason.trim()});
  if(error){alert(`Archive deletion request failed:\n${error.message||error}`);await renderClosedArchiveStatus(c);return;}
  alert('Archive deletion request accepted. The NUC archive worker will perform and audit the deletion.');
  await renderClosedArchiveStatus(c);
}

function renderClass(){
  const c=cls(),t=tier(),stats=classStats(c);if(!c)return showHome();
  const closed=isClassClosed(c),life=lifecycleStatus(c);
  $('classTitle').textContent=c.name||'TCCC Class';
  $('classSub').textContent=`Tier ${c.tierId} — ${t.name} · ${t.source}`;
  $('classState').textContent=life;$('classState').className=`statusPill ${life.toLowerCase()}`;
  ensureLocationFields(c);const home=installationById(c.homeInstallationId);
  const rosterCloud=c.cloudRosterSync||{};const rosterCloudLabel=!c.cloudSync?.enabled?'Local only':rosterCloud.status==='synced'?'Synced':rosterCloud.status==='error'?'Sync error':rosterCloud.status==='offline'?'Offline':rosterCloud.status==='pending'?'Pending':'Not synced';
  $('classMeta').innerHTML=[['Roster',c.roster||'—'],['Roster cloud',rosterCloudLabel],['Course type',String(c.courseType||'initial').replace(/-/g,' ')],['Supported MAJCOM',c.majcom?commandName(c.majcom):'—'],['Home installation',c.homeInstallationName||'—'],['Host command',home?.hostCommand?commandName(home.hostCommand):'—'],['Unit / organization',c.unit||'—'],['Training location',c.trainingLocationName||'—'],['Site code',c.siteCode||'—'],['Exercise / event',c.exercise||'—'],['Scenario',`${c.scenario||'—'} · v${c.scenarioVersion||'1'}`],['Scenario difficulty',String(c.scenarioDifficulty||'standard').replace(/-/g,' ')],['Scenario profile',c.scenarioProfile||'—'],['Date',c.date||'—'],['Lead Evaluator',c.leadEvaluator||'—'],['Evaluator ID',c.evaluatorId||'—'],['Curriculum ID',c.curriculumId||`TCCC-TIER${c.tierId}`],['Content',c.contentVersion||t.source],['Status',life],['Closed',c.closedAt?`${new Date(c.closedAt).toLocaleString()}${c.closedBy?` · ${c.closedBy}`:''}`:'—']].map(([a,b])=>`<div class="metaCell"><small>${esc(a)}</small><b>${esc(b)}</b></div>`).join('');
  const items=allItems(t),critical=items.filter(i=>i.critical).length,noncrit=items.filter(i=>!i.critical).length;
  $('scenarioCoverage').textContent=`${critical} critical required · ${noncrit-(c.scenarioNT||[]).length}/${noncrit} noncritical active`;
  $('scenarioBtn').textContent=closed?'Scenario NT (closed)':hasStartedClass(c)?'View Scenario NT (locked)':'Configure Scenario NT';
  const visibleStudents=c.students.filter(rosterMatches);
  $('rosterCount').textContent=`${visibleStudents.length}/${stats.total} shown · ${stats.completed} finalized`;
  renderActiveEvaluationLockBanner();
  $('rosterList').innerHTML=visibleStudents.length?visibleStudents.map(s=>rosterRow(c,s)).join(''):c.students.length?'<div class="empty">No students match the current roster filter.</div>':'<div class="empty">No students loaded. Add a student or import a CSV roster.</div>';
  if($('rosterSearch'))$('rosterSearch').value=rosterSearchTerm;
  document.querySelectorAll('[data-roster-filter]').forEach(b=>b.classList.toggle('active',b.dataset.rosterFilter===rosterFilter));
  renderClassAnalytics(c,t);
  if($('analyticsScope'))$('analyticsScope').textContent=`${classAttempt1s(c).length} finalized A1 · normalized rates`;
  $('editClassBtn').disabled=closed;$('scenarioBtn').disabled=closed;$('addStudentBtn').disabled=closed;$('importRosterBtn').disabled=closed;
  $('closeClassBtn').classList.toggle('hidden',closed);$('closedBanner').classList.toggle('hidden',!closed);
  const deleteBtn=$('deleteClassBtn');
  if(deleteBtn){
    deleteBtn.classList.toggle('hidden',!hasEnterpriseAccess());
    deleteBtn.textContent=closed?'Request Archive Deletion':'Delete Class';
    deleteBtn.disabled=closed;
  }
  if(closed)$('closedBannerText').textContent=`Closed ${new Date(c.closedAt).toLocaleString()}. This class is locked for retention, remains available for viewing/export, and is archived automatically on the RaPS NUC after cloud sync completes.`;
  else if($('closedArchiveStatus')){$('closedArchiveStatus').classList.add('hidden');$('closedArchiveStatus').innerHTML='';}
  bindRosterRows();
  void renderClosedArchiveStatus(c);
}
function gradingSyncBadge(a){
  if(!a)return '';
  if(a.cloudShellOnly)return '<span class="gradeSyncBadge shell">CLOUD SHELL</span>';
  const st=String(a.cloudGrading?.status||'local').toLowerCase();
  const label=st==='synced'?'GRADE SYNCED':st==='syncing'?'GRADE SYNCING':st==='conflict'?'GRADE CONFLICT':st==='error'?'GRADE ERROR':st==='offline'?'GRADE OFFLINE':'GRADE LOCAL';
  return `<span class="gradeSyncBadge ${esc(st)}" title="${esc(a.cloudGrading?.error||'')}">${label}</span>`;
}
function rosterRow(c,s){
  const a1=s.attempts?.['1'],a2=s.attempts?.['2'],closed=isClassClosed(c),lock=findActiveEvaluationLock();
  const best=a2?.finalizedAt?a2:a1?.finalizedAt?a1:null;
  const status=a2&&!a2.finalizedAt?'A2 IN PROGRESS':a1&&!a1.finalizedAt?'A1 IN PROGRESS':best?best.finalResult:'NOT STARTED';
  const clsx=status==='PASS'?'pass':status==='FAIL'?'fail':status.includes('IN PROGRESS')?'progress':'';
  const attrs=attemptNo=>{
    if(!lock)return '';
    if(evaluationTargetMatchesLock(lock,c.id,s.id,attemptNo))return '';
    return ' disabled aria-disabled="true" title="Finalize or Void the active evaluation before opening another assessment."';
  };
  const label=(attemptNo,normal)=>evaluationTargetMatchesLock(lock,c.id,s.id,attemptNo)?'Resume Current Evaluation':normal;
  let buttons='';
  if(closed){
    if(a1)buttons+=`<button class="action compact" data-start="${s.id}" data-attempt="1"${attrs(1)}>${label(1,'View A1')}</button>`;
    if(a2)buttons+=` <button class="action compact" data-start="${s.id}" data-attempt="2"${attrs(2)}>${label(2,'View A2')}</button>`;
    if(!a1&&!a2)buttons='<span class="rowSub">No evaluation</span>';
  }else{
    if(!a1)buttons=`<button class="action compact primary" data-start="${s.id}" data-attempt="1"${attrs(1)}>${label(1,'Start A1')}</button>`;
    else if(a1.cloudShellOnly)buttons=`<button class="action compact" data-start="${s.id}" data-attempt="1"${attrs(1)}>Cloud A1 Shell</button>`;
    else buttons=`<button class="action compact${!a1.finalizedAt?' primary':''}" data-start="${s.id}" data-attempt="1"${attrs(1)}>${label(1,a1.finalizedAt?'View A1':'Continue A1')}</button>`;
    if(a2)buttons+=a2.cloudShellOnly?` <button class="action compact" data-start="${s.id}" data-attempt="2"${attrs(2)}>Cloud A2 Shell</button>`:` <button class="action compact${!a2.finalizedAt?' primary':''}" data-start="${s.id}" data-attempt="2"${attrs(2)}>${label(2,a2.finalizedAt?'View A2':'Continue A2')}</button>`;
    else if(a1?.finalizedAt&&a1.finalResult==='FAIL')buttons+=` <button class="action compact primary" data-start="${s.id}" data-attempt="2"${attrs(2)}>${label(2,'Start A2 Remediation')}</button>`;
    else if(a1?.finalizedAt&&a1.finalResult==='PASS')buttons+=` <span class="rowSub">A2 not indicated after A1 PASS</span>`;
    buttons+=` <button class="ghost small danger" data-delete-student="${s.id}"${lock?' disabled aria-disabled="true" title="Roster deletion is locked while an evaluation is in progress."':''}>Delete</button>`;
  }
  return `<div class="rosterRow"><div><div class="rowTitle">${esc(s.rank?`${s.rank} `:'')}${esc(s.name)}</div><div class="rowSub">${esc(s.trainingId||'No training ID')} · <span class="statusPill ${clsx}">${status}</span>${best?` · ${scoreStats(c.tierSnapshot,best).percentText} ${gradingSyncBadge(best)}`:a1?` ${gradingSyncBadge(a1)}`:''}</div></div><div class="rowActions">${buttons}</div></div>`;
}
function bindRosterRows(){
  document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>openEvaluation(b.dataset.start,Number(b.dataset.attempt)));
  document.querySelectorAll('[data-delete-student]').forEach(b=>b.onclick=()=>{const c=cls();if(isClassClosed(c))return;const st=c.students.find(x=>x.id===b.dataset.deleteStudent);if(confirm(`Delete ${st?.name||'student'} and all attempts?`)){c.students=c.students.filter(x=>x.id!==b.dataset.deleteStudent);saveDb();renderClass();}});
}
function closureIssues(c){
  const issues=[];
  if(!(c.students||[]).length)issues.push('Roster has no students.');
  (c.students||[]).forEach(s=>{
    const a1=s.attempts?.['1'],a2=s.attempts?.['2'];
    if(!a1)issues.push(`${s.name}: no evaluation started/finalized.`);
    else if(!a1.finalizedAt)issues.push(`${s.name}: Attempt 1 is still in progress.`);
    if(a2&&!a2.finalizedAt)issues.push(`${s.name}: Attempt 2 is still in progress.`);
  });
  return issues;
}
function closeClass(){
  const c=cls();if(!c||isClassClosed(c))return;const issues=closureIssues(c);
  if(issues.length){alert(`Class cannot be closed yet:\n\n${issues.slice(0,12).join('\n')}${issues.length>12?`\n+ ${issues.length-12} more`:''}\n\nFinalize or remove unresolved roster entries first.`);return;}
  const token=prompt(`CLOSE CLASS\n\nClosing permanently locks the roster, scenario, evaluations, attempts, notes, and grading data. Viewing, PDF/CSV export, and backup remain available. There is no reopen function.\n\nType CLOSE to continue.`);
  if(token!=='CLOSE')return;c.status='closed';c.closedAt=now();c.closedBy=c.leadEvaluator||'';saveDb();renderClass();
}
async function deleteClass(){
  const c=cls();if(!c)return;
  if(!hasEnterpriseAccess()){alert('Only an Enterprise Administrator may delete or archive classes.');return;}
  if(isClassClosed(c)){await requestClosedClassArchiveDeletion(c);return;}
  const token=prompt(`Move this class to Enterprise Local Trash?\n\nThis is for non-closed class cleanup only. Closed classes use the audited NUC archive workflow.\n\nType DELETE to continue.`);
  if(token!=='DELETE')return;
  c.deletedAt=now();saveDb();showHome();
}

// ---------- Forms ----------// ---------- Forms ----------
let modalReturnFocus=null;
function openModal(id){
  const m=$(id);if(!m)return;modalReturnFocus=document.activeElement;m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('modalOpen');
  setTimeout(()=>m.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])')?.focus(),20);
}
function closeModal(id){
  const m=$(id);if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');
  if(!document.querySelector('.modal.open'))document.body.classList.remove('modalOpen');
  const f=modalReturnFocus;modalReturnFocus=null;if(f&&document.contains(f))setTimeout(()=>f.focus(),0);
}
function newClassForm(existing=null){
  if(existing&&isClassClosed(existing)){alert('Closed classes are permanently locked.');return;}
  if(existing)ensureLocationFields(existing);
  const tOpts=Object.values(TIERS).map(t=>`<option value="${t.id}" ${(existing?.tierId||'1')===t.id?'selected':''}>Tier ${t.id} — ${esc(t.name)}</option>`).join('');
  const courseOpts=[['initial','Initial qualification'],['sustainment','Sustainment / refresher'],['remediation','Remediation'],['calibration','Instructor / evaluator calibration'],['other','Other']].map(([v,l])=>`<option value="${v}" ${(existing?.courseType||'initial')===v?'selected':''}>${l}</option>`).join('');
  const diffOpts=[['foundational','Foundational'],['standard','Standard'],['advanced','Advanced / high workload']].map(([v,l])=>`<option value="${v}" ${(existing?.scenarioDifficulty||'standard')===v?'selected':''}>${l}</option>`).join('');
  const cmdValue=existing?.majcom||'';const cmdOpts=['<option value="">Select command…</option>',...(LOCATION_DATA.commands||[]).map(x=>`<option value="${esc(x.id)}" ${cmdValue===x.id?'selected':''}>${esc(x.name)}</option>`)].join('');
  const existingHome=installationById(existing?.homeInstallationId),existingHomeCustom=!!existing&&!existingHome&&!!existing?.homeInstallationName,existingTrain=installationById(existing?.trainingInstallationId),sameTraining=existing?existing.trainingLocationType==='SAME_AS_HOME':true;
  $('formModalTitle').textContent=existing?'Edit Class':'New TCCC Class';
  $('formModalBody').innerHTML=`<form id="classForm"><div class="formGrid">
    <label><span>Class name *</span><input name="name" required value="${esc(existing?.name||'')}"></label><label><span>Tier *</span><select name="tierId" ${existing?'disabled':''}>${tOpts}</select></label>
    <label><span>Roster / course #</span><input name="roster" value="${esc(existing?.roster||'')}"></label><label><span>Course type</span><select name="courseType">${courseOpts}</select></label>
    <label><span>Date</span><input name="date" type="date" value="${esc(existing?.date||new Date().toISOString().slice(0,10))}"></label><label><span>Site code / local standardized ID</span><input name="siteCode" value="${esc(existing?.siteCode||'')}" placeholder="e.g., HIK-01"></label>
    <label class="full"><span>Supported MAJCOM / Command *</span><select name="majcom" required>${cmdOpts}</select><small class="fieldHelp">Select the command this training supports. The home-installation list filters to that command; use Show all for tenant/joint relationships.</small></label>
    <label class="full inlineCheck"><input name="showAllInstallations" type="checkbox"><span>Show all active-duty installations</span></label>
    <label class="full"><span>Home installation *</span><select name="homeInstallationId" required></select><small class="fieldHelp">The stable installation ID is saved for analytics even if the displayed installation name changes.</small></label>
    <div id="customHomeFields" class="full conditionalFields hidden"><label><span>Home installation / location *</span><input name="customHomeLocation" value="${esc(existingHomeCustom?existing.homeInstallationName:'')}"></label><label><span>State / region</span><input name="customHomeRegion" value="${esc(existingHomeCustom?existing.homeInstallationState||'':'')}"></label><label><span>Country / territory</span><input name="customHomeCountry" value="${esc(existingHomeCustom?existing.homeInstallationCountry||'':'')}"></label></div>
    <label class="full"><span>Unit / organization</span><input name="unit" value="${esc(existing?.unit||'')}" placeholder="e.g., 15 MDG"></label>
    <label class="full inlineCheck"><input name="sameTrainingLocation" type="checkbox" ${sameTraining?'checked':''}><span>Training location is the same as home installation</span></label>
    <div id="trainingLocationFields" class="full conditionalFields ${sameTraining?'hidden':''}"><label class="full"><span>Training location *</span><select name="trainingInstallationId"></select></label><div id="customTrainingFields" class="full conditionalFields hidden"><label><span>Expeditionary / other location *</span><input name="customTrainingLocation" value="${esc(existing?.trainingLocationType==='CUSTOM'?existing.trainingLocationName||'':'')}" placeholder="e.g., Tinian North Field"></label><label><span>State / region</span><input name="customTrainingRegion" value="${esc(existing?.trainingLocationType==='CUSTOM'?existing.trainingLocationState||'':'')}"></label><label><span>Country / territory</span><input name="customTrainingCountry" value="${esc(existing?.trainingLocationType==='CUSTOM'?existing.trainingLocationCountry||'':'')}"></label></div></div>
    <label class="full"><span>Exercise / event</span><input name="exercise" value="${esc(existing?.exercise||'')}" placeholder="e.g., Mobility Guardian 26"></label>
    <label><span>Lead evaluator</span><input name="leadEvaluator" value="${esc(existing?.leadEvaluator||'')}"></label><label><span>Evaluator ID / cadre identifier</span><input name="evaluatorId" value="${esc(existing?.evaluatorId||'')}"></label>
    <label><span>Scenario</span><input name="scenario" value="${esc(existing?.scenario||'')}"></label><label><span>Scenario version</span><input name="scenarioVersion" value="${esc(existing?.scenarioVersion||'1')}"></label>
    <label><span>Scenario difficulty</span><select name="scenarioDifficulty">${diffOpts}</select></label><label class="full"><span>Scenario profile / key conditions</span><textarea name="scenarioProfile" rows="2" placeholder="Optional standardized scenario descriptors">${esc(existing?.scenarioProfile||'')}</textarea></label>
  </div><div class="formActions"><button class="action primary" type="submit">${existing?'Save':'Create Class'}</button></div></form>`;
  const form=$('classForm'),maj=form.elements.majcom,showAll=form.elements.showAllInstallations,home=form.elements.homeInstallationId,same=form.elements.sameTrainingLocation,train=form.elements.trainingInstallationId;
  const all=(LOCATION_DATA.installations||[]).filter(i=>i.active!==false&&i.component==='ACTIVE_DUTY').sort((a,b)=>installationDisplay(a).localeCompare(installationDisplay(b)));const wantedHome=existingHome?.id||(existingHomeCustom?'__OTHER__':'');if(existingHome&&cmdValue&&!(existingHome.commands||[]).includes(cmdValue))showAll.checked=true;
  function opt(i,sel=''){return `<option value="${esc(i.id)}" ${sel===i.id?'selected':''}>${esc(installationDisplay(i))}</option>`;}
  function refreshHome(preserve=true){const current=preserve?(home.value||wantedHome):'';let list=(showAll.checked||!maj.value||maj.value==='OTHER')?all:all.filter(i=>(i.commands||[]).includes(maj.value));home.innerHTML=`<option value="">Select installation…</option>${list.map(i=>opt(i,current)).join('')}<option value="__OTHER__" ${current==='__OTHER__'?'selected':''}>Other / not listed</option>`;if(current&&!home.value&&current!=='__OTHER__'){showAll.checked=true;list=all;home.innerHTML=`<option value="">Select installation…</option>${list.map(i=>opt(i,current)).join('')}<option value="__OTHER__">Other / not listed</option>`;}toggleHomeCustom();}
  function refreshTraining(){const current=train.value||(existing?.trainingLocationType==='CUSTOM'?'__OTHER__':existingTrain?.id||'');train.innerHTML=`<option value="">Select training location…</option>${all.map(i=>opt(i,current)).join('')}<option value="__OTHER__" ${current==='__OTHER__'?'selected':''}>Expeditionary / other location</option>`;toggleTrainingCustom();}
  function toggleHomeCustom(){const on=home.value==='__OTHER__';$('customHomeFields').classList.toggle('hidden',!on);form.elements.customHomeLocation.required=on;}
  function toggleTraining(){const on=!same.checked;$('trainingLocationFields').classList.toggle('hidden',!on);train.required=on;if(!on)form.elements.customTrainingLocation.required=false;toggleTrainingCustom();}
  function toggleTrainingCustom(){const on=!same.checked&&train.value==='__OTHER__';$('customTrainingFields').classList.toggle('hidden',!on);form.elements.customTrainingLocation.required=on;}
  maj.onchange=()=>{if(!showAll.checked)refreshHome(false);};showAll.onchange=()=>refreshHome(true);home.onchange=toggleHomeCustom;same.onchange=toggleTraining;train.onchange=toggleTrainingCustom;refreshHome();refreshTraining();toggleTraining();
  form.onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),data=Object.fromEntries(f.entries());if(existing){['name','roster','date','scenario','scenarioVersion','siteCode','courseType','scenarioDifficulty','scenarioProfile','leadEvaluator','evaluatorId'].forEach(k=>existing[k]=String(f.get(k)||'').trim());applyClassLocationFields(existing,data);existing.cloudSync=existing.cloudSync||{};existing.cloudSync.enabled=true;saveDb();closeModal('formModal');renderClass();renderHome();}else{const c=createClass(data);closeModal('formModal');openClass(c.id);}};
  openModal('formModal');
}
function addStudentForm(){
  if(isClassClosed()){alert('Closed classes are permanently locked.');return;}
  $('formModalTitle').textContent='Add Student';
  $('formModalBody').innerHTML=`<form id="studentForm"><div class="formGrid"><label><span>Name *</span><input name="name" required></label><label><span>Rank</span><input name="rank"></label><label class="full"><span>Training ID / privacy-safe identifier</span><input name="trainingId"></label></div><div class="formActions"><button class="action primary" type="submit">Add Student</button></div></form>`;
  $('studentForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),c=cls();const ts=now();c.students.push({id:uuid(),classId:c.id,name:String(f.get('name')).trim(),rank:String(f.get('rank')||'').trim(),trainingId:String(f.get('trainingId')||'').trim(),appVersion:APP_VERSION,contentVersion:c.contentVersion||'',createdAt:ts,modifiedAt:ts,deviceId:db.deviceId,lastModifiedDeviceId:db.deviceId,syncStatus:SYNC_LOCAL,attempts:{}});saveDb();closeModal('formModal');renderClass();};openModal('formModal');
}
function scenarioForm(){
  const c=cls();if(isClassClosed(c)){alert('Closed classes are permanently locked.');return;}
  const locked=hasStartedClass(c), t=tier(), selected=new Set(c.scenarioNT||[]);
  $('formModalTitle').textContent=`Scenario Applicability${locked?' — LOCKED':''}`;
  const rows=t.sections.map(s=>{
    const its=s.items.filter(i=>!i.critical); if(!its.length)return '';
    return `<h3>${esc(s.code)} — ${esc(s.title)}</h3>${its.map(i=>`<label class="scenarioRow"><input type="checkbox" data-scenario-nt="${i.id}" ${selected.has(i.id)?'checked':''} ${locked?'disabled':''}><div><b>${esc(i.id)}</b> ${esc(i.text)} ${i.provenance==='daf'?'<span class="localBadge">DAF SUPPLEMENTAL</span>':''}<br><small>Check = NT by default for new attempts</small></div></label>`).join('')}`;
  }).join('');
  $('formModalBody').innerHTML=`<p class="helper">Use this only for NONCRITICAL criteria the base class scenario will not trigger. All critical criteria remain mandatory and are not eligible for class-level NT. Once the first attempt starts, the class profile locks for consistency. During an individual fluid scenario, an evaluator may still change a noncritical NT to an active grade when the scenario evolves.</p><div class="scenarioList">${rows}</div>${locked?'':`<div class="formActions"><button id="saveScenarioBtn" class="action primary">Save Scenario Profile</button></div>`}`;
  if(!locked)$('saveScenarioBtn').onclick=()=>{c.scenarioNT=[...document.querySelectorAll('[data-scenario-nt]:checked')].map(x=>x.dataset.scenarioNt);saveDb();closeModal('formModal');renderClass();};openModal('formModal');
}

// ---------- Evaluation ----------
function openEvaluation(studentId,attemptNo){
  const c=cls(),s=c?.students.find(x=>x.id===studentId);if(!c||!s)return;
  const lock=findActiveEvaluationLock();
  if(lock&&!evaluationTargetMatchesLock(lock,c.id,studentId,attemptNo)){
    alert(`Another evaluation is still IN PROGRESS:\n\n${activeEvaluationLockText(lock)}\n\nFinalize or Void that attempt before opening another evaluation.`);
    renderActiveEvaluationLockBanner();
    return;
  }
  const existing=s.attempts?.[String(attemptNo)];
  if(existing){
    if(existing.cloudShellOnly){
      alert('This attempt shell was synced from another device. Criterion-level grades, timers, notes, and final result are not cloud-synced yet in this phase. Open the originating device for the full evaluation record.');
      return;
    }
    currentStudentId=studentId;currentAttemptNo=attemptNo;renderEval();showView('evalView');requestEvalWakeLock();return;
  }
  if(attemptNo===2 && s.attempts?.['1']?.finalResult!=='FAIL'){alert('Attempt 2 is reserved for remediation after a finalized Attempt 1 FAIL.');return;}
  if(isClassClosed(c)){alert('Closed classes are read-only.');return;}
  $('formModalTitle').textContent=`Begin Attempt ${attemptNo}`;
  const remediationFields=attemptNo===2?`<div class="remediationStart"><label><span>Remediation reason *</span><select id="remediationReason" required><option value="">Select</option><option>Critical task failure</option><option>Knowledge gap</option><option>Skill execution gap</option><option>Sequencing / prioritization gap</option><option>Timing standard</option><option>Other</option></select></label><label><span>Corrective action completed / planned *</span><textarea id="remediationAction" rows="2" placeholder="e.g., coached repetition, deliberate practice, knowledge review"></textarea></label></div>`:'';
  $('formModalBody').innerHTML=`<div class="startGate"><p><b>${esc(s.rank?`${s.rank} `:'')}${esc(s.name)}</b></p><p>Tier ${esc(c.tierId)} · ${esc(c.name)}</p>${remediationFields}<div class="startWarning"><b>Evaluator ready check</b><br>Confirm the correct student, tier, scenario, and attempt before starting. The evaluation clock begins only after you press <b>Begin Assessment</b>.</div><label class="safetyAckRow"><input id="beginAttemptAck" type="checkbox"><span>I am ready to begin direct observation of this assessment.</span></label><div class="formActions"><button id="beginAttemptBtn" class="action primary" disabled>Begin Assessment</button></div></div>`;
  $('beginAttemptAck').onchange=e=>$('beginAttemptBtn').disabled=!e.target.checked;
  $('beginAttemptBtn').onclick=()=>{const activeLock=findActiveEvaluationLock();if(activeLock&&!evaluationTargetMatchesLock(activeLock,c.id,studentId,attemptNo)){alert(`Another evaluation became active:\n\n${activeEvaluationLockText(activeLock)}\n\nFinalize or Void it first.`);closeModal('formModal');renderClass();return;}const reason=attemptNo===2?$('remediationReason').value.trim():'',action=attemptNo===2?$('remediationAction').value.trim():'';if(attemptNo===2&&(!reason||!action)){alert('Record the remediation reason and corrective action before starting Attempt 2.');return;}currentStudentId=studentId;currentAttemptNo=attemptNo;const st=ensureAttempt();if(!st){alert('Unable to start this attempt. Verify Attempt 1 remediation eligibility and class status.');return;}if(attemptNo===2)st.remediation={reason,action,at:now()};saveDb();closeModal('formModal');renderEval();showView('evalView');requestEvalWakeLock();};
  openModal('formModal');
}
function isObserveMode(st=evalState()){return st?.observeMode!==false;}
function renderEval(){
  const c=cls(),t=tier(),s=student(),st=evalState(); if(!c||!s||!st)return openClass(currentClassId);
  $('tierTitle').textContent=`Tier ${t.id} — ${t.shortName}`; $('tierSource').textContent=t.source;
  $('studentLabel').textContent=`${s.rank?`${s.rank} `:''}${s.name} · ${c.name}`;
  $('attemptBadge').textContent=`Attempt ${st.attemptNo}${st.finalizedAt?' · FINALIZED':''}`; $('attemptLabel').textContent=`Attempt ${st.attemptNo}`; $('instructions').textContent=t.instructions;
  $('trainerSign').value=st.trainerSign||''; $('attemptEvaluatorId').value=st.evaluatorId||c.evaluatorId||''; $('studentSign').value=st.studentSign||''; $('overallNotes').value=st.overallNotes||''; $('showNtToggle').checked=!!st.showNt;
  const observe=isObserveMode(st);$('evalView').classList.toggle('reviewMode',!observe);$('evalView').classList.toggle('observeMode',observe);
  if($('observeModeBtn')){$('observeModeBtn').classList.toggle('active',observe);$('observeModeBtn').setAttribute('aria-pressed',String(observe));}
  if($('reviewModeBtn')){$('reviewModeBtn').classList.toggle('active',!observe);$('reviewModeBtn').setAttribute('aria-pressed',String(!observe));}
  const tq=(t.timers||[]).find(d=>String(d.label||'').toLowerCase().includes('cuf tourniquet'));
  if(tq){$('quickCufTimerCard').classList.remove('hidden');$('quickCufTimerStandard').textContent=tq.standard;$('quickCufTimer').innerHTML=timerMarkup(tq);}else $('quickCufTimerCard').classList.add('hidden');
  const gd=(t.timers||[]).find(d=>d.section==='GLOBAL');
  if(gd){$('globalTimerCard').classList.remove('hidden');$('globalTimerStandard').textContent=gd.standard;$('globalTimer').innerHTML=timerMarkup(gd);}else $('globalTimerCard').classList.add('hidden');
  renderTabs(); renderSection(); renderTimeline(); renderKpis(); renderActiveTimers(); bindEvalDynamic(); setReadOnly(!!st.finalizedAt||isClassClosed(c));
}
function setReadOnly(readonly){
  document.querySelectorAll('#evalView button[data-item],#evalView button[data-timer],#evalView button[data-failure],#evalView button[data-note-toggle],#evalView textarea,#evalView input').forEach(x=>{ if(!x.matches('#showNtToggle')) x.disabled=readonly; });
  $('nextUnresolvedBottomBtn').disabled=readonly;$('nextUnresolvedBtn').disabled=readonly;$('finalizeBtn').disabled=readonly;$('finalizeBtn').textContent=evalState()?.finalizedAt?'Evaluation Finalized':isClassClosed(cls())?'Class Closed':'Review / Finalize';
  $('voidAttemptBtn').classList.toggle('hidden',readonly);$('voidAttemptBtn').disabled=readonly;
}
function sectionStatus(s){
  const st=evalState(); let unresolved=0,warn=0;
  s.items.forEach(i=>{const r=st.ratings[i.id];if(!r||(i.critical&&r==='nt'))unresolved++;if(r==='fail')warn++;});
  return warn?'warn':unresolved?'':'done';
}
function sectionTabLabel(code){
  return code==='COMMS'?'COM':code;
}
function renderTabs(){
  const t=tier(),st=evalState();
  $('tabs').innerHTML=t.sections.map(s=>`<button class="tab ${s.code===st.section?'active':''} ${sectionStatus(s)}" data-section="${esc(s.code)}">${esc(sectionTabLabel(s.code))}</button>`).join('');
}
function renderSection(){
  const t=tier(),st=evalState(),sec=t.sections.find(s=>s.code===st.section)||t.sections[0]; st.section=sec.code;
  const applicable=sec.items.filter(i=>st.ratings[i.id]!=='nt').length;
  const resolved=sec.items.filter(i=>['pass','fail','nt'].includes(st.ratings[i.id]) && !(i.critical&&st.ratings[i.id]==='nt') && !(i.critical&&st.ratings[i.id]==='fail'&&criticalFailureCauseMissing(i,st))).length;
  $('sectionTitle').textContent=`${sec.code} — ${sec.title}`; $('sectionProgress').textContent=`${resolved}/${sec.items.length} resolved · ${applicable} active`;
  const tools=(t.timers||[]).filter(d=>d.section===sec.code&&!d.linkedItemId).map(timerMarkup).join('');
  const inst=(t.instantEvents||[]).filter(i=>i.section===sec.code);
  $('sectionTools').innerHTML=tools+(inst.length?`<div class="instantGrid">${inst.map(i=>`<button class="instantBtn" data-instant="${i.id}">${esc(i.label)}${st.instants[i.id]?`<br><small>${wall(st.instants[i.id])}</small>`:''}</button>`).join('')}</div>`:'');
  $('items').innerHTML=sec.items.length?sec.items.map(item=>itemMarkup(item)).join(''):'<div class="emptySection">No grading criteria in this section.</div>';
  const idx=t.sections.findIndex(s=>s.code===sec.code); $('prevPhaseBtn').disabled=idx===0; $('nextPhaseBtn').disabled=idx===t.sections.length-1;
  const remaining=reviewRemainingItems(sec.items);
  if($('observeFocus')){const focus=remaining[0];$('observeFocus').innerHTML=focus?`<span>Current focus</span><b>${esc(sec.code)} · ${esc(focus.id)}${focus.critical?' · CRITICAL':''}</b><em>${esc(focus.text)}</em>`:`<span>Current phase</span><b>${esc(sec.code)} · COMPLETE</b><em>No unresolved criteria remain in this phase.</em>`;}
  $('blockCloseoutHint').textContent=remaining.length?`${remaining.length} unresolved criterion${remaining.length===1?'':'a'} remain in this phase. Use Next Unresolved to continue forward without scrolling back through the checklist.`:(isObserveMode(st)?'All required criteria in this phase are resolved. Switch to REVIEW when the lane is complete to document, review, and finalize.':'All required criteria in this phase are resolved.');
  const allRemaining=reviewRemainingItems(allItems(t));
  $('nextUnresolvedBottomBtn').disabled=!!st.finalizedAt||allRemaining.length===0;
  $('nextUnresolvedBtn').disabled=!!st.finalizedAt||allRemaining.length===0;
}
function itemMarkup(item){
  const st=evalState(),r=st.ratings[item.id]||'', forced=!!st.timerForced[item.id], linked=timersForItem(item.id), hide=r==='nt'&&!st.showNt&&!item.critical,reviewMode=!isObserveMode(st);
  const badges=`${item.critical?'<span class="crit">CRITICAL</span>':''}${reviewMode?(item.provenance==='daf'?'<span class="localBadge">DAF SUPPLEMENTAL</span>':'<span class="sourceBadge">JTS/DHA</span>'):''}${reviewMode&&item.sourceDiscrepancy?'<span class="noteBadge">SOURCE NOTE</span>':''}${forced?'<span class="forcedBadge">TIMER FAIL</span>':''}`;
  const sourceNote=reviewMode&&item.sourceNote?`<div class="sourceNote">${esc(item.sourceNote)}</div>`:'';
  const linkedTimers=linked.map(timerMarkup).join('');
  const buttons=tier().ratings.map(x=>{let disabled=false;if(forced&&x.key!=='fail')disabled=true;if(x.key==='nt'&&linked.some(d=>timerHasStarted(d.id)))disabled=true;return `<button class="choice ${x.key} ${r===x.key?'sel':''}" data-item="${item.id}" data-rating="${x.key}" ${disabled?'disabled':''}>${esc(x.label)}</button>`;}).join('');
  let status='Not yet graded'; if(r){status=`${r.toUpperCase()} · ${st.methods[item.id]||'explicit'} · ${wall(st.stamps[item.id])}`;const nr=st.ntReasons?.[item.id];if(r==='nt'&&nr)status+=` · ${nr.label}${nr.detail?`: ${nr.detail}`:''}`;}
  const fd=st.failureDetails?.[item.id];
  const failSummary=r==='fail'?`<div class="failureSummary ${fd?.mode==='unclassified'?'unclassified':''}"><span>${esc(fd?.modeLabel||fd?.mode||'Unclassified failure')}</span>${fd?.contributorLabel?`<b>${esc(fd.contributorLabel)}</b>`:''}<button class="ghost small" data-failure="${item.id}">${fd?.mode==='unclassified'?'Classify Fail':'Edit Cause'}</button></div>`:'';
  const noteOpen=reviewMode||!!st.noteOpen?.[item.id],hasNote=!!String(st.notes[item.id]||'').trim();
  const noteArea=noteOpen?`<textarea class="note" data-note="${item.id}" placeholder="Evaluator note">${esc(st.notes[item.id]||'')}</textarea>`:`<button class="noteToggle ghost small" data-note-toggle="${item.id}">Note${hasNote?' ✓':''}</button>`;
  return `<article class="item ${hide?'hiddenNt':''}" data-article="${item.id}"><div class="itemText"><span class="id">${esc(item.id)}</span> · ${esc(item.text)} ${badges}</div>${sourceNote}${linkedTimers}<div class="choices">${buttons}</div>${failSummary}<div class="stamp">${esc(status)}</div>${noteArea}</article>`;
}
const NT_REASONS=[
  ['scenario','Scenario did not trigger criterion'],
  ['contraindicated','Clinically contraindicated / not indicated'],
  ['equipment','Required equipment or resource unavailable'],
  ['prior-action','Action completed before learner opportunity'],
  ['program','Evaluator / program-directed exclusion'],
  ['other','Other']
];
function applyRating(itemId,rating,method='explicit',ntReason=null,failureDetail=null){
  const st=evalState(),i=itemById(itemId);if(!st||!i||st.finalizedAt)return;
  st.ratings[itemId]=rating;st.methods[itemId]=method;st.stamps[itemId]=now();
  st.ntReasons=st.ntReasons||{};st.failureDetails=st.failureDetails||{};
  if(rating==='nt'&&ntReason)st.ntReasons[itemId]={...ntReason,at:st.stamps[itemId]};else if(rating!=='nt')delete st.ntReasons[itemId];
  if(rating==='fail'){
    if(failureDetail)st.failureDetails[itemId]=failureDetail;
    else if(!st.failureDetails[itemId])st.failureDetails[itemId]={mode:'unclassified',modeLabel:'Unclassified / review later',contributor:'',contributorLabel:'',contributingFactor:'',comment:'',at:st.stamps[itemId]};
  }else delete st.failureDetails[itemId];
  const fd=st.failureDetails[itemId];
  event(`${i.id} → ${rating.toUpperCase()}`,`${i.critical?'Critical':'Noncritical'} · ${method}${ntReason?` · ${ntReason.label}${ntReason.detail?`: ${ntReason.detail}`:''}`:''}${rating==='fail'&&fd?` · ${fd.modeLabel}${fd.contributorLabel?` · ${fd.contributorLabel}`:''}`:''}`);saveDb();renderEval();
}
function requestNtReason(itemId){
  const i=itemById(itemId);if(!i||i.critical){alert('Critical criteria cannot be excluded as NT.');return;}
  $('formModalTitle').textContent=`NT Justification — ${i.id}`;
  $('formModalBody').innerHTML=`<p class="helper noPad">NT removes a noncritical criterion from the scoring denominator. Select the reason it was not tested in this attempt.</p><form id="ntReasonForm"><div class="formGrid"><label class="full"><span>Reason *</span><select id="ntReasonCode" required><option value="">Select a reason</option>${NT_REASONS.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label class="full"><span>Optional detail</span><textarea id="ntReasonDetail" rows="3" placeholder="Add scenario-specific context when useful"></textarea></label></div><div class="formActions"><button class="action primary" type="submit">Apply NT</button></div></form>`;
  $('ntReasonForm').onsubmit=e=>{e.preventDefault();const code=$('ntReasonCode').value,label=NT_REASONS.find(x=>x[0]===code)?.[1];if(!label)return;const detail=$('ntReasonDetail').value.trim();if(code==='other'&&!detail){alert('Enter a brief detail for Other.');return;}closeModal('formModal');applyRating(itemId,'nt','explicit-nt',{code,label,detail});};
  openModal('formModal');
}
const FAILURE_MODES=[
  ['omitted','Omitted'],
  ['incorrect','Incorrect'],
  ['delayed-sequence','Delayed / Wrong Sequence'],
  ['incomplete','Incomplete'],
  ['unsafe-other','Unsafe / Other'],
  ['unclassified','Unclassified / review later']
];
const FAILURE_CONTRIBUTORS=[
  ['knowledge','Knowledge'],
  ['recognition-judgment','Recognition / Judgment'],
  ['skill-execution','Skill / Execution'],
  ['prioritization-teamwork','Prioritization / Teamwork'],
  ['environment-system','Environment / System']
];
function requestFailureClassification(itemId,required=false){
  const i=itemById(itemId),st=evalState();if(!i||!st||st.finalizedAt)return;
  const prior=migrateFailureDetail(st.failureDetails?.[itemId]||{})||{};
  $('formModalTitle').textContent=`${required?'Critical ':''}Failure Details — ${i.id}`;
  $('formModalBody').innerHTML=`<p class="helper noPad">Record the observed failure pattern. Performance-contributor selections are evaluator observations, not scientifically proven root causes.</p><form id="failureReasonForm"><div class="formGrid compactFailureGrid"><label><span>Failure mode *</span><select id="failureMode"><option value="">Select</option>${FAILURE_MODES.filter(x=>x[0]!=='unclassified').map(([v,l])=>`<option value="${v}" ${prior.mode===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label><span>Primary Performance Contributor ${required?'*':'(optional)'}</span><select id="failureContributor"><option value="">${required?'Select':'Optional'}</option>${FAILURE_CONTRIBUTORS.map(([v,l])=>`<option value="${v}" ${prior.contributor===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label class="full"><span>Optional note</span><textarea id="failureComment" rows="2" placeholder="Add concise context only when useful">${esc(prior.comment||'')}</textarea></label></div><div class="formActions"><button class="action primary" type="submit">${st.ratings[itemId]==='fail'?'Save Failure Details':'Record FAIL'}</button></div></form>`;
  $('failureReasonForm').onsubmit=e=>{e.preventDefault();const mode=$('failureMode').value,contributor=$('failureContributor').value;if(!mode){alert('Select a failure mode.');return;}if(required&&!contributor){alert('Critical failures require a Primary Performance Contributor.');return;}const modeLabel=FAILURE_MODE_LABELS[mode]||FAILURE_MODES.find(x=>x[0]===mode)?.[1]||mode,contributorLabel=CONTRIBUTOR_LABELS[contributor]||FAILURE_CONTRIBUTORS.find(x=>x[0]===contributor)?.[1]||'';const detail={mode,modeLabel,contributor,contributorLabel,contributingFactor:'',comment:$('failureComment').value.trim(),at:now()};closeModal('formModal');applyRating(itemId,'fail',required?'explicit-critical-fail':'explicit-fail-classified',null,detail);};
  openModal('formModal');
}
function setRating(itemId,rating,method='explicit'){
  const st=evalState(),i=itemById(itemId); if(!st||!i||st.finalizedAt)return;
  if(st.timerForced[itemId]&&rating!=='fail'){alert('A triggered timing standard was not met. This criterion must be graded FAIL unless the erroneous timer instance is voided with an audit reason.');return;}
  if(rating==='nt'&&timersForItem(itemId).some(d=>timerHasStarted(d.id))){alert('NT is unavailable because a linked timed intervention was initiated.');return;}
  if(rating==='nt')return requestNtReason(itemId);
  if(rating==='fail')return requestFailureClassification(itemId,!!i.critical);
  applyRating(itemId,rating,method);
}
function criticalFailureCauseMissing(i,st=evalState()){if(!i?.critical||st?.ratings?.[i.id]!=='fail')return false;const d=st.failureDetails?.[i.id];return !d||!d.mode||d.mode==='unclassified'||!d.contributor;}
function reviewRemainingItems(items){
  const st=evalState();
  return items.filter(i=>!st.ratings[i.id]||(i.critical&&st.ratings[i.id]==='nt')||criticalFailureCauseMissing(i,st)||(st.timerForced[i.id]&&st.ratings[i.id]!=='fail'));
}
function unresolvedItem(i,st){
  return !st.ratings[i.id]||(i.critical&&st.ratings[i.id]==='nt')||criticalFailureCauseMissing(i,st)||(st.timerForced[i.id]&&st.ratings[i.id]!=='fail');
}
function nextUnresolved(){
  const st=evalState(),t=tier(),items=allItems(t),remaining=items.filter(i=>unresolvedItem(i,st));
  if(!remaining.length){alert('No unresolved criteria remain.');return;}

  const sec=t.sections.find(s=>s.code===st.section)||t.sections[0];
  const sectionRemaining=sec.items.filter(i=>unresolvedItem(i,st));
  let target=null;

  // Prefer the next unresolved item at or below the evaluator's current viewing position.
  // If the evaluator reached the bottom but missed an item above, wrap within the current
  // phase before moving to a later phase. This makes the bottom button useful without
  // requiring manual scrolling back through the checklist.
  if(sectionRemaining.length){
    const headerBottom=document.getElementById('evalHeader')?.getBoundingClientRect().bottom||0;
    const candidateEls=[...document.querySelectorAll('#items [data-article]')]
      .filter(el=>!el.classList.contains('hiddenNt')&&el.getBoundingClientRect().bottom>headerBottom+6);
    for(const el of candidateEls){
      const item=sectionRemaining.find(i=>i.id===el.dataset.article);
      if(item){target=item;break;}
    }
    if(!target)target=sectionRemaining[0];
  }

  // Current phase is resolved: continue forward through later phases, then wrap once.
  if(!target){
    const sectionIndex=t.sections.findIndex(s=>s.code===sec.code);
    for(let offset=1;offset<=t.sections.length;offset++){
      const nextSec=t.sections[(sectionIndex+offset)%t.sections.length];
      target=nextSec.items.find(i=>unresolvedItem(i,st));
      if(target)break;
    }
  }

  if(!target)target=remaining[0];
  st.section=target.section;saveDb();renderEval();
  setTimeout(()=>{
    const el=document.querySelector(`[data-article="${CSS.escape(target.id)}"]`);
    if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.classList.add('unresolvedFocus');
    setTimeout(()=>el.classList.remove('unresolvedFocus'),1100);
  },50);
}


// ---------- Timers ----------
function timerStore(id){ const st=evalState(); if(!st.timers[id])st.timers[id]={instances:[],currentIndex:-1}; return st.timers[id]; }
function currentInstance(id){ const s=timerStore(id); return s.currentIndex>=0?s.instances[s.currentIndex]:null; }
function blankInstance(id,index){ return {id:`${id}-${index+1}`,index:index+1,wallStart:null,wallStartMono:null,wallStop:null,runtimeId:null,running:false,paused:false,pauseKind:null,pauseStartedAt:null,pauseStartedMono:null,activeStartedAt:null,activeStartedMono:null,activeMs:0,continuousMs:0,maxContinuousMs:0,tacticalPauseMs:0,adminPauseMs:0,finalDurationMs:null,result:null,voided:false,voidReason:'',segments:[]}; }
function ensureInstance(id){ const s=timerStore(id); let x=currentInstance(id); if(!x||x.wallStop||x.voided){x=blankInstance(id,s.instances.length);s.instances.push(x);s.currentIndex=s.instances.length-1;} return x; }
function timerHasStarted(id){ return timerStore(id).instances.some(x=>x.wallStart&&!x.voided); }
function timerNeedsRecovery(x){return !!(x?.wallStart&&!x.wallStop&&!x.voided&&(!x.runtimeId||x.runtimeId!==RUNTIME_ID));}
function elapsedSafe(wallStart,monoStart,runtimeId,at=now(),monoAt=monoNow()){
  if(runtimeId===RUNTIME_ID&&Number.isFinite(monoStart)&&Number.isFinite(monoAt))return Math.max(0,monoAt-monoStart);
  return Math.max(0,at-(wallStart||at));
}
function closeActive(x,at,monoAt=monoNow()){ if(x.activeStartedAt){const d=elapsedSafe(x.activeStartedAt,x.activeStartedMono,x.runtimeId,at,monoAt);x.activeMs+=d;x.continuousMs+=d;x.segments.push({start:x.activeStartedAt,end:at,duration:d});x.activeStartedAt=null;x.activeStartedMono=null;} }
function gradingDuration(d,x,at=now(),monoAt=monoNow()){
  if(!x||!x.wallStart)return 0;if(x.wallStop&&Number.isFinite(x.finalDurationMs))return x.finalDurationMs;
  let active=x.activeMs,cont=x.continuousMs,maxCont=x.maxContinuousMs,admin=x.adminPauseMs;
  if(x.running&&x.activeStartedAt&&!timerNeedsRecovery(x)){const dlt=elapsedSafe(x.activeStartedAt,x.activeStartedMono,x.runtimeId,at,monoAt);active+=dlt;cont+=dlt;}
  if(x.paused&&x.pauseKind==='admin'&&x.pauseStartedAt&&!timerNeedsRecovery(x))admin+=elapsedSafe(x.pauseStartedAt,x.pauseStartedMono,x.runtimeId,at,monoAt);
  maxCont=Math.max(maxCont,cont);
  if(d.gradingClock==='wall') return Math.max(0,elapsedSafe(x.wallStart,x.wallStartMono,x.runtimeId,at,monoAt)-admin);
  if(d.gradingClock==='continuous') return maxCont;
  return active;
}
function rawTimerResult(d,x,at=now()){
  if(!x||!x.wallStart||x.voided)return 'incomplete'; const dur=gradingDuration(d,x,at);
  let met=false;if(d.mode==='max')met=dur<=d.seconds*1000;else if(d.mode==='min')met=dur>=d.seconds*1000;else if(d.mode==='range')met=dur>=(d.minSeconds||0)*1000&&dur<=(d.maxSeconds||Infinity)*1000;
  if(!x.wallStop){
    if(d.mode==='max'&&dur>d.seconds*1000)return 'notmet';
    return met?'live-met':'incomplete';
  }
  return met?'met':'notmet';
}
function timerAggregateStatus(d){
  const s=timerStore(d.id),valid=s.instances.filter(x=>x.wallStart&&!x.voided); if(!valid.length)return 'incomplete';
  const statuses=valid.map(x=>rawTimerResult(d,x)); if(statuses.includes('notmet'))return 'notmet'; if(valid.some(x=>!x.wallStop))return statuses.includes('live-met')?'live-met':'incomplete'; return statuses.every(x=>x==='met')?'met':'incomplete';
}
function recalcTimerForced(itemId){
  if(!itemId)return;const st=evalState(),i=itemById(itemId); const fail=timersForItem(itemId).some(d=>timerAggregateStatus(d)==='notmet');
  if(fail){st.timerForced[itemId]=true;if(!i.critical){st.ratings[itemId]='fail';st.methods[itemId]='timer';st.stamps[itemId]=now();st.failureDetails=st.failureDetails||{};st.failureDetails[itemId]={mode:'delayed-sequence',modeLabel:'Delayed / Wrong Sequence',contributor:'',contributorLabel:'',contributingFactor:'',comment:'Timer standard not met',at:st.stamps[itemId]};}else if(st.ratings[itemId]!=='fail'){delete st.ratings[itemId];delete st.methods[itemId];delete st.stamps[itemId];delete st.failureDetails?.[itemId];}}
  else delete st.timerForced[itemId];
}
function timerAction(id,act){
  const d=timerDef(id),st=evalState();if(!d||!st||st.finalizedAt)return;let x=currentInstance(id),at=now(),monoAt=monoNow();
  if(x&&timerNeedsRecovery(x)&&act!=='void'){
    alert('This timer was active when the app process ended or reloaded. For timing integrity it cannot be resumed or stopped from the recovered state. VOID this instance with a reason, then start a new timer instance.');return;
  }
  if(act==='start'){
    x=ensureInstance(id);
    if(x.paused){
      const pd=elapsedSafe(x.pauseStartedAt,x.pauseStartedMono,x.runtimeId,at,monoAt);if(x.pauseKind==='admin')x.adminPauseMs+=pd;else x.tacticalPauseMs+=pd;x.pauseStartedAt=null;x.pauseStartedMono=null;x.pauseKind=null;x.paused=false;x.running=true;x.activeStartedAt=at;x.activeStartedMono=monoAt;event(`${d.label} resumed`,`Instance ${x.index}`);
    }else if(!x.running&&!x.wallStart){x.wallStart=at;x.wallStartMono=monoAt;x.runtimeId=RUNTIME_ID;x.running=true;x.activeStartedAt=at;x.activeStartedMono=monoAt;if(d.linkedItemId&&st.ratings[d.linkedItemId]==='nt'){delete st.ratings[d.linkedItemId];delete st.methods[d.linkedItemId];delete st.stamps[d.linkedItemId];delete st.ntReasons?.[d.linkedItemId];}event(`${d.label} started`,`Instance ${x.index}`);}
  }
  if(act==='pause'){
    if(!x?.running)return;
    closeActive(x,at,monoAt);x.running=false;x.paused=true;x.pauseKind='tactical';x.pauseStartedAt=at;x.pauseStartedMono=monoAt;if(d.continuousRequired){x.maxContinuousMs=Math.max(x.maxContinuousMs,x.continuousMs);x.continuousMs=0;}event(`${d.label} tactical pause`,`Instance ${x.index}`);
  }
  if(act==='admin'){
    if(!x?.running)return;
    closeActive(x,at,monoAt);x.running=false;x.paused=true;x.pauseKind='admin';x.pauseStartedAt=at;x.pauseStartedMono=monoAt;event(`${d.label} administrative hold`,`Instance ${x.index}`);
  }
  if(act==='stop'){
    if(!x?.wallStart)return;if(x.running)closeActive(x,at,monoAt);if(x.paused&&x.pauseStartedAt){const pd=elapsedSafe(x.pauseStartedAt,x.pauseStartedMono,x.runtimeId,at,monoAt);if(x.pauseKind==='admin')x.adminPauseMs+=pd;else x.tacticalPauseMs+=pd;x.pauseStartedAt=null;x.pauseStartedMono=null;}x.running=false;x.paused=false;x.maxContinuousMs=Math.max(x.maxContinuousMs,x.continuousMs);x.finalDurationMs=gradingDuration(d,x,at,monoAt);x.wallStop=at;x.result=rawTimerResult(d,x,at);event(`${d.label} stopped`,`Instance ${x.index} · ${fmt(x.finalDurationMs)} · ${x.result.toUpperCase()}`);recalcTimerForced(d.linkedItemId);
  }
  if(act==='reset'){
    if(x&&x.wallStart&&!x.wallStop&&!x.voided&&!confirm('Current timer instance is incomplete. Preserve it as an incomplete instance and create the next instance?'))return;
    const s=timerStore(id),n=blankInstance(id,s.instances.length);s.instances.push(n);s.currentIndex=s.instances.length-1;event(`${d.label} next/reset`,`Created instance ${n.index}`);
  }
  if(act==='void'){
    if(!x?.wallStart)return;const reason=prompt('Reason for voiding this timer instance (required):');if(!reason?.trim())return;if(x.running&&!timerNeedsRecovery(x))closeActive(x,at,monoAt);x.running=false;x.paused=false;x.wallStop=x.wallStop||at;x.voided=true;x.voidReason=reason.trim();event(`${d.label} instance voided`,`Instance ${x.index} · ${x.voidReason}`);recalcTimerForced(d.linkedItemId);
  }
  saveDb();renderEval();updateLiveClocks(true);
}
function timerMarkup(d){
  const s=timerStore(d.id),x=currentInstance(d.id),recovery=timerNeedsRecovery(x),status=recovery?'recovery':timerAggregateStatus(d); const dur=x&&!recovery?gradingDuration(d,x):0;
  const liveStatus=recovery?'RECOVERY REQUIRED — VOID AND RESTART':status==='met'?'STANDARD MET':status==='notmet'?'STANDARD NOT MET':status==='live-met'?'STANDARD CURRENTLY MET':'READY / INCOMPLETE';
  const clsx=status==='notmet'||recovery?'bad':status==='met'||status==='live-met'?'good':'';
  const prov=d.provenance==='daf'?'<span class="localBadge">DAF SUPPLEMENTAL TIMER</span>':'<span class="sourceBadge">SOURCE TIMER</span>';
  const startLabel=x?.paused?'RESUME':x?.running?'RUNNING':'START';
  const pauseBtn=d.pausePolicy==='admin-only'?`<button class="timerBtn admin" data-timer="${d.id}" data-act="admin">ADMIN HOLD</button>`:`<button class="timerBtn pause" data-timer="${d.id}" data-act="pause">PAUSE</button>`;
  const history=s.instances.filter(z=>z.wallStart).map(z=>`<div class="timerInstance"><span>#${z.index}${z.voided?' VOID':''}</span><span>${z.voided?esc(z.voidReason):`${fmt(gradingDuration(d,z,z.wallStop||now()))} · ${rawTimerResult(d,z,z.wallStop||now()).toUpperCase()}`}</span></div>`).join('');
  return `<div class="toolCard"><div class="toolTitle">${esc(d.label)} · ${esc(d.standard)} ${prov}</div><div class="timerDisplay ${status==='notmet'||recovery?'bad':status==='incomplete'?'':'good'}" data-display="${d.id}">${recovery?'--:--':fmt(dur)}</div><div class="timerBtns"><button class="timerBtn start" data-timer="${d.id}" data-act="start" ${x?.running?'disabled':''}>${startLabel}</button>${pauseBtn}<button class="timerBtn stop" data-timer="${d.id}" data-act="stop">${d.section==='GLOBAL'?'END':'STOP'}</button>${d.repeatable?`<button class="timerBtn reset" data-timer="${d.id}" data-act="reset">NEXT / RESET</button>`:''}<button class="timerBtn reset" data-timer="${d.id}" data-act="void">VOID</button></div><div class="timerMeta"><span class="${clsx}">${liveStatus}</span> · Grading clock: ${esc(d.gradingClock||'active')}${d.continuousRequired?' · continuous segment required':''}${x?.paused?` · ${x.pauseKind==='admin'?'ADMIN HOLD':'TACTICAL PAUSE'}`:''}</div>${history?`<div class="timerHistory">${history}</div>`:''}</div>`;
}
function renderActiveTimers(){
  const t=tier();const running=(t.timers||[]).filter(d=>{const x=currentInstance(d.id);return x&&(x.running||x.paused);});
  $('activeTimersCard').classList.toggle('hidden',running.length===0);$('activeTimerCount').textContent=`${running.length}`;
  $('activeTimers').innerHTML=running.map(d=>{
    const x=currentInstance(d.id),recovery=timerNeedsRecovery(x),locked=!!evalState()?.finalizedAt||isClassClosed(cls());
    return `<div class="activeTimerRow"><span class="activeTimerName">${esc(d.label)} #${x.index}${recovery?' (RECOVERY REQUIRED)':x.paused?' (PAUSED)':''}</span><b class="activeTimerElapsed">${recovery?'VOID / RESTART':fmt(gradingDuration(d,x))}</b><button class="timerBtn stop activeTimerStop" data-active-timer-stop="${esc(d.id)}" ${recovery||locked?'disabled':''}>STOP</button></div>`;
  }).join('');
}

// ---------- Scoring / finalization ----------
function activeTimerDefs(t=tier()){
  if(!t||!evalState())return [];
  return (t.timers||[]).filter(d=>{
    const x=currentInstance(d.id);
    return !!(x?.wallStart&&!x.voided&&!x.wallStop&&(x.running||x.paused));
  });
}
function scoreStats(t,st){
  const items=t.sections.flatMap(s=>s.items);const pass=items.filter(i=>st.ratings[i.id]==='pass').length,fail=items.filter(i=>st.ratings[i.id]==='fail').length,nt=items.filter(i=>st.ratings[i.id]==='nt').length,ungraded=items.filter(i=>!st.ratings[i.id]).length;const denom=pass+fail;const percent=denom?pass/denom:0;return {pass,fail,nt,ungraded,denom,percent,percentText:denom?`${(percent*100).toFixed(1)}%`:'—'};
}
function proficiency(t=tier(),st=evalState()){
  const items=t.sections.flatMap(s=>s.items),score=scoreStats(t,st);
  const criticalFail=items.filter(i=>i.critical&&st.ratings[i.id]==='fail');
  const criticalCauseMissing=criticalFail.filter(i=>{const d=st.failureDetails?.[i.id];return !d||!d.mode||d.mode==='unclassified'||!d.contributor;});
  const criticalUnresolved=items.filter(i=>i.critical&&(!st.ratings[i.id]||st.ratings[i.id]==='nt'));
  const otherUnresolved=items.filter(i=>!i.critical&&!st.ratings[i.id]);
  const timerPassMissing=[];
  (t.timers||[]).filter(d=>d.linkedItemId).forEach(d=>{
    const r=st.ratings[d.linkedItemId],ts=timerAggregateStatus(d);
    if(r==='pass'&&ts!=='met')timerPassMissing.push(d);
  });
  const activeTimers=activeTimerDefs(t);
  const gd=(t.timers||[]).find(d=>d.section==='GLOBAL');
  const globalStatus=gd?timerAggregateStatus(gd):'met';
  // A running or paused timer is never a final result. This explicitly blocks
  // the prior edge case where an expired max-duration timer became NOT MET
  // while it was still running and the evaluation could be finalized as FAIL.
  const incomplete=criticalUnresolved.length||criticalCauseMissing.length||otherUnresolved.length||timerPassMissing.length||activeTimers.length||(gd&&globalStatus==='incomplete')||(gd&&globalStatus==='live-met');
  let result='INCOMPLETE';
  if(!incomplete){
    if(criticalFail.length||globalStatus==='notmet'||score.percent<0.75)result='FAIL';
    else result='PASS';
  }
  return {result,score,criticalFail,criticalCauseMissing,criticalUnresolved,otherUnresolved,timerPassMissing,activeTimers,globalStatus};
}
function renderKpis(){
  const st=evalState();if(!st)return;const p=proficiency();$('elapsedTop').textContent=fmt(sessionElapsed(st));$('criticalTop').textContent=p.criticalFail.length;$('gradedTop').textContent=p.score.percentText;$('unresolvedTop').textContent=p.criticalUnresolved.length+p.criticalCauseMissing.length+p.otherUnresolved.length+p.timerPassMissing.length+p.activeTimers.length;
}
function renderTimeline(){ const st=evalState();if(!st)return;$('eventCount').textContent=`${st.events.length} events`;$('timeline').innerHTML=st.events.length?st.events.slice().reverse().map(e=>`<div class="event"><div class="eventTime">${fmt(e.elapsed)}</div><div><b>${esc(e.label)}</b>${e.detail?`<div>${esc(e.detail)}</div>`:''}<div class="stamp">${wall(e.at)}</div></div></div>`).join(''):'<div class="stamp">No events yet.</div>'; }
function buildReviewText(){
  const c=cls(),s=student(),st=evalState(),t=tier(),p=proficiency(),items=allItems(t);const fails=items.filter(i=>st.ratings[i.id]==='fail'),critNt=items.filter(i=>i.critical&&st.ratings[i.id]==='nt');
  const timerLines=(t.timers||[]).map(d=>`${d.label}: ${timerAggregateStatus(d).toUpperCase()}${timerStore(d.id).instances.filter(x=>x.wallStart&&!x.voided).map(x=>` | #${x.index} ${fmt(gradingDuration(d,x,x.wallStop||now()))} ${rawTimerResult(d,x,x.wallStop||now()).toUpperCase()}`).join('')}`);
  const failLine=i=>{const d=st.failureDetails?.[i.id];return `${i.id} — ${i.text}${d?` | ${d.modeLabel||d.mode}${d.contributorLabel?` | ${d.contributorLabel}`:''}${d.contributingFactor?` | Factor: ${d.contributingFactor}`:''}`:''}`;};
  return `TCCC EVALUATION REVIEW
${c.name} | Tier ${t.id} ${t.shortName} | ${t.source}
Student: ${s.rank?s.rank+' ':''}${s.name} | Attempt ${st.attemptNo}
Scenario: ${c.scenario||'—'} v${c.scenarioVersion||'1'} | Roster: ${c.roster||'—'}${st.remediation?`\nRemediation: ${st.remediation.reason} | ${st.remediation.action}`:''}

STATUS: ${p.result}
Score: ${p.score.pass}/${p.score.denom} (${p.score.percentText}) [NT excluded]
PASS ${p.score.pass} | FAIL ${p.score.fail} | NT ${p.score.nt} | Unresolved ${p.score.ungraded}
Critical failures: ${p.criticalFail.length}
Critical failure classifications missing: ${p.criticalCauseMissing.length}
Critical unresolved (blank/NT): ${p.criticalUnresolved.length}
Other unresolved: ${p.otherUnresolved.length}
Active / paused timers: ${p.activeTimers.length}${p.activeTimers.length?` (${p.activeTimers.map(d=>d.label).join(', ')})`:''}

FAILED CRITICAL
${p.criticalFail.length?p.criticalFail.map(failLine).join('\n'):'None'}

OTHER FAILURES
${fails.filter(i=>!i.critical).length?fails.filter(i=>!i.critical).map(failLine).join('\n'):'None'}

CRITICAL NT
${critNt.length?critNt.map(i=>`${i.id} — ${i.text}`).join('\n'):'None'}

TIMERS
${timerLines.length?timerLines.join('\n'):'None'}

EVALUATOR NOTES
${st.overallNotes||'None'}

Generated ${new Date().toLocaleString()} | TCCC Evaluation Suite v${APP_VERSION}`;
}
function reviewFinalize(){
  $('aarText').textContent=buildReviewText();
  const p=proficiency();
  $('confirmFinalizeBtn').disabled=p.result==='INCOMPLETE';
  $('confirmFinalizeBtn').textContent=p.activeTimers.length?'Stop / resolve active timers':p.result==='INCOMPLETE'?'Resolve Items Before Finalizing':`Finalize ${p.result}`;
  openModal('reportModal');
}
function finalizeEvaluation(){ const st=evalState(),p=proficiency();if(p.result==='INCOMPLETE'){alert(p.activeTimers.length?'Stop or administratively resolve all active/paused timers before finalization.':'Resolve all required criteria and timing standards before finalization.');return;}if(!confirm(`Finalize this evaluation as ${p.result}? Finalized attempts become read-only and the evaluator lock will be released.`))return;st.finalizedAt=now();st.finalResult=p.result;event('Evaluation finalized',`${p.result} · ${p.score.percentText}`);saveDb();closeModal('reportModal');renderEval(); }

function voidCurrentAttempt(){
  const c=cls(),s=student(),st=evalState();if(!c||!s||!st||st.finalizedAt||isClassClosed(c))return;
  const token=prompt(`VOID IN-PROGRESS ATTEMPT ${st.attemptNo}

Use this only for an accidental or invalid start. This removes the unfinished local attempt.

Type VOID to continue.`);if(token!=='VOID')return;
  delete s.attempts[String(st.attemptNo)];if(!hasStartedClass(c))c.status='draft';saveDb();releaseEvalWakeLock();openClass(c.id);
}

// ---------- Export ----------
function csvValue(v){let s=String(v??'');if(/^[\t\r\n ]*[=+\-@]/.test(s))s="'"+s;return s;}
function csvCell(v){return `"${csvValue(v).replace(/"/g,'""')}"`;}
function csv(rows){return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
function bytes(s){return new TextEncoder().encode(s);}
function bytesToBase64(arr){let bin='';for(let i=0;i<arr.length;i+=0x8000)bin+=String.fromCharCode(...arr.subarray(i,Math.min(i+0x8000,arr.length)));return btoa(bin);}
function uniqueName(name){const d=new Date(),stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;const p=name.lastIndexOf('.');return p>0?`${name.slice(0,p)}_${stamp}${name.slice(p)}`:`${name}_${stamp}`;}
async function saveFile(name,data,mime){
  const final=uniqueName(name);
  try{
    const cap=window.Capacitor;
    if(cap && (cap.getPlatform?.()==='android'||cap.isNativePlatform?.())){
      const fs=cap.registerPlugin?cap.registerPlugin('Filesystem'):cap.Plugins?.Filesystem;
      if(!fs?.writeFile)throw new Error('Filesystem plugin unavailable');
      await fs.writeFile({path:final,data:bytesToBase64(data),directory:'DOCUMENTS',recursive:true});
      if(fs.stat)await fs.stat({path:final,directory:'DOCUMENTS'});
      alert(`Saved and verified in Documents:\n${final}`);
      return true;
    }
  }catch(e){console.error(e);alert(`Android save failed: ${e.message||e}`);return false;}
  const blob=new Blob([data],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=final;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return true;
}
function wrap(text,max=94){const out=[];for(const para of String(text??'').split('\n')){if(!para){out.push('');continue;}let line='';for(const w of para.split(/\s+/)){const n=line?line+' '+w:w;if(n.length>max){if(line)out.push(line);line=w}else line=n;}if(line)out.push(line);}return out;}
function opRect(ops,x,y,w,h,fill,stroke=null,lw=1){ops.push({type:'rect',x,y,w,h,fill,stroke,lw});}
function opLine(ops,x1,y1,x2,y2,color='#CBD5E1',lw=1){ops.push({type:'line',x1,y1,x2,y2,color,lw});}
function opText(ops,x,y,text,size=9,bold=false,color='#0F172A'){ops.push({type:'text',x,y,text:String(text??''),size,bold,color});}
function opWrap(ops,x,y,text,maxChars=55,size=8,bold=false,color='#334155',lineH=11,maxLines=3){const lines=wrap(text,maxChars).slice(0,maxLines);lines.forEach((ln,i)=>opText(ops,x,y-i*lineH,ln,size,bold,color));return y-lines.length*lineH;}
function base64ToBytes(b64){const bin=atob(b64),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function concatBytes(parts,total){const out=new Uint8Array(total);let off=0;for(const p of parts){out.set(p,off);off+=p.length;}return out;}
function renderOpsJpeg(ops,pageNo,totalPages){
  const scale=2,w=612,h=792,canvas=document.createElement('canvas');canvas.width=w*scale;canvas.height=h*scale;const ctx=canvas.getContext('2d',{alpha:false});
  ctx.scale(scale,scale);ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,w,h);ctx.textBaseline='alphabetic';
  const drawOps=ops.slice();drawOps.push({type:'text',x:510,y:18,text:`Page ${pageNo}/${totalPages}`,size:7,bold:false,color:'#64748B'});
  for(const o of drawOps){
    if(o.type==='rect'){
      const yy=h-o.y-o.h;if(o.fill){ctx.fillStyle=o.fill;ctx.fillRect(o.x,yy,o.w,o.h);}if(o.stroke){ctx.strokeStyle=o.stroke;ctx.lineWidth=o.lw||1;ctx.strokeRect(o.x,yy,o.w,o.h);}
    }else if(o.type==='line'){
      ctx.beginPath();ctx.strokeStyle=o.color;ctx.lineWidth=o.lw||1;ctx.moveTo(o.x1,h-o.y1);ctx.lineTo(o.x2,h-o.y2);ctx.stroke();
    }else if(o.type==='text'){
      ctx.fillStyle=o.color;ctx.font=`${o.bold?'700':'400'} ${o.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;ctx.fillText(o.text,o.x,h-o.y);
    }
  }
  const data=canvas.toDataURL('image/jpeg',0.95);return {bytes:base64ToBytes(data.split(',')[1]),width:canvas.width,height:canvas.height};
}
function buildOpsPdf(pages){
  const images=pages.map((ops,i)=>renderOpsJpeg(ops,i+1,pages.length));
  const pageIds=[],contentIds=[],imageIds=[];let next=3;for(let i=0;i<images.length;i++){pageIds.push(next++);contentIds.push(next++);imageIds.push(next++);}const size=next;
  const enc=new TextEncoder(),parts=[],offsets=new Array(size).fill(0);let len=0;
  const add=b=>{parts.push(b);len+=b.length;};const addText=s=>add(enc.encode(s));const beginObj=id=>{offsets[id]=len;addText(`${id} 0 obj\n`);};
  addText('%PDF-1.4\n');
  beginObj(1);addText('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  beginObj(2);addText(`<< /Type /Pages /Kids [${pageIds.map(x=>x+' 0 R').join(' ')}] /Count ${pageIds.length} >>\nendobj\n`);
  images.forEach((img,i)=>{
    beginObj(pageIds[i]);addText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im${i+1} ${imageIds[i]} 0 R >> >> /Contents ${contentIds[i]} 0 R >>\nendobj\n`);
    const stream=`q\n612 0 0 792 0 0 cm\n/Im${i+1} Do\nQ\n`;
    beginObj(contentIds[i]);addText(`<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
    beginObj(imageIds[i]);addText(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);add(img.bytes);addText('\nendstream\nendobj\n');
  });
  const xref=len;addText(`xref\n0 ${size}\n0000000000 65535 f \n`);for(let i=1;i<size;i++)addText(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);addText(`trailer << /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return concatBytes(parts,len);
}
function sectionPerformance(t,st){return t.sections.map(sec=>{const p=sec.items.filter(i=>st.ratings[i.id]==='pass').length,f=sec.items.filter(i=>st.ratings[i.id]==='fail').length,nt=sec.items.filter(i=>st.ratings[i.id]==='nt').length,unresolved=sec.items.filter(i=>!st.ratings[i.id]).length,d=p+f;return {code:sec.code,title:sec.title,pass:p,fail:f,nt,unresolved,denom:d,pct:d?p/d:null,criticalFail:sec.items.filter(i=>i.critical&&st.ratings[i.id]==='fail').length};});}
function bestWorstSections(t,st){const a=sectionPerformance(t,st).filter(x=>x.denom>0);const best=a.slice().sort((x,y)=>(y.pct-x.pct)||(x.fail-y.fail)).slice(0,3);const weak=a.filter(x=>x.fail>0).sort((x,y)=>(x.pct-y.pct)||(y.fail-x.fail)).slice(0,3);return {best,weak};}
function triggeredTimerSummary(t,st){let total=0,met=0,notmet=0;for(const d of (t.timers||[])){const store=st.timers?.[d.id]||{instances:[]};for(const x of store.instances.filter(x=>x.wallStart&&!x.voided)){total++;const r=resultStatic(d,x);if(r==='MET')met++;else if(r==='NOTMET')notmet++;}}return {total,met,notmet};}
function reportColor(pct,fail=0){if(fail>0&&pct!==null&&pct<.8)return '#B42318';if(pct!==null&&pct>=.9)return '#157347';if(pct!==null)return '#B7791F';return '#64748B';}
function drawKpi(ops,x,y,w,label,value,fill='#F8FAFC',valueColor='#0F172A'){opRect(ops,x,y,w,52,fill,'#CBD5E1');opText(ops,x+9,y+34,label.toUpperCase(),7,true,'#64748B');opText(ops,x+9,y+12,value,17,true,valueColor);}
function buildIndividualSummaryPdf(){
  const c=cls(),s=student(),st=evalState(),t=tier(),p=proficiency(),ph=sectionPerformance(t,st),bw=bestWorstSections(t,st),tm=triggeredTimerSummary(t,st),ops=[];
  opRect(ops,0,710,612,82,'#0B2A48');opText(ops,30,758,'TCCC STUDENT PERFORMANCE SUMMARY',18,true,'#FFFFFF');opText(ops,30,738,`${s.rank?s.rank+' ':''}${s.name} | Tier ${t.id} ${t.shortName} | Attempt ${st.attemptNo}`,11,true,'#CFFAFE');ensureLocationFields(c);opText(ops,30,721,`${c.name} | ${c.majcom||'MAJCOM -'} | ${c.homeInstallationName||'Home -'} | ${c.scenario||'Scenario'} v${c.scenarioVersion||'1'}`,8,false,'#E2E8F0');
  const result=st.finalResult||p.result,resColor=result==='PASS'?'#157347':result==='FAIL'?'#B42318':'#B7791F';
  drawKpi(ops,30,642,126,'Result',result,'#FFFFFF',resColor);drawKpi(ops,166,642,126,'Performance',p.score.percentText,'#FFFFFF');drawKpi(ops,302,642,126,'Critical',`${p.criticalFail.length} fail`,'#FFFFFF',p.criticalFail.length?'#B42318':'#157347');drawKpi(ops,438,642,144,'Timers',tm.total?`${tm.met}/${tm.total} met`:'None triggered','#FFFFFF',tm.notmet?'#B42318':'#157347');
  opText(ops,30,620,'PHASE PERFORMANCE',9,true,'#334155');
  const cols=8,bwBox=66,bh=34;ph.forEach((x,i)=>{const row=Math.floor(i/cols),col=i%cols,xx=30+col*bwBox,yy=576-row*42;const color=reportColor(x.pct,x.fail);opRect(ops,xx,yy,bwBox-5,bh,'#F8FAFC','#CBD5E1');opText(ops,xx+5,yy+21,x.code,8,true,color);opText(ops,xx+5,yy+8,x.pct===null?'NT/--':`${Math.round(x.pct*100)}%`,11,true,color);});
  const boxY=432;opRect(ops,30,boxY,266,105,'#F0FDF4','#BBF7D0');opText(ops,42,boxY+86,'STRENGTHS',10,true,'#157347');if(bw.best.length)bw.best.forEach((x,i)=>opText(ops,42,boxY+64-i*22,`${i+1}. ${x.code} - ${x.title} (${Math.round(x.pct*100)}%)`,8,i===0,'#166534'));else opText(ops,42,boxY+62,'No scored phases yet.',8,false,'#64748B');
  opRect(ops,316,boxY,266,105,'#FFF7ED','#FED7AA');opText(ops,328,boxY+86,'IMPROVEMENT PRIORITIES',10,true,'#B45309');if(bw.weak.length)bw.weak.forEach((x,i)=>opWrap(ops,328,boxY+64-i*27,`${i+1}. ${x.code} - ${x.title}: ${x.fail} miss${x.fail===1?'':'es'}`,43,8,i===0,'#9A3412',10,2));else opText(ops,328,boxY+62,'No failed applicable criteria.',8,false,'#64748B');
  opText(ops,30,407,'KEY MISSES / COACHING POINTS',10,true,'#334155');const failed=allItems(t).filter(i=>st.ratings[i.id]==='fail').sort((a,b)=>(Number(b.critical)-Number(a.critical))||(Number(!!st.timerForced[b.id])-Number(!!st.timerForced[a.id]))).slice(0,5);let yy=387;if(!failed.length){opText(ops,42,yy,'No failed criteria recorded.',8,false,'#157347');yy-=18;}else failed.forEach((i,n)=>{const prefix=`${n+1}. ${i.section} ${i.id}${i.critical?' [CRITICAL]':''}${st.timerForced[i.id]?' [TIMING]':''}`;opText(ops,42,yy,prefix,8,true,i.critical?'#B42318':'#334155');yy=opWrap(ops,54,yy-12,i.text,82,7,false,'#475569',9,2)-4;});
  opLine(ops,30,205,582,205,'#CBD5E1');opText(ops,30,189,'EVALUATOR SUMMARY',9,true,'#334155');const note=st.overallNotes||'No overall evaluator comments entered.';opWrap(ops,30,174,note,105,8,false,'#475569',10,4);
  opText(ops,30,120,`PASS ${p.score.pass} | FAIL ${p.score.fail} | NT ${p.score.nt} | Unresolved ${p.score.ungraded} | Applicable ${p.score.denom}`,8,true,'#334155');opText(ops,30,104,`Elapsed ${fmt((st.finalizedAt||now())-st.startedAt)} | Evaluator ${st.trainerSign||c.leadEvaluator||'-'} | DAF Supplemental included in scoring when applicable`,7,false,'#64748B');
  opRect(ops,30,48,552,38,'#EFF6FF','#BFDBFE');opText(ops,42,70,'Student coaching summary only.',8,true,'#1D4ED8');opText(ops,42,56,'Full criterion, timer, pause/reset, notes, and event details are retained in the Full Individual CSV.',7,false,'#334155');opText(ops,30,30,`Generated ${new Date().toLocaleString()} | TCCC Evaluation Suite v${APP_VERSION} | ${t.source}`,6,false,'#64748B');
  return buildOpsPdf([ops]);
}
async function exportIndividualPdf(){const s=student();await saveFile(`TCCC_Tier${tier().id}_${safe(s.name)}_Attempt${currentAttemptNo}_Summary.pdf`,buildIndividualSummaryPdf(),'application/pdf');}
async function exportIndividualCsv(){
  const c=cls(),stu=student(),st=evalState(),t=tier(),p=proficiency();
  const h=['record_type','class_id','class_name','class_status','closed_at',...CLASS_LOCATION_HEADERS,'roster','course_type','scenario','scenario_version','scenario_difficulty','lead_evaluator','evaluator_id','student','rank','training_id','tier','curriculum_id','attempt','remediation_reason','remediation_action','result','score_percent','criterion_id','section','critical','provenance','daf_supplemental','grade','grading_method','graded_at','failure_mode','failure_mode_label','primary_contributor','primary_contributor_label','contributing_factor','failure_comment','criterion_note','source_reference','timer_id','timer_label','timer_instance','timer_standard','timer_grading_clock','timer_wall_start','timer_wall_stop','timer_duration_seconds','timer_result','tactical_pause_seconds','admin_pause_seconds','timer_voided','timer_void_reason','event_at','event_elapsed_seconds','event_label','event_detail','overall_notes','trainer_sign','evaluator_id','student_sign','app_version'];
  const lv=classLocationExportValues(c),loc=Object.fromEntries(CLASS_LOCATION_HEADERS.map((k,i)=>[k,lv[i]]));const records=[];const base={class_id:c.id,class_name:c.name,class_status:lifecycleStatus(c),closed_at:iso(c.closedAt),...loc,roster:c.roster,course_type:c.courseType||'',scenario:c.scenario,scenario_version:c.scenarioVersion,scenario_difficulty:c.scenarioDifficulty||'',lead_evaluator:c.leadEvaluator||'',student:stu.name,rank:stu.rank,training_id:stu.trainingId,tier:t.id,curriculum_id:st.curriculumId||c.curriculumId||`TCCC-TIER${t.id}`,attempt:st.attemptNo,remediation_reason:st.remediation?.reason||'',remediation_action:st.remediation?.action||'',result:st.finalResult||p.result,score_percent:p.score.denom?(p.score.percent*100).toFixed(1):'',overall_notes:st.overallNotes||'',trainer_sign:st.trainerSign||'',evaluator_id:st.evaluatorId||c.evaluatorId||'',student_sign:st.studentSign||'',app_version:APP_VERSION};
  records.push({...base,record_type:'SUMMARY'});
  t.sections.forEach(sec=>sec.items.forEach(i=>records.push({...base,record_type:'CRITERION',criterion_id:i.id,section:sec.code,critical:i.critical?'YES':'NO',provenance:i.provenance||'source',daf_supplemental:i.provenance==='daf'?'YES':'NO',grade:st.ratings[i.id]||'',grading_method:st.methods[i.id]||'',graded_at:iso(st.stamps[i.id]),failure_mode:st.failureDetails?.[i.id]?.mode||'',failure_mode_label:st.failureDetails?.[i.id]?.modeLabel||'',primary_contributor:st.failureDetails?.[i.id]?.contributor||'',primary_contributor_label:st.failureDetails?.[i.id]?.contributorLabel||'',contributing_factor:st.failureDetails?.[i.id]?.contributingFactor||'',failure_comment:st.failureDetails?.[i.id]?.comment||'',criterion_note:st.notes[i.id]||'',source_reference:i.sourceReference||'',curriculum_id:st.curriculumId||c.curriculumId||`TCCC-TIER${t.id}`})));
  (t.timers||[]).forEach(d=>{const store=st.timers?.[d.id]||{instances:[]};store.instances.filter(x=>x.wallStart).forEach(x=>records.push({...base,record_type:'TIMER',timer_id:d.id,timer_label:d.label,timer_instance:x.index,timer_standard:d.standard,timer_grading_clock:d.gradingClock,timer_wall_start:iso(x.wallStart),timer_wall_stop:iso(x.wallStop),timer_duration_seconds:(durationStatic(d,x)/1000).toFixed(1),timer_result:x.voided?'VOID':resultStatic(d,x),tactical_pause_seconds:((x.tacticalPauseMs||0)/1000).toFixed(1),admin_pause_seconds:((x.adminPauseMs||0)/1000).toFixed(1),timer_voided:x.voided?'YES':'NO',timer_void_reason:x.voidReason||''}));});
  (st.events||[]).forEach(e=>records.push({...base,record_type:'EVENT',event_at:iso(e.at),event_elapsed_seconds:((e.elapsed||0)/1000).toFixed(1),event_label:e.label||'',event_detail:e.detail||''}));
  const rows=[h,...records.map(r=>h.map(k=>r[k]??''))];await saveFile(`TCCC_${safe(c.name)}_${safe(stu.name)}_A${st.attemptNo}_Full.csv`,bytes(csv(rows)),'text/csv');
}
function finalAttemptForStudent(s){const finals=Object.values(s.attempts||{}).filter(a=>a?.finalizedAt).sort((a,b)=>a.attemptNo-b.attemptNo);return finals.at(-1)||null;}
function classAttempt1s(c){return (c.students||[]).map(s=>s.attempts?.['1']).filter(a=>a?.finalizedAt);}
function classPhaseStats(c,t){const arr=classAttempt1s(c);return t.sections.map(sec=>{let pass=0,fail=0;arr.forEach(a=>sec.items.forEach(i=>{if(a.ratings[i.id]==='pass')pass++;if(a.ratings[i.id]==='fail')fail++;}));const d=pass+fail;return {code:sec.code,title:sec.title,pass,fail,denom:d,pct:d?pass/d:null};});}
function classMisses(c,t){return criterionGapStats(c,t).filter(x=>x.fail>0).slice(0,5).map(x=>({id:x.item.id,count:x.fail,tested:x.tested,rate:x.failRate,ntRate:x.ntRate,item:x.item}));}
function buildClassSummaryPdf(){
  const c=cls(),t=tier(),stats=classStats(c),a1=classAttempt1s(c),a1Pass=a1.filter(a=>a.finalResult==='PASS').length,finalized=stats.completed,finalRate=finalized?stats.qualified/finalized:0,a1Rate=a1.length?a1Pass/a1.length:0,ph=classPhaseStats(c,t),miss=classMisses(c,t),intel=classAnalytics(c,t),ops=[];
  opRect(ops,0,710,612,82,'#0B2A48');opText(ops,30,758,'TCCC CLASS PERFORMANCE SUMMARY',18,true,'#FFFFFF');opText(ops,30,738,`${c.name} | Tier ${t.id} ${t.shortName} | ${lifecycleStatus(c)}`,11,true,'#CFFAFE');ensureLocationFields(c);opText(ops,30,721,`Roster ${c.roster||'-'} | ${c.majcom||'MAJCOM -'} | ${c.homeInstallationName||'Home -'} | ${c.date||''}`,8,false,'#E2E8F0');
  drawKpi(ops,30,642,102,'Students',String(stats.total));drawKpi(ops,142,642,102,'First Pass',a1.length?`${Math.round(a1Rate*100)}%`:'-');drawKpi(ops,254,642,102,'Final Pass',finalized?`${Math.round(finalRate*100)}%`:'-','#FFFFFF',finalRate>=.9?'#157347':'#0F172A');drawKpi(ops,366,642,102,'Remed Success',intel.remediationSuccess==null?'-':`${Math.round(intel.remediationSuccess*100)}%`,'#FFFFFF','#0F172A');drawKpi(ops,478,642,104,'Critical Fail',intel.criticalRate==null?'-':`${Math.round(intel.criticalRate*100)}%`,'#FFFFFF',intel.criticalStudents?'#B42318':'#157347');
  opText(ops,30,620,'STUDENT OUTCOMES',9,true,'#334155');const totalBar=Math.max(1,stats.completed),passW=552*(stats.qualified/totalBar),failW=552*(stats.failed/totalBar);opRect(ops,30,590,552,22,'#E2E8F0');if(stats.qualified)opRect(ops,30,590,passW,22,'#22A35A');if(stats.failed)opRect(ops,30+passW,590,failW,22,'#D64545');opText(ops,36,596,`PASS ${stats.qualified} (${finalized?Math.round(finalRate*100):0}%)`,8,true,'#FFFFFF');if(stats.failed)opText(ops,Math.min(520,36+passW),596,`FAIL ${stats.failed}`,8,true,'#FFFFFF');opText(ops,30,574,`Finalized ${stats.completed}/${stats.total} | Incomplete / not finalized ${Math.max(0,stats.total-stats.completed)} | Attempt 1 finalized ${a1.length}`,7,false,'#64748B');
  opText(ops,30,548,'CUF - TFC - MARCH-PAWS / PHASE PERFORMANCE (ATTEMPT 1)',9,true,'#334155');
  ph.forEach((x,i)=>{const col=i%2,row=Math.floor(i/2),xx=30+col*276,yy=522-row*27;opText(ops,xx,yy,x.code,8,true,reportColor(x.pct,x.fail));opText(ops,xx+30,yy,x.pct===null?'-':`${Math.round(x.pct*100)}%`,8,true,'#334155');opRect(ops,xx+72,yy-2,178,9,'#E2E8F0');if(x.pct!==null)opRect(ops,xx+72,yy-2,178*x.pct,9,reportColor(x.pct,x.fail));});
  const missY=Math.max(214,522-Math.ceil(ph.length/2)*27-28);opText(ops,30,missY,'HIGHEST CRITERION FAILURE RATES - ATTEMPT 1',9,true,'#334155');let yy=missY-20;if(!miss.length)opText(ops,42,yy,'No failed criteria in finalized Attempt 1 evaluations.',8,false,'#157347');else miss.forEach((m,i)=>{opText(ops,42,yy,`${i+1}. ${Math.round((m.rate||0)*100)}% fail (${m.count}/${m.tested} tested) - ${m.id} ${m.item?.critical?'[CRITICAL]':''}`,8,true,m.item?.critical?'#B42318':'#334155');yy=opWrap(ops,54,yy-11,m.item?.text||'',88,7,false,'#475569',9,2)-4;});
  opRect(ops,30,48,552,50,'#EFF6FF','#BFDBFE');opText(ops,42,79,'HOW TO READ THIS REPORT',8,true,'#1D4ED8');opText(ops,42,64,'Phase bars and criterion failure rates use finalized Attempt 1 data; final PASS/FAIL shows course outcomes after remediation.',7,false,'#334155');opText(ops,30,30,`Generated ${new Date().toLocaleString()} | TCCC Evaluation Suite v${APP_VERSION} | Full detail retained in class CSV exports`,6,false,'#64748B');return buildOpsPdf([ops]);
}
async function exportClassPdf(){const c=cls();await saveFile(`TCCC_${safe(c.name)}_Class_Summary.pdf`,buildClassSummaryPdf(),'application/pdf');}
async function exportClassSummaryCsv(){const c=cls(),t=tier(),lv=classLocationExportValues(c);const rows=[['class_id','class_name','class_status','closed_at',...CLASS_LOCATION_HEADERS,'roster','course_type','scenario','scenario_version','scenario_difficulty','scenario_profile','lead_evaluator','evaluator_id','student','rank','training_id','tier','curriculum_id','attempt','remediation_reason','remediation_action','finalized','result','pass_count','fail_count','nt_count','unresolved_count','score_percent','started_at','finalized_at']];c.students.forEach(stu=>Object.values(stu.attempts||{}).filter(Boolean).sort((a,b)=>a.attemptNo-b.attemptNo).forEach(a=>{const ss=scoreStats(t,a);rows.push([c.id,c.name,lifecycleStatus(c),iso(c.closedAt),...lv,c.roster,c.courseType||'',c.scenario,c.scenarioVersion,c.scenarioDifficulty||'',c.scenarioProfile||'',c.leadEvaluator||'',a.evaluatorId||c.evaluatorId||'',stu.name,stu.rank,stu.trainingId,t.id,a.curriculumId||c.curriculumId||`TCCC-TIER${t.id}`,a.attemptNo,a.remediation?.reason||'',a.remediation?.action||'',a.finalizedAt?'YES':'NO',a.finalResult||proficiencyFor(t,a).result,ss.pass,ss.fail,ss.nt,ss.ungraded,ss.denom?(ss.percent*100).toFixed(1):'',iso(a.startedAt),iso(a.finalizedAt)]);}));await saveFile(`TCCC_${safe(c.name)}_Summary.csv`,bytes(csv(rows)),'text/csv');}
async function exportClassAnalyticsCsv(){
  const c=cls(),t=tier(),a=classAnalytics(c,t),rows=[['record_type','metric','value','criterion_id','section','critical','tested','fail_count','fail_rate_percent','nt_count','nt_rate_percent','root_cause','root_cause_count','root_cause_percent','app_version']];
  const metric=(k,v)=>rows.push(['METRIC',k,v,'','','','','','','','','','','',APP_VERSION]);
  ensureLocationFields(c);metric('students',c.students.length);metric('operational_majcom',c.majcom||'');metric('home_installation_id',c.homeInstallationId||'');metric('home_installation_name',c.homeInstallationName||'');metric('training_location_type',c.trainingLocationType||'');metric('training_location_name',c.trainingLocationName||'');metric('unit',c.unit||'');metric('exercise',c.exercise||'');metric('course_type',c.courseType||'');metric('site_code',c.siteCode||'');metric('scenario',c.scenario||'');metric('scenario_version',c.scenarioVersion||'');metric('scenario_difficulty',c.scenarioDifficulty||'');metric('curriculum_id',c.curriculumId||`TCCC-TIER${t.id}`);metric('first_attempt_qualification_percent',a.a1Rate==null?'':(a.a1Rate*100).toFixed(1));metric('final_qualification_percent',a.finalRate==null?'':(a.finalRate*100).toFixed(1));metric('remediation_rate_percent',a.remediationRate==null?'':(a.remediationRate*100).toFixed(1));metric('remediation_success_percent',a.remediationSuccess==null?'':(a.remediationSuccess*100).toFixed(1));metric('repeat_failure_rate_percent',a.repeatFailureRate==null?'':(a.repeatFailureRate*100).toFixed(1));metric('critical_failure_rate_percent',a.criticalRate==null?'':(a.criticalRate*100).toFixed(1));metric('scenario_coverage_percent',a.coverage==null?'':(a.coverage*100).toFixed(1));metric('median_attempts_to_proficiency',a.medianAttempts??'');
  criterionGapStats(c,t).forEach(g=>rows.push(['CRITERION_GAP','', '',g.item.id,g.item.section,g.item.critical?'YES':'NO',g.tested,g.fail,g.failRate==null?'':(g.failRate*100).toFixed(1),g.nt,g.ntRate==null?'':(g.ntRate*100).toFixed(1),'','','',APP_VERSION]));
  const roots=rootCauseStats(c,t);roots.rows.forEach(r=>rows.push(['ROOT_CAUSE','','','','','','','','','','',r.label,r.count,(r.pct*100).toFixed(1),APP_VERSION]));roots.modeRows.forEach(r=>rows.push(['FAILURE_MODE','','','','','','','','','','',r.label,r.count,(r.pct*100).toFixed(1),APP_VERSION]));evaluatorSignalStats(c,t).forEach(g=>rows.push(['EVALUATOR_SIGNAL',g.evaluator,`${g.students} students; fail ${g.failRate==null?'':(g.failRate*100).toFixed(1)}%; NT ${g.ntRate==null?'':(g.ntRate*100).toFixed(1)}%; critical ${g.criticalRate==null?'':(g.criticalRate*100).toFixed(1)}%`,'','','','','','','','','','','',APP_VERSION]));
  await saveFile(`TCCC_${safe(c.name)}_Performance_Analytics.csv`,bytes(csv(rows)),'text/csv');
}
function proficiencyFor(t,st){const saveC=currentClassId,saveS=currentStudentId,saveA=currentAttemptNo; // static scoring without timer aggregate, used only export summary fallback
  const items=t.sections.flatMap(s=>s.items),ss=scoreStats(t,st),cf=items.filter(i=>i.critical&&st.ratings[i.id]==='fail').length,un=items.filter(i=>!st.ratings[i.id]||(i.critical&&st.ratings[i.id]==='nt')||criticalFailureCauseMissing(i,st)).length;return {result:un?'INCOMPLETE':cf||ss.percent<.75?'FAIL':'PASS'};
}
async function exportClassCriteriaCsv(){const c=cls(),t=tier(),lv=classLocationExportValues(c);const rows=[['class_id','class_name','class_status','closed_at',...CLASS_LOCATION_HEADERS,'roster','course_type','scenario','scenario_version','scenario_difficulty','lead_evaluator','evaluator_id','student','rank','training_id','tier','attempt','criterion_id','section','critical','provenance','daf_supplemental','grade','grading_method','graded_at','failure_mode','failure_mode_label','primary_contributor','primary_contributor_label','contributing_factor','failure_comment','note','source_reference','curriculum_id','app_version']];c.students.forEach(stu=>Object.values(stu.attempts||{}).filter(Boolean).forEach(a=>t.sections.forEach(sec=>sec.items.forEach(i=>rows.push([c.id,c.name,lifecycleStatus(c),iso(c.closedAt),...lv,c.roster,c.courseType||'',c.scenario,c.scenarioVersion,c.scenarioDifficulty||'',c.leadEvaluator||'',a.evaluatorId||c.evaluatorId||'',stu.name,stu.rank,stu.trainingId,t.id,a.attemptNo,i.id,sec.code,i.critical?'YES':'NO',i.provenance||'source',i.provenance==='daf'?'YES':'NO',a.ratings[i.id]||'',a.methods[i.id]||'',iso(a.stamps[i.id]),a.failureDetails?.[i.id]?.mode||'',a.failureDetails?.[i.id]?.modeLabel||'',a.failureDetails?.[i.id]?.contributor||'',a.failureDetails?.[i.id]?.contributorLabel||'',a.failureDetails?.[i.id]?.contributingFactor||'',a.failureDetails?.[i.id]?.comment||'',a.notes[i.id]||'',i.sourceReference||'',a.curriculumId||c.curriculumId||`TCCC-TIER${t.id}`,a.appVersion||APP_VERSION])))));await saveFile(`TCCC_${safe(c.name)}_Criteria.csv`,bytes(csv(rows)),'text/csv');}
async function exportClassTimersCsv(){const c=cls(),t=tier(),lv=classLocationExportValues(c);const rows=[['class_id','class_name','class_status','closed_at',...CLASS_LOCATION_HEADERS,'course_type','scenario','scenario_version','scenario_difficulty','evaluator_id','student','training_id','tier','attempt','timer_id','timer_label','linked_criterion','instance','standard','grading_clock','wall_start','wall_stop','duration_seconds','result','tactical_pause_seconds','admin_pause_seconds','voided','void_reason']];c.students.forEach(stu=>Object.values(stu.attempts||{}).filter(Boolean).forEach(a=>(t.timers||[]).forEach(d=>{const store=a.timers?.[d.id]||{instances:[]};store.instances.filter(x=>x.wallStart).forEach(x=>{const dur=durationStatic(d,x);rows.push([c.id,c.name,lifecycleStatus(c),iso(c.closedAt),...lv,c.courseType||'',c.scenario,c.scenarioVersion,c.scenarioDifficulty||'',a.evaluatorId||c.evaluatorId||'',stu.name,stu.trainingId,t.id,a.attemptNo,d.id,d.label,d.linkedItemId||'',x.index,d.standard,d.gradingClock,iso(x.wallStart),iso(x.wallStop),(dur/1000).toFixed(1),x.voided?'VOID':resultStatic(d,x),((x.tacticalPauseMs||0)/1000).toFixed(1),((x.adminPauseMs||0)/1000).toFixed(1),x.voided?'YES':'NO',x.voidReason||'']);});})));await saveFile(`TCCC_${safe(c.name)}_Timers.csv`,bytes(csv(rows)),'text/csv');}
async function exportClassEventsCsv(){const c=cls(),t=tier(),lv=classLocationExportValues(c);const rows=[['class_id','class_name','class_status','closed_at',...CLASS_LOCATION_HEADERS,'course_type','scenario','scenario_version','scenario_difficulty','evaluator_id','student','rank','training_id','tier','attempt','event_at','event_elapsed_seconds','event_label','event_detail','app_version']];c.students.forEach(stu=>Object.values(stu.attempts||{}).filter(Boolean).forEach(a=>(a.events||[]).forEach(e=>rows.push([c.id,c.name,lifecycleStatus(c),iso(c.closedAt),...lv,c.courseType||'',c.scenario,c.scenarioVersion,c.scenarioDifficulty||'',a.evaluatorId||c.evaluatorId||'',stu.name,stu.rank,stu.trainingId,t.id,a.attemptNo,iso(e.at),((e.elapsed||0)/1000).toFixed(1),e.label||'',e.detail||'',a.appVersion||APP_VERSION]))));await saveFile(`TCCC_${safe(c.name)}_Events.csv`,bytes(csv(rows)),'text/csv');}
async function exportEnterpriseAnalyticsCsvForClasses(classes,fileBase='TCCC_Enterprise_Detail'){
  const exportedAt=new Date().toISOString(),h=['schema_version','installation_catalog_version','record_id','class_id','class_name','class_status','closed_at',...CLASS_LOCATION_HEADERS,'course_date','roster','course_type','scenario','scenario_version','scenario_difficulty','scenario_profile','tier','curriculum_id','student_local_id','training_id','attempt_id','attempt_number','attempt_finalized','attempt_result','attempt_started_at','attempt_finalized_at','remediation_reason','remediation_action','evaluator_id','criterion_id','criterion_section','criterion_text','critical','provenance','grade','grading_method','graded_at','nt_reason_code','nt_reason_label','failure_mode','failure_mode_label','primary_contributor','primary_contributor_label','contributing_factor','failure_comment','criterion_note','timer_forced_failure','content_version','app_version','export_timestamp'],rows=[h];
  classes.forEach(c=>{ensureLocationFields(c);const t=c.tierSnapshot||TIERS[c.tierId],lv=classLocationExportValues(c);(c.students||[]).forEach(stu=>Object.values(stu.attempts||{}).filter(Boolean).sort((a,b)=>a.attemptNo-b.attemptNo).forEach(a=>{const result=a.finalResult||proficiencyFor(t,a).result;t.sections.forEach(sec=>sec.items.forEach(i=>{const nt=a.ntReasons?.[i.id]||{},fd=a.failureDetails?.[i.id]||{},recordId=`${c.id}:${stu.id}:${a.id||a.attemptNo}:${i.id}`;rows.push([ANALYTICS_SCHEMA_VERSION,LOCATION_DATA.catalogVersion||'',recordId,c.id,c.name,lifecycleStatus(c),iso(c.closedAt),...lv,c.date||'',c.roster||'',c.courseType||'',c.scenario||'',c.scenarioVersion||'1',c.scenarioDifficulty||'',c.scenarioProfile||'',t.id,a.curriculumId||c.curriculumId||`TCCC-TIER${t.id}`,stu.id,stu.trainingId||'',a.id||'',a.attemptNo,a.finalizedAt?'YES':'NO',result,iso(a.startedAt),iso(a.finalizedAt),a.remediation?.reason||'',a.remediation?.action||'',a.evaluatorId||c.evaluatorId||'',i.id,sec.code,i.text||'',i.critical?'YES':'NO',i.provenance||'source',a.ratings[i.id]||'',a.methods[i.id]||'',iso(a.stamps[i.id]),nt.code||'',nt.label||'',fd.mode||'',fd.modeLabel||'',fd.contributor||'',fd.contributorLabel||'',fd.contributingFactor||'',fd.comment||'',a.notes[i.id]||'',a.timerForced?.[i.id]?'YES':'NO',a.contentVersion||c.contentVersion||'',a.appVersion||APP_VERSION,exportedAt]);}));}));});
  await saveFile(`${safe(fileBase)}.csv`,bytes(csv(rows)),'text/csv');
}
async function exportClassEnterpriseAnalyticsCsv(){const c=cls();if(c)await exportEnterpriseAnalyticsCsvForClasses([c],`TCCC_${safe(c.name)}_Enterprise_Detail`);}
async function exportScopedEnterpriseAnalyticsCsv(){const scope=managementScopeClasses();if(!scope.length){alert('No classes match the current management scope.');return;}await exportEnterpriseAnalyticsCsvForClasses(scope,`TCCC_Management_Enterprise_Detail_${new Date().toISOString().slice(0,10)}`);}
async function exportManagementSummaryCsv(){
  const scope=managementScopeClasses();if(!scope.length){alert('No classes match the current management scope.');return;}const overall=aggregateManagement(scope),maj=managementGroupRows(scope,'majcom'),inst=managementGroupRows(scope,'installation');
  const rows=[['record_type','scope_key','scope_name','supported_majcom','classes','bases','students','a1_finalized','first_pass_rate','finalized_students','final_pass_rate','remediation_rate','remediation_success','critical_failure_rate','failed_observations','contributor_classified_rate','top_performance_contributor','app_version','installation_catalog_version']];
  const push=(type,key,name,cmd,g,bases='')=>rows.push([type,key,name,cmd,g.classes,bases,g.students,g.a1Final,g.a1Rate==null?'':(g.a1Rate*100).toFixed(1),g.finalized,g.finalRate==null?'':(g.finalRate*100).toFixed(1),g.remediationRate==null?'':(g.remediationRate*100).toFixed(1),g.remediationSuccess==null?'':(g.remediationSuccess*100).toFixed(1),g.criticalRate==null?'':(g.criticalRate*100).toFixed(1),g.failObs,g.rcaRate==null?'':(g.rcaRate*100).toFixed(1),g.rootRows[0]?.label||'',APP_VERSION,LOCATION_DATA.catalogVersion||'']);
  push('OVERALL','ALL','Current management scope','',overall,new Set(scope.map(c=>c.homeInstallationId||c.homeInstallationName).filter(Boolean)).size);maj.forEach(x=>push('MAJCOM',x.key,x.label,x.key,x.a,x.bases.size));inst.forEach(x=>push('INSTALLATION',x.key,x.label,x.sub,x.a,1));
  await saveFile(`TCCC_Management_Summary_${new Date().toISOString().slice(0,10)}.csv`,bytes(csv(rows)),'text/csv');
}
function durationStatic(d,x){if(Number.isFinite(x.finalDurationMs))return x.finalDurationMs;let active=x.activeMs||0,cont=x.continuousMs||0,max=x.maxContinuousMs||0;if(x.running&&x.activeStartedAt&&!timerNeedsRecovery(x)){const dd=elapsedSafe(x.activeStartedAt,x.activeStartedMono,x.runtimeId);active+=dd;cont+=dd;}max=Math.max(max,cont);if(d.gradingClock==='wall')return Math.max(0,elapsedSafe(x.wallStart,x.wallStartMono,x.runtimeId)-(x.adminPauseMs||0));if(d.gradingClock==='continuous')return max;return active;}
function resultStatic(d,x){if(x.voided)return 'VOID';if(!x.wallStop)return 'INCOMPLETE';const dur=durationStatic(d,x);let met=false;if(d.mode==='max')met=dur<=d.seconds*1000;else if(d.mode==='min')met=dur>=d.seconds*1000;else met=dur>=(d.minSeconds||0)*1000&&dur<=(d.maxSeconds||Infinity)*1000;return met?'MET':'NOTMET';}
async function backupClass(){const c=cls();await saveFile(`TCCC_${safe(c.name)}_Backup.json`,bytes(JSON.stringify({type:'TCCC_CLASS_BACKUP',appVersion:APP_VERSION,class:c},null,2)),'application/json');}
async function backupAttempt(){const c=cls(),s=student(),a=evalState();await saveFile(`TCCC_${safe(c.name)}_${safe(s.name)}_A${a.attemptNo}_Backup.json`,bytes(JSON.stringify({type:'TCCC_ATTEMPT_BACKUP',appVersion:APP_VERSION,classMeta:{id:c.id,name:c.name,tierId:c.tierId},studentMeta:{id:s.id,name:s.name},attempt:a},null,2)),'application/json');}
function restoreBackup(file){const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(x.type!=='TCCC_CLASS_BACKUP'||!x.class)throw new Error('Not a class backup');const c=x.class;c.id=uuid();c.name=`${c.name} (Restored)`;db.classes.unshift(c);normalizeDb(db);saveDb();renderHome();alert('Class backup restored.');}catch(e){alert(`Restore failed: ${e.message||e}`);}};r.readAsText(file);}
function importRoster(file){
  if(isClassClosed()){alert('Closed classes are permanently locked.');return;}
  const r=new FileReader();
  r.onload=()=>{
    const lines=String(r.result).split(/\r?\n/).filter(x=>x.trim());
    if(!lines.length){alert('Roster CSV is empty.');return;}
    const parse=line=>{
      const out=[];let cur='',q=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}
        else if(ch===','&&!q){out.push(cur.trim());cur='';}
        else cur+=ch;
      }
      out.push(cur.trim());return out;
    };
    const h=parse(lines[0]).map(x=>x.trim().toLowerCase()),c=cls();
    const existingIds=new Set(c.students.map(s=>String(s.trainingId||'').trim().toLowerCase()).filter(Boolean));
    const existingNames=new Set(c.students.map(s=>`${String(s.name||'').trim().toLowerCase()}|${String(s.rank||'').trim().toLowerCase()}`));
    const seenIds=new Set(),seenNames=new Set(),valid=[],duplicates=[],invalid=[];
    lines.slice(1).forEach((line,rowIndex)=>{
      const v=parse(line),obj={};h.forEach((k,i)=>obj[k]=v[i]||'');
      const first=obj.first_name||obj.firstname||obj.first||'';
      const last=obj.last_name||obj.lastname||obj.last||'';
      const name=(obj.name||obj.student||obj.student_name||[first,last].filter(Boolean).join(' ')).trim();
      const rank=(obj.rank||obj.grade||'').trim();
      const trainingId=(obj.training_id||obj.id||obj.trainingid||obj.roster_id||'').trim();
      if(!name){invalid.push(`Row ${rowIndex+2}: missing student name`);return;}
      const idKey=trainingId.toLowerCase(),nameKey=`${name.toLowerCase()}|${rank.toLowerCase()}`;
      if((idKey&&(existingIds.has(idKey)||seenIds.has(idKey)))||existingNames.has(nameKey)||seenNames.has(nameKey)){
        duplicates.push(`${rank?rank+' ':''}${name}${trainingId?` (${trainingId})`:''}`);
        return;
      }
      if(idKey)seenIds.add(idKey);seenNames.add(nameKey);
      {const ts=now();valid.push({id:uuid(),classId:c.id,name,rank,trainingId,appVersion:APP_VERSION,contentVersion:c.contentVersion||'',createdAt:ts,modifiedAt:ts,deviceId:db.deviceId,lastModifiedDeviceId:db.deviceId,syncStatus:SYNC_LOCAL,attempts:{}});}
    });
    const preview=`ROSTER IMPORT PREVIEW\n\nValid new students: ${valid.length}\nDuplicates skipped: ${duplicates.length}\nInvalid rows skipped: ${invalid.length}\n\n${duplicates.length?`Duplicates:\n${duplicates.slice(0,8).join('\n')}${duplicates.length>8?`\n+ ${duplicates.length-8} more`:''}\n\n`:''}${invalid.length?`Invalid:\n${invalid.slice(0,8).join('\n')}${invalid.length>8?`\n+ ${invalid.length-8} more`:''}\n\n`:''}Import ${valid.length} valid student(s)?`;
    if(!valid.length){alert(preview.replace(/\n\nImport 0 valid student\(s\)\?$/,''));return;}
    if(!confirm(preview))return;
    c.students.push(...valid);saveDb();renderClass();alert(`Imported ${valid.length} student(s).`);
  };
  r.readAsText(file);
}


// ---------- Android field hardening ----------
let evalWakeLock=null,backgroundedAt=null;
function evalVisible(){return !$('evalView').classList.contains('hidden')&&!!evalState();}
function hasActiveTimers(){return evalVisible()&&activeTimerDefs().length>0;}
async function requestEvalWakeLock(){
  if(!evalVisible()||evalState()?.finalizedAt||!('wakeLock' in navigator))return;
  try{
    if(!evalWakeLock||evalWakeLock.released)evalWakeLock=await navigator.wakeLock.request('screen');
  }catch(e){console.warn('Screen wake lock unavailable',e);}
}
async function releaseEvalWakeLock(){
  try{if(evalWakeLock&&!evalWakeLock.released)await evalWakeLock.release();}catch{}
  evalWakeLock=null;
}
function navigateBackSafely(){
  if(!$('evalView').classList.contains('hidden')){
    if(activeTimerDefs().length){alert('An evaluation timer is running or paused. Stop, void, or otherwise resolve the timer before leaving this evaluation.');return;}
    openClass(currentClassId);return;
  }
  if(!$('classView').classList.contains('hidden')){showHome();return;}
  try{
    const cap=window.Capacitor,appPlugin=cap?.registerPlugin?cap.registerPlugin('App'):cap?.Plugins?.App;
    if(appPlugin?.exitApp)appPlugin.exitApp();
  }catch{}
}
function setupNativeBackButton(){
  try{
    const cap=window.Capacitor;
    if(!cap||!(cap.getPlatform?.()==='android'||cap.isNativePlatform?.()))return;
    const appPlugin=cap.registerPlugin?cap.registerPlugin('App'):cap.Plugins?.App;
    appPlugin?.addListener?.('backButton',()=>navigateBackSafely());
  }catch(e){console.warn('Android back-button handler unavailable',e);}
}

// ---------- Bindings ----------
function bindEvalDynamic(){
  document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{const st=evalState();st.section=b.dataset.section;saveDb();renderEval();});
  document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>setRating(b.dataset.item,b.dataset.rating,'explicit'));
  document.querySelectorAll('[data-note]').forEach(n=>n.oninput=()=>{const st=evalState();st.notes[n.dataset.note]=n.value;saveDb();});
  document.querySelectorAll('[data-note-toggle]').forEach(b=>b.onclick=()=>{const st=evalState();st.noteOpen=st.noteOpen||{};st.noteOpen[b.dataset.noteToggle]=!st.noteOpen[b.dataset.noteToggle];saveDb();renderSection();bindEvalDynamic();setTimeout(()=>[...document.querySelectorAll('[data-note]')].find(n=>n.dataset.note===b.dataset.noteToggle)?.focus(),0);});
  document.querySelectorAll('[data-failure]').forEach(b=>b.onclick=()=>requestFailureClassification(b.dataset.failure,!!itemById(b.dataset.failure)?.critical));
  document.querySelectorAll('[data-timer]').forEach(b=>b.onclick=()=>timerAction(b.dataset.timer,b.dataset.act));
  document.querySelectorAll('[data-instant]').forEach(b=>b.onclick=()=>{const st=evalState(),d=tier().instantEvents.find(x=>x.id===b.dataset.instant);st.instants[d.id]=now();event(d.label);saveDb();renderEval();});
}
if($('activeTimers'))$('activeTimers').onclick=e=>{const b=e.target.closest('[data-active-timer-stop]');if(!b||b.disabled)return;timerAction(b.dataset.activeTimerStop,'stop');};
document.querySelectorAll('[data-home-area]').forEach(b=>b.onclick=()=>setHomeArea(b.dataset.homeArea));
$('newClassBtn').onclick=()=>newClassForm();$('importBackupBtn').onclick=()=>$('backupImportFile').click();$('backupImportFile').onchange=e=>e.target.files[0]&&restoreBackup(e.target.files[0]);
$('backHome').onclick=()=>{releaseEvalWakeLock();showHome();};$('editClassBtn').onclick=()=>newClassForm(cls());$('addStudentBtn').onclick=addStudentForm;$('importRosterBtn').onclick=()=>$('rosterFile').click();$('rosterFile').onchange=e=>e.target.files[0]&&importRoster(e.target.files[0]);$('scenarioBtn').onclick=scenarioForm;
if($('rosterSearch'))$('rosterSearch').oninput=e=>{rosterSearchTerm=e.target.value;renderClass();};document.querySelectorAll('[data-roster-filter]').forEach(b=>b.onclick=()=>{rosterFilter=b.dataset.rosterFilter;renderClass();});
$('backRoster').onclick=()=>navigateBackSafely();$('nextUnresolvedBottomBtn').onclick=nextUnresolved;$('nextUnresolvedBtn').onclick=nextUnresolved;if($('observeModeBtn'))$('observeModeBtn').onclick=()=>{const st=evalState();st.observeMode=true;st.fieldMode=true;saveDb();renderEval();};if($('reviewModeBtn'))$('reviewModeBtn').onclick=()=>{const st=evalState();st.observeMode=false;st.fieldMode=false;saveDb();renderEval();};$('showNtToggle').onchange=e=>{const st=evalState();st.showNt=e.target.checked;saveDb();renderSection();bindEvalDynamic();};
$('prevPhaseBtn').onclick=()=>{const t=tier(),st=evalState(),i=t.sections.findIndex(s=>s.code===st.section);if(i>0){st.section=t.sections[i-1].code;saveDb();renderEval();}};$('nextPhaseBtn').onclick=()=>{const t=tier(),st=evalState(),i=t.sections.findIndex(s=>s.code===st.section);if(i<t.sections.length-1){st.section=t.sections[i+1].code;saveDb();renderEval();}};
$('trainerSign').oninput=e=>{evalState().trainerSign=e.target.value;saveDb();};$('attemptEvaluatorId').oninput=e=>{evalState().evaluatorId=e.target.value;saveDb();};$('studentSign').oninput=e=>{evalState().studentSign=e.target.value;saveDb();};$('overallNotes').oninput=e=>{evalState().overallNotes=e.target.value;saveDb();};
$('finalizeBtn').onclick=reviewFinalize;$('voidAttemptBtn').onclick=voidCurrentAttempt;$('confirmFinalizeBtn').onclick=finalizeEvaluation;$('copyAar').onclick=async()=>{await navigator.clipboard.writeText($('aarText').textContent);alert('Review copied.');};$('individualPdfBtn').onclick=exportIndividualPdf;$('individualCsvBtn').onclick=exportIndividualCsv;$('attemptBackupBtn').onclick=backupAttempt;
$('classPdfBtn').onclick=exportClassPdf;$('classSummaryCsvBtn').onclick=exportClassSummaryCsv;$('classCriteriaCsvBtn').onclick=exportClassCriteriaCsv;$('classTimersCsvBtn').onclick=exportClassTimersCsv;$('classEventsCsvBtn').onclick=exportClassEventsCsv;$('classAnalyticsCsvBtn').onclick=exportClassAnalyticsCsv;$('classEnterpriseCsvBtn').onclick=exportClassEnterpriseAnalyticsCsv;$('backupClassBtn').onclick=backupClass;$('closeClassBtn').onclick=closeClass;$('deleteClassBtn').onclick=()=>{void deleteClass();};
const moreExportsBtn=$('moreExportsBtn'),moreExportsMenu=$('moreExportsMenu');
function setMoreExportsOpen(open){
  if(!moreExportsBtn||!moreExportsMenu)return;
  moreExportsMenu.classList.toggle('hidden',!open);
  moreExportsBtn.setAttribute('aria-expanded',String(open));
  moreExportsBtn.textContent=open?'More Exports ▴':'More Exports ▾';
}
if(moreExportsBtn)moreExportsBtn.onclick=()=>setMoreExportsOpen(moreExportsMenu.classList.contains('hidden'));
if(moreExportsMenu)moreExportsMenu.addEventListener('click',e=>{if(e.target.closest('button'))setMoreExportsOpen(false);});
if($('managementMajcom'))$('managementMajcom').onchange=e=>{managementFilters.majcom=e.target.value;managementFilters.installationId='';renderManagementDashboard();};if($('managementInstallation'))$('managementInstallation').onchange=e=>{managementFilters.installationId=e.target.value;renderManagementDashboard();};if($('managementTier'))$('managementTier').onchange=e=>{managementFilters.tierId=e.target.value;renderManagementDashboard();};if($('managementCourseType'))$('managementCourseType').onchange=e=>{managementFilters.courseType=e.target.value;renderManagementDashboard();};if($('managementResetBtn'))$('managementResetBtn').onclick=()=>{managementFilters={majcom:'',installationId:'',tierId:'',courseType:''};renderManagementDashboard();};if($('managementSummaryCsvBtn'))$('managementSummaryCsvBtn').onclick=exportManagementSummaryCsv;if($('enterpriseAnalyticsCsvBtn'))$('enterpriseAnalyticsCsvBtn').onclick=exportScopedEnterpriseAnalyticsCsv;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));document.querySelectorAll('.modal').forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id);});

let evalHeaderCollapsed=false;
function updateEvalHeaderCollapse(){const h=$('evalHeader');if(!h)return;const should=evalVisible()&&window.scrollY>150;if(should!==evalHeaderCollapsed){evalHeaderCollapsed=should;h.classList.toggle('collapsed',should);}}
window.addEventListener('scroll',updateEvalHeaderCollapse,{passive:true});
// Live clock renderer. Keep timer state and timer presentation separate so the
// stopwatch remains visibly active in Android WebView while a scenario is running.
let liveClockRaf=null,lastLivePaint=0;
function updateLiveClocks(force=false){
  const view=$('evalView');
  if(!view||view.classList.contains('hidden')||!evalState())return;
  try{renderKpis();}catch(e){console.warn('KPI live refresh failed',e);}
  try{renderActiveTimers();}catch(e){console.warn('Active timer live refresh failed',e);}
  document.querySelectorAll('[data-display]').forEach(el=>{
    try{
      const d=timerDef(el.dataset.display);
      if(!d)return;
      const x=currentInstance(d.id),recovery=timerNeedsRecovery(x),dur=x&&!recovery?gradingDuration(d,x):0,rs=recovery?'recovery':timerAggregateStatus(d);
      el.textContent=recovery?'--:--':fmt(dur);
      el.classList.toggle('running',!!x?.running&&!recovery);
      el.classList.toggle('paused',!!x?.paused&&!recovery);
      el.classList.toggle('bad',rs==='notmet'||recovery);
      el.classList.toggle('good',rs==='met'||rs==='live-met');
      el.setAttribute('aria-label',recovery?`${d.label}: recovery required; void and restart`:`${d.label}: ${fmt(dur)}${x?.running?' running':x?.paused?' paused':''}`);
    }catch(e){console.warn('Timer display refresh failed',e);}
  });
}
function liveClockFrame(ts){
  if(ts-lastLivePaint>=200){lastLivePaint=ts;updateLiveClocks();}
  liveClockRaf=requestAnimationFrame(liveClockFrame);
}
function startLiveClockLoop(){
  if(liveClockRaf==null&&typeof requestAnimationFrame==='function')liveClockRaf=requestAnimationFrame(liveClockFrame);
  // Fallback for WebViews that throttle/suspend animation frames unexpectedly.
  if(tick==null)tick=setInterval(()=>updateLiveClocks(),500);
}
if(document&&typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(evalVisible()&&activeTimerDefs().length)backgroundedAt=now();
    releaseEvalWakeLock();
  }else{
    updateLiveClocks(true);requestEvalWakeLock();
    if(backgroundedAt&&evalVisible()&&activeTimerDefs().length){
      const away=now()-backgroundedAt;
      if(away>=5000){
        event('App resumed during active timing',`Backgrounded ${fmt(away)}. Timer clocks continued according to their configured grading clock.`);
        alert(`The app was backgrounded for ${fmt(away)} while one or more timers were active.\n\nTimer clocks continued according to their configured grading clock. Review the active timer before finalization.`);
      }
    }
    backgroundedAt=null;
  }
});
if(window&&typeof window.addEventListener==='function')window.addEventListener('focus',()=>updateLiveClocks(true));
startLiveClockLoop();
setupNativeBackButton();
if($('appVersion'))$('appVersion').textContent=APP_VERSION;

window.addEventListener('raps-cloud-identity',()=>{
  renderHome();
  if(currentClassId&&!$('classView')?.classList.contains('hidden'))renderClass();
});

window.RAPS_CLASS_STORE = Object.freeze({
  getClasses:()=>db.classes,
  getClass:id=>db.classes.find(c=>c.id===id)||null,
  deviceId:()=>db.deviceId,
  patchCloudState:(id,patch)=>{
    const c=db.classes.find(x=>x.id===id);if(!c)return null;
    c.cloudSync={...(c.cloudSync||{}),...(patch||{})};
    localStorage.setItem(DB_KEY,JSON.stringify(db));
    renderHome();
    if(currentClassId===id&&!$('classView')?.classList.contains('hidden'))renderClass();
    return c;
  },
  patchRosterCloudState:(id,patch)=>{
    const c=db.classes.find(x=>x.id===id);if(!c)return null;
    c.cloudRosterSync={...(c.cloudRosterSync||{}),...(patch||{})};
    localStorage.setItem(DB_KEY,JSON.stringify(db));
    renderHome();
    if(currentClassId===id&&!$('classView')?.classList.contains('hidden'))renderClass();
    return c;
  },
  persistCloudMerge:()=>{
    localStorage.setItem(DB_KEY,JSON.stringify(db));
    renderHome();
    if(currentClassId&&!$('classView')?.classList.contains('hidden'))renderClass();
  },
  upsertFromCloud:(remote,options={})=>{
    if(!remote?.id)return null;
    const idx=db.classes.findIndex(c=>c.id===remote.id);
    if(idx<0){db.classes.unshift(normalizeDb({schemaVersion:5,deviceId:db.deviceId,classes:[remote]})?.classes?.[0]||remote);}
    else{
      const current=db.classes[idx];
      const students=options.preserveStudents?(current.students||[]):(remote.students||[]);
      db.classes[idx]={...current,...remote,students};
      ensureLocationFields(db.classes[idx]);
    }
    localStorage.setItem(DB_KEY,JSON.stringify(db));
    renderHome();
    return db.classes.find(c=>c.id===remote.id)||null;
  }
});

renderHome();
})();

// Web/PWA bootstrap only. Evaluator/data logic above is shared with APK v3.0.0.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .catch(e => console.warn('Service worker registration failed', e));
  });
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => false);
