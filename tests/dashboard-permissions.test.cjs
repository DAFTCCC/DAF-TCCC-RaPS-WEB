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
      innerHTML:'previous-account-report', textContent:'', value:'', children:[],
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
  const pending = new Promise(resolve => { release = resolve; });
  const reads = [];
  const client = {
    from(table) {
      reads.push(table);
      const builder = new Proxy({}, {
        get(target, key) {
          if (key === 'then') return (resolve, reject) => pending.then(() => ({
            data:table === 'classes' ? [{ id:'old-class', base_id:'base' }]
              : table === 'bases' ? [{ id:'base', code:'BASE', majcom_id:'majcom', active:true }]
              : [], error:null
          })).then(resolve, reject);
          return () => builder;
        }
      });
      return builder;
    }
  };
  const window = {
    RAPS_CLOUD:identity, RAPS_SUPABASE:client,
    addEventListener(type, handler) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(handler);
    }
  };
  const context = vm.createContext({
    window, navigator:{ onLine:options.online !== false },
    document:{ readyState:'loading', getElementById:node, addEventListener() {}, querySelector() { return null; } },
    console:{ warn() {}, error() {} }, Date, setTimeout, clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'permissions.js'), 'utf8'), context);
  let source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const end = source.lastIndexOf('})();');
  source = source.slice(0, end) + `window.__test = {
    load:${loader}, allowed:${predicate}, raw:() => ${file.startsWith('program') ? 'lastLoadedBaseId' : 'raw'}
  };\n` + source.slice(end);
  vm.runInContext(source, context);
  return {
    window, nodes, node, reads, member, identity,
    allowed:window.__test.allowed,
    load:window.__test.load,
    raw:window.__test.raw,
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
