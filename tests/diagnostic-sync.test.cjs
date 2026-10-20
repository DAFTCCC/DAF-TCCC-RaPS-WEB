'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const instant = 1700000000000;
const iso = value => new Date(value).toISOString();

// This fake implements the query surface used by the browser sync modules.
// All writes stay in this in-memory database; no network/auth is involved.
function fakeClient(tables) {
  const writes = [];
  const hooks = { beforeReturn:null, beforeRequest:null };
  const requests = [];
  let session = {user:{id:'evaluator-1'},access_token:'synthetic-evaluator-1'};
  function from(table, authorization = () => `Bearer ${session?.access_token || ''}`) {
    const filters = [];
    let action = 'select', payload, conflictKeys, shape = 'rows';
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => key.includes('->>')
        ? row.app_data?.[key.split('->>')[1]] === value : row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      maybeSingle() { shape = 'one'; return query; },
      single() { shape = 'one'; return query; },
      update(value) { action = 'update'; payload = value; return query; },
      insert(value) { action = 'insert'; payload = value; return query; },
      upsert(value, options) { action = 'upsert'; payload = value; conflictKeys = options.onConflict.split(','); return query; },
      delete() { action = 'delete'; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if(hooks.beforeRequest)hooks.beforeRequest({table,action});
          const request = {table,action,authorization:authorization()};
          requests.push(request);
          const rows = tables[table] || (tables[table] = []);
          let selected = rows.filter(row => filters.every(match => match(row)));
          if (action !== 'select') writes.push({ ...request, payload: payload === undefined ? undefined : copy(payload) });
          if (action === 'update') selected.forEach(row => Object.assign(row, copy(payload)));
          if (action === 'delete') tables[table] = rows.filter(row => !selected.includes(row));
          if (action === 'upsert' || action === 'insert') {
            selected = [];
            for (const value of Array.isArray(payload) ? payload : [payload]) {
              const old = action === 'upsert' && rows.find(row => conflictKeys.every(key => row[key] === value[key]));
              if (old) { Object.assign(old, copy(value)); selected.push(old); }
              else { const row = { id: `fake-${table}-${rows.length}`, ...copy(value) }; rows.push(row); selected.push(row); }
            }
          }
          const response = { data: copy(shape === 'one' ? selected[0] || null : selected), error: null };
          if(hooks.beforeReturn)hooks.beforeReturn({table,action,response});
          return response;
        }).then(resolve, reject);
      }
    };
    return query;
  }
  return { from, writes, hooks, requests,
    auth:{getSession:async()=>({data:{session:copy(session)},error:null})},
    setSession(value) {session=value;},
    bound(authorization) {return {from:table=>from(table,()=>authorization)};}
  };
}

function setup({ evaluation = {}, criterionRows = [], participants = [] } = {}) {
  const tier = { source: 'JTS-standard', sections: [{ code: 'M', items: [{ id: 'M1', critical: true }, { id: 'M2' }] }], timers: [] };
  const attempt = { id: 'eval-1', attemptNo: 1, startedAt: instant, modifiedAt: instant + 2000,
    ratings: {}, failureDetails: {}, observations: {}, notes: {}, timers: {}, cloudGrading: { remoteModifiedAt: instant } };
  const student = { id: 'student-1', name: 'Test learner', attempts: { 1: attempt } };
  const course = { id: 'class-1', tierId: '1', tierSnapshot: tier, contentVersion: 'standard',
    students: [student], homeInstallationId:'TEST', cloudScope:{baseId:'base-1',baseCode:'TEST',majcomId:'majcom-1'}, cloudSync: { enabled: true,createdBy:'evaluator-1' } };
  const tables = {
    bases:[{id:'base-1',code:'TEST',majcom_id:'majcom-1',active:true}],
    classes: [{ id: course.id, status: 'active',created_by:'evaluator-1', base_id:'base-1', bases:{id:'base-1',code:'TEST',majcom_id:'majcom-1'} }],
    curriculum_versions: [{ id: 'curriculum-1', course_type: 'ASM', version: tier.source, published: true }],
    criteria: [{ id: 'criterion-1', criterion_code: 'M1', curriculum_version_id: 'curriculum-1', active: true },
      { id: 'criterion-2', criterion_code: 'M2', curriculum_version_id: 'curriculum-1', active: true }],
    evaluations: [{ id: attempt.id, event_id: course.id, participant_id: student.id, attempt_number: 1,
      evaluator_id: 'evaluator-1', status: 'in_progress', curriculum_version_id: 'curriculum-1',
      started_at: iso(instant), client_modified_at: iso(instant), source_device_id: 'this-device',
      app_data: {}, ...copy(evaluation) }],
    criterion_results: copy(criterionRows), timer_results: [],
    evaluation_events: [{ id: course.id, class_id: course.id }], participants: copy(participants)
  };
  const client = fakeClient(tables);
  let persists = 0;
  const store = { deviceId: () => 'this-device', getClasses: () => [course], getClass: id => id === course.id ? course : null,
    persistCloudMerge: () => { persists++; },
    localRosterSignature:c=>JSON.stringify((c.students||[]).map(s=>({id:s.id,name:s.name||'',rank:s.rank||'',trainingId:s.trainingId||''})).sort((a,b)=>a.id.localeCompare(b.id))),
    patchRosterCloudState(id,patch) { course.cloudRosterSync={...course.cloudRosterSync,...patch}; } };
  const listeners=new Map();
  const clientSettings=[];
  const window = { RAPS_SUPABASE: client,
    RAPS_CLOUD_CONFIG:{projectUrl:'https://supabase.example.test',publishableKey:'synthetic-anon'},
    supabase:{createClient(_url,_key,settings){clientSettings.push(settings);return client.bound(settings.global.headers.Authorization);}}, RAPS_CLOUD: { user: { id: 'evaluator-1' }, connected:true, memberships:[{id:'member-1',user_id:'evaluator-1',role:'enterprise_admin',active:true,base_id:null,majcom_id:null}] },
    RAPS_CLASS_STORE: store, TCCC_TIERS: { 1: tier }, addEventListener(type,callback) { if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback); }, dispatchEvent(event) { for(const callback of listeners.get(event.type)||[])callback(event); }, setTimeout() {} };
  const context = vm.createContext({ window, document: { readyState: 'loading', addEventListener() {} },
    navigator: { onLine: true }, console, CustomEvent: class { constructor(type,options={}){this.type=type;this.detail=options.detail;} }, setTimeout() {}, clearTimeout() {} });
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  load('permissions.js');
  load('cloud-grading-sync.js');
  return { attempt, student, course, tables, client, clientSettings, window, load, get persists() { return persists; },
    push: () => window.RAPS_GRADING_SYNC.pushEvaluation(course, student, attempt, { skipRosterSync: true }),
    pull: () => window.RAPS_GRADING_SYNC.pullEvaluation(course, student, attempt, { force: true }) };
}

