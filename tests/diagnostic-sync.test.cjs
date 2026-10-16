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
  function from(table) {
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
          const rows = tables[table] || (tables[table] = []);
          let selected = rows.filter(row => filters.every(match => match(row)));
          if (action !== 'select') writes.push({ table, action, payload: payload === undefined ? undefined : copy(payload) });
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
          return { data: copy(shape === 'one' ? selected[0] || null : selected), error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  }
  return { from, writes };
}

function setup({ evaluation = {}, criterionRows = [], participants = [] } = {}) {
  const tier = { source: 'JTS-standard', sections: [{ code: 'M', items: [{ id: 'M1', critical: true }, { id: 'M2' }] }], timers: [] };
  const attempt = { id: 'eval-1', attemptNo: 1, startedAt: instant, modifiedAt: instant + 2000,
    ratings: {}, failureDetails: {}, observations: {}, notes: {}, timers: {}, cloudGrading: { remoteModifiedAt: instant } };
  const student = { id: 'student-1', name: 'Test learner', attempts: { 1: attempt } };
  const course = { id: 'class-1', tierId: '1', tierSnapshot: tier, contentVersion: 'standard',
    students: [student], cloudSync: { enabled: true } };
  const tables = {
    classes: [{ id: course.id, status: 'active' }],
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
    persistCloudMerge: () => { persists++; }, patchRosterCloudState() {} };
  const window = { RAPS_SUPABASE: client, RAPS_CLOUD: { user: { id: 'evaluator-1' } },
    RAPS_CLASS_STORE: store, TCCC_TIERS: { 1: tier }, addEventListener() {}, dispatchEvent() {}, setTimeout() {} };
  const context = vm.createContext({ window, document: { readyState: 'loading', addEventListener() {} },
    navigator: { onLine: true }, console, CustomEvent: class {}, setTimeout() {}, clearTimeout() {} });
  const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  load('cloud-grading-sync.js');
  return { attempt, student, course, tables, client, window, load, get persists() { return persists; },
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
  assert.equal(await fixture.push(), true);
  assert.equal(fixture.client.writes.length, 0);
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
  assert.equal(await fixture.window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(fixture.course), true);
  assert.equal(fixture.client.writes.length, 0);
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
