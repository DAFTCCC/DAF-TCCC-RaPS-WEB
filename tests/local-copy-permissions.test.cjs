'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const classes = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');
const grading = fs.readFileSync(path.join(root, 'cloud-grading-sync.js'), 'utf8');
const permissions = fs.readFileSync(path.join(root, 'permissions.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

function functionSource(source, name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing ${name}`);
  for (let end = source.indexOf('}', start); end >= 0; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`Cannot extract ${name}`);
}

// Execute the real cache-removal/store implementation with in-memory browser
// storage and the real permission/fingerprint helpers. No server requests occur.
function fixture() {
  const alerts = [], events = [], readers = [], values = new Map();
  let promptAction = () => 'REMOVE LOCAL';
  let failKey = null;
  const window = {
    RAPS_CLOUD: {user:{id:'enterprise-1'}, connected:true, memberships:[{
      id:'membership-1', user_id:'enterprise-1', role:'enterprise_admin', active:true,
      base_id:null, majcom_id:null
    }]},
    addEventListener() {}, dispatchEvent(event) { events.push(event); }
  };
  const localStorage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { if (key === failKey) throw new Error('Synthetic quota error'); values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const document={createElement(){return {id:'',innerHTML:'',classList:{toggle(){}},setAttribute(){}};},querySelectorAll(){return [];}};
  const context = vm.createContext({window, navigator:{onLine:true}, localStorage, document,
    alert:message=>alerts.push(String(message)), prompt:(...args)=>promptAction(...args),
    confirm:()=>window.testConfirm?window.testConfirm():true,
    FileReader:class { constructor(){readers.push(this);} readAsText(file){this.file=file;} },
    CustomEvent:class { constructor(type, options) { this.type=type; this.detail=options.detail; } },
    console, Date, JSON});
  vm.runInContext(permissions, context);
  const names = ['currentCloudUserId','localRosterSignature','readLocalCopyExclusion',
    'isLocalCopyHidden','clearLocalCopyHidden','getExcludedLocalClassIds','discardExcludedCleanCopies','canAccessClass',
    'requireClassAccess','hasEnterpriseAccess','localGradingCopyConfirmed','localCopyRemovalIssue','removeLocalClassCopy',
    'classPermissionContext','currentCloudClient','hasClassCloseAccess','isClassClosed','closureIssues',
    'syncClassForAuthoritativeClose','closeClass','prepareBackupClass','unverifiedLocalClasses',
    'renderLocalRecoveryNotice','guardClassExport','scrubPrivateViews','refreshPrivateViewAccess','importRoster',
    'attemptBelongsToCurrentEvaluator','findActiveEvaluationLock','resumeActiveEvaluation','renderLearnerPracticeHistory',
    'cloudReachable','attemptAwaitingSync','refreshClosureGate',
    'idbOpen','idbDone','idbMirror','readRosterWithdrawals','classArchivableFromCache','compactCacheSnapshot','writeDbSnapshot'];
  const storeStart = app.indexOf('window.RAPS_CLASS_STORE = Object.freeze({');
  const storeEnd = app.indexOf("\n\nwindow.addEventListener('raps-evaluation-tombstoned'", storeStart);
  assert.ok(storeStart >= 0 && storeEnd > storeStart);
  vm.runInContext(`
    const DB_KEY='TCCC_SUITE_DB';
    const LOCAL_COPY_EXCLUSION_PREFIX='RAPS_CLASS_LOCAL_EXCLUDED:';
    // Real device-storage write path; no IndexedDB exists in this harness.
    const IDB_NAME='raps-local-v1',IDB_CLASSES='classes',IDB_META='meta',ROSTER_WITHDRAWAL_PREFIX='RAPS_ROSTER_WITHDRAWALS_V1:';
    const idbPendingHydration=new Set();
    let idbHandle=null,idbWriteChain=Promise.resolve(),idbUnavailable=true,idbHydrationGate=Promise.resolve(),idbQueued=null;
    const now=()=>Date.now(),deep=value=>JSON.parse(JSON.stringify(value));
    const esc=value=>String(value);
    const APP_VERSION='synthetic-test';
    const SYNC_LOCAL='local',uuid=()=>'synthetic-imported-student';
    let db={classes:[]}, currentClassId=null,currentStudentId=null,currentAttemptNo=1;
    let observationUndo=null,observationMessage=null,rosterSearchTerm='',rosterFilter='all',managementFilters={};
    const modalFocusState=new Map();let deferredModalFocus=null;
    const cls=()=>db.classes.find(c=>c.id===currentClassId);
    const student=()=>cls()?.students?.find(s=>s.id===currentStudentId);
    const readTrashOutbox=id=>JSON.parse(localStorage.getItem('RAPS_CLASS_TRASH_OUTBOX:'+id));
    const renderHome=()=>{};
    const renderClass=()=>{};
    const renderEval=()=>{};
    const showHome=()=>{currentClassId=null;};
    const releaseEvalWakeLock=()=>{};
    const closeModal=id=>{if(window.testDom?.[id])window.testDom[id].open=false;};
    const setReadOnly=value=>{window.testReadOnly=value;};
    const setHomeArea=value=>{window.testHomeArea=value;};
    const showView=value=>{window.testView=value;};
    const normalizeDb=value=>value;
    const ensureLocationFields=value=>value;
    const recoverTrashActions=()=>{};
    const ownsTrashAction=()=>true;
    const rememberTrashAction=()=>{};
    const acknowledgeTrashAction=()=>{};
    const $=id=>window.testDom?.[id]||null;
    const saveDb=()=>localStorage.setItem(DB_KEY,JSON.stringify(db));
    ${names.map(name=>functionSource(app,name)).join('\n')}
    ${functionSource(classes,'normalizeStudentGroups')}
    ${functionSource(classes,'classMetadataSnapshot')}
    ${functionSource(classes,'classMetadataSignature')}
    ${functionSource(grading,'canonical')}
    ${functionSource(grading,'localGradingSignature')}
    window.RAPS_CLASS_SYNC={classMetadataSignature};
    window.RAPS_GRADING_SYNC={localGradingSignature};
    ${app.slice(storeStart,storeEnd)}
    window.testCache={
      seed(record,other=[]){
        db={deviceId:'synthetic-device',classes:[record,...other]};
        record.cloudSync={enabled:true,status:'synced',baseMetadataSignature:classMetadataSignature(record)};
        record.cloudRosterSync={status:'synced',syncedRosterSignature:localRosterSignature(record),syncedByUserId:'enterprise-1'};
        for(const student of record.students||[])for(const attempt of Object.values(student.attempts||{})){
          attempt.cloudGrading={status:'synced',baseGradingSignature:localGradingSignature(attempt),syncedByUserId:'enterprise-1'};
        }
        localStorage.setItem(DB_KEY,JSON.stringify(db));
      },
      remove:removeLocalClassCopy, issue:localCopyRemovalIssue,
      record:()=>db.classes[0], db:()=>db,
      select:id=>{currentClassId=id;},
      selectStudent:id=>{currentStudentId=id;},
      client:currentCloudClient,close:closeClass,prepareBackup:prepareBackupClass,
      unverified:unverifiedLocalClasses,recoveryNotice:renderLocalRecoveryNotice,exportGuard:guardClassExport,
      scrub:scrubPrivateViews,lock:findActiveEvaluationLock,resume:resumeActiveEvaluation,
      refreshAccess:refreshPrivateViewAccess,belongs:attemptBelongsToCurrentEvaluator,importRoster,
      practiceHistory:renderLearnerPracticeHistory,
      uiState:()=>({currentClassId,currentStudentId,currentAttemptNo}),
      persist:()=>localStorage.setItem(DB_KEY,JSON.stringify(db))
    };
  `, context);
  const api = window.testCache;
  const course = {id:'class-1',name:'Synthetic Training',homeInstallationId:'BASE-1',tierId:'1',students:[]};
  api.seed(course);
  return {api, window, values, alerts, events, readers, localStorage,
    stored:()=>JSON.parse(localStorage.getItem('TCCC_SUITE_DB')),
    prompt(action) { promptAction=action; }, fail(key) { failKey=key; },
    addFinal() { const a={id:'evaluation-1',attemptNo:1,startedAt:10,finalizedAt:20,finalResult:'PASS',ratings:{A:'pass'}};
      const c=api.record(); c.students=[{id:'student-1',name:'Synthetic Student',rank:'',trainingId:'SYNTHETIC',attempts:{1:a}}]; api.seed(c); return a; }
  };
}

for (const state of ['open','closed','trash']) {
  test(`Enterprise removes a confirmed ${state} device copy without shared writes`, () => {
    const f=fixture(), c=f.api.record();
    if (state==='closed') { c.closedAt=20; c.status='closed'; }
    if (state==='trash') c.deletedAt=20;
    f.api.seed(c);
    f.api.remove(c.id);
    assert.equal(f.api.db().classes.length,0);
    assert.equal(f.stored().classes.length,0);
    assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),true);
    assert.equal(f.events[0].type,'raps-local-copy-removed');
    assert.equal(f.alerts.length,0);
  });
}

test('confirmed finalized grades may be evicted, and a subsequent automatic pull cannot re-add them', () => {
  const f=fixture(); f.addFinal(); const c=copy(f.api.record());
  f.api.remove(c.id);
  assert.equal(f.window.RAPS_CLASS_STORE.upsertFromCloud(c),null);
  assert.equal(f.api.db().classes.length,0);
  assert.equal(f.window.RAPS_CLASS_STORE.upsertFromCloud(c,{restoreLocalCopy:true}).id,c.id);
  assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),false);
  assert.equal(f.stored().classes.length,1);
});

test('a synced shared-trash copy verifies finalized grading before removing only this device copy', async () => {
  const f=fixture(), a=f.addFinal(), c=f.api.record();
  c.deletedAt=30;f.api.seed(c);
  a.events=[{at:20,elapsed:10,label:'Evaluation finalized',detail:'Server-authoritative PASS · 1/1'}];
  f.api.persist();
  const calls=[];
  f.window.RAPS_GRADING_SYNC.verifyEvaluationForLocalRemoval=async (course,student,attempt)=>{
    calls.push({courseId:course.id,studentId:student.id,attemptId:attempt.id});
    return {status:'synced',baseGradingSignature:f.window.RAPS_GRADING_SYNC.localGradingSignature(attempt),syncedByUserId:'enterprise-1'};
  };
  const button={textContent:'Remove Local Copy',disabled:false,isConnected:true};
  await f.api.remove(c.id,button);
  assert.deepEqual(calls,[{courseId:c.id,studentId:'student-1',attemptId:a.id}]);
  assert.equal(f.stored().classes.length,0);
  assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),true);
  assert.equal(f.alerts.length,0);
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'Remove Local Copy');
  assert.equal(f.events[0].type,'raps-local-copy-removed');
});

for(const outcome of ['different-record','network-error','account-changed','roster-changed','another-tab']){
  test(`server verification keeps local copy when ${outcome}`,async()=>{
    const f=fixture(),a=f.addFinal(),c=f.api.record();
    a.events=[{at:20,elapsed:10,label:'Evaluation finalized',detail:'Server-authoritative PASS · 1/1'}];
    f.api.persist();
    let prompts=0;f.prompt(()=>{prompts++;return 'REMOVE LOCAL';});
    f.window.RAPS_GRADING_SYNC.verifyEvaluationForLocalRemoval=async()=>{
      if(outcome==='different-record')return false;
      if(outcome==='network-error')throw new Error('Synthetic connection failure');
      const proof={status:'synced',baseGradingSignature:f.window.RAPS_GRADING_SYNC.localGradingSignature(a),syncedByUserId:'enterprise-1'};
      if(outcome==='account-changed')f.window.RAPS_CLOUD.memberships=[];
      if(outcome==='roster-changed')c.students[0].name='Unsent roster edit';
      f.api.persist();
      if(outcome==='another-tab'){
        const saved=f.stored();saved.classes[0].name='Newer class from another tab';
        f.localStorage.setItem('TCCC_SUITE_DB',JSON.stringify(saved));
      }
      return proof;
    };
    await f.api.remove(c.id);
    assert.equal(f.stored().classes.length,1);
    assert.equal(f.api.db().classes.length,1);
    assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),false);
    assert.ok(f.alerts.length);
    assert.equal(prompts,outcome==='another-tab'?1:0);
    assert.equal(f.events.length,0);
  });
}

for(const pending of ['metadata','roster','in-progress','outbox']){
  test(`local-copy verification does not bypass pending ${pending}`,async()=>{
    const f=fixture(),a=f.addFinal(),c=f.api.record();
    a.overallNotes='An unconfirmed note';
    if(pending==='metadata')c.name='Unsent metadata';
    if(pending==='roster')c.students[0].name='Unsent roster';
    if(pending==='in-progress')a.finalizedAt=null;
    if(pending==='outbox')f.localStorage.setItem('RAPS_CLASS_TRASH_OUTBOX:'+c.id,JSON.stringify({action:{kind:'delete'}}));
    f.api.persist();
    let checked=0;f.window.RAPS_GRADING_SYNC.verifyEvaluationForLocalRemoval=async()=>{checked++;return true;};
    await f.api.remove(c.id);
    assert.equal(checked,0);
    assert.equal(f.stored().classes.length,1);
    assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),false);
    assert.ok(f.alerts.length);
  });
}

for(const changedClass of ['target','unrelated']){
  test(`a ${changedClass} class saved by another tab during verification is never overwritten`,async()=>{
    const f=fixture(),a=f.addFinal(),c=f.api.record();
    a.events=[{at:20,elapsed:10,label:'Evaluation finalized',detail:'Server-authoritative PASS · 1/1'}];
    f.api.persist();
    f.window.RAPS_GRADING_SYNC.verifyEvaluationForLocalRemoval=async()=>{
      const saved=f.stored();
      if(changedClass==='target')saved.classes[0].name='Newer target from another tab';
      else saved.classes.push({id:'other-class',name:'Newer unrelated class from another tab',students:[]});
      f.localStorage.setItem('TCCC_SUITE_DB',JSON.stringify(saved));
      return {status:'synced',baseGradingSignature:f.window.RAPS_GRADING_SYNC.localGradingSignature(a),syncedByUserId:'enterprise-1'};
    };
    await f.api.remove(c.id);
    const saved=f.stored();
    assert.equal(saved.classes.length,1);
    assert.equal(saved.classes[0].name,changedClass==='target'?'Newer target from another tab':'Newer unrelated class from another tab');
    assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),changedClass!=='target');
    assert.equal(f.alerts.length,changedClass==='target'?1:0);
  });
}

test('canceling removal does not save or reuse an ephemeral grading receipt',async()=>{
  const f=fixture(),a=f.addFinal(),c=f.api.record();
  a.events=[{at:20,elapsed:10,label:'Evaluation finalized',detail:'Server-authoritative PASS · 1/1'}];
  f.api.persist();
  const before=copy(f.api.db()),storedBefore=f.localStorage.getItem('TCCC_SUITE_DB');
  let checked=0;
  f.window.RAPS_GRADING_SYNC.verifyEvaluationForLocalRemoval=async()=>{
    checked++;
    return checked===1?{status:'synced',baseGradingSignature:f.window.RAPS_GRADING_SYNC.localGradingSignature(a),syncedByUserId:'enterprise-1'}:false;
  };
  f.prompt(()=>null);
  await f.api.remove(c.id);
  assert.deepEqual(copy(f.api.db()),before);
  assert.equal(f.localStorage.getItem('TCCC_SUITE_DB'),storedBefore);
  f.prompt(()=>'REMOVE LOCAL');
  await f.api.remove(c.id);
  assert.equal(checked,2);
  assert.equal(f.stored().classes.length,1);
  assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),false);
});

for (const state of ['metadata','roster','grades','outbox','in-progress','unpublished','other-account-baseline']) {
  test(`cache removal preserves ${state} work`, () => {
    const f=fixture();
    if (state==='grades'||state==='in-progress') f.addFinal();
    const c=f.api.record();
    if (state==='metadata') c.name='Unsent class change';
    if (state==='roster') c.students.push({id:'unsent',name:'Local-only student',attempts:{}});
    if (state==='grades') c.students[0].attempts[1].ratings.A='fail';
    if (state==='outbox') f.localStorage.setItem('RAPS_CLASS_TRASH_OUTBOX:'+c.id,JSON.stringify({action:{kind:'delete'}}));
    if (state==='in-progress') c.students[0].attempts[1].finalizedAt=null;
    if (state==='unpublished') c.cloudSync.enabled=false;
    if (state==='other-account-baseline') c.cloudRosterSync.syncedByUserId='different-account';
    f.api.persist();
    f.api.remove(c.id);
    assert.equal(f.api.db().classes.length,1);
    assert.equal(f.stored().classes.length,1);
    assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden(c.id),false);
    assert.ok(f.alerts.length);
  });
}

for (const condition of ['role-only','inactive','expired','offline','role-changed-during-confirmation']) {
  test(`cache removal rejects ${condition} Enterprise authorization`, () => {
    const f=fixture();
    if (condition==='role-only') { f.window.RAPS_CLOUD.role='enterprise_admin'; f.window.RAPS_CLOUD.memberships=[]; }
    if (condition==='inactive') f.window.RAPS_CLOUD.memberships[0].active=false;
    if (condition==='expired') f.window.RAPS_CLOUD.memberships[0].ends_at='2020-01-01T00:00:00Z';
    if (condition==='offline') { f.window.RAPS_CLOUD.connected=false; f.window.RAPS_CLOUD.offlineCached=true; }
    if (condition==='role-changed-during-confirmation') f.prompt(()=>{f.window.RAPS_CLOUD.memberships=[];return 'REMOVE LOCAL';});
    f.api.remove('class-1');
    assert.equal(f.stored().classes.length,1);
    assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden('class-1'),false);
  });
}

test('another tab target change stops removal without overwriting its work', () => {
  const f=fixture(), saved=f.stored();
  saved.classes[0].name='Newer edit from another tab';
  f.localStorage.setItem('TCCC_SUITE_DB',JSON.stringify(saved));
  f.api.remove('class-1');
  assert.equal(f.stored().classes[0].name,'Newer edit from another tab');
  assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden('class-1'),false);
  assert.match(f.alerts[0],/another tab/);
});

test('removing one cache entry preserves other classes newly saved by another tab', () => {
  const f=fixture(), saved=f.stored();
  saved.classes.push({id:'other-class',name:'Keep the latest other class',students:[]});
  f.localStorage.setItem('TCCC_SUITE_DB',JSON.stringify(saved));
  f.api.remove('class-1');
  assert.deepEqual(f.stored().classes,[{id:'other-class',name:'Keep the latest other class',students:[]}]);
});

for (const key of ['TCCC_SUITE_DB','RAPS_CLASS_LOCAL_EXCLUDED:class-1']) {
  test(`storage failure at ${key} keeps the local copy and its removal marker consistent`, () => {
    const f=fixture(); f.fail(key); f.api.remove('class-1');
    assert.equal(f.api.db().classes.length,1);
    assert.equal(f.stored().classes.length,1);
    assert.equal(f.window.RAPS_CLASS_STORE.isLocalCopyHidden('class-1'),false);
  });
}

test('removal markers contain only identifiers and a timestamp, with no roster or grades', () => {
  const f=fixture(); f.addFinal(); f.api.remove('class-1');
  const marker=JSON.parse(f.localStorage.getItem('RAPS_CLASS_LOCAL_EXCLUDED:class-1'));
  assert.deepEqual(Object.keys(marker).sort(),['classId','removedAt','userId']);
});

test('backup restoration retains the original class, participant, attempt identifiers, name, and owner', () => {
  const f=fixture();
  const backup={id:'original-class',name:'Original Name',homeInstallationId:'BASE-1',
    cloudSync:{createdBy:'original-owner'},cloudScope:{baseId:'untrusted-file-scope'},
    cloudAccess:{userId:'enterprise-1',assignedEvaluator:true},
    students:[{id:'original-student',classId:'original-class',name:'Synthetic Student',attempts:{1:{
      id:'original-attempt',classId:'original-class',participantId:'original-student',
      startedAt:10,finalizedAt:20,ratings:{A:'pass'},cloudGrading:{baseGradingSignature:'untrusted-certification'}
    }}}]};
  const restored=f.api.prepareBackup(backup);
  assert.equal(restored.id,backup.id);
  assert.equal(restored.name,backup.name);
  assert.equal(restored.cloudSync.createdBy,'original-owner');
  assert.equal(restored.localCreatedByUserId,undefined);
  assert.equal(restored.students[0].id,'original-student');
  assert.equal(restored.students[0].attempts[1].id,'original-attempt');
  assert.equal(restored.students[0].attempts[1].participantId,'original-student');
  assert.equal(restored.cloudAccess,undefined);
  assert.equal(restored.cloudScope,undefined);
  assert.equal(restored.students[0].attempts[1].cloudGrading.baseGradingSignature,'');
  assert.equal(backup.cloudScope.baseId,'untrusted-file-scope');
});

test('a backup cannot overwrite an existing local class or invent an original identifier', () => {
  const f=fixture();
  assert.throws(()=>f.api.prepareBackup(copy(f.api.record())),/already has a local copy/);
  assert.throws(()=>f.api.prepareBackup({name:'Missing ID',students:[]}),/original class identifier/);
  assert.equal(f.stored().classes.length,1);
});

test('a backup assignment claim does not grant evaluator access or adopt an unknown owner', () => {
  const f=fixture();
  f.window.RAPS_CLOUD={user:{id:'evaluator-1'},connected:true,memberships:[{
    user_id:'evaluator-1',role:'evaluator',active:true,base_id:'base-1',majcom_id:null,
    bases:{id:'base-1',code:'BASE-1',active:true}
  }]};
  assert.throws(()=>f.api.prepareBackup({id:'other-class',homeInstallationId:'BASE-1',students:[],
    cloudSync:{createdBy:'another-evaluator'},cloudAccess:{userId:'evaluator-1',assignedEvaluator:true}}),/cannot verify access/);
  assert.throws(()=>f.api.prepareBackup({id:'legacy-class',homeInstallationId:'BASE-1',students:[]}),/cannot verify access/);
});

test('legacy unassigned local records remain stored and receive a count-only recovery notice', () => {
  const f=fixture();
  const nodes={};
  for(const id of ['classList','manageClassList'])nodes[id]={before(node){nodes[node.id]=node;}};
  f.window.testDom=nodes;
  f.api.record().name='Private class name must not appear in the notice';
  f.api.recoveryNotice();
  assert.equal(f.api.unverified().length,1);
  assert.equal(f.api.db().classes.length,1);
  assert.match(nodes.localOwnershipRecoveryNotice.innerHTML,/1 local class needs ownership verification/);
  assert.doesNotMatch(nodes.localOwnershipRecoveryNotice.innerHTML,/Private class name/);
  assert.match(nodes.localOwnershipRecoveryNotice.innerHTML,/Export Recovery Backup/);
  assert.equal(f.api.record().localCreatedByUserId,undefined);
});

test('export callbacks reject revoked membership even when an old class remains selected', () => {
  const f=fixture();f.api.select('class-1');
  let exports=0;const callback=f.api.exportGuard(()=>{exports++;});
  callback();assert.equal(exports,1);
  f.window.RAPS_CLOUD.memberships[0].active=false;
  callback();assert.equal(exports,1);
});

function deferred() {
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

function bindClient(f,{reply=deferred(),started=deferred()}={}) {
  const requests=[];
  f.window.RAPS_CLOUD.client={
    auth:{getSession:async()=>({data:{session:{user:{id:'enterprise-1'},access_token:'synthetic-account-bound-token'}}})},
    rpc(name,args){
      const query={headers:{},then(resolve,reject){requests.push({name,args,headers:copy(query.headers)});started.resolve();return reply.promise.then(resolve,reject);}};
      return query;
    }
  };
  return {requests,reply,started};
}

test('class RPC requests pin the verified account token and reject a stale response after account switch', async () => {
  const f=fixture();f.api.select('class-1');
  const fake=bindClient(f), client=f.api.client();
  let applied=false;
  const request=Promise.resolve(client.rpc('close_class_authoritatively',{p_class_id:'class-1'})).then(()=>{applied=true;});
  await fake.started.promise;
  assert.equal(fake.requests[0].headers.Authorization,'Bearer synthetic-account-bound-token');
  f.window.RAPS_CLOUD={user:{id:'other-account'},connected:true,memberships:[]};
  fake.reply.resolve({data:{closed:true},error:null});
  await assert.rejects(request,/session or class permissions changed/i);
  assert.equal(applied,false);
});

test('class RPC rejects capability loss before dispatch and unsupported RPC names', async () => {
  const f=fixture();f.api.select('class-1');const fake=bindClient(f),client=f.api.client();
  assert.throws(()=>client.rpc('unapproved_mutation',{}),/not available/);
  f.window.RAPS_CLOUD.memberships[0].active=false;
  assert.throws(()=>client.rpc('close_class_authoritatively',{p_class_id:'class-1'}),/permissions changed/);
  assert.equal(fake.requests.length,0);
});

test('changing accounts during closure preparation prevents the consequential close RPC', async () => {
  const f=fixture();f.addFinal();f.api.select('class-1');f.prompt(()=> 'CLOSE');
  const fake=bindClient(f),gate=deferred(),started=deferred();
  f.window.RAPS_CLASS_SYNC.pushClass=async()=>{started.resolve();await gate.promise;return true;};
  f.window.RAPS_ROSTER_SYNC={pushClassRosterAndShells:async()=>true};
  f.window.RAPS_GRADING_SYNC.pushEvaluation=async()=>true;
  const closing=f.api.close();await started.promise;
  f.window.RAPS_CLOUD={user:{id:'another-account'},connected:true,memberships:[]};
  gate.resolve();await closing;
  assert.equal(fake.requests.length,0);
  assert.equal(f.api.record().closedAt,undefined);
  assert.equal(f.alerts.length,0);
});

test('auth-view scrubbing clears private learner DOM and dialogs while preserving unsent records', () => {
  const f=fixture();f.addFinal();f.api.select('class-1');
  const nodes={};
  for(const id of ['classTitle','studentLabel','rosterList','classMeta','aarText','formModalTitle','formModalBody','trainerSign','studentSign','overallNotes'])nodes[id]={textContent:'Private learner evidence',value:'Private learner evidence'};
  nodes.formModal={open:true};nodes.reportModal={open:true};
  nodes.activeEvaluationLockBanner={textContent:'Private learner evidence',classList:{add(){}}};
  f.window.testDom=nodes;
  const saved=JSON.stringify(f.stored());
  f.api.scrub();
  for(const id of ['classTitle','studentLabel','rosterList','classMeta','aarText','formModalTitle','formModalBody'])assert.equal(nodes[id].textContent,'');
  for(const id of ['trainerSign','studentSign','overallNotes'])assert.equal(nodes[id].value,'');
  assert.equal(nodes.formModal.open,false);assert.equal(nodes.reportModal.open,false);
  assert.equal(f.api.uiState().currentClassId,null);
  assert.equal(f.window.testView,'homeView');assert.equal(f.window.testReadOnly,true);
  assert.equal(JSON.stringify(f.stored()),saved);
});

test('a stale evaluator lock outside the current membership scope does not leak a student banner or resume it', () => {
  const f=fixture(),a=f.addFinal(),c=f.api.record();
  a.finalizedAt=null;a.cloudEvaluatorUserId='evaluator-1';
  c.cloudScope={baseId:'unassigned-base'};c.cloudSync.createdBy='evaluator-1';
  f.window.RAPS_CLOUD={user:{id:'evaluator-1'},connected:true,memberships:[{
    user_id:'evaluator-1',role:'evaluator',active:true,base_id:'assigned-base',majcom_id:null,
    bases:{id:'assigned-base',code:'ASSIGNED',active:true}
  }]};
  assert.equal(f.api.lock(),null);
  assert.equal(f.api.resume({classId:c.id,studentId:c.students[0].id,attemptNo:1}),false);
  assert.equal(f.api.uiState().currentClassId,null);
});

test('a shared device does not establish ownership of an unstamped legacy assessment', () => {
  const f=fixture(),a=f.addFinal();
  a.finalizedAt=null;a.startedByDeviceId='synthetic-device';a.deviceId='synthetic-device';
  assert.equal(f.api.belongs(a),false);
  assert.equal(f.api.lock(),null);
  a.startedByUserId='enterprise-1';
  assert.equal(f.api.belongs(a),true);
  a.cloudEvaluatorUserId='another-evaluator';
  assert.equal(f.api.belongs(a),false);
});

test('revoking a cross-base evaluator assignment immediately scrubs its open class without removing retained work', () => {
  const f=fixture(),a=f.addFinal(),c=f.api.record();
  a.finalizedAt=null;a.cloudEvaluatorUserId='evaluator-1';
  c.cloudScope={baseId:'other-base'};c.cloudSync.createdBy='another-evaluator';
  c.cloudAccess={userId:'evaluator-1',assignedEvaluator:true};
  f.window.RAPS_CLOUD={user:{id:'evaluator-1'},connected:true,memberships:[{
    user_id:'evaluator-1',role:'evaluator',active:true,base_id:'assigned-base',majcom_id:null,
    bases:{id:'assigned-base',code:'ASSIGNED',active:true}
  }]};
  f.api.select(c.id);f.api.persist();
  f.window.testDom={studentLabel:{textContent:'Private learner'},rosterList:{textContent:'Private roster'}};
  const saved=JSON.stringify(f.stored());
  c.cloudAccess={userId:'evaluator-1',assignedEvaluator:false};
  f.api.refreshAccess();
  assert.equal(f.api.uiState().currentClassId,null);
  assert.equal(f.window.testDom.studentLabel.textContent,'');
  assert.equal(f.window.testDom.rosterList.textContent,'');
  assert.equal(f.api.db().classes.length,1);
  assert.equal(JSON.stringify(f.stored()),saved);
});

for(const phase of ['file-read','confirmation']){
  test(`roster import rejects an account change during ${phase}`, () => {
    const f=fixture();f.api.select('class-1');
    const switchAccount=()=>{f.window.RAPS_CLOUD={user:{id:'enterprise-2'},connected:true,memberships:[{
      user_id:'enterprise-2',role:'enterprise_admin',active:true,base_id:null,majcom_id:null
    }]};};
    f.api.importRoster({name:'synthetic.csv'});
    assert.equal(f.readers.length,1);
    if(phase==='file-read')switchAccount();
    else f.window.testConfirm=()=>{switchAccount();return true;};
    f.readers[0].result='name,rank,training_id\nSynthetic Learner,SSgt,TEST-1';
    f.readers[0].onload();
    assert.equal(f.api.record().students.length,0);
    assert.equal(f.stored().classes[0].students.length,0);
  });
}

test('a verified SDK session for another account cannot dispatch a class RPC', async () => {
  const f=fixture();f.api.select('class-1');const fake=bindClient(f);
  f.window.RAPS_CLOUD.client.auth.getSession=async()=>({data:{session:{
    user:{id:'different-auth-user'},access_token:'different-synthetic-token'
  }}});
  const client=f.api.client();
  await assert.rejects(Promise.resolve(client.rpc('close_class_authoritatively',{p_class_id:'class-1'})),/sign-in session changed or expired/i);
  assert.equal(fake.requests.length,0);
});

for(const matchingKey of ['training-id','student-id']){
  test(`practice history excludes forbidden cached classes with a matching ${matchingKey} after account switch`, () => {
    const f=fixture(),a=f.addFinal(),own=f.api.record();
    own.name='Authorized Class';own.cloudScope={baseId:'own-base'};own.cloudSync.createdBy='evaluator-1';
    own.contentVersion='Authorized Curriculum';
    a.failureDetails={A:{practicePlan:'Authorized practice plan',reassessmentOutcome:'authorized-outcome'}};
    if(matchingKey==='student-id')own.students[0].trainingId='';
    const foreign=copy(own);foreign.id='foreign-class';foreign.name='Private foreign class';
    foreign.cloudScope={baseId:'foreign-base'};foreign.contentVersion='Private foreign curriculum';
    foreign.students[0].attempts[1].failureDetails={A:{practicePlan:'Private foreign coaching',reassessmentOutcome:'private-foreign-outcome'}};
    f.api.db().classes.push(foreign);f.api.select(own.id);f.api.selectStudent(own.students[0].id);
    let hidden=true;
    const host={innerHTML:'',classList:{add(){hidden=true;},remove(){hidden=false;}}};
    f.window.testDom={learnerPracticeHistory:host};
    f.api.practiceHistory();assert.match(host.innerHTML,/Private foreign coaching/);
    f.window.RAPS_CLOUD={user:{id:'evaluator-1'},connected:true,memberships:[{
      user_id:'evaluator-1',role:'evaluator',active:true,base_id:'own-base',majcom_id:null,
      bases:{id:'own-base',code:'OWN',active:true}
    }]};
    const retained=JSON.stringify(f.api.db());
    f.api.practiceHistory();
    assert.equal(hidden,false);
    assert.match(host.innerHTML,/1 plans/);assert.match(host.innerHTML,/Authorized practice plan/);
    assert.doesNotMatch(host.innerHTML,/Private foreign|private-foreign-outcome/);
    assert.equal(JSON.stringify(f.api.db()),retained);
    f.window.RAPS_CLOUD.memberships[0].active=false;
    f.api.practiceHistory();assert.equal(host.innerHTML,'');assert.equal(hidden,true);
    assert.equal(JSON.stringify(f.api.db()),retained);
  });
}