test('marker-only observations round-trip without creating an official grade or denominator', async () => {
  const fixture = setup({ evaluation: { app_data: { futureFlag: { source: 'server' }, observations: {
    M1: { vendorMetadata: { device: 'test' }, tags: ['prompted'], reviewNeeded: true }
  } } } });
  fixture.attempt.observations = { M1: { tags: ['not-observed'], reviewNeeded: false, observedAt: instant, recordedAt: instant + 500 } };
  assert.equal(await fixture.push(), true);
  const row = fixture.tables.evaluations[0];
  assert.equal(fixture.tables.criterion_results.length, 0);
  assert.equal(row.score_numerator, 0);
  assert.equal(row.score_denominator, 0);
  assert.equal(row.overall_result, null);
  assert.deepEqual(row.app_data.observations.M1.tags, ['not-observed']);
  assert.equal(row.app_data.observations.M1.reviewNeeded, false);
  assert.deepEqual(row.app_data.observations.M1.vendorMetadata, { device: 'test' });
  assert.deepEqual(row.app_data.futureFlag, { source: 'server' });
  fixture.attempt.observations = {};
  await fixture.pull();
  assert.deepEqual(copy(fixture.attempt.observations), row.app_data.observations);
  assert.deepEqual(copy(fixture.attempt.ratings), {});
});

test('rich failure coaching and unknown JSONB metadata survive push, pull, and a later save', async () => {
  const detail = { mode: 'execution', contributor: 'psychomotor', comment: 'Observed miss',
    learnerExplanation: 'Could not position equipment', confidence: 'possible', additionalContributors: ['equipment'],
    episodeId: 'episode-1', practicePlan: 'Isolated repetitions', reassessmentPlan: 'Unprompted scenario',
    reassessmentOutcome: 'not-assessed', reassessedAt: null, retentionDueAt: instant + 86400000,
    classifiedAt: instant + 1000, futureDiagnostic: { version: 1 } };
  const fixture = setup({
    evaluation: { app_data: { futureParent: ['preserve'], failureDetails: { M1: { futureParentDetail: 'keep' } } } },
    criterionRows: [{ id: 'result-1', evaluation_id: 'eval-1', criterion_id: 'criterion-1', result: 'fail',
      app_data: { futureCriterion: { enabled: true }, failureDetail: { futureCriterionDetail: 7 } } }]
  });
  fixture.attempt.ratings = { M1: 'fail' };
  fixture.attempt.failureDetails = { M1: copy(detail) };
  fixture.attempt.stamps = { M1: instant + 500 };
  await fixture.push();
  await fixture.pull();
  const restored = copy(fixture.attempt.failureDetails.M1);
  assert.deepEqual(restored, { futureCriterionDetail: 7, futureParentDetail: 'keep', ...detail });
  assert.equal(fixture.tables.criterion_results[0].failure_mode, detail.mode);
  assert.equal(fixture.tables.criterion_results[0].primary_contributor, detail.contributor);
  assert.deepEqual(copy(fixture.attempt.cloudAppData.futureParent), ['preserve']);
  fixture.attempt.failureDetails.M1.comment = 'Updated observation';
  fixture.attempt.modifiedAt += 2000;
  await fixture.push();
  const saved = fixture.tables.criterion_results[0].app_data;
  assert.deepEqual(saved.futureCriterion, { enabled: true });
  assert.equal(saved.failureDetail.learnerExplanation, detail.learnerExplanation);
  assert.equal(saved.failureDetail.futureCriterionDetail, 7);
  assert.equal(saved.failureDetail.comment, 'Updated observation');
  assert.deepEqual(fixture.tables.evaluations[0].app_data.futureParent, ['preserve']);
});

test('coaching history remains separate when an official grade changes to PASS', async () => {
  const fixture = setup({ evaluation: { app_data: { failureDetails: { M1: {
    mode: 'execution', contributor: 'psychomotor', practicePlan: 'Repeat with feedback', reassessmentOutcome: 'independent-pass'
  } } } }, criterionRows: [{ id: 'result-1', evaluation_id: 'eval-1', criterion_id: 'criterion-1', result: 'pass',
    app_data: { failureDetail: null } }] });
  await fixture.pull();
  assert.equal(fixture.attempt.ratings.M1, 'pass');
  assert.equal(fixture.attempt.failureDetails.M1.reassessmentOutcome, 'independent-pass');
  fixture.attempt.modifiedAt += 1000;
  await fixture.push();
  const row = fixture.tables.criterion_results[0];
  assert.equal(row.result, 'pass');
  assert.equal(row.failure_mode, null);
  assert.equal(row.primary_contributor, null);
  assert.equal(row.app_data.failureDetail, null);
  assert.equal(fixture.tables.evaluations[0].app_data.failureDetails.M1.practicePlan, 'Repeat with feedback');
});

test('legacy failure columns still load and absent observations do not fabricate markers', async () => {
  const fixture = setup({ criterionRows: [{ id: 'result-1', evaluation_id: 'eval-1', criterion_id: 'criterion-1',
    result: 'fail', failure_mode: 'omission', primary_contributor: 'knowledge', evaluator_note: 'Legacy note',
    graded_at: iso(instant), app_data: null }] });
  fixture.attempt.observations = { M2: { tags: ['prompted'], reviewNeeded: true } };
  await fixture.pull();
  assert.deepEqual(copy(fixture.attempt.failureDetails.M1), { mode: 'omission', contributor: 'knowledge' });
  assert.deepEqual(copy(fixture.attempt.observations), {});
  assert.equal(fixture.attempt.notes.M1, 'Legacy note');
  assert.equal(fixture.attempt.ratings.M1, 'fail');
  assert.equal(fixture.attempt.ratings.M2, undefined);
});

test('structured failure columns take precedence over stale parent classification when criterion detail is absent', async () => {
  const fixture = setup({
    evaluation: { app_data: { failureDetails: { M1: {
      mode: 'stale-mode', contributor: 'stale-contributor', comment: 'Retain the observed context',
      practicePlan: 'Retain supplemental coaching', futureDiagnostic: { preserved: true }
    } } } },
    criterionRows: [{ id: 'result-1', evaluation_id: 'eval-1', criterion_id: 'criterion-1',
      result: 'fail', failure_mode: 'omission', primary_contributor: 'knowledge', app_data: null }]
  });
  await fixture.pull();
  const detail = fixture.attempt.failureDetails.M1;
  assert.equal(detail.mode, 'omission');
  assert.equal(detail.contributor, 'knowledge');
  assert.equal(detail.comment, 'Retain the observed context');
  assert.equal(detail.practicePlan, 'Retain supplemental coaching');
  assert.deepEqual(copy(detail.futureDiagnostic), { preserved: true });
  fixture.attempt.modifiedAt += 1000;
  await fixture.push();
  assert.equal(fixture.tables.criterion_results[0].failure_mode, 'omission');
  assert.equal(fixture.tables.criterion_results[0].primary_contributor, 'knowledge');
});

