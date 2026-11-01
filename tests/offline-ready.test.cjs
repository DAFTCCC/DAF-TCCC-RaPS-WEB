'use strict';

// Offline Ready: one answer per class to "can this device run today's
// evaluations with no connection?" Runs the real app.js function.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
function functionSource(name) {
  const start = source.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  for (let end = source.indexOf('}', start); end >= 0; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(name);
}

const NOW = 1_800_000_000_000;
function check(overrides = {}) {
  const o = { signedIn: true, identityCached: true, canEvaluate: true, swController: true, idbOk: true, persisted: true,
    synced: true, students: 18, lastSyncedAgoHours: 1, conflicts: 0, ...overrides };
  const c = { id: 'c1', tierSnapshot: { sections: [{ code: 'M' }] },
    cloudSync: { enabled: true, status: o.synced ? 'synced' : 'pending', lastSyncedAt: NOW - o.lastSyncedAgoHours * 3600000 },
    students: Array.from({ length: o.students }, (_, i) => ({ id: 's' + i, attempts: i < o.conflicts ? { 1: { syncConflict: { kind: 'duplicate_attempt' } } } : {} })) };
  const sandbox = {
    window: { RAPS_CLOUD: o.signedIn ? { user: { id: 'u1' } } : {}, RAPS_CLOUD_CONFIG: { identityCacheKey: 'ID' },
      rapsDeviceStorage: o.idbOk ? {} : { error: 'failed' }, rapsStoragePersisted: o.persisted },
    localStorage: { getItem: key => key === 'ID' && o.identityCached ? '{}' : null },
    navigator: { serviceWorker: { controller: o.swController ? {} : null } },
    canAccessClass: () => o.canEvaluate, idbUnavailable: !o.idbOk, now: () => NOW
  };
  vm.runInNewContext(functionSource('offlineReadiness') + '\nthis.result = offlineReadiness(c);', Object.assign(sandbox, { c }));
  return sandbox.result;
}

test('a prepared device is Offline Ready with no warnings', () => {
  const r = check();
  assert.equal(r.ready, true);
  assert.equal(r.blocking.length + r.warnings.length, 0);
});

for (const [name, override, label] of [
  ['no saved sign-in', { identityCached: false }, 'Sign-in saved for offline use'],
  ['not assigned to the class', { canEvaluate: false }, 'You can evaluate in this class'],
  ['app not saved for offline use', { swController: false }, 'App saved for offline use'],
  ['class or roster not downloaded', { synced: false }, 'Class and roster downloaded'],
  ['empty roster', { students: 0 }, 'Class and roster downloaded'],
  ['durable storage unavailable', { idbOk: false }, 'Records protected by durable storage']
]) {
  test(`blocked when ${name}`, () => {
    const r = check(override);
    assert.equal(r.ready, false);
    assert.ok(r.blocking.some(x => x.label === label), JSON.stringify(r.blocking));
    assert.ok(r.blocking.every(x => x.fix), 'Every blocking item names its fix');
  });
}

for (const [name, override, pattern] of [
  ['stale sync', { lastSyncedAgoHours: 30 }, /last 18 hours/],
  ['storage not guaranteed by the browser', { persisted: false }, /keep this app/],
  ['unresolved conflicts', { conflicts: 2 }, /2 sync conflicts/]
]) {
  test(`ready with a warning for ${name}`, () => {
    const r = check(override);
    assert.equal(r.ready, true);
    assert.ok(r.warnings.some(x => pattern.test(x.label)), JSON.stringify(r.warnings));
  });
}
