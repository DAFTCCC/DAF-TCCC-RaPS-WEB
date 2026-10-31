'use strict';

// Field scenario: 1 class, 18 students, 3 instructors on 3 phones, plus a
// Program Manager. Everyone syncs in the morning, evaluates all day with no
// connection, returns, syncs, and closes the class. Two A1 failures are
// retested offline by a different instructor on a different phone, and one
// student is accidentally evaluated on two phones.
//
// Each phone runs the real permissions.js, cloud-grading-sync.js, and
// cloud-closure-gate.js in its own isolated context. They share one in-memory
// server whose RPCs mirror supabase/migrations/20261101_offline_field_finalization.sql
// (tested against PostgreSQL in tests/offline-finalization.sh) and the
// deployed claim/finalize contract. No network access.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const CLASS = 'class-1', BASE = 'base-1', MAJCOM = 'majcom-1', CURR = 'curriculum-1';
const USERS = { pm: 'user-pm', a: 'user-alpha', b: 'user-bravo', c: 'user-charlie' };
const tier = { id: '1', shortName: 'ASM', source: 'JTS-standard',
  sections: [{ code: 'M', title: 'Massive hemorrhage', items: [{ id: 'M1', critical: true, text: 'Apply tourniquet' }, { id: 'M2', text: 'Reassess' }] }], timers: [] };
const students = Array.from({ length: 18 }, (_, i) => ({ id: `student-${String(i + 1).padStart(2, '0')}`, name: `Student ${i + 1}` }));