test('removing a marker is authoritative and does not resurrect a remote observation', async () => {
  const fixture = setup({ evaluation: { app_data: { observations: { M1: { tags: ['prompted'], reviewNeeded: true } } } } });
  await fixture.pull();
  delete fixture.attempt.observations.M1;
  fixture.attempt.modifiedAt += 1000;
  await fixture.push();
  assert.deepEqual(fixture.tables.evaluations[0].app_data.observations, {});
  assert.equal(fixture.tables.criterion_results.length, 0);
});

test('finalized evaluations retain the existing no-direct-write lifecycle guard', async () => {
  const fixture = setup();
  fixture.attempt.finalizedAt = instant + 2000;
  fixture.attempt.observations = { M1: { tags: ['prompted'], reviewNeeded: true } };
  assert.equal(await fixture.push(), false);
  assert.equal(fixture.client.writes.length, 0);
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature, undefined, 'A terminal shortcut must not certify unsaved grades');
});

test('roster shell hydration carries marker-only observations without rating them', async () => {
  const marker = { tags: ['equipment'], reviewNeeded: true, recordedAt: instant };
  const fixture = setup({ evaluation: { app_data: { observations: { M2: marker }, futureParent: 'keep' } },
    participants: [{ id: 'student-1', display_name: 'Test learner', app_data: { classId: 'class-1' } }] });
  fixture.student.attempts = {};
  fixture.load('cloud-roster-sync.js');
  const result = await fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells();
  assert.equal(result.evaluations, 1);
  const shell = fixture.student.attempts[1];
  assert.deepEqual(copy(shell.observations), { M2: marker });
  assert.deepEqual(copy(shell.ratings), {});
  assert.equal(shell.cloudAppData.futureParent, 'keep');
  assert.equal(shell.cloudShellOnly, true);
  assert.equal(fixture.client.writes.length, 0);
});

for (const location of ['local', 'server']) {
  test(`${location} shared trash blocks direct and background grading and roster writes`, async () => {
    const fixture = setup();
    fixture.attempt.ratings = { M1: 'fail' };
    fixture.attempt.failureDetails = { M1: { mode: 'incorrect', contributor: 'knowledge', comment: 'Preserved evidence' } };
    if (location === 'local') fixture.course.deletedAt = instant + 3000;
    else fixture.tables.classes[0].status = 'archived';
    fixture.load('cloud-roster-sync.js');
    assert.equal(await fixture.push(), false);
    assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course), false);
    assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushAll(), 0);
    await fixture.window.RAPS_ROSTER_SYNC.syncAll({ silent: true });
    assert.equal(fixture.client.writes.length, 0);
    assert.equal(fixture.attempt.failureDetails.M1.comment, 'Preserved evidence');
    assert.notEqual(fixture.attempt.cloudGrading.status, 'conflict', 'Archiving must not create a grading conflict that survives restoration');
  });
}

test('a rejected class push blocks the dependent roster and grading writes', async () => {
  const fixture = setup();
  fixture.window.RAPS_CLASS_SYNC = { pushClass: async () => false };
  fixture.load('cloud-roster-sync.js');
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course), false);
  assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushEvaluation(fixture.course, fixture.student, fixture.attempt), false);
  assert.equal(fixture.client.writes.length, 0);
});

test('roster push rechecks the canonical class after synchronization replaces it with a tombstone', async () => {
  const fixture = setup();
  let canonical = fixture.course;
  fixture.window.RAPS_CLASS_STORE.getClass = id => id === canonical.id ? canonical : null;
  fixture.window.RAPS_CLASS_SYNC = { pushClass: async () => {
    canonical = { ...fixture.course, deletedAt: instant + 3000 };
    return true;
  } };
  fixture.load('cloud-roster-sync.js');
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course), false);
  assert.equal(fixture.course.deletedAt, undefined, 'The stale caller object must not mask its replacement');
  assert.equal(fixture.client.writes.length, 0);
});

test('stale direct callers cannot bypass a class tombstone already present in the store', async () => {
  const fixture = setup();
  fixture.window.RAPS_CLASS_STORE.getClass = id => id === fixture.course.id
    ? { ...fixture.course, deletedAt: instant + 3000 } : null;
  fixture.window.RAPS_CLASS_SYNC = { pushClass: async () => { throw new Error('The stale class must never be pushed'); } };
  fixture.load('cloud-roster-sync.js');
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course), false);
  assert.equal(await fixture.push(), false);
  assert.equal(fixture.client.writes.length, 0);
});

test('locally closed classes retain the pull-only roster guard without requiring another server read', async () => {
  const fixture = setup();
  fixture.course.closedAt = instant + 3000;
  fixture.window.RAPS_SUPABASE.from = () => { throw new Error('A retained local class needs no write preflight'); };
  fixture.load('cloud-roster-sync.js');
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course), false);
  assert.equal(fixture.client.writes.length, 0);
  assert.equal(fixture.course.cloudRosterSync?.syncedRosterSignature, undefined);
});

test('grading push rechecks the canonical class after roster synchronization', async () => {
  const fixture = setup();
  let canonical = fixture.course;
  fixture.window.RAPS_CLASS_STORE.getClass = id => id === canonical.id ? canonical : null;
  fixture.window.RAPS_ROSTER_SYNC = { pushClassRosterAndShells: async () => {
    canonical = { ...fixture.course, deletedAt: instant + 3000 };
    return true;
  } };
  assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushEvaluation(fixture.course, fixture.student, fixture.attempt), false);
  assert.equal(fixture.client.writes.length, 0);
});

for (const terminalStatus of ['archived', 'completed']) {
  test(`roster push rechecks a parent that becomes ${terminalStatus} during class synchronization`, async () => {
    const fixture = setup();
    fixture.window.RAPS_CLASS_SYNC = { pushClass: async () => {
      fixture.tables.classes[0].status = terminalStatus;
      return true;
    } };
    fixture.load('cloud-roster-sync.js');
    assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course), false);
    assert.equal(fixture.client.writes.length, 0);
  });

  test(`grading push rechecks a parent that becomes ${terminalStatus} during roster synchronization`, async () => {
    const fixture = setup();
    fixture.window.RAPS_ROSTER_SYNC = { pushClassRosterAndShells: async () => {
      fixture.tables.classes[0].status = terminalStatus;
      return true;
    } };
    assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushEvaluation(fixture.course, fixture.student, fixture.attempt), false);
    assert.equal(fixture.client.writes.length, 0);
  });
}

for (const state of ['missing-helper', 'offline-cache', 'inactive', 'expired', 'scope-mismatch']) {
  test(`${state} permissions block grading and roster synchronization`, async () => {
    const fixture=setup();
    fixture.load('cloud-roster-sync.js');
    if(state==='missing-helper')delete fixture.window.RAPS_PERMISSIONS;
    else if(state==='offline-cache')fixture.window.RAPS_CLOUD.offlineCached=true;
    else if(state==='inactive')fixture.window.RAPS_CLOUD.memberships[0].active=false;
    else if(state==='expired')fixture.window.RAPS_CLOUD.memberships[0].ends_at='2000-01-01T00:00:00Z';
    else fixture.window.RAPS_CLOUD.memberships=[{id:'scope-2',user_id:'evaluator-1',role:'evaluator',active:true,base_id:'other-base',majcom_id:null}];
    assert.equal(await fixture.push(),false);
    assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),false);
    assert.equal(await fixture.window.RAPS_GRADING_SYNC.pullAll(),0);
    assert.equal((await fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells()).participants,0);
    assert.equal(fixture.client.writes.length,0);
  });
}

