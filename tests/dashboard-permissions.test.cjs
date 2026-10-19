const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const cases = [
  ['enterprise-dashboard.js', 'enterprise_admin', 'isEnterpriseAdmin', 'load', 'enterpriseKpis'],
  ['majcom-manager-dashboard.js', 'majcom_manager', 'isMajcomManager', 'load', 'majcomKpis'],
  ['program-manager-dashboard.js', 'program_manager', 'isProgramManager', 'loadDashboard', 'pmBaseKpis']
];

function fixture([file, role, predicate, loader, resultId], options = {}) {
  const events = new Map();
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML:'previous-account-report', textContent:'', value:id.endsWith('Period') ? '0' : '', children:[],
      classList:{ toggle() {} }, addEventListener() {},
      querySelectorAll() { return []; }
    });
    return nodes.get(id);
  };
  const member = {
    id:'membership', user_id:'caller', role, active:true,
    base_id:role === 'program_manager' ? 'base' : null,
    majcom_id:role === 'majcom_manager' ? 'majcom' : null,
    bases:role === 'program_manager' ? { id:'base', code:'BASE' } : null
  };
  const identity = {
    mode:'connected', connected:true, user:{ id:'caller' }, role,
    memberships:[member], primaryMembership:member, ...options.identity
  };
  let release;
  const pending = options.immediate ? Promise.resolve() : new Promise(resolve => { release = resolve; });
  const reads = [];
  const queries = [];
  const errors = [];
  const rpcCalls = [];
  const tableErrors = new Map();
  let tables = options.tables || null;
  let heldRead = null;
  const client = {
    from(table) {
      reads.push(table);
      const query = { table, filters:[] };
      queries.push(query);
      const builder = new Proxy({}, {
        get(target, key) {
          if (key === 'then') return (resolve, reject) => {
            let rows = tables ? (tables[table] || [])
              : table === 'classes' ? [{ id:'old-class', base_id:'base' }]
              : table === 'bases' ? [{ id:'base', code:'BASE', majcom_id:'majcom', active:true }]
              : [];
            for (const [op, column, value] of query.filters) {
              rows = rows.filter(row => op === 'in' ? value.includes(row[column])
                : op === 'neq' ? row[column] !== value : row[column] === value);
            }
            // A read returns the snapshot requested, even if a later sync changes it.
            const data = JSON.parse(JSON.stringify(rows));
            let gate = pending;
            if (heldRead?.table === table) {
              gate = heldRead.pending;
              heldRead.started = true;
              heldRead = null;
            }
            return gate.then(() => ({ data, error:tableErrors.get(table) || null })).then(resolve, reject);
          };
          if (['eq', 'neq', 'in'].includes(key)) return (column, value) => {
            query.filters.push([key, column, value]);
            return builder;
          };
          return () => builder;
        }
      });
      return builder;
    }
  };
  client.auth = { getSession:options.getSession || (async () => ({
    data:{ session:{ user:{ id:'caller' }, access_token:'synthetic-caller-token' } }, error:null
  })) };
  client.rpc = (name, args) => {
    const call = { name, args, headers:{} };
    rpcCalls.push(call);
    const request = {
      setHeader(key, value) { call.headers[key] = value; return request; },
      then(resolve, reject) {
        return Promise.resolve(options.rpc ? options.rpc(call) : { data:null, error:null }).then(resolve, reject);
      }
    };
    return request;
  };
  const window = {
    RAPS_CLOUD:identity, RAPS_SUPABASE:client,
    RAPS_CLASS_STORE:options.store || { getClass:() => null },
    RAPS_CLASS_SYNC:options.classSync,
    RAPS_GRADING_SYNC:options.gradingSync,
    prompt:options.prompt || (() => 'Training completed'),
    confirm:options.confirm || (() => true),
    addEventListener(type, handler) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(handler);
    }
  };
  const context = vm.createContext({
    window, navigator:{ onLine:options.online !== false },
    document:{ readyState:'loading', getElementById:node, addEventListener() {}, querySelector() { return null; } },
    console:{ warn() {}, error(...args) { errors.push(args); } }, Date, setTimeout, clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'permissions.js'), 'utf8'), context);
  let source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const end = source.lastIndexOf('})();');
  source = source.slice(0, end) + `window.__test = {
    load:${loader}, allowed:${predicate}, raw:() => ${file.startsWith('program') ? 'lastLoadedBaseId' : 'raw'},
    render:${file.startsWith('program') ? 'null' : 'render'},
    refreshBaseOptions:${file.startsWith('enterprise') ? 'refreshBaseOptions' : 'null'},
    requestArchive:${file.startsWith('enterprise') ? 'requestReportingArchive' : 'null'},
    cancelArchive:${file.startsWith('enterprise') ? 'cancelReportingArchive' : 'null'}
  };\n` + source.slice(end);
  vm.runInContext(source, context);
  return {
    window, nodes, node, reads, queries, errors, rpcCalls, member, identity,
    failTable(table) { tableErrors.set(table, { code:'42P01', message:'relation does not exist' }); },
    requestArchive:window.__test.requestArchive,
    cancelArchive:window.__test.cancelArchive,
    setTables(next) { tables = next; },
    holdNextRead(table) {
      let resume;
      const held = { table, started:false, pending:new Promise(resolve => { resume = resolve; }) };
      heldRead = held;
      return { started:() => held.started, release:() => resume() };
    },
    emit(type) { for (const handler of events.get(type) || []) handler(); },
    allowed:window.__test.allowed,
    load:window.__test.load,
    raw:window.__test.raw,
    render:window.__test.render,
    refreshBaseOptions:window.__test.refreshBaseOptions,
    release,
    identityEvent() { for (const handler of events.get('raps-cloud-identity') || []) handler(); },
    resultId
  };
}