// ---------------------------------------------------------------- server ----
function makeServer() {
  let clock = Date.parse('2026-11-03T13:00:00Z');
  const now = () => (clock += 1000);
  const tables = {
    bases: [{ id: BASE, code: 'TEST', majcom_id: MAJCOM, active: true }],
    classes: [{ id: CLASS, status: 'active', created_by: USERS.pm, base_id: BASE, bases: { id: BASE, code: 'TEST', majcom_id: MAJCOM } }],
    curriculum_versions: [{ id: CURR, course_type: 'ASM', version: tier.source, published: true }],
    criteria: [{ id: 'crit-M1', criterion_code: 'M1', critical: true, curriculum_version_id: CURR, active: true },
      { id: 'crit-M2', criterion_code: 'M2', critical: false, curriculum_version_id: CURR, active: true }],
    evaluation_events: [{ id: CLASS, class_id: CLASS, curriculum_version_id: CURR, status: 'active' }],
    participants: students.map(s => ({ id: s.id, display_name: s.name, app_data: { classId: CLASS } })),
    evaluations: [], criterion_results: [], timer_results: [], checkins: [], closure: null
  };
  const managers = new Set([USERS.pm]);
  const fail = message => { throw Object.assign(new Error(message), { code: 'P0001' }); };

  function retestRules(row) {
    if (Number(row.attempt_number) !== 2) return;
    const first = tables.evaluations.find(e => e.event_id === row.event_id && e.participant_id === row.participant_id && e.attempt_number === 1 && e.status !== 'voided');
    if (!first || first.status !== 'finalized' || first.overall_result !== 'fail') fail('Attempt 2 requires a finalized Attempt 1 FAIL on the server');
    if (first.evaluator_id === row.evaluator_id) fail('Attempt 2 retest requires a different evaluator than Attempt 1');
  }
  function statusOf() {
    const req = tables.closure;
    const devices = tables.checkins.map(d => ({ ...d, checkedIn: !!req && d.pendingCount === 0 && d.lastCleanAt >= req.requestedAt }));
    const waiting = devices.filter(d => !d.releasedAt && !d.checkedIn).length;
    return { ok: true, closureRequestedAt: req ? new Date(req.requestedAt).toISOString() : null, devices: copy(devices), waiting, ready: !!req && waiting === 0 };
  }
  const rpc = {
    claim_evaluation_authoritatively(uid, a) {
      const same = tables.evaluations.find(e => e.event_id === a.p_event_id && e.participant_id === a.p_participant_id
        && e.attempt_number === a.p_attempt_number && e.status !== 'voided');
      if (same) {
        if (same.id === a.p_evaluation_id && same.evaluator_id === uid) return { claimed: true, alreadyClaimed: true, evaluationId: same.id, startedAt: same.started_at };
        return { claimed: false, reason: 'evaluation_owned_by_other_evaluator', existingEvaluationId: same.id };
      }
      if (tables.evaluations.some(e => e.evaluator_id === uid && e.status === 'in_progress')) return { claimed: false, reason: 'active_evaluation_exists' };
      const row = { id: a.p_evaluation_id, event_id: a.p_event_id, participant_id: a.p_participant_id, evaluator_id: uid,
        curriculum_version_id: a.p_curriculum_version_id, attempt_number: a.p_attempt_number, status: 'in_progress',
        overall_result: null, started_at: new Date(now()).toISOString(), completed_at: null, app_data: {}, source_device_id: a.p_source_device_id };
      retestRules(row);
      tables.evaluations.push(row);
      return { claimed: true, evaluationId: row.id, startedAt: row.started_at };
    },
    finalize_evaluation_authoritatively(uid, a) {
      const row = tables.evaluations.find(e => e.id === a.p_evaluation_id);
      if (!row || row.evaluator_id !== uid || row.status !== 'in_progress') return { finalized: false, reason: 'not_finalizable' };
      const results = tables.criterion_results.filter(r => r.evaluation_id === row.id);
      if (results.length < 2) return { finalized: false, issues: ['Every criterion must be graded'] };
      const criticalFail = results.some(r => r.criterion_id === 'crit-M1' && r.result === 'fail');
      Object.assign(row, { status: 'finalized', overall_result: criticalFail ? 'fail' : 'pass', completed_at: new Date(now()).toISOString() });
      return { finalized: true, result: row.overall_result, completedAt: row.completed_at,
        scoreNumerator: results.filter(r => r.result === 'pass').length, scoreDenominator: results.length };
    },
    confirm_offline_evaluation_audit(uid, a) {
      const row = tables.evaluations.find(e => e.id === a.p_evaluation_id);
      if (!row) return { confirmed: false, reason: 'evaluation_not_found' };
      if (row.evaluator_id !== uid) return { confirmed: false, reason: 'evaluation_owned_by_other_evaluator' };
      if (row.status !== 'finalized') return { confirmed: false, reason: 'evaluation_not_finalized' };
      if (row.app_data.serverAuditConfirmation) return { confirmed: true, alreadyConfirmed: true };
      const app = row.app_data;
      if (!app.fieldStartedAt || !app.fieldFinalizedAt || !app.fieldFinalResult) return { confirmed: false, reason: 'missing_preexisting_field_evidence' };
      if (app.fieldStartedAt !== Date.parse(a.p_field_started_at) || app.fieldFinalizedAt !== Date.parse(a.p_field_finalized_at)
        || app.fieldFinalResult !== String(a.p_field_result).toUpperCase()) return { confirmed: false, reason: 'field_evidence_changed_after_upload' };
      if (row.overall_result.toUpperCase() !== app.fieldFinalResult) return { confirmed: false, reason: 'field_result_mismatch' };
      row.app_data = { ...app, serverVerificationStatus: 'verified', serverAuditConfirmation: { confirmedAt: new Date(now()).toISOString(), confirmedBy: uid } };
      row.started_at = a.p_field_started_at;
      return { confirmed: true };
    },
    report_class_device_sync(uid, a) {
      if (tables.classes[0].status === 'completed') return { ok: true, classClosed: true };
      const t = now();
      let d = tables.checkins.find(x => x.deviceId === a.p_device_id);
      if (!d) tables.checkins.push(d = { deviceId: a.p_device_id, label: a.p_device_label, firstSeenAt: t });
      Object.assign(d, { userId: uid, label: a.p_device_label || d.label, lastReportedAt: t, pendingCount: a.p_pending_count,
        lastCleanAt: a.p_pending_count === 0 ? t : d.lastCleanAt || null });
      if (a.p_pending_count > 0) Object.assign(d, { releasedAt: null, releaseReason: null });
      return { ok: true, reportedAt: new Date(t).toISOString(), closureRequestedAt: tables.closure ? new Date(tables.closure.requestedAt).toISOString() : null };
    },
    class_device_closure_status: () => statusOf(),
    request_class_closure(uid) {
      if (!managers.has(uid)) fail('An installation Program Manager or Enterprise Admin must request class closure');
      tables.closure = { requestedAt: now(), requestedBy: uid };
      return statusOf();
    },
    release_class_device(uid, a) {
      if (!managers.has(uid)) fail('Program Manager required');
      Object.assign(tables.checkins.find(d => d.deviceId === a.p_device_id), { releasedAt: now(), releaseReason: a.p_reason });
      return statusOf();
    },
    close_class_with_device_gate(uid) {
      if (!managers.has(uid)) fail('Program Manager required');
      const status = statusOf();
      if (!status.closureRequestedAt) return { closed: false, issues: ['Select Prepare to Close first'] };
      const waiting = status.devices.filter(d => !d.releasedAt && !d.checkedIn);
      if (waiting.length) return { closed: false, issues: waiting.map(d => `${d.label}: not checked in`) };
      tables.classes[0].status = 'completed';
      return { closed: true, closedAt: now() };
    }
  };

  function client(uid) {
    function from(table) {
      const filters = []; let action = 'select', payload, conflictKeys, shape = 'rows';
      const q = {
        select() { return q; },
        eq(k, v) { filters.push(r => k.includes('->>') ? r.app_data?.[k.split('->>')[1]] === v : r[k] === v); return q; },
        neq(k, v) { filters.push(r => r[k] !== v); return q; },
        in(k, vs) { filters.push(r => vs.includes(r[k])); return q; },
        maybeSingle() { shape = 'one'; return q; }, single() { shape = 'one'; return q; },
        update(v) { action = 'update'; payload = v; return q; }, insert(v) { action = 'insert'; payload = v; return q; },
        upsert(v, o) { action = 'upsert'; payload = v; conflictKeys = o.onConflict.split(','); return q; },
        delete() { action = 'delete'; return q; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const rows = tables[table] || (tables[table] = []);
            let sel = rows.filter(r => filters.every(f => f(r)));
            if (table === 'evaluations' && action === 'update') {
              for (const r of sel) {
                if (r.evaluator_id !== uid || !['draft', 'in_progress'].includes(r.status)) return { data: null, error: { message: 'permission denied' } };
                if (['finalized', 'voided'].includes(payload.status)) return { data: null, error: { message: 'Use the authoritative evaluation lifecycle workflow' } };
              }
            }
            if (action === 'update') sel.forEach(r => Object.assign(r, copy(payload)));
            if (action === 'delete') tables[table] = rows.filter(r => !sel.includes(r));
            if (action === 'insert' || action === 'upsert') {
              sel = [];
              for (const v of [].concat(payload)) {
                const old = action === 'upsert' && rows.find(r => conflictKeys.every(k => r[k] === v[k]));
                if (old) { Object.assign(old, copy(v)); sel.push(old); } else { const r = { id: `${table}-${rows.length + 1}`, ...copy(v) }; rows.push(r); sel.push(r); }
              }
            }
            return { data: copy(shape === 'one' ? sel[0] || null : sel), error: null };
          }).then(resolve, reject);
        }
      };
      return q;
    }
    return {
      from,
      rpc(name, args) {
        return Promise.resolve().then(() => {
          try { return { data: copy(rpc[name](uid, args)), error: null }; }
          catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
        });
      }
    };
  }
  return { tables, client, managers };
}