test('Enterprise privilege cannot overwrite an evaluation owned by another evaluator', async () => {
  const fixture=setup({evaluation:{evaluator_id:'another-evaluator'}});
  fixture.attempt.ratings={M1:'fail'};
  assert.equal(await fixture.push(),false);
  assert.equal(fixture.client.writes.length,0);
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature,undefined);
});

test('actual server class scope overrides a misleading local class scope',async()=>{
  const fixture=setup();
  fixture.window.RAPS_CLOUD.memberships=[{id:'scope-1',user_id:'evaluator-1',role:'evaluator',active:true,base_id:'base-1',majcom_id:null,bases:{id:'base-1',code:'TEST'}}];
  fixture.tables.classes[0].base_id='another-base';
  fixture.tables.classes[0].bases={id:'another-base',code:'OTHER',majcom_id:'other-majcom'};
  fixture.attempt.ratings={M1:'fail'};
  assert.equal(await fixture.push(),false);
  fixture.load('cloud-roster-sync.js');
  await assert.rejects(fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),/permission/i);
  assert.equal(fixture.client.writes.length,0);
});

test('an account change while a query is pending prevents further grading writes and merges',async()=>{
  const fixture=setup();
  fixture.client.hooks.beforeReturn=({table})=>{
    if(table==='evaluations')fixture.window.RAPS_CLOUD={user:{id:'other-user'},connected:true,memberships:[{id:'m2',user_id:'other-user',active:true,role:'enterprise_admin',base_id:null,majcom_id:null}]};
  };
  await assert.rejects(fixture.push(),/Session or class permissions changed/);
  assert.equal(fixture.client.writes.length,0);
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature,undefined);
});

test('role revocation while a roster query is pending prevents local hydration',async()=>{
  const fixture=setup({participants:[{id:'new-student',display_name:'New learner',app_data:{classId:'class-1'}}]});
  fixture.load('cloud-roster-sync.js');
  fixture.client.hooks.beforeReturn=({table})=>{if(table==='participants')fixture.window.RAPS_CLOUD.memberships[0].active=false;};
  await assert.rejects(fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells(),/Session or permissions changed/);
  assert.equal(fixture.course.students.length,1);
  assert.equal(fixture.persists,0);
});

test('pulling an unchanged roster certifies its exact content but never unsaved local participant edits',async()=>{
  const fixture=setup({participants:[{id:'student-1',display_name:'Test learner',app_data:{classId:'class-1'}}]});
  fixture.load('cloud-roster-sync.js');
  await fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells();
  const signature=fixture.course.cloudRosterSync.syncedRosterSignature;
  assert.equal(signature,fixture.window.RAPS_CLASS_STORE.localRosterSignature(fixture.course));
  fixture.student.name='Unsaved name change';
  await fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells();
  assert.equal(fixture.course.cloudRosterSync.syncedRosterSignature,signature);
  assert.notEqual(signature,fixture.window.RAPS_CLASS_STORE.localRosterSignature(fixture.course));
});

test('successful grading push certifies only the content sent, preserving concurrent local edits as pending',async()=>{
  const fixture=setup();
  fixture.attempt.ratings={M1:'pass'};
  fixture.client.hooks.beforeReturn=({table,action})=>{
    if(table==='evaluations'&&action==='update')fixture.attempt.ratings.M1='fail';
  };
  assert.equal(await fixture.push(),true);
  assert.equal(fixture.tables.criterion_results[0].result,'pass');
  assert.equal(fixture.attempt.ratings.M1,'fail');
  assert.equal(fixture.attempt.cloudGrading.status,'pending');
  assert.notEqual(fixture.attempt.cloudGrading.baseGradingSignature,fixture.window.RAPS_GRADING_SYNC.localGradingSignature(fixture.attempt));
});

test('a concurrent local edit prevents a pending grading pull from overwriting it',async()=>{
  const fixture=setup({criterionRows:[{id:'cr-1',evaluation_id:'eval-1',criterion_id:'criterion-1',result:'pass'}]});
  fixture.client.hooks.beforeReturn=({table})=>{if(table==='criterion_results')fixture.attempt.ratings.M1='fail';};
  assert.equal(await fixture.pull(),false);
  assert.equal(fixture.attempt.ratings.M1,'fail');
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature,undefined);
});

test('hidden local copies cannot be rehydrated or pushed by background roster or grading sync',async()=>{
  const fixture=setup({participants:[{id:'new-student',display_name:'New learner',app_data:{classId:'class-1'}}]});
  fixture.window.RAPS_CLASS_STORE.isLocalCopyHidden=()=>true;
  fixture.load('cloud-roster-sync.js');
  assert.equal(await fixture.push(),false);
  assert.equal(await fixture.pull(),false);
  assert.equal((await fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells()).participants,0);
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),false);
  assert.equal(fixture.course.students.length,1);
  assert.equal(fixture.client.writes.length,0);
});

test('legacy finalized copies receive a verified fingerprint without rewriting terminal server records',async()=>{
  const fixture=setup({evaluation:{status:'finalized',completed_at:iso(instant+1000),overall_result:'pass',client_modified_at:iso(instant+1000)}});
  assert.equal(await fixture.pull(),true);
  delete fixture.attempt.cloudGrading.baseGradingSignature;
  assert.equal(await fixture.window.RAPS_GRADING_SYNC.pullEvaluation(fixture.course,fixture.student,fixture.attempt),true);
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature,fixture.window.RAPS_GRADING_SYNC.localGradingSignature(fixture.attempt));
  assert.equal(fixture.client.writes.length,0);
});

test('legacy finalized copies with unconfirmed edits remain protected from normal sync overwrite',async()=>{
  const fixture=setup({evaluation:{status:'finalized',completed_at:iso(instant+1000),overall_result:'pass',client_modified_at:iso(instant+1000)}});
  await fixture.pull();
  delete fixture.attempt.cloudGrading.baseGradingSignature;
  fixture.attempt.overallNotes='Unconfirmed local note';
  assert.equal(await fixture.window.RAPS_GRADING_SYNC.pullEvaluation(fixture.course,fixture.student,fixture.attempt),false);
  assert.equal(fixture.attempt.overallNotes,'Unconfirmed local note');
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature,undefined);
  assert.equal(fixture.client.writes.length,0);
});

test('an empty cloud class can verify its roster even before any evaluation event exists',async()=>{
  const fixture=setup();
  fixture.course.students=[];
  fixture.tables.evaluation_events=[];
  fixture.tables.evaluations=[];
  fixture.load('cloud-roster-sync.js');
  await fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells();
  assert.equal(fixture.course.cloudRosterSync.syncedRosterSignature,'[]');
  assert.equal(fixture.client.writes.length,0);
});