for (const item of cases) {
  const [file, role] = item;
  test(`${file}: a role label, offline cache, or expired membership cannot query reports`, async () => {
    for (const options of [
      { identity:{ memberships:[] } },
      { online:false },
      { identity:{ connected:false, offlineCached:true, mode:'offline' } }
    ]) {
      const f = fixture(item, options);
      assert.equal(f.allowed(), false);
      await f.load(true);
      assert.equal(f.reads.length, 0);
    }
    const f = fixture(item);
    f.member.ends_at = '2000-01-01T00:00:00Z';
    assert.equal(f.allowed(), false);
    await f.load(true);
    assert.equal(f.reads.length, 0);
  });

  test(`${file}: an in-flight report cannot continue or render after account change`, async () => {
    const f = fixture(item);
    assert.equal(f.allowed(), true);
    const loading = f.load(true);
    const initialReads = f.reads.length;
    assert.ok(initialReads > 0);
    f.window.RAPS_CLOUD = null;
    f.identityEvent();
    assert.equal(f.node(f.resultId).innerHTML, '');
    f.release();
    await loading;
    assert.equal(f.reads.length, initialReads);
    assert.equal(f.node(f.resultId).innerHTML, '');
    assert.equal(f.raw(), null);
  });

  if (role !== 'enterprise_admin') {
    test(`${file}: an exact secondary role remains available with a higher primary role`, () => {
      const f = fixture(item);
      f.identity.role = 'enterprise_admin';
      f.identity.primaryMembership = { id:'enterprise', role:'enterprise_admin', active:true };
      f.identity.memberships.unshift(f.identity.primaryMembership);
      assert.equal(f.allowed(), true);
    });
  }
}

function reportTables(classes) {
  const tables = {
    majcoms:[{ id:'majcom', code:'ACC', name:'Air Combat Command', active:true }],
    bases:[{ id:'base', code:'BASE', name:'Test Installation', majcom_id:'majcom', active:true }],
    classes, class_reporting_archives:[], evaluation_events:[], evaluations:[], criterion_results:[], profiles:[], participants:[]
  };
  for (const c of classes) {
    const trashed = c.status === 'archived' || !!c.app_data?.deletedAt;
    tables.evaluation_events.push({ id:'event-' + c.id, class_id:c.id, base_id:c.base_id });
    tables.evaluations.push({
      id:'evaluation-' + c.id, event_id:'event-' + c.id,
      participant_id:'participant-' + c.id, evaluator_id:'evaluator-' + c.id,
      status:c.status === 'completed' ? 'finalized' : 'in_progress',
      overall_result:c.status === 'completed' ? 'pass' : null,
      completed_at:c.status === 'completed' ? '2026-10-17T01:00:00Z' : null
    });
    tables.profiles.push({ id:'evaluator-' + c.id, display_name:'Evaluator ' + c.name });
    tables.participants.push({ id:'participant-' + c.id, display_name:'Participant ' + c.name });
    if (trashed) tables.criterion_results.push({
      evaluation_id:'evaluation-' + c.id, result:'fail', failure_mode:'trashed_failure',
      primary_contributor:'trashed_contributor'
    });
  }
  return tables;
}

function reportClass(id, name, status = 'draft', app_data = {}) {
  return { id, name, status, app_data, base_id:'base', start_date:'2026-10-17', course_type:'ASM' };
}

function classTableId(file) {
  return file.startsWith('enterprise') ? 'enterpriseClassTable'
    : file.startsWith('majcom') ? 'majcomClassTable' : 'pmBaseClassTable';
}

function reportCount(f, label) {
  const match = f.node(f.resultId).innerHTML.match(new RegExp('<small>' + label + '</small>\\s*<strong>([^<]+)</strong>'));
  assert.ok(match, 'Rendered report contains the ' + label + ' KPI');
  return match[1];
}