// ----------------------------------------------------------------- phone ----
function makePhone(server, key, deviceId, label) {
  const uid = USERS[key];
  const role = key === 'pm' ? 'program_manager' : 'evaluator';
  const course = { id: CLASS, name: 'Field class', tierId: '1', tierSnapshot: copy(tier), status: 'active',
    homeInstallationId: 'TEST', cloudScope: { baseId: BASE, baseCode: 'TEST', majcomId: MAJCOM },
    cloudAccess: role === 'evaluator' ? { userId: uid, assignedEvaluator: true } : undefined,
    cloudSync: { enabled: true, status: 'synced', createdBy: USERS.pm }, cloudRosterSync: { status: 'synced' },
    students: students.map(s => ({ ...s, attempts: {} })) };
  const listeners = new Map();
  const net = { online: true };
  const session = { user: { id: uid }, access_token: `token-${uid}` };
  const base = server.client(uid);
  const supabase = { ...base, auth: { getSession: async () => ({ data: { session: copy(session) }, error: null }) } };
  const store = { deviceId: () => deviceId, getClasses: () => [course], getClass: id => id === CLASS ? course : null,
    persistCloudMerge() {}, localRosterSignature: () => '', getRosterWithdrawals: () => [], patchRosterCloudState() {} };
  const membership = { id: `m-${key}`, user_id: uid, role, active: true, base_id: BASE, majcom_id: null, starts_at: null, ends_at: null,
    bases: { id: BASE, code: 'TEST', majcom_id: MAJCOM, active: true } };
  const window = { RAPS_SUPABASE: supabase, RAPS_CLASS_STORE: store, TCCC_TIERS: { 1: tier },
    RAPS_CLOUD_CONFIG: { projectUrl: 'https://server.invalid', publishableKey: 'synthetic' },
    supabase: { createClient: () => base },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); }, dispatchEvent() {}, setTimeout() {} };
  const navigator = { get onLine() { return net.online; }, userAgent: 'iPhone' };
  const setIdentity = () => {
    window.RAPS_CLOUD = { user: { id: uid }, profile: { display_name: label }, connected: net.online, offlineCached: !net.online, memberships: [membership] };
  };
  setIdentity();
  const context = vm.createContext({ window, navigator, document: { readyState: 'loading', addEventListener() {} }, console: { warn() {}, error() {}, log() {} },
    CustomEvent: class { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } }, setTimeout: () => 0, clearTimeout() {} });
  for (const file of ['permissions.js', 'cloud-grading-sync.js', 'cloud-closure-gate.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  let seq = 0;
  return {
    key, uid, deviceId, course, window,
    goOffline() { net.online = false; setIdentity(); },
    goOnline() { net.online = true; setIdentity(); },
    student: id => course.students.find(s => s.id === id),
    // Mirrors app.js activateLocalOfflineAttempt + finalizeLocallyPendingServer.
    evaluateOffline(studentId, attemptNo, critical, options = {}) {
      assert.equal(net.online, false, 'field evaluation happens offline');
      const s = this.student(studentId), start = Date.parse('2026-11-03T14:00:00Z') + (++seq) * 600000 + key.charCodeAt(0) * 1000;
      const result = critical === 'fail' ? 'FAIL' : 'PASS';
      s.attempts[String(attemptNo)] = {
        id: `${key}-${studentId}-a${attemptNo}`, attemptNo, startedAt: start, fieldStartedAt: start,
        fieldFinalizedAt: start + 420000, finalizedAt: start + 420000, fieldFinalResult: result, finalResult: result,
        ratings: { M1: critical, M2: 'pass' }, stamps: { M1: start + 60000, M2: start + 120000 }, methods: {}, ntReasons: {},
        failureDetails: critical === 'fail' ? { M1: { mode: 'omission', contributor: 'knowledge' } } : {}, observations: {}, notes: {}, timers: {}, events: [],
        startedByUserId: uid, cloudEvaluatorUserId: uid, startedByDeviceId: deviceId, modifiedAt: start + 420000,
        pendingServerClaim: true, pendingServerFinalization: true, offlineStarted: true,
        remediation: attemptNo === 2 ? { reason: 'Critical task failure', action: 'Coached repetition', ...(options.otherPhone ? { attempt1OnAnotherDevice: true } : {}) } : null,
        cloudGrading: { status: 'offline', error: '' }
      };
      return s.attempts[String(attemptNo)];
    },
    sync: () => window.RAPS_GRADING_SYNC.syncAll(),
    pending: () => window.RAPS_CLOSURE_GATE.pendingCountFor(course),
    gate: window.RAPS_CLOSURE_GATE
  };
}

// --------------------------------------------------------------- scenario ---
test('a full field day: offline grading, offline retests, a duplicate, and a gated close', async () => {
  const server = makeServer();
  const pm = makePhone(server, 'pm', 'device-pm-laptop', 'Program Manager');
  const A = makePhone(server, 'a', 'device-alpha', 'SSgt Alpha');
  const B = makePhone(server, 'b', 'device-bravo', 'TSgt Bravo');
  const C = makePhone(server, 'c', 'device-charlie', 'MSgt Charlie');
  const phones = [A, B, C];

  // Morning: every phone syncs and registers for the class.
  for (const p of [pm, ...phones]) assert.equal(await p.gate.reportAll(), 1);
  assert.equal(server.tables.checkins.length, 4);

  // The day: no connection. Each instructor evaluates six students.
  phones.forEach(p => p.goOffline());
  const assignment = { a: students.slice(0, 6), b: students.slice(6, 12), c: students.slice(12, 18) };
  for (const p of phones) for (const s of assignment[p.key]) {
    const failsA1 = s.id === 'student-01' || s.id === 'student-02';
    p.evaluateOffline(s.id, 1, failsA1 ? 'fail' : 'pass');
  }
  // Retests by a different instructor on a different phone, still offline.
  B.evaluateOffline('student-01', 2, 'pass', { otherPhone: true });
  C.evaluateOffline('student-02', 2, 'pass', { otherPhone: true });
  // Mistake: Charlie also grades Bravo's student 7.
  C.evaluateOffline('student-07', 1, 'pass');
  assert.equal(server.tables.evaluations.length, 0, 'Nothing reaches the server while offline');
  assert.equal(A.pending(), 6); assert.equal(B.pending(), 7); assert.equal(C.pending(), 8);

  // Back at the main building. The PM asks every phone to check in.
  await pm.gate.requestClosure(CLASS);
  assert.equal((await pm.gate.closeClass(CLASS)).closed, false, 'Closing before the phones sync is refused');

  // Bravo happens to sync first: its retest waits for Alpha's A1 FAIL.
  B.goOnline(); await B.sync();
  const bRetest = B.student('student-01').attempts['2'];
  assert.equal(bRetest.waitingForAttempt1, true);
  assert.equal(bRetest.pendingServerFinalization, true, 'The waiting retest stays sealed on the phone');
  assert.equal(B.pending(), 1);
  for (const s of assignment.b) assert.equal(B.student(s.id).attempts['1'].cloudGrading.status, 'synced');

  // Alpha syncs: both A1 FAILs reach the server.
  A.goOnline(); await A.sync();
  assert.equal(A.pending(), 0);

  // Charlie syncs: its A2 retest now succeeds; the duplicate student 7 is a conflict, preserved.
  C.goOnline(); await C.sync();
  const dup = C.student('student-07').attempts['1'];
  assert.equal(dup.syncConflict.kind, 'duplicate_attempt');
  assert.equal(dup.finalResult, 'PASS', 'The losing record is kept intact');
  assert.equal(C.student('student-02').attempts['2'].cloudGrading.status, 'synced');
  assert.equal(C.pending(), 1, 'An unresolved conflict keeps the phone from checking in');

  await pm.gate.reportAll(); // app.js closeClass checks this device in first
  const blocked = await pm.gate.closeClass(CLASS);
  assert.equal(blocked.closed, false);
  assert.deepEqual(blocked.issues.sort(), ['MSgt Charlie · iPhone charli: not checked in', 'TSgt Bravo · iPhone bravo: not checked in'].sort());

  // Bravo syncs again: the retest goes through now that Alpha's A1 FAIL is on the server.
  await B.sync();
  assert.equal(B.student('student-01').attempts['2'].pendingServerFinalization, false);
  assert.equal(B.pending(), 0);

  // Charlie reviews the conflict and keeps the server record (app archives its copy first).
  const s7 = C.student('student-07');
  s7.syncConflictArchive = [{ archivedAt: Date.now(), reason: 'duplicate_attempt', record: copy(s7.attempts['1']) }];
  delete s7.attempts['1'];
  await C.sync();
  assert.equal(C.pending(), 0);

  await pm.gate.reportAll();
  const closed = await pm.gate.closeClass(CLASS);
  assert.equal(closed.closed, true, 'The class closes once every phone has checked in clean');

  // Server record integrity.
  const evals = server.tables.evaluations;
  const a1 = evals.filter(e => e.attempt_number === 1), a2 = evals.filter(e => e.attempt_number === 2);
  assert.equal(a1.length, 18, 'Exactly one A1 per student');
  assert.equal(new Set(a1.map(e => e.participant_id)).size, 18);
  assert.equal(a2.length, 2);
  assert.ok(evals.every(e => e.status === 'finalized'));
  assert.deepEqual(a1.filter(e => e.overall_result === 'fail').map(e => e.participant_id).sort(), ['student-01', 'student-02']);
  for (const retest of a2) {
    const first = a1.find(e => e.participant_id === retest.participant_id);
    assert.notEqual(retest.evaluator_id, first.evaluator_id, 'Retests were conducted by a different instructor');
    assert.equal(retest.overall_result, 'pass');
  }
  assert.equal(a1.find(e => e.participant_id === 'student-07').evaluator_id, USERS.b, 'The first phone to sync owns the duplicate student');
  for (const e of evals) {
    assert.equal(Date.parse(e.started_at), e.app_data.fieldStartedAt, 'Official start time is the real field start');
    assert.ok(e.app_data.serverAuditConfirmation, 'Every field record has its audit confirmation');
  }
  assert.equal(s7.syncConflictArchive[0].record.id, 'c-student-07-a1', 'Charlie\'s duplicate stays archived on the phone');
  assert.equal(server.tables.classes[0].status, 'completed');
});

test('an interrupted sync resumes without finalizing twice or losing the field record', async () => {
  const server = makeServer();
  const A = makePhone(server, 'a', 'device-alpha', 'SSgt Alpha');
  A.goOffline();
  A.evaluateOffline('student-03', 1, 'pass');
  A.goOnline();
  let finalizeCalls = 0, dropAudit = true;
  const realRpc = A.window.supabase.createClient().rpc;
  const base = A.window.supabase.createClient();
  A.window.supabase.createClient = () => ({ ...base, rpc(name, args) {
    if (name === 'finalize_evaluation_authoritatively') finalizeCalls++;
    if (name === 'confirm_offline_evaluation_audit' && dropAudit) return Promise.reject(new TypeError('Failed to fetch'));
    return realRpc(name, args);
  } });
  await A.sync();
  const a = A.student('student-03').attempts['1'];
  assert.equal(a.pendingServerFinalization, true, 'Still awaiting verification after the drop');
  assert.equal(server.tables.evaluations[0].status, 'finalized', 'The server finalized before the drop');
  dropAudit = false;
  await A.sync();
  assert.equal(finalizeCalls, 1, 'The resumed sync does not finalize a second time');
  assert.equal(a.pendingServerFinalization, false);
  assert.equal(a.cloudGrading.status, 'synced');
  assert.ok(server.tables.evaluations[0].app_data.serverAuditConfirmation);
});

test('the A1 evaluator cannot retest the same student, even offline', async () => {
  const server = makeServer();
  const A = makePhone(server, 'a', 'device-alpha', 'SSgt Alpha');
  A.goOffline();
  A.evaluateOffline('student-04', 1, 'fail');
  A.evaluateOffline('student-04', 2, 'pass');
  A.goOnline(); await A.sync();
  const retest = A.student('student-04').attempts['2'];
  assert.equal(retest.syncConflict.kind, 'same_evaluator_retest');
  assert.equal(server.tables.evaluations.filter(e => e.attempt_number === 2).length, 0);
  assert.equal(A.student('student-04').attempts['1'].cloudGrading.status, 'synced', 'The A1 record still syncs');
});

test('phones only check in for closure when nothing is left on them', async () => {
  const server = makeServer();
  const pm = makePhone(server, 'pm', 'device-pm', 'Program Manager');
  const A = makePhone(server, 'a', 'device-alpha', 'SSgt Alpha');
  await pm.gate.requestClosure(CLASS);
  A.goOffline(); A.evaluateOffline('student-05', 1, 'pass');
  A.goOnline();
  await A.gate.reportAll();
  assert.equal(A.course.closureGate.checkedInAt, 0, 'Unsynced records prevent check-in');
  assert.equal(A.course.closureGate.pending, 1);
  await A.sync();
  assert.ok(A.course.closureGate.checkedInAt > 0, 'After syncing, the phone checks in');
  assert.ok(A.course.closureGate.requestedAt > 0, 'The phone knows closure was requested');
});