test('successful roster push verifies participant contents before certifying its fingerprint',async()=>{
  const fixture=setup();
  fixture.load('cloud-roster-sync.js');
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),true);
  assert.equal(fixture.tables.participants[0].display_name,'Test learner');
  assert.equal(fixture.course.cloudRosterSync.status,'synced');
  assert.equal(fixture.course.cloudRosterSync.syncedRosterSignature,fixture.window.RAPS_CLASS_STORE.localRosterSignature(fixture.course));
});

test('concurrent roster edits remain pending after the captured participant contents finish uploading',async()=>{
  const fixture=setup();
  fixture.load('cloud-roster-sync.js');
  fixture.client.hooks.beforeReturn=({table,action})=>{if(table==='participants'&&action==='insert')fixture.student.name='Unsaved edit during upload';};
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),true);
  assert.equal(fixture.tables.participants[0].display_name,'Test learner');
  assert.equal(fixture.student.name,'Unsaved edit during upload');
  assert.equal(fixture.course.cloudRosterSync.status,'pending');
  assert.equal(fixture.course.cloudRosterSync.syncedRosterSignature,undefined);
});

for(const role of ['evaluator','majcom_manager']){
  test(`assigned ${role} grades a claimed record without writing class events or participant metadata`,async()=>{
    const fixture=setup();
    fixture.window.RAPS_CLOUD.memberships=[role==='evaluator'
      ? {id:'assigned-role',user_id:'evaluator-1',role,active:true,base_id:'another-base',majcom_id:null,bases:{id:'another-base',code:'OTHER'}}
      : {id:'assigned-role',user_id:'evaluator-1',role,active:true,base_id:null,majcom_id:'another-command'}];
    fixture.course.cloudSync.createdBy='class-owner';
    fixture.tables.classes[0].created_by='class-owner';
    fixture.course.cloudAccess={userId:'evaluator-1',assignedEvaluator:true};
    fixture.attempt.ratings={M1:'pass'};
    fixture.window.RAPS_ROSTER_SYNC={pushClassRosterAndShells:()=>{throw new Error('An assigned grader must not manage this roster');}};
    assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushEvaluation(fixture.course,fixture.student,fixture.attempt),true);
    assert.equal(fixture.tables.criterion_results[0].result,'pass');
    assert.ok(fixture.client.writes.every(write=>['criterion_results','timer_results','evaluations'].includes(write.table)));
    assert.equal(fixture.window.RAPS_PERMISSIONS.canClass('manageRoster',fixture.course),false);
  });
}

test('MAJCOM oversight alone does not permit grading or roster administration',async()=>{
  const fixture=setup();
  fixture.window.RAPS_CLOUD.memberships=[{id:'manager-role',user_id:'evaluator-1',role:'majcom_manager',active:true,base_id:null,majcom_id:'majcom-1'}];
  fixture.load('cloud-roster-sync.js');
  assert.equal(fixture.window.RAPS_PERMISSIONS.canClass('readClass',fixture.course),true);
  assert.equal(await fixture.push(),false);
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),false);
  assert.equal(fixture.client.writes.length,0);
});

test('assignment access does not permit overwriting another evaluator claimed assessment',async()=>{
  const fixture=setup({evaluation:{evaluator_id:'other-evaluator'}});
  fixture.window.RAPS_CLOUD.memberships=[{id:'assigned-role',user_id:'evaluator-1',role:'evaluator',active:true,base_id:'another-base',majcom_id:null}];
  fixture.course.cloudSync.createdBy='class-owner';
  fixture.tables.classes[0].created_by='class-owner';
  fixture.course.cloudAccess={userId:'evaluator-1',assignedEvaluator:true};
  assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushEvaluation(fixture.course,fixture.student,fixture.attempt),false);
  assert.equal(fixture.client.writes.length,0);
});

test('the event relation supports grading and reading an evaluation whose event id differs from its class id',async()=>{
  const fixture=setup();
  fixture.tables.evaluation_events[0].id='distinct-event';
  fixture.tables.evaluations[0].event_id='distinct-event';
  fixture.attempt.ratings={M1:'pass'};
  assert.equal(await fixture.push(),true);
  assert.equal(await fixture.pull(),true);
  assert.equal(fixture.attempt.ratings.M1,'pass');
});

test('an evaluation from a different event class cannot be imported or overwritten',async()=>{
  const fixture=setup();
  fixture.tables.evaluation_events[0].class_id='different-class';
  fixture.attempt.ratings={M1:'fail'};
  assert.equal(await fixture.push(),false);
  assert.equal(await fixture.pull(),false);
  assert.equal(fixture.attempt.ratings.M1,'fail');
  assert.equal(fixture.client.writes.length,0);
});

test('authoritative server ownership overrides misleading local evaluator class ownership',async()=>{
  const fixture=setup();
  fixture.window.RAPS_CLOUD.memberships=[{id:'evaluator-role',user_id:'evaluator-1',role:'evaluator',active:true,base_id:'base-1',majcom_id:null,bases:{id:'base-1',code:'TEST'}}];
  fixture.tables.classes[0].created_by='actual-owner';
  fixture.load('cloud-roster-sync.js');
  assert.equal(await fixture.push(),false);
  await assert.rejects(fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),/permission/i);
  assert.equal(fixture.client.writes.length,0);
});

test('terminal server voids remove the exact local attempt so its obsolete grading cannot block safe cache removal',async()=>{
  const fixture=setup({evaluation:{status:'voided'}});
  fixture.attempt.overallNotes='Retired local evidence';
  assert.equal(await fixture.pull(),true);
  assert.equal(Object.keys(fixture.student.attempts).length,0);
  assert.equal(fixture.client.writes.length,0);
});

for(const operation of ['grading-push','grading-pull','roster-push','roster-pull']) {
  test(`${operation} rejects an SDK session belonging to a different account before making requests`,async()=>{
    const fixture=setup();
    fixture.load('cloud-roster-sync.js');
    fixture.client.setSession({user:{id:'other-user'},access_token:'synthetic-other-user'});
    const run=operation==='grading-push'?fixture.push:operation==='grading-pull'?fixture.pull:
      operation==='roster-push'?()=>fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course):
        ()=>fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells();
    await assert.rejects(run(),error=>error.code==='RAPS_SESSION_CHANGED');
    assert.equal(fixture.client.requests.length,0);
    assert.equal(fixture.client.writes.length,0);
    assert.equal(fixture.persists,0);
  });
}