// Retained TEST-* installation rows are ordinary historical catalog records.
// Their names and codes must not enable special reporting or access behavior.
function mixedMajcomReportTables() {
  const rows = [
    ['live-finished', 'Live completed class', 'completed', 'live-base-1'],
    ['live-open', 'Live open class', 'active', 'live-base-73'],
    ['live-verified', 'Live verified CSV', 'completed', 'live-base-1'],
    ['practice-failed', 'Practice failed class', 'completed', 'test-base-1'],
    ['practice-open', 'Practice open class', 'active', 'test-base-73'],
    ['practice-no-event', 'Practice class awaiting events', 'draft', 'test-base-2'],
    ['practice-verified', 'Practice verified CSV', 'completed', 'test-base-1'],
    ['practice-trash', 'Practice shared Trash', 'archived', 'test-base-73']
  ].map(([id, name, status, base_id]) => ({ ...reportClass(id, name, status), base_id }));
  const tables = reportTables(rows);
  tables.majcoms = [
    { id:'live-acc', code:'ACC', name:'Air Combat Command', active:true },
    { id:'live-amc', code:'AMC', name:'Air Mobility Command', active:true },
    { id:'test-command', code:'TEST', name:'Test / Practice Command', active:true }
  ];
  tables.bases = Array.from({ length:73 }, (_, index) => {
    const n = index + 1;
    return [
      { id:'live-base-' + n, code:'INSTALLATION-' + n, name:'Live Installation ' + n,
        majcom_id:n <= 37 ? 'live-acc' : 'live-amc', active:true },
      { id:'test-base-' + n, code:'TEST-INSTALLATION-' + n, name:'Practice Installation ' + n,
        majcom_id:'test-command', active:true }
    ];
  }).flat();
  tables.evaluation_events = tables.evaluation_events.filter(row => row.class_id !== 'practice-no-event');
  tables.evaluations.find(row => row.id === 'evaluation-practice-failed').overall_result = 'fail';
  tables.criterion_results.push({
    evaluation_id:'evaluation-practice-failed', result:'fail',
    failure_mode:'practice_only_failure', primary_contributor:'practice_only_contributor'
  });
  tables.class_reporting_archives = [
    ['live-finished', 'requested'], ['live-verified', 'archived'],
    ['practice-failed', 'failed'], ['practice-verified', 'archived']
  ].map(([class_id, status]) => ({ class_id, status, request_id:'request-' + class_id,
    requested_at:'2026-10-18T01:00:00Z', archived_at:status === 'archived' ? '2026-10-18T01:01:00Z' : null }));
  return tables;
}

