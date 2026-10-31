'use strict';

// Remove Student: per-student gating and synchronized roster withdrawal.
// Runs the real app.js gating functions and cloud-roster-sync.js against an
// in-memory fake of the Supabase query surface. No network or NUC access.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const instant = 1700000000000;
const iso = value => new Date(value).toISOString();
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function functionSource(name) {
  const start = appSource.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  for (let end = appSource.indexOf('}', start); end >= 0; end = appSource.indexOf('}', end + 1)) {
    const candidate = appSource.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error('Cannot parse ' + name);
}

function fakeClient(tables) {
  const writes = [];
  function from(table) {
    const filters = [];
    let action = 'select', payload, shape = 'rows';
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => key.includes('->>')
        ? row.app_data?.[key.split('->>')[1]] === value : row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      maybeSingle() { shape = 'one'; return query; },
      single() { shape = 'one'; return query; },
      update(value) { action = 'update'; payload = value; return query; },
      insert(value) { action = 'insert'; payload = value; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const rows = tables[table] || (tables[table] = []);
          let selected = rows.filter(row => filters.every(match => match(row)));
          if (action !== 'select') writes.push({ table, action, payload: copy(payload) });
          if (action === 'update') selected.forEach(row => Object.assign(row, copy(payload)));
          if (action === 'insert') { const row = copy(payload); rows.push(row); selected = [row]; }
          return { data: copy(shape === 'one' ? selected[0] || null : selected), error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  }
  const session = { user: { id: 'manager-1' }, access_token: 'synthetic-manager-1' };
  return { from, writes,
    auth: { getSession: async () => ({ data: { session: copy(session) }, error: null }) } };
}

function setup({ students, participants = [], evaluations = [], withdrawals = [] }) {
  const tier = { source: 'JTS-standard', sections: [{ code: 'M', items: [{ id: 'M1' }] }], timers: [] };
  const course = { id: 'class-1', name: 'Synthetic class', tierId: '1', tierSnapshot: tier, students,
    homeInstallationId: 'TEST', cloudScope: { baseId: 'base-1', baseCode: 'TEST', majcomId: 'majcom-1' },
    cloudSync: { enabled: true, createdBy: 'manager-1' } };
  const tables = {
    bases: [{ id: 'base-1', code: 'TEST', majcom_id: 'majcom-1', active: true }],
    classes: [{ id: course.id, status: 'draft', created_by: 'manager-1', base_id: 'base-1',
      bases: { id: 'base-1', code: 'TEST', majcom_id: 'majcom-1' } }],
    curriculum_versions: [{ id: 'curriculum-1', course_type: 'ASM', version: tier.source, published: true }],
    evaluation_events: [{ id: course.id, class_id: course.id }],
    participants: copy(participants), evaluations: copy(evaluations)
  };
  const client = fakeClient(tables);
  let outbox = copy(withdrawals);
  const resolutions = [];
  const store = {
    deviceId: () => 'device-a', getClasses: () => [course], getClass: id => id === course.id ? course : null,
    persistCloudMerge() {},
    localRosterSignature: c => JSON.stringify((c.students || []).map(s => ({ id: s.id, name: s.name || '',
      rank: s.rank || '', trainingId: s.trainingId || '' })).sort((a, b) => a.id.localeCompare(b.id))),
    patchRosterCloudState(id, patch) { course.cloudRosterSync = { ...course.cloudRosterSync, ...patch }; },
    getRosterWithdrawals: classId => classId === course.id ? copy(outbox) : [],
    resolveRosterWithdrawal(classId, studentId, outcome) {
      resolutions.push({ classId, studentId, ...outcome });
      outbox = outbox.filter(x => x.studentId !== studentId);
      return true;
    }
  };
  const window = { RAPS_SUPABASE: client,
    RAPS_CLOUD_CONFIG: { projectUrl: 'https://supabase.example.test', publishableKey: 'synthetic-anon' },
    supabase: { createClient: () => ({ from: table => client.from(table) }) },
    RAPS_CLOUD: { user: { id: 'manager-1' }, connected: true,
      memberships: [{ id: 'member-1', user_id: 'manager-1', role: 'enterprise_admin', active: true, base_id: null, majcom_id: null }] },
    RAPS_CLASS_STORE: store, TCCC_TIERS: { 1: tier }, TCCC_BUILD: { versionName: 'test' },
    addEventListener() {}, dispatchEvent() {}, setTimeout() {} };
  const context = vm.createContext({ window, document: { readyState: 'loading', addEventListener() {} },
    navigator: { onLine: true }, console, CustomEvent: class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } },
    setTimeout() {}, clearTimeout() {} });
  for (const file of ['permissions.js', 'cloud-roster-sync.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return { course, tables, client, resolutions, outbox: () => outbox,
    push: () => window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(course),
    pull: () => window.RAPS_ROSTER_SYNC.pullRosterAndShells() };
}

const participantRow = (id, app = {}) => ({ id, display_name: `Learner ${id}`, created_by: 'manager-1',
  home_base_id: 'base-1', participant_identifier: `RAPS-${id}`, app_data: { classId: 'class-1', ...app } });
const learner = (id, attempts = {}) => ({ id, name: `Learner ${id}`, attempts });
const participantWrites = (client, id) => client.writes.filter(w => w.table === 'participants' && w.payload?.id !== undefined
  ? w.payload.id === id : w.table === 'participants');

// ---------------- Gating ----------------

function gate() {
  const sandbox = {};
  vm.runInNewContext(`${functionSource('isClassClosed')}\n${functionSource('studentRemovalBlockReason')}\nthis.f=studentRemovalBlockReason;`, sandbox);
  return sandbox.f;
}

test('an unfinished evaluation for another student never disables Remove Student', () => {
  const blocked = gate();
  const other = learner('busy', { 1: { id: 'e1', startedAt: instant } });
  const free = learner('free');
  const c = { id: 'class-1', students: [other, free] };
  assert.equal(blocked(c, free), '');
  const rosterRow = appSource.slice(appSource.indexOf('function rosterRow('), appSource.indexOf('function classConflictSummary('));
  assert.ok(!/data-delete-student="\$\{s\.id\}"\$\{lock/.test(rosterRow), 'Button must not depend on the global evaluation lock');
  assert.ok(rosterRow.includes('studentRemovalBlockReason(c,s)'));
});

test('students with started, finalized, or voided assessments stay protected', () => {
  const blocked = gate();
  const c = { id: 'class-1', students: [] };
  for (const attempt of [{ startedAt: instant }, { startedAt: instant, finalizedAt: instant + 1 }, { startedAt: instant, voidedAt: instant + 1 }]) {
    assert.match(blocked(c, learner('x', { 1: attempt })), /started assessment/);
  }
});

test('unstarted cloud shells do not block removal, closed classes always do', () => {
  const blocked = gate();
  assert.equal(blocked({ id: 'c', students: [] }, learner('x', { 1: { id: 'shell', cloudShellOnly: true, startedAt: null } })), '');
  assert.match(blocked({ id: 'c', closedAt: instant, students: [] }, learner('x')), /Closed classes/);
});

// ---------------- Push: withdrawal ----------------

test('a queued removal is written to the server as an audited withdrawal and acknowledged', async () => {
  const f = setup({ students: [learner('keep')],
    participants: [participantRow('keep'), participantRow('gone', { rank: 'SrA', futureField: 'preserve' })],
    withdrawals: [{ studentId: 'gone', userId: 'manager-1', deviceId: 'device-a', requestedAt: instant }] });
  assert.equal(await f.push(), true);
  const gone = f.tables.participants.find(p => p.id === 'gone');
  assert.equal(gone.app_data.withdrawnAt, instant);
  assert.equal(gone.app_data.withdrawnBy, 'manager-1');
  assert.equal(gone.app_data.withdrawnDeviceId, 'device-a');
  assert.equal(gone.app_data.withdrawnFromClassId, 'class-1');
  assert.equal(gone.app_data.futureField, 'preserve', 'Existing participant data is merged, not replaced');
  assert.equal(gone.app_data.rank, 'SrA');
  assert.deepEqual(f.resolutions.map(r => [r.studentId, r.status]), [['gone', 'confirmed']]);
  assert.equal(f.outbox().length, 0);
  assert.equal(f.tables.participants.length, 2, 'The participant row is never deleted');
});

test('the server refuses a withdrawal when an assessment was already started elsewhere', async () => {
  const f = setup({ students: [],
    participants: [participantRow('gone')],
    evaluations: [{ id: 'eval-x', event_id: 'class-1', participant_id: 'gone', attempt_number: 1,
      status: 'in_progress', started_at: iso(instant), evaluator_id: 'evaluator-2', app_data: {} }],
    withdrawals: [{ studentId: 'gone', userId: 'manager-1', deviceId: 'device-a', requestedAt: instant + 5 }] });
  assert.equal(await f.push(), true);
  const gone = f.tables.participants.find(p => p.id === 'gone');
  assert.equal(gone.app_data.withdrawnAt, undefined);
  assert.equal(f.resolutions[0].status, 'rejected');
  assert.match(f.resolutions[0].message, /assessment had already been started/);
  assert.ok(f.course.students.some(s => s.id === 'gone'), 'The student is restored locally right away');
  assert.ok(f.course.students.find(s => s.id === 'gone').attempts['1'], 'The started evaluation is visible');
});

test('removing a student that never reached the server needs no server write', async () => {
  const f = setup({ students: [], withdrawals: [{ studentId: 'local-only', userId: 'manager-1', requestedAt: instant }] });
  assert.equal(await f.push(), true);
  assert.equal(f.client.writes.filter(w => w.table === 'participants').length, 0);
  assert.equal(f.resolutions[0].status, 'confirmed');
});

// ---------------- Pull and stale devices ----------------

test('another device drops a withdrawn student and an unstarted shell cannot bring it back', async () => {
  const f = setup({ students: [learner('keep'), learner('gone')],
    participants: [participantRow('keep'), participantRow('gone', { withdrawnAt: instant })],
    evaluations: [{ id: 'shell-1', event_id: 'class-1', participant_id: 'gone', attempt_number: 1,
      status: 'draft', started_at: null, evaluator_id: 'manager-1', app_data: {} }] });
  const result = await f.pull();
  assert.equal(result.withdrawals, 1);
  assert.deepEqual(f.course.students.map(s => s.id), ['keep']);
  await f.pull();
  assert.deepEqual(f.course.students.map(s => s.id), ['keep'], 'Repeated pulls stay removed');
  assert.equal(f.course.cloudRosterSync.status, 'synced');
});

test('a pending local removal is not undone by a pull that runs before the push', async () => {
  const f = setup({ students: [learner('keep')],
    participants: [participantRow('keep'), participantRow('gone')],
    withdrawals: [{ studentId: 'gone', userId: 'manager-1', requestedAt: instant }] });
  await f.pull();
  assert.deepEqual(f.course.students.map(s => s.id), ['keep']);
});

test('a stale device cannot resurrect a withdrawn student', async () => {
  const f = setup({ students: [learner('keep'), learner('gone')],
    participants: [participantRow('keep'), participantRow('gone', { withdrawnAt: instant, withdrawnBy: 'manager-2' })] });
  assert.equal(await f.push(), true);
  const gone = f.tables.participants.find(p => p.id === 'gone');
  assert.equal(gone.app_data.withdrawnAt, instant, 'Withdrawal survives the stale upload');
  assert.equal(f.client.writes.filter(w => w.table === 'participants' && w.action === 'update' && w.payload.id === 'gone').length, 0);
  assert.deepEqual(f.course.students.map(s => s.id), ['keep'], 'Stale local copy is removed');
});

test('a withdrawn student with a started local assessment is kept and reinstated', async () => {
  const attempt = { id: 'eval-local', attemptNo: 1, startedAt: instant + 10, modifiedAt: instant + 10 };
  const f = setup({ students: [learner('gone', { 1: attempt })],
    participants: [participantRow('gone', { withdrawnAt: instant })] });
  await f.pull();
  assert.ok(f.course.students.some(s => s.id === 'gone'), 'Assessment evidence keeps the student visible');
  assert.equal(await f.push(), true);
  const gone = f.tables.participants.find(p => p.id === 'gone');
  assert.equal(gone.app_data.withdrawnAt, undefined);
  assert.equal(gone.app_data.previousWithdrawnAt, instant);
  assert.equal(gone.app_data.reinstatedBy, 'manager-1');
});

// ---------------- Device queue ----------------

test('a removal is queued durably on the device and cleared only by acknowledgement', () => {
  const storage = new Map();
  const sandbox = {
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    window: { RAPS_CLOUD: { user: { id: 'manager-1' } } }, now: () => instant, DB_KEY: 'db',
    ROSTER_WITHDRAWAL_PREFIX: 'RAPS_ROSTER_WITHDRAWALS_V1:', db: { deviceId: 'device-a', classes: [] }
  };
  vm.runInNewContext(['currentCloudUserId', 'readRosterWithdrawals', 'writeRosterWithdrawals', 'resolveRosterWithdrawal', 'removeStudentFromRoster']
    .map(functionSource).join('\n') + '\nthis.api={readRosterWithdrawals,resolveRosterWithdrawal,removeStudentFromRoster};', sandbox);
  const { api } = sandbox;
  const c = { id: 'class-1', cloudSync: { enabled: true }, students: [learner('a'), learner('b')] };
  sandbox.db.classes.push(c);
  api.removeStudentFromRoster(c, c.students[1]);
  assert.deepEqual(c.students.map(s => s.id), ['a']);
  const stored = JSON.parse(storage.get('RAPS_ROSTER_WITHDRAWALS_V1:class-1'));
  assert.deepEqual(copy(stored.items), [{ studentId: 'b', userId: 'manager-1', deviceId: 'device-a', requestedAt: instant }]);
  assert.ok(!JSON.stringify(stored).includes('Learner'), 'The queue stores identifiers only, never names');
  assert.equal(api.resolveRosterWithdrawal('class-1', 'b', { status: 'rejected', message: 'Kept for records' }), true);
  assert.equal(storage.has('RAPS_ROSTER_WITHDRAWALS_V1:class-1'), false);
  assert.equal(c.rosterNotice.message, 'Kept for records');

  const local = { id: 'class-2', students: [learner('z')] };
  api.removeStudentFromRoster(local, local.students[0]);
  assert.equal(storage.has('RAPS_ROSTER_WITHDRAWALS_V1:class-2'), false, 'Local-only classes need no server queue');
});