for(const sameUser of [false,true]) {
  test(`grading requests retain the initiating JWT when the SDK adopts ${sameUser?'a replacement token':'another account'} before dispatch`,async()=>{
    const fixture=setup();
    fixture.attempt.ratings={M1:'pass'};
    let stateAtReplacement,persistsAtReplacement;
    const initialData=fixture.attempt.cloudAppData;
    fixture.client.hooks.beforeRequest=({table,action})=>{
      if(table==='evaluations'&&action==='update'){
        stateAtReplacement=copy(fixture.attempt.cloudGrading);
        persistsAtReplacement=fixture.persists;
        fixture.client.setSession({user:{id:sameUser?'evaluator-1':'other-user'},access_token:'synthetic-replaced-token'});
      }
    };
    await assert.rejects(fixture.push(),error=>error.code==='RAPS_SESSION_CHANGED');
    assert.equal(fixture.window.RAPS_CLOUD.user.id,'evaluator-1','The identity event has not arrived');
    assert.ok(fixture.client.writes.some(write=>write.table==='evaluations'));
    assert.ok(fixture.client.writes.every(write=>write.authorization==='Bearer synthetic-evaluator-1'));
    assert.deepEqual(copy(fixture.attempt.cloudGrading),stateAtReplacement);
    assert.equal(fixture.attempt.cloudAppData,initialData);
    assert.equal(fixture.persists,persistsAtReplacement);
    for(const settings of fixture.clientSettings) {
      assert.equal(settings.auth.persistSession,false);
      assert.equal(settings.auth.autoRefreshToken,false);
      assert.equal(settings.auth.detectSessionInUrl,false);
    }
  });

  test(`roster writes retain the initiating JWT when the SDK adopts ${sameUser?'a replacement token':'another account'} before dispatch`,async()=>{
    const fixture=setup();
    fixture.load('cloud-roster-sync.js');
    fixture.client.hooks.beforeRequest=({table,action})=>{
      if(table==='evaluation_events'&&action==='update')fixture.client.setSession({
        user:{id:sameUser?'evaluator-1':'other-user'},access_token:'synthetic-replaced-token'
      });
    };
    await assert.rejects(fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course),error=>error.code==='RAPS_SESSION_CHANGED');
    assert.equal(fixture.client.writes.length,1);
    assert.equal(fixture.client.writes[0].authorization,'Bearer synthetic-evaluator-1');
    assert.equal(fixture.course.cloudRosterSync,undefined);
    assert.equal(fixture.persists,0);
  });
}

test('an SDK token change during roster reads prevents participant and lifecycle hydration',async()=>{
  const fixture=setup({participants:[{id:'new-student',display_name:'Other server learner',app_data:{classId:'class-1'}}]});
  fixture.course.status='draft';
  fixture.load('cloud-roster-sync.js');
  fixture.client.hooks.beforeReturn=({table})=>{
    if(table==='participants')fixture.client.setSession({user:{id:'other-user'},access_token:'synthetic-other-user'});
  };
  await assert.rejects(fixture.window.RAPS_ROSTER_SYNC.pullRosterAndShells(),error=>error.code==='RAPS_SESSION_CHANGED');
  assert.equal(fixture.course.students.length,1);
  assert.equal(fixture.course.status,'draft');
  assert.equal(fixture.course.cloudRosterSync,undefined);
  assert.equal(fixture.persists,0);
});

test('an SDK token change during grading reads prevents local grade hydration',async()=>{
  const fixture=setup({criterionRows:[{id:'cr-1',evaluation_id:'eval-1',criterion_id:'criterion-1',result:'pass'}]});
  fixture.client.hooks.beforeReturn=({table})=>{
    if(table==='criterion_results')fixture.client.setSession({user:{id:'other-user'},access_token:'synthetic-other-user'});
  };
  await assert.rejects(fixture.pull(),error=>error.code==='RAPS_SESSION_CHANGED');
  assert.deepEqual(copy(fixture.attempt.ratings),{});
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature,undefined);
  assert.equal(fixture.persists,0);
});

test('grading rechecks its initiating JWT after a separately awaited roster operation',async()=>{
  const fixture=setup();
  fixture.window.RAPS_ROSTER_SYNC={pushClassRosterAndShells:async()=>{
    fixture.client.setSession({user:{id:'other-user'},access_token:'synthetic-other-user'});
    return true;
  }};
  await assert.rejects(fixture.window.RAPS_GRADING_SYNC.pushEvaluation(fixture.course,fixture.student,fixture.attempt),error=>error.code==='RAPS_SESSION_CHANGED');
  assert.equal(fixture.client.writes.length,0);
  assert.equal(fixture.persists,0);
});

test('batch grading aborts without storing a late error in the previous account after SDK replacement',async()=>{
  const fixture=setup();
  fixture.attempt.ratings={M1:'pass'};
  fixture.attempt.cloudGrading.status='pending';
  let stateAtReplacement,persistsAtReplacement;
  fixture.client.hooks.beforeRequest=({table,action})=>{
    if(table==='evaluations'&&action==='update'){
      stateAtReplacement=copy(fixture.attempt.cloudGrading);
      persistsAtReplacement=fixture.persists;
      fixture.client.setSession({user:{id:'other-user'},access_token:'synthetic-other-user'});
    }
  };
  assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushAll(),0);
  assert.deepEqual(copy(fixture.attempt.cloudGrading),stateAtReplacement);
  assert.equal(fixture.attempt.cloudGrading.baseGradingSignature,undefined);
  assert.equal(fixture.persists,persistsAtReplacement);
});

for(const operation of ['grading','roster']) {
  test(`${operation} rejects an expired SDK session before requesting cloud records`,async()=>{
    const fixture=setup();
    fixture.client.setSession({user:{id:'evaluator-1'},access_token:'synthetic-expired',expires_at:1});
    fixture.load('cloud-roster-sync.js');
    const run=operation==='grading'?fixture.push:()=>fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course);
    await assert.rejects(run(),error=>error.code==='RAPS_SESSION_CHANGED');
    assert.equal(fixture.client.requests.length,0);
    assert.equal(fixture.persists,0);
  });
}

test('an unavailable SDK session after a write aborts batch sync without a late local error',async()=>{
  const fixture=setup();
  fixture.attempt.ratings={M1:'pass'};
  let stateAtFailure,persistsAtFailure;
  fixture.client.hooks.beforeReturn=({table,action})=>{
    if(table==='evaluations'&&action==='update'){
      stateAtFailure=copy(fixture.attempt.cloudGrading);
      persistsAtFailure=fixture.persists;
      fixture.client.auth.getSession=async()=>{throw new Error('Synthetic SDK session unavailable');};
    }
  };
  assert.equal(await fixture.window.RAPS_GRADING_SYNC.pushAll(),0);
  assert.deepEqual(copy(fixture.attempt.cloudGrading),stateAtFailure);
  assert.equal(fixture.persists,persistsAtFailure);
});