test('Enterprise includes TEST in All MAJCOMs and applies the same command filter, trash, and CSV archive rules', async () => {
  const f = fixture(cases[0], { immediate:true, tables:mixedMajcomReportTables() });
  await f.load(true);
  assert.deepEqual(f.errors, []);
  assert.match(f.node('enterpriseMajcomFilter').innerHTML, /All MAJCOMs/);
  assert.match(f.node('enterpriseMajcomFilter').innerHTML, /value="test-command">TEST/);
  assert.equal(reportCount(f, 'MAJCOMs'), '3/3');
  assert.equal(reportCount(f, 'Installations'), '5/146');
  assert.equal(reportCount(f, 'Classes'), '5');
  assert.equal(reportCount(f, 'Evaluations'), '4');
  assert.equal(reportCount(f, 'Pass rate'), '50%');
  assert.equal((f.node('enterpriseBaseFilter').innerHTML.match(/value="live-base-/g) || []).length, 73);
  assert.equal((f.node('enterpriseBaseFilter').innerHTML.match(/value="test-base-/g) || []).length, 73);
  assert.match(f.node('enterpriseClassTable').innerHTML, /Practice failed class/);
  assert.match(f.node('enterpriseClassTable').innerHTML, /Live completed class/);
  assert.doesNotMatch(f.node('enterpriseClassTable').innerHTML, /verified CSV|Practice shared Trash/);
  assert.match(f.node('enterpriseDataQuality').innerHTML, /<b>1<\/b><span>classes without evaluation events/);
  assert.match(f.node('enterpriseFailureModes').innerHTML, /Practice Only Failure/);
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Class ID: live-verified/);
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Class ID: practice-verified/);
  assert.match(f.node('enterpriseDashboardMessage').textContent, /^All MAJCOMs/);

  // Switching command must clear an installation chosen in the previous scope.
  f.node('enterpriseBaseFilter').value = 'live-base-1';
  f.node('enterpriseMajcomFilter').value = 'test-command';
  f.refreshBaseOptions();
  f.render();
  assert.equal(f.node('enterpriseBaseFilter').value, '');
  assert.equal((f.node('enterpriseBaseFilter').innerHTML.match(/value="test-base-/g) || []).length, 73);
  assert.doesNotMatch(f.node('enterpriseBaseFilter').innerHTML, /value="live-base-/);
  assert.equal(reportCount(f, 'MAJCOMs'), '1/1');
  assert.equal(reportCount(f, 'Installations'), '3/73');
  assert.equal(reportCount(f, 'Classes'), '3');
  assert.equal(reportCount(f, 'Evaluations'), '2');
  assert.equal(reportCount(f, 'Finalized'), '1');
  assert.equal(reportCount(f, 'Incomplete'), '1');
  assert.equal(reportCount(f, 'Pass rate'), '0%');
  assert.match(f.node('enterpriseClassTable').innerHTML, /Practice failed class/);
  assert.match(f.node('enterpriseClassTable').innerHTML, /Practice open class/);
  assert.doesNotMatch(f.node('enterpriseClassTable').innerHTML, /Live |Practice verified CSV|Practice shared Trash/);
  assert.match(f.node('enterpriseFailureModes').innerHTML, /Practice Only Failure/);
  assert.match(f.node('enterpriseContributors').innerHTML, /Practice Only Contributor/);
  assert.match(f.node('enterpriseDataQuality').innerHTML, /<b>1<\/b><span>classes without evaluation events/);
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Class ID: practice-verified/);
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Failed — still counted/);
  assert.doesNotMatch(f.node('enterpriseReportingArchives').innerHTML, /Class ID: live-/);
  assert.match(f.node('enterpriseDashboardMessage').textContent, /^TEST · all available data/);

  f.node('enterpriseBaseFilter').value = 'test-base-1';
  f.render();
  assert.equal(reportCount(f, 'Classes'), '1');
  assert.equal(reportCount(f, 'Evaluations'), '1');
  f.node('enterpriseMajcomFilter').value = '';
  f.refreshBaseOptions();
  f.render();
  // Returning to all commands preserves an installation that is still in scope.
  assert.equal(f.node('enterpriseBaseFilter').value, 'test-base-1');
  assert.equal(reportCount(f, 'Classes'), '1');
  f.node('enterpriseBaseFilter').value = '';
  f.render();
  assert.equal(reportCount(f, 'Classes'), '5');
  assert.match(f.node('enterpriseFailureModes').innerHTML, /Practice Only Failure/);
  assert.deepEqual(f.errors, []);
});

test('inactive TEST metadata follows the same retained-record behavior as an inactive ordinary MAJCOM', async () => {
  const tables = mixedMajcomReportTables();
  tables.majcoms.find(row => row.code === 'TEST').active = false;
  const f = fixture(cases[0], { immediate:true, tables });
  await f.load(true);
  assert.equal(reportCount(f, 'Classes'), '5');
  assert.equal(reportCount(f, 'Pass rate'), '50%');
  assert.doesNotMatch(f.node('enterpriseMajcomFilter').innerHTML, /value="test-command"/);
  assert.match(f.node('enterpriseBaseFilter').innerHTML, /value="test-base-/);
  assert.match(f.node('enterpriseClassTable').innerHTML, /Practice/);
  assert.match(f.node('enterpriseFailureModes').innerHTML, /Practice Only Failure/);
  const ordinaryTables = mixedMajcomReportTables();
  ordinaryTables.majcoms.find(row => row.code === 'ACC').active = false;
  const ordinary = fixture(cases[0], { immediate:true, tables:ordinaryTables });
  await ordinary.load(true);
  for (const kpi of ['MAJCOMs', 'Installations', 'Classes', 'Evaluations', 'Pass rate']) {
    assert.equal(reportCount(f, kpi), reportCount(ordinary, kpi));
  }
  assert.deepEqual(ordinary.errors, []);
  assert.deepEqual(f.errors, []);
});

test('TEST and ordinary MAJCOM managers use the same parent-installation query and retained-record rules', async () => {
  for (const [majcom_id, code, expectedBases, expectedClasses, expectedPass] of [
    ['test-command', 'TEST', 73, '3', '0%'],
    ['live-acc', 'ACC', 37, '1', '100%'],
    ['live-amc', 'AMC', 36, '1', '—']
  ]) {
    const f = fixture(cases[1], { immediate:true, tables:mixedMajcomReportTables() });
    Object.assign(f.member, { majcom_id, majcoms:{ id:majcom_id, code, active:true } });
    await f.load(true);
    assert.deepEqual(f.errors, []);
    assert.equal(reportCount(f, 'Classes'), expectedClasses);
    assert.equal(reportCount(f, 'Pass rate'), expectedPass);
    const baseQuery = f.queries.find(query => query.table === 'bases');
    assert.ok(baseQuery.filters.some(([op, column, value]) => op === 'eq' && column === 'majcom_id' && value === majcom_id));
    const requestedBases = f.queries.find(query => query.table === 'classes').filters.find(([, column]) => column === 'base_id')[2];
    assert.equal(requestedBases.length, expectedBases);
    assert.ok(Array.from(requestedBases).every(id => id.startsWith(code === 'TEST' ? 'test-base-' : 'live-base-')));
    assert.doesNotMatch(f.node('majcomClassTable').innerHTML, code === 'TEST' ? /Live |Practice verified CSV|Practice shared Trash/ : /Practice/);
    if (code === 'TEST') {
      assert.match(f.node('majcomClassTable').innerHTML, /Practice open class/);
      assert.match(f.node('majcomDashboardScope').textContent, /^TEST · MAJCOM Manager$/);
      assert.match(f.node('majcomFailureModes').innerHTML, /Practice Only Failure/);
      assert.equal(reportCount(f, 'Installations'), '3/73');
    } else {
      assert.doesNotMatch(f.node('majcomFailureModes').innerHTML, /Practice Only Failure/);
      assert.doesNotMatch(f.node('majcomDashboardScope').textContent, /Practice/);
    }
  }
});

test('Program Managers use the same exact installation query for retained TEST and ordinary installation rows', async () => {
  for (const [base_id, code, expectedName, expectedPass] of [
    ['test-base-1', 'TEST-INSTALLATION-1', 'Practice failed class', '0%'],
    ['live-base-1', 'INSTALLATION-1', 'Live completed class', '100%']
  ]) {
    const f = fixture(cases[2], { immediate:true, tables:mixedMajcomReportTables() });
    Object.assign(f.member, { base_id, bases:{ id:base_id, code, active:true } });
    await f.load(true);
    assert.deepEqual(f.errors, []);
    assert.equal(reportCount(f, 'Classes'), '1');
    assert.equal(reportCount(f, 'Evaluations'), '1');
    assert.equal(reportCount(f, 'Pass rate'), expectedPass);
    const classQuery = f.queries.find(query => query.table === 'classes');
    assert.ok(classQuery.filters.some(([op, column, value]) => op === 'eq' && column === 'base_id' && value === base_id));
    assert.match(f.node('pmBaseClassTable').innerHTML, new RegExp(expectedName));
    assert.doesNotMatch(f.node('pmBaseClassTable').innerHTML, /verified CSV|Practice open class|Live open class|Practice shared Trash/);
    if (code.startsWith('TEST-')) {
      assert.doesNotMatch(f.node('pmBaseScope').textContent, /practice data/i);
      assert.doesNotMatch(f.node('pmBaseClassTable').innerHTML, /Live completed class/);
    } else {
      assert.doesNotMatch(f.node('pmBaseScope').textContent, /practice/);
      assert.doesNotMatch(f.node('pmBaseClassTable').innerHTML, /Practice failed class/);
    }
  }
});

async function until(check) {
  for (let turn = 0; turn < 30; turn++) {
    if (check()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Dashboard did not finish the expected asynchronous update');
}

for (const item of cases) {
  const [file] = item;

  test(`${file}: shared Trash and its assessments are excluded while closed and server-only classes remain`, async () => {
    const kept = reportClass('retained', 'Server record after local removal', 'active');
    const closed = reportClass('closed', 'Closed training history', 'completed');
    const byStatus = reportClass('trash-status', 'Trashed by status', 'archived');
    const byMarker = reportClass('trash-marker', 'Trashed by lifecycle marker', 'draft', { deletedAt:123 });
    const f = fixture(item, { immediate:true, tables:reportTables([kept, closed, byStatus, byMarker]) });
    await f.load(true);
    assert.deepEqual(f.errors, []);
    assert.equal(reportCount(f, 'Classes'), '2');
    assert.equal(reportCount(f, 'Evaluations'), '2');
    assert.equal(reportCount(f, 'Finalized'), '1');
    assert.equal(reportCount(f, 'Incomplete'), '1');
    const html = f.node(classTableId(file)).innerHTML;
    assert.match(html, /Server record after local removal/);
    assert.match(html, /Closed training history/);
    assert.doesNotMatch(html, /Trashed by/);
    const allReportHtml = [...f.nodes.values()].map(node => node.innerHTML).join('\n');
    assert.doesNotMatch(allReportHtml, /trashed_failure|trashed_contributor/);
    const childQueries = f.queries.filter(query => query.table === 'evaluation_events');
    assert.equal(childQueries.length, 1);
    assert.deepEqual(Array.from(childQueries[0].filters.find(([op, column]) => op === 'in' && column === 'class_id')[2]), ['retained', 'closed']);
    for (const table of ['profiles', 'participants']) {
      const ids = f.queries.filter(query => query.table === table).flatMap(query => query.filters.filter(([op]) => op === 'in').flatMap(filter => filter[2]));
      assert.ok(ids.every(id => !id.includes('trash')), 'No deleted assessment identities are requested');
    }
    if (file.startsWith('enterprise')) {
      assert.match(f.node('enterpriseMajcomTable').innerHTML, /<td>1\/1<\/td><td>2<\/td><td>2<\/td><td>1\/2<\/td>/);
    }
  });

  test(`${file}: completed sync updates cached reporting after shared deletion and restoration`, async () => {
    const live = reportClass('live', 'Lifecycle class', 'active');
    const f = fixture(item, { immediate:true, tables:reportTables([live]) });
    await f.load(true);
    assert.equal(reportCount(f, 'Classes'), '1');
    f.setTables(reportTables([{ ...live, status:'archived', app_data:{ deletedAt:123 } }]));
    f.emit('raps-class-sync-complete');
    await until(() => /<small>Classes<\/small>\s*<strong>0<\/strong>/.test(f.node(f.resultId).innerHTML));
    assert.doesNotMatch(f.node(classTableId(file)).innerHTML, /Lifecycle class/);
    f.setTables(reportTables([live]));
    f.emit('raps-class-lifecycle-synced');
    await until(() => /<small>Classes<\/small>\s*<strong>1<\/strong>/.test(f.node(f.resultId).innerHTML));
    assert.match(f.node(classTableId(file)).innerHTML, /Lifecycle class/);
    assert.deepEqual(f.errors, []);
  });

  test(`${file}: an older report cannot restore deleted classes after a sync refresh`, async () => {
    const live = reportClass('live', 'Old snapshot class', 'active');
    const f = fixture(item, { immediate:true, tables:reportTables([live]) });
    const held = f.holdNextRead('classes');
    const oldLoad = f.load(true);
    await until(held.started);
    f.setTables(reportTables([{ ...live, status:'archived', app_data:{ deletedAt:123 } }]));
    f.emit('raps-class-lifecycle-synced');
    await until(() => /<small>Classes<\/small>\s*<strong>0<\/strong>/.test(f.node(f.resultId).innerHTML));
    held.release();
    await oldLoad;
    assert.equal(reportCount(f, 'Classes'), '0');
    assert.doesNotMatch(f.node(classTableId(file)).innerHTML, /Old snapshot class/);
    assert.equal(f.queries.filter(query => query.table === 'evaluation_events').length, 0);
    assert.deepEqual(f.errors, []);
  });

  test(`${file}: sync notifications do not query with revoked reporting access`, async () => {
    const f = fixture(item, { immediate:true, tables:reportTables([]) });
    await f.load(true);
    const before = f.reads.length;
    f.member.active = false;
    f.identityEvent();
    f.emit('raps-class-sync-complete');
    f.emit('raps-class-lifecycle-synced');
    assert.equal(f.reads.length, before);
    assert.equal(f.node(f.resultId).innerHTML, '');
  });
}

for (const item of cases) {
  const [file] = item;
  test(`${file}: only verified CSV archives leave metrics; requested and failed exports stay counted`, async () => {
    const rows = ['ordinary', 'verified', 'requested', 'failed'].map(id => reportClass(id, 'CSV ' + id, 'completed'));
    const tables = reportTables(rows);
    tables.class_reporting_archives = ['verified', 'requested', 'failed'].map(id => ({
      class_id:id, request_id:'request-' + id, status:id === 'verified' ? 'archived' : id,
      requested_at:'2026-10-18T01:00:00Z', archived_at:id === 'verified' ? '2026-10-18T01:01:00Z' : null
    }));
    tables.criterion_results.push({ evaluation_id:'evaluation-verified', result:'fail', failure_mode:'archived_only_failure' });
    const f = fixture(item, { immediate:true, tables });
    await f.load(true);
    assert.deepEqual(f.errors, []);
    assert.equal(reportCount(f, 'Classes'), '3');
    assert.equal(reportCount(f, 'Evaluations'), '3');
    const html = f.node(classTableId(file)).innerHTML;
    assert.match(html, /CSV ordinary/);
    assert.match(html, /CSV requested/);
    assert.match(html, /CSV failed/);
    assert.doesNotMatch(html, /CSV verified/);
    const childIds = f.queries.find(query => query.table === 'evaluation_events').filters.find(([op]) => op === 'in')[2];
    assert.deepEqual(Array.from(childIds), ['ordinary', 'requested', 'failed']);
    const allHtml = [...f.nodes.values()].map(node => node.innerHTML).join('\n');
    assert.doesNotMatch(allHtml, /archived_only_failure/);
    if (file.startsWith('enterprise')) {
      assert.match(f.node('enterpriseReportingArchives').innerHTML, /CSV verified/);
      assert.match(f.node('enterpriseReportingArchives').innerHTML, /Archived — excluded from reports/);
      assert.match(f.node('enterpriseReportingArchives').innerHTML, /Requested — still counted/);
      assert.match(f.node('enterpriseReportingArchives').innerHTML, /Failed — still counted/);
      assert.match(html, /data-enterprise-archive-class="ordinary"/);
      assert.doesNotMatch(html, /data-enterprise-archive-class="(?:requested|failed)"/);
    }
  });

  test(`${file}: unavailable CSV archive metadata clears stale totals and reports the setup error`, async () => {
    const f = fixture(item, { immediate:true, tables:reportTables([reportClass('live', 'Cloud class')]) });
    await f.load(true);
    assert.equal(reportCount(f, 'Classes'), '1');
    f.failTable('class_reporting_archives');
    const before = f.queries.filter(query => query.table === 'evaluation_events').length;
    await f.load(true);
    assert.equal(f.node(f.resultId).innerHTML, '');
    assert.equal(f.node(classTableId(file)).innerHTML, '');
    const statusId = file.startsWith('enterprise') ? 'enterpriseDashboardMessage'
      : file.startsWith('majcom') ? 'majcomDashboardMessage' : 'pmBaseStatus';
    assert.match(f.node(statusId).textContent, /NUC CSV archive status is unavailable/);
    assert.equal(f.queries.filter(query => query.table === 'evaluation_events').length, before);
  });
}

test('Enterprise CSV archive confirms one selected class and binds its initiating bearer token', async () => {
  const tables = reportTables([reportClass('selected', 'Selected class'), reportClass('other', 'Other class')]);
  const f = fixture(cases[0], { immediate:true, tables, prompt:() => '  Class cleanup  ', rpc(call) {
    tables.class_reporting_archives.push({ class_id:'selected', request_id:'request-selected', status:'requested' });
    return { data:{ class_id:'selected', request_id:'request-selected', status:'requested' }, error:null };
  } });
  await f.load(true);
  await f.requestArchive('selected');
  assert.equal(f.rpcCalls.length, 1);
  const call = f.rpcCalls[0];
  assert.equal(call.name, 'request_class_reporting_archive');
  assert.deepEqual(JSON.parse(JSON.stringify(call.args)), { p_class_id:'selected', p_reason:'Class cleanup' });
  assert.equal(call.headers.Authorization, 'Bearer synthetic-caller-token');
  assert.equal(reportCount(f, 'Classes'), '2', 'Requested archive remains counted until verified by the NUC');
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Selected class/);
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Class ID: selected/);
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Requested — still counted/);
});

test('Enterprise CSV archive cancellation or lost membership never sends a mutation', async () => {
  for (const options of [{ prompt:() => null }, { prompt:() => '' }, { confirm:() => false }]) {
    const f = fixture(cases[0], { immediate:true, tables:reportTables([reportClass('selected', 'Selected')]), ...options });
    await f.load(true);
    await f.requestArchive('selected');
    assert.equal(f.rpcCalls.length, 0);
  }
  const f = fixture(cases[0], { immediate:true, tables:reportTables([reportClass('selected', 'Selected')]) });
  await f.load(true);
  f.member.active = false;
  await f.requestArchive('selected');
  assert.equal(f.rpcCalls.length, 0);
});

test('Enterprise CSV archive stops if the account changes while its session is being verified', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(cases[0], { immediate:true, tables:reportTables([reportClass('selected', 'Selected')]), getSession:() => gate });
  await f.load(true);
  const request = f.requestArchive('selected');
  f.window.RAPS_CLOUD = null;
  f.identityEvent();
  release({ data:{ session:{ user:{ id:'caller' }, access_token:'old-account-token' } }, error:null });
  await request;
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.node(f.resultId).innerHTML, '');
});

test('Enterprise CSV archive response cannot refresh or reveal a previous account report', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(cases[0], { immediate:true, tables:reportTables([reportClass('selected', 'Selected')]), rpc:() => gate });
  await f.load(true);
  const request = f.requestArchive('selected');
  await until(() => f.rpcCalls.length === 1);
  const before = f.reads.length;
  f.window.RAPS_CLOUD = null;
  f.identityEvent();
  release({ data:{ class_id:'selected', status:'requested' }, error:null });
  await request;
  assert.equal(f.reads.length, before);
  assert.equal(f.node(f.resultId).innerHTML, '');
  assert.equal(f.node('enterpriseReportingArchives').innerHTML, '');
});

function verifiedLocalCopy() {
  const c = {
    id:'selected', metadataProof:'metadata', rosterProof:'roster',
    cloudSync:{ enabled:true, status:'synced', baseMetadataSignature:'metadata' },
    cloudRosterSync:{ status:'synced', syncedByUserId:'caller', syncedRosterSignature:'roster' },
    students:[{ attempts:{ 1:{ finalizedAt:123, gradingProof:'grading', cloudGrading:{
      status:'synced', syncedByUserId:'caller', baseGradingSignature:'grading'
    } } } }]
  };
  return {
    c,
    store:{ getClass:() => c, localRosterSignature:value => value.rosterProof },
    classSync:{ classMetadataSignature:value => value.metadataProof },
    gradingSync:{ localGradingSignature:value => value.gradingProof }
  };
}

test('Enterprise CSV archive accepts a fully verified local copy and rejects every kind of unsynced work', async () => {
  const mutations = [
    c => { c.cloudSync.status = 'pending'; },
    c => { c.cloudSync.status = 'conflict'; },
    c => { c.cloudSync.trashAction = { kind:'delete' }; },
    c => { c.metadataProof = 'new metadata'; },
    c => { c.cloudRosterSync.status = 'error'; },
    c => { c.cloudRosterSync.syncedByUserId = 'other-user'; },
    c => { c.rosterProof = 'new roster'; },
    c => { c.students[0].attempts[1].cloudGrading.status = 'offline'; },
    c => { c.students[0].attempts[1].gradingProof = 'new grading'; },
    c => { Object.assign(c.students[0].attempts[1], { startedAt:1, finalizedAt:null }); }
  ];
  for (const mutate of [null, ...mutations]) {
    const local = verifiedLocalCopy();
    if (mutate) mutate(local.c);
    const f = fixture(cases[0], { immediate:true, tables:reportTables([reportClass('selected', 'Selected')]), ...local,
      rpc:() => ({ data:{ class_id:'selected', request_id:'request-1', status:'requested' }, error:null })
    });
    await f.load(true);
    await f.requestArchive('selected');
    assert.equal(f.rpcCalls.length, mutate ? 0 : 1);
    if (mutate) assert.match(f.node('enterpriseDashboardMessage').textContent, /Sync|sync|Finalize/);
  }
});

test('Enterprise CSV archive rechecks local work after asynchronous session verification', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const local = verifiedLocalCopy();
  const f = fixture(cases[0], { immediate:true, tables:reportTables([reportClass('selected', 'Selected')]), ...local, getSession:() => gate });
  await f.load(true);
  const request = f.requestArchive('selected');
  local.c.cloudSync.status = 'pending';
  release({ data:{ session:{ user:{ id:'caller' }, access_token:'synthetic-caller-token' } }, error:null });
  await request;
  assert.equal(f.rpcCalls.length, 0);
  assert.match(f.node('enterpriseDashboardMessage').textContent, /unconfirmed class changes/);
});

test('Enterprise CSV archive refuses a missing verification bridge but accepts a deliberately absent local copy', async () => {
  const f = fixture(cases[0], { immediate:true, tables:reportTables([reportClass('selected', 'Selected')]),
    rpc:() => ({ data:{ class_id:'selected', request_id:'request-1', status:'requested' }, error:null })
  });
  await f.load(true);
  f.window.RAPS_CLASS_STORE = undefined;
  await f.requestArchive('selected');
  assert.equal(f.rpcCalls.length, 0);
  assert.match(f.node('enterpriseDashboardMessage').textContent, /verification is unavailable/);
  f.window.RAPS_CLASS_STORE = { getClass:() => null };
  await f.requestArchive('selected');
  assert.equal(f.rpcCalls.length, 1);
});

for (const archiveStatus of ['requested', 'failed']) {
  test(`Enterprise can cancel only the exact unfinished ${archiveStatus} CSV archive generation`, async () => {
    const tables = reportTables([reportClass('selected', 'Selected')]);
    tables.class_reporting_archives = [{ class_id:'selected', request_id:'current-request', status:archiveStatus }];
    const f = fixture(cases[0], { immediate:true, tables, rpc(call) {
      tables.class_reporting_archives = [];
      return { data:null, error:null };
    } });
    await f.load(true);
    assert.match(f.node('enterpriseReportingArchives').innerHTML, /Cancel unfinished archive/);
    await f.cancelArchive('selected', 'obsolete-request');
    assert.equal(f.rpcCalls.length, 0, 'An obsolete generation from an old render cannot be cancelled');
    await f.cancelArchive('selected', 'current-request');
    assert.equal(f.rpcCalls.length, 1);
    assert.equal(f.rpcCalls[0].name, 'cancel_class_reporting_archive');
    assert.deepEqual(JSON.parse(JSON.stringify(f.rpcCalls[0].args)), { p_class_id:'selected', p_request_id:'current-request' });
    assert.equal(f.rpcCalls[0].headers.Authorization, 'Bearer synthetic-caller-token');
    assert.equal(reportCount(f, 'Classes'), '1');
    assert.match(f.node('enterpriseClassTable').innerHTML, /data-enterprise-archive-class="selected"/);
  });
}

test('Enterprise retry requests a new failed archive generation while preserving its training metrics', async () => {
  const tables = reportTables([reportClass('selected', 'Selected')]);
  tables.class_reporting_archives = [{ class_id:'selected', request_id:'failed-request', status:'failed' }];
  const f = fixture(cases[0], { immediate:true, tables, rpc() {
    tables.class_reporting_archives[0] = { class_id:'selected', request_id:'new-request', status:'requested' };
    return { data:tables.class_reporting_archives[0], error:null };
  } });
  await f.load(true);
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Retry CSV archive/);
  await f.requestArchive('selected');
  assert.equal(f.rpcCalls.length, 1);
  assert.equal(f.rpcCalls[0].name, 'request_class_reporting_archive');
  assert.equal(reportCount(f, 'Classes'), '1');
  assert.match(f.node('enterpriseReportingArchives').innerHTML, /Requested — still counted/);
  assert.doesNotMatch(f.node('enterpriseReportingArchives').innerHTML, /Retry CSV archive/);
});

test('Enterprise verified archive exposes neither retry nor cancellation actions', async () => {
  const tables = reportTables([reportClass('selected', 'Selected')]);
  tables.class_reporting_archives = [{ class_id:'selected', request_id:'verified-request', status:'archived' }];
  const f = fixture(cases[0], { immediate:true, tables });
  await f.load(true);
  assert.equal(reportCount(f, 'Classes'), '0');
  assert.doesNotMatch(f.node('enterpriseReportingArchives').innerHTML, /data-enterprise-(?:retry|cancel)-archive/);
  await f.requestArchive('selected');
  await f.cancelArchive('selected', 'verified-request');
  assert.equal(f.rpcCalls.length, 0);
});

test('Enterprise archive cancellation suppresses a response after membership revocation', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const tables = reportTables([reportClass('selected', 'Selected')]);
  tables.class_reporting_archives = [{ class_id:'selected', request_id:'current-request', status:'requested' }];
  const f = fixture(cases[0], { immediate:true, tables, rpc:() => gate });
  await f.load(true);
  const request = f.cancelArchive('selected', 'current-request');
  await until(() => f.rpcCalls.length === 1);
  const before = f.reads.length;
  f.member.active = false;
  f.identityEvent();
  release({ data:null, error:null });
  await request;
  assert.equal(f.reads.length, before);
  assert.equal(f.node(f.resultId).innerHTML, '');
  assert.equal(f.node('enterpriseReportingArchives').innerHTML, '');
});