// Real finalization uploads the editable assessment first. The RPC then writes
// terminal lifecycle fields, and the browser adds its own finalization event.
// That local record no longer has its pre-finalization upload fingerprint.
async function finalizedRemovalFixture({completionOffset=0}={}) {
  const fixture=setup();
  fixture.course.tierSnapshot.timers=[{id:'synthetic-clock',section:'M',label:'Synthetic assessment clock',
    standard:'60 seconds',mode:'max',seconds:60,gradingClock:'active'}];
  Object.assign(fixture.attempt,{
    section:'M',ratings:{M1:'pass',M2:'pass'},methods:{M1:'explicit',M2:'explicit'},
    stamps:{M1:instant+500,M2:instant+1000},ntReasons:{},
    failureDetails:{M2:{mode:'incorrect',contributor:'skill-execution',comment:'Earlier coaching retained',
      learnerExplanation:'Synthetic learner account',practicePlan:'Approved task repetition',
      reassessmentOutcome:'independent-pass',classifiedAt:instant+900}},
    observations:{M1:{tags:['independent'],reviewNeeded:false,observedAt:instant+400,recordedAt:instant+500}},
    notes:{M1:'Synthetic criterion evidence'},timerForced:{},
    timers:{'synthetic-clock':{currentIndex:0,instances:[{
      id:'synthetic-instance-1',index:1,wallStart:instant+100,wallStop:instant+1600,
      finalDurationMs:1500,result:'met',running:false,paused:false,voided:false,
      segments:[{start:instant+100,end:instant+1600,duration:1500}],runtimeId:'synthetic-runtime'}]}},
    events:[{at:instant+500,elapsed:500,label:'M1 PASS',detail:'Explicit evaluator selection'}],
    instants:{sceneSafe:instant+100},trainerSign:'Synthetic evaluator',evaluatorId:'CADRE-TEST',
    studentSign:'Synthetic learner',overallNotes:'Preserve this completed assessment and its evidence.',
    startedByUserId:'evaluator-1',startedByDeviceId:'this-device',cloudEvaluatorUserId:'evaluator-1',
    showNt:false,observeMode:true,remediation:{plan:'Synthetic follow-up'},
    appVersion:'3.4.12-web.13',contentVersion:'standard',scenarioVersion:'1'
  });
  assert.equal(await fixture.push(),true);
  const completedAt=instant+5000,row=fixture.tables.evaluations[0];
  Object.assign(row,{status:'finalized',completed_at:iso(completedAt),overall_result:'pass',
    score_numerator:2,score_denominator:2,client_modified_at:iso(completedAt)});
  row.app_data.serverFinalization={finalizedAt:completedAt,finalizedBy:'evaluator-1',
    result:'pass',scoreNumerator:2,scoreDenominator:2};
  Object.assign(fixture.attempt,{finalizedAt:completedAt+completionOffset,finalResult:'PASS',
    modifiedAt:completedAt+completionOffset});
  fixture.attempt.events.push({at:fixture.attempt.finalizedAt,
    elapsed:fixture.attempt.finalizedAt-fixture.attempt.startedAt,label:'Evaluation finalized',
    detail:'Server-authoritative PASS · 2/2'});
  fixture.tables.classes[0].status='archived';
  fixture.course.status='archived';
  fixture.verifyRemoval=()=>fixture.window.RAPS_GRADING_SYNC.verifyEvaluationForLocalRemoval(
    fixture.course,fixture.student,fixture.attempt);
  fixture.writesBeforeVerification=fixture.client.writes.length;
  return fixture;
}

for(const completionOffset of [0,250]) {
  test(`read-only cache-removal verification recognizes finalized uploaded evidence with ${completionOffset?'a local fallback':'the canonical'} completion timestamp`,async()=>{
    const fixture=await finalizedRemovalFixture({completionOffset});
    const sync=fixture.window.RAPS_GRADING_SYNC;
    assert.notEqual(fixture.attempt.cloudGrading.baseGradingSignature,sync.localGradingSignature(fixture.attempt));
    assert.equal(await sync.pullEvaluation(fixture.course,fixture.student,fixture.attempt),false,
      'Ordinary sync must still protect a modified finalized copy');
    assert.equal(await fixture.push(),false,'Archived final records must not be rewritten');
    const before=copy(fixture.attempt),serverBefore=copy(fixture.tables),persistBefore=fixture.persists;
    const receipt=await fixture.verifyRemoval();
    assert.ok(receipt);
    assert.equal(fixture.client.writes.length,fixture.writesBeforeVerification);
    assert.deepEqual(fixture.tables,serverBefore);
    assert.deepEqual(copy(fixture.attempt),before,
      'Verification returns an ephemeral receipt without modifying the assessment or stored sync state');
    assert.equal(fixture.persists,persistBefore,'A read-only proof must never write a stale database over another tab');
    assert.equal(receipt.status,'synced');
    assert.equal(receipt.syncedByUserId,'evaluator-1');
    assert.equal(receipt.remoteModifiedAt,instant+5000);
    assert.equal(receipt.baseGradingSignature,sync.localGradingSignature(fixture.attempt));
  });
}

test('cache-removal verification ignores only disposable phase and display preferences',async()=>{
  const fixture=await finalizedRemovalFixture();
  fixture.attempt.section='DOC';fixture.attempt.showNt=true;fixture.attempt.observeMode=false;
  const before=copy(fixture.attempt),persistBefore=fixture.persists;
  const receipt=await fixture.verifyRemoval();
  assert.ok(receipt);
  assert.deepEqual(copy(fixture.attempt),before);
  assert.equal(fixture.persists,persistBefore);
  assert.equal(receipt.baseGradingSignature,
    fixture.window.RAPS_GRADING_SYNC.localGradingSignature(fixture.attempt));
  assert.equal(fixture.client.writes.length,fixture.writesBeforeVerification);
});

test('legacy cache-removal verification without cloudGrading returns a receipt without creating sync metadata or persisting',async()=>{
  const fixture=await finalizedRemovalFixture();
  delete fixture.attempt.cloudGrading;
  const before=copy(fixture.attempt),persistBefore=fixture.persists;
  const receipt=await fixture.verifyRemoval();
  assert.ok(receipt);
  assert.equal(receipt.status,'synced');
  assert.equal(receipt.syncedByUserId,'evaluator-1');
  assert.equal(receipt.baseGradingSignature,fixture.window.RAPS_GRADING_SYNC.localGradingSignature(fixture.attempt));
  assert.deepEqual(copy(fixture.attempt),before);
  assert.equal(Object.hasOwn(fixture.attempt,'cloudGrading'),false);
  assert.equal(fixture.persists,persistBefore);
  assert.equal(fixture.client.writes.length,fixture.writesBeforeVerification);
});

const removalMismatches={
  'official grade':f=>{f.attempt.ratings.M1='fail';},
  'grading method':f=>{f.attempt.methods.M1='coached';},
  'grade timestamp':f=>{f.attempt.stamps.M1++;},
  'criterion note':f=>{f.attempt.notes.M1='Unsaved local evidence';},
  'overall note':f=>{f.attempt.overallNotes='Unsaved local comments';},
  'coaching history':f=>{f.attempt.failureDetails.M2.practicePlan='Unsaved local coaching';},
  'observation evidence':f=>{f.attempt.observations.M1.tags=['prompted'];},
  'timer duration':f=>{f.attempt.timers['synthetic-clock'].instances[0].finalDurationMs++;},
  'timer history':f=>{f.attempt.timers['synthetic-clock'].instances[0].segments[0].duration++;},
  'forced timer result':f=>{f.attempt.timerForced.M1=true;},
  'instant event':f=>{f.attempt.instants.sceneSafe++;},
  'earlier timeline event':f=>{f.attempt.events[0].detail='Unconfirmed observation';},
  'extra timeline event':f=>{f.attempt.events.push({at:instant+6000,elapsed:6000,label:'Unsaved note',detail:'Must not be discarded'});},
  'finalization event detail':f=>{f.attempt.events.at(-1).detail='Server-authoritative PASS · 1/2';},
  'finalization event timestamp':f=>{f.attempt.events.at(-1).at++;},
  'finalization event elapsed':f=>{f.attempt.events.at(-1).elapsed++;},
  'duplicate finalization event':f=>{f.attempt.events.push(copy(f.attempt.events.at(-1)));},
  'evaluator signoff':f=>{f.attempt.trainerSign='Unsaved evaluator name';},
  'evaluator display identifier':f=>{f.attempt.evaluatorId='DIFFERENT-CADRE';},
  'student signoff':f=>{f.attempt.studentSign='Unsaved learner acknowledgement';},
  'remediation plan':f=>{f.attempt.remediation.plan='Unconfirmed practice plan';},
  'app version':f=>{f.attempt.appVersion='different-app-version';},
  'content version':f=>{f.attempt.contentVersion='different-content-version';},
  'scenario version':f=>{f.attempt.scenarioVersion='different-scenario-version';},
  'start time':f=>{f.attempt.startedAt++;},
  'attempt number':f=>{f.attempt.attemptNo=2;},
  'local final result':f=>{f.attempt.finalResult='FAIL';},
  'server final result':f=>{f.tables.evaluations[0].overall_result='fail';},
  'server score':f=>{f.tables.evaluations[0].score_numerator=1;},
  'server active lifecycle':f=>{f.tables.evaluations[0].status='in_progress';},
  'server void lifecycle':f=>{f.tables.evaluations[0].status='voided';},
  'server missing completion':f=>{f.tables.evaluations[0].completed_at=null;},
  'server participant':f=>{f.tables.evaluations[0].participant_id='other-participant';},
  'server event class':f=>{f.tables.evaluation_events[0].class_id='other-class';},
  'server curriculum':f=>{f.tables.evaluations[0].curriculum_version_id='other-curriculum';},
  'server evaluator provenance':f=>{f.tables.evaluations[0].evaluator_id='other-evaluator';},
  'local evaluator provenance':f=>{f.attempt.startedByUserId='other-evaluator';},
  'server version metadata':f=>{f.tables.evaluations[0].app_data.contentVersion='unconfirmed-server-version';},
};
for(const [name,mutate] of Object.entries(removalMismatches)) {
  test(`cache-removal verification refuses mismatched ${name} without discarding local evidence`,async()=>{
    const fixture=await finalizedRemovalFixture();mutate(fixture);
    const before=copy(fixture.attempt),persistBefore=fixture.persists;
    assert.equal(await fixture.verifyRemoval(),false);
    assert.deepEqual(copy(fixture.attempt),before);
    assert.equal(fixture.persists,persistBefore);
    assert.equal(fixture.client.writes.length,fixture.writesBeforeVerification);
  });
}

test('cache-removal verification checks authoritative class scope for a scoped evaluator',async()=>{
  const fixture=await finalizedRemovalFixture();
  fixture.window.RAPS_CLOUD.memberships=[{id:'scope-1',user_id:'evaluator-1',role:'evaluator',active:true,
    base_id:'base-1',majcom_id:null,bases:{id:'base-1',code:'TEST',majcom_id:'majcom-1',active:true}}];
  fixture.tables.classes[0].base_id='other-base';
  fixture.tables.classes[0].bases={id:'other-base',code:'OTHER',majcom_id:'other-majcom',active:true};
  assert.equal(await fixture.verifyRemoval(),false);
  assert.equal(fixture.client.writes.length,fixture.writesBeforeVerification);
});

test('an account-bound removal receipt uses the verified current account without rebinding stored sync metadata',async()=>{
  const fixture=await finalizedRemovalFixture();
  fixture.window.RAPS_CLOUD={user:{id:'reviewer-2'},connected:true,
    memberships:[{id:'reviewer-membership',user_id:'reviewer-2',role:'enterprise_admin',active:true,base_id:null,majcom_id:null}]};
  fixture.client.setSession({user:{id:'reviewer-2'},access_token:'synthetic-reviewer-2'});
  assert.equal(fixture.attempt.cloudGrading.syncedByUserId,'evaluator-1');
  const before=copy(fixture.attempt),persistBefore=fixture.persists;
  const receipt=await fixture.verifyRemoval();
  assert.ok(receipt);
  assert.equal(receipt.syncedByUserId,'reviewer-2');
  assert.equal(receipt.baseGradingSignature,
    fixture.window.RAPS_GRADING_SYNC.localGradingSignature(fixture.attempt));
  assert.deepEqual(copy(fixture.attempt),before);
  assert.equal(fixture.attempt.cloudGrading.syncedByUserId,'evaluator-1');
  assert.equal(fixture.persists,persistBefore);
  assert.equal(fixture.client.writes.length,fixture.writesBeforeVerification);
  assert.ok(fixture.client.requests.filter(request=>request.authorization==='Bearer synthetic-reviewer-2').length);
});

for(const mutation of ['local-evidence','local-view','local-attempt-replacement','account','sdk-token']) {
  test(`in-flight ${mutation} change prevents cache-removal certification`,async()=>{
    const fixture=await finalizedRemovalFixture();
    const proof=copy(fixture.attempt.cloudGrading),persistBefore=fixture.persists;
    let changed=false;
    fixture.client.hooks.beforeReturn=({table})=>{
      if(changed||table!=='criterion_results')return;changed=true;
      if(mutation==='local-evidence')fixture.attempt.overallNotes='Unsaved concurrent local evidence';
      else if(mutation==='local-view')fixture.attempt.section='DOC';
      else if(mutation==='local-attempt-replacement')fixture.student.attempts[1]=copy(fixture.attempt);
      else if(mutation==='account')fixture.window.RAPS_CLOUD={user:{id:'other-user'},connected:true,
        memberships:[{id:'other-membership',user_id:'other-user',role:'enterprise_admin',active:true,base_id:null,majcom_id:null}]};
      else fixture.client.setSession({user:{id:'evaluator-1'},access_token:'synthetic-replaced-token'});
    };
    if(mutation.startsWith('local-'))assert.equal(await fixture.verifyRemoval(),false);
    else await assert.rejects(fixture.verifyRemoval(),/session|permissions changed/i);
    assert.equal(changed,true);
    assert.deepEqual(copy(fixture.attempt.cloudGrading),proof);
    assert.equal(fixture.persists,persistBefore);
    assert.equal(fixture.client.writes.length,fixture.writesBeforeVerification);
  });
}
