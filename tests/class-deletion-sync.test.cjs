'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const syncSource = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

// Two independent browser globals and class stores share only this fake server.
// The real public class-sync API runs inside each VM; no cloud writes occur.
function sharedServer({ rowCap = Infinity, endRangeErrorCode = null } = {}) {
  let clock = Date.now();
  let nextUpdateHook = null;
  let nextClassFetchPause = null;
  let nextClassPageHook = null;
  const tick = () => ++clock;
  const tables = {
    classes: [],
    bases: [{ id: 'base-1', code: 'TEST', name: 'Test Installation', majcom_id: 'majcom-1', active: true }],
    majcoms: [{ id: 'majcom-1', code: 'TEST', name: 'Test Command', active: true }],
    curriculum_versions: [{ id: 'curriculum-1', course_type: 'ASM', version: 'JTS-standard', published: true }],
    evaluation_events: [], evaluations: []
  };
  const writes = [], reads = [];
  function client(deviceId) {
    return { from(table) {
      const filters = [], equality = {}, orders = [];
      let action = 'select', payload, one = false, from = 0, to = Infinity, limit = Infinity;
      const query = {
        select() { return query; },
        order(key, options = {}) { orders.push({ key, ascending: options.ascending !== false }); return query; },
        range(first, last) { from = first; to = last; return query; },
        eq(key, value) { equality[key] = value; filters.push(row => row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        is(key, value) { filters.push(row => value === null ? row[key] == null : row[key] === value); return query; },
        not(key, operator, value) { filters.push(row => operator === 'is' && value === null ? row[key] != null : row[key] !== value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        limit(value) { limit = value; return query; },
        maybeSingle() { one = true; return query; },
        single() { one = true; return query; },
        update(value) { action = 'update'; payload = copy(value); return query; },
        insert(value) { action = 'insert'; payload = copy(value); return query; },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            const rows = tables[table] || (tables[table] = []);
            if (action === 'update' && nextUpdateHook) {
              const hook = nextUpdateHook;
              nextUpdateHook = null;
              hook({ deviceId, table, payload });
            }
            let selected = rows.filter(row => filters.every(matches => matches(row)));
            if (action !== 'select') writes.push({ deviceId, table, action, payload: copy(payload), affected: action === 'insert' ? 1 : selected.length });
            if (action === 'insert') {
              if (rows.some(row => row.id === payload.id)) return { data: null, error: { code: '23505', message: 'Duplicate id' } };
              const row = { created_at: new Date(tick()).toISOString(), ...payload, updated_at: new Date(tick()).toISOString() };
              rows.push(row);
              selected = [row];
            } else if (action === 'update') {
              selected.forEach(row => Object.assign(row, payload, { updated_at: new Date(tick()).toISOString() }));
            }
            if (action === 'select') {
              const totalMatching = selected.length;
              selected.sort((left, right) => {
                for (const order of orders) {
                  const a = left[order.key], b = right[order.key];
                  if (a === b) continue;
                  return (a < b ? -1 : 1) * (order.ascending ? 1 : -1);
                }
                return 0;
              });
              if (!one) selected = selected.slice(from, from + Math.min(rowCap, limit, to - from + 1));
              reads.push({ deviceId, table, equality: copy(equality), orders: copy(orders), from, to, returned: selected.length });
              if (table === 'classes' && !one && from > 0 && from >= totalMatching && endRangeErrorCode) {
                return { data: null, error: { code: endRangeErrorCode, message: 'Requested range is not satisfiable', status: 416 } };
              }
            }
            const response = { data: copy(one ? selected[0] || null : selected), error: null };
            if (action === 'select' && table === 'classes' && !one && nextClassPageHook) {
              const hook = nextClassPageHook;
              nextClassPageHook = null;
              hook({ deviceId, from, response });
            }
            if (action === 'select' && table === 'classes' && one && equality.id && nextClassFetchPause?.deviceId === deviceId) {
              const pause = nextClassFetchPause;
              nextClassFetchPause = null;
              pause.snapshotCaptured();
              await pause.releaseGate;
            }
            return response;
          }).then(resolve, reject);
        }
      };
      return query;
    } };
  }
  return {
    tables, writes, reads, tick, client,
    beforeNextUpdate(hook) { nextUpdateHook = hook; },
    afterNextClassPage(hook) { nextClassPageHook = hook; },
    pauseNextClassFetch(deviceId) {
      let snapshotCaptured, release;
      const snapshotReady = new Promise(resolve => { snapshotCaptured = resolve; });
      const releaseGate = new Promise(resolve => { release = resolve; });
      nextClassFetchPause = { deviceId, snapshotCaptured, releaseGate };
      return { snapshotReady, release };
    }
  };
}

function browser(server, deviceId) {
  const classes = [], statePatches = [];
  const accessRefreshes=[], lifecycleSyncs=[];
  const hidden = new Set(), clientSettings = [];
  const tier = { id: '1', source: 'JTS-standard', sections: [{ code: 'M', items: [] }], timers: [] };
  const getClass = id => classes.find(c => c.id === id) || null;
  const store = {
    getClasses: () => classes,
    getClass,
    deviceId: () => deviceId,
    isLocalCopyHidden:id => hidden.has(id),
    persistCloudMerge() {},
    patchCloudState(id, patch) {
      const c = getClass(id);
      statePatches.push({ id, patch: copy(patch) });
      if (c) c.cloudSync = { ...(c.cloudSync || {}), ...patch };
      return c;
    },
    upsertFromCloud(remote, options = {}) {
      if (hidden.has(remote.id) && !options.restoreLocalCopy) return null;
      if (options.restoreLocalCopy) hidden.delete(remote.id);
      const index = classes.findIndex(c => c.id === remote.id);
      if (index < 0) classes.push(copy(remote));
      else {
        const current = classes[index];
        classes[index] = { ...current, ...copy(remote), students: options.preserveStudents ? current.students || [] : copy(remote.students || []) };
      }
      return getClass(remote.id);
    }
  };
  const listeners = new Map();
  const scheduled = [];
  const window = {
    RAPS_CLASS_STORE: store,
    RAPS_CLOUD: { user: { id: 'enterprise-user' }, role: 'enterprise_admin', connected: true,
      memberships:[{id:'enterprise-membership',user_id:'enterprise-user',role:'enterprise_admin',active:true,base_id:null,majcom_id:null,starts_at:null,ends_at:null}] },
    RAPS_CLOUD_CONFIG:{ projectUrl:'https://supabase.example.test',publishableKey:'synthetic-anon' },
    RAPS_SUPABASE: { ...server.client(deviceId), auth:{getSession:async () => ({data:{session:{user:{id:window.RAPS_CLOUD.user?.id},access_token:`synthetic-${window.RAPS_CLOUD.user?.id}`}},error:null})} },
    supabase:{createClient:(_url,_key,settings) => {clientSettings.push(settings);return server.client(deviceId);}},
    TCCC_TIERS: { 1: tier },
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatchEvent(event) { if(event.type==='raps-class-access-refresh')accessRefreshes.push(event);if(event.type==='raps-class-lifecycle-synced')lifecycleSyncs.push(event);listeners.get(event.type)?.(event); },
    setTimeout(callback) { scheduled.push(callback); }
  };
  const context = vm.createContext({ window, navigator: { onLine: true }, console,
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(fs.readFileSync(path.join(root,'permissions.js'),'utf8'),context,{filename:'permissions.js'});
  vm.runInContext(syncSource, context, { filename: 'cloud-sync.js' });
  const api = window.RAPS_CLASS_SYNC;
  function change(id, patch) {
    const c = getClass(id);
    Object.assign(c, patch, { modifiedAt: server.tick(), lastModifiedDeviceId: deviceId });
    c.cloudSync = { ...c.cloudSync, status: 'pending', localModifiedAt: c.modifiedAt };
    return c;
  }
  return {
    api, classes, window, getClass, change, statePatches, hidden, clientSettings, context, accessRefreshes, lifecycleSyncs,
    createClass() {
      const now = server.tick();
      const c = { id: 'class-1', name: 'TCCC skills assessment', tierId: '1', roster: 'A', date: '2026-10-15',
        scenario: 'Standard scenario', scenarioVersion: '1', courseType: 'initial', scenarioDifficulty: 'standard',
        curriculumId: 'TCCC-TIER1', component: 'ACTIVE_DUTY', majcom: 'TEST',
        homeInstallationId: 'TEST', homeInstallationName: 'Test Installation', trainingLocationType: 'SAME_AS_HOME',
        trainingInstallationId: 'TEST', trainingLocationName: 'Test Installation', location: 'Test Installation',
        status: 'draft', deletedAt: null, closedAt: null, tierSnapshot: copy(tier),
        students: [], createdAt: now, modifiedAt: now, lastModifiedDeviceId: deviceId,
        localCreatedByUserId:window.RAPS_CLOUD.user.id,
        cloudSync: { enabled: true, status: 'pending', remoteModifiedAt: 0 } };
      classes.push(c);
      return c;
    },
    async flushScheduled() { while (scheduled.length) await scheduled.shift()(); }
  };
}

async function twoBrowsers(options) {
  const server = sharedServer(options);
  const desktop = browser(server, 'desktop');
  const phone = browser(server, 'phone');
  desktop.createClass();
  assert.equal(await desktop.api.pushClass(desktop.getClass('class-1')), true);
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').deletedAt, null);
  return { server, desktop, phone };
}

function requestTrashAction(server, device, kind) {
  const c = device.getClass('class-1');
  const requestedAt = server.tick();
  const action = { kind, requestedAt, expectedDeletedAt: Number(c.deletedAt || 0), expectedRestoredAt: Number(c.restoredAt || 0) };
  const patch = { deletedAt: kind === 'delete' ? requestedAt : null };
  if (kind === 'restore') patch.restoredAt = requestedAt;
  device.change('class-1', patch);
  device.getClass('class-1').cloudSync.trashAction = action;
  return requestedAt;
}

function archiveOnServer(server) {
  const row = server.tables.classes[0];
  const removedAt = server.tick();
  row.status = 'archived';
  row.app_data.deletedAt = removedAt;
  row.client_modified_at = new Date(removedAt).toISOString();
  row.updated_at = new Date(removedAt).toISOString();
  row.source_device_id = 'desktop';
  return removedAt;
}

function completeOnServer(server) {
  const row = server.tables.classes[0];
  const closedAt = server.tick();
  row.status = 'completed';
  row.app_data.closedAt = closedAt;
  row.app_data.closedBy = 'enterprise-user';
  row.client_modified_at = new Date(closedAt).toISOString();
  row.updated_at = new Date(closedAt).toISOString();
  return closedAt;
}

function useLegacyMetadataBaseline(device) {
  const c = device.getClass('class-1');
  const baseline = JSON.parse(c.cloudSync.baseMetadataSignature);
  delete baseline.deletedAt;
  delete baseline.restoredAt;
  c.cloudSync.baseMetadataSignature = JSON.stringify(baseline);
}

function addNewerClasses(server, count = 4) {
  const template = copy(server.tables.classes.find(row => row.id === 'class-1'));
  for (let index = 0; index < count; index++) {
    const at = new Date(server.tick()).toISOString();
    server.tables.classes.push({ ...copy(template), id: `aaa-newer-${index}`, name: `Newer class ${index}`,
      status: 'draft', app_data: { ...copy(template.app_data), deletedAt: null }, updated_at: at, client_modified_at: at });
  }
}

test('disabled legacy trash outside the first capped page is published from the original desktop', async () => {
  const { server, desktop, phone } = await twoBrowsers({ rowCap: 2 });
  const local = desktop.getClass('class-1');
  local.deletedAt = server.tick();
  local.cloudSync = { ...local.cloudSync, enabled: false, status: 'local' };
  useLegacyMetadataBaseline(desktop);
  addNewerClasses(server);
  await desktop.api.syncAll({ silent: true });
  const row = server.tables.classes.find(c => c.id === 'class-1');
  assert.equal(row.status, 'archived');
  assert.equal(row.app_data.deletedAt, local.deletedAt);
  await phone.api.pullVisibleClasses();
  assert.ok(phone.getClass('class-1').deletedAt);
});

test('legacy trash falsely marked synced outside the first capped page publishes a tombstone', async () => {
  const { server, desktop, phone } = await twoBrowsers({ rowCap: 2 });
  const local = desktop.getClass('class-1');
  local.deletedAt = server.tick();
  local.cloudSync.status = 'synced';
  useLegacyMetadataBaseline(desktop);
  addNewerClasses(server);
  await desktop.api.syncAll({ silent: true });
  assert.equal(server.tables.classes.find(c => c.id === 'class-1').status, 'archived');
  await phone.api.pullVisibleClasses();
  assert.ok(phone.getClass('class-1').deletedAt);
});

test('phone consumes older archived rows through every capped page with deterministic ordering', async () => {
  const { server, phone } = await twoBrowsers({ rowCap: 2 });
  const removedAt = archiveOnServer(server);
  addNewerClasses(server);
  const readsBefore = server.reads.length;
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
  assert.equal(phone.classes.length, 5);
  const pages = server.reads.slice(readsBefore).filter(read => read.table === 'classes' && !read.equality.id);
  assert.ok(pages.length >= 3);
  assert.ok(pages.some(page => page.from > 0));
  assert.ok(pages.every(page => page.orders.some(order => order.key === 'id')));
  assert.equal(pages.at(-1).returned, 0, 'a server cap below the requested range must not be mistaken for the final page');
});

test('metadata updates between pages cannot move an archived class out of the phone pull', async () => {
  const { server, phone } = await twoBrowsers({ rowCap: 2 });
  const removedAt = archiveOnServer(server);
  addNewerClasses(server);
  server.afterNextClassPage(({ from }) => {
    assert.equal(from, 0);
    const row = server.tables.classes.find(c => c.id === 'class-1');
    // updated_at ordering would move this old tombstone ahead of the cursor
    // after the first response; ordering by immutable IDs keeps it reachable.
    row.updated_at = new Date(server.tick()).toISOString();
    row.app_data.externalMetadata = 'updated during pagination';
  });
  await phone.api.pullVisibleClasses();
  assert.equal(phone.classes.length, 5);
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
});

test('pagination consumes older tombstones when the terminal range returns PostgREST 416', async () => {
  const { server, phone } = await twoBrowsers({ rowCap: 2, endRangeErrorCode: 'PGRST103' });
  const removedAt = archiveOnServer(server);
  addNewerClasses(server);
  const before = server.reads.length;
  await phone.api.pullVisibleClasses();
  assert.equal(phone.classes.length, 5);
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
  const pages = server.reads.slice(before).filter(read => read.table === 'classes' && !read.equality.id);
  assert.equal(pages.at(-1).from, 5);
  assert.equal(pages.at(-1).returned, 0);
});

test('pagination propagates other server errors rather than treating them as the final page', async () => {
  const server = sharedServer({ rowCap: 2, endRangeErrorCode: '42501' });
  const desktop = browser(server, 'desktop');
  const phone = browser(server, 'phone');
  desktop.createClass();
  await desktop.api.pushClass(desktop.getClass('class-1'));
  await assert.rejects(phone.api.pullVisibleClasses(), { code: '42501' });
});

test('legacy local trash with no server row is explicitly reconciled and publishes a shared tombstone', async () => {
  const { server, desktop, phone } = await twoBrowsers({ rowCap: 2 });
  const local = desktop.getClass('class-1');
  const removedAt = server.tick();
  local.deletedAt = removedAt;
  local.cloudSync = { ...local.cloudSync, enabled: false, status: 'local' };
  server.tables.classes.length = 0;
  const readsBefore = server.reads.length;
  await desktop.api.syncAll({ silent: true });
  const row = server.tables.classes.find(c => c.id === 'class-1');
  assert.ok(row, 'the original deletion must not remain stranded solely in local storage');
  assert.equal(row.status, 'archived');
  assert.equal(row.app_data.deletedAt, removedAt);
  assert.ok(server.reads.slice(readsBefore).some(read => read.table === 'classes' && read.equality.id === 'class-1'));
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
});

test('an active local class stays visible when its server row is absent', async () => {
  const { server, phone } = await twoBrowsers({ rowCap: 2 });
  server.tables.classes.length = 0;
  const writesBefore = server.writes.length;
  await phone.api.syncAll({ silent: true });
  assert.equal(phone.getClass('class-1').deletedAt, null);
  assert.equal(phone.classes.filter(c => !c.deletedAt).length, 1);
  assert.equal(server.writes.length, writesBefore);
});

test('concurrent sync consumes a server deletion after an older in-flight parent fetch returns', async () => {
  const { server, phone } = await twoBrowsers();
  const pause = server.pauseNextClassFetch('phone');
  const pushing = phone.api.pushClass(phone.getClass('class-1'));
  await pause.snapshotReady;
  const removedAt = archiveOnServer(server);
  const syncing = phone.api.syncAll({ silent: true });
  // Let the collection response arrive while the earlier push still holds
  // the class tail. The paused fetch must then return its older active row.
  await new Promise(resolve => setImmediate(resolve));
  pause.release();
  await Promise.all([pushing, syncing]);
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
  assert.equal(phone.classes.filter(c => !c.deletedAt).length, 0);
  assert.equal(phone.getClass('class-1').cloudSync.status, 'synced');
});

test('acknowledged trash is not rescheduled or rewritten on each synchronization', async () => {
  const { server, desktop } = await twoBrowsers({ rowCap: 2 });
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  const deletedAt = desktop.getClass('class-1').deletedAt;
  const writesBefore = server.writes.length;
  const patchesBefore = desktop.statePatches.length;
  await desktop.api.syncAll({ silent: true });
  await desktop.api.syncAll({ silent: true });
  assert.equal(server.writes.length, writesBefore);
  assert.equal(desktop.getClass('class-1').deletedAt, deletedAt);
  assert.equal(desktop.getClass('class-1').cloudSync.status, 'synced');
  assert.equal(desktop.getClass('class-1').cloudSync.trashAction, null);
  assert.equal(desktop.statePatches.slice(patchesBefore).some(({ patch }) => patch.status === 'pending' || patch.trashAction?.kind === 'delete'), false);
});

test('legacy trash repair retains enterprise authorization when an older row is paginated', async () => {
  const { server, phone } = await twoBrowsers({ rowCap: 2 });
  phone.window.RAPS_CLOUD.role = 'evaluator';
  Object.assign(phone.window.RAPS_CLOUD.memberships[0],{role:'evaluator',base_id:'base-1'});
  phone.getClass('class-1').deletedAt = server.tick();
  phone.getClass('class-1').cloudSync = { ...phone.getClass('class-1').cloudSync, enabled: false, status: 'local' };
  addNewerClasses(server);
  const writesBefore = server.writes.length;
  await phone.api.syncAll({ silent: true });
  assert.notEqual(server.tables.classes.find(c => c.id === 'class-1').status, 'archived');
  assert.equal(server.writes.length, writesBefore);
});

test('a foreign-owned queued deletion cannot be published or acknowledged by the current user', async () => {
  const { server, phone } = await twoBrowsers();
  requestTrashAction(server, phone, 'delete');
  const foreignEntry = copy(phone.getClass('class-1').cloudSync.trashAction);
  const calls = { remembered: 0, acknowledged: 0 };
  const store = phone.window.RAPS_CLASS_STORE;
  store.ownsTrashAction = () => false;
  store.rememberTrashAction = () => { calls.remembered++; throw new Error('Foreign outbox must not be replaced'); };
  store.acknowledgeTrashAction = () => { calls.acknowledged++; return true; };
  const before = server.writes.length;
  await phone.api.syncAll({ silent: true });
  assert.equal(server.tables.classes[0].status, 'draft');
  assert.equal(phone.getClass('class-1').deletedAt, null);
  assert.equal(phone.classes.filter(c => !c.deletedAt).length, 1);
  assert.equal(server.writes.length, before);
  assert.deepEqual(calls, { remembered: 0, acknowledged: 0 });
  assert.equal(foreignEntry.kind, 'delete');
});

test('a foreign-owned queued deletion cannot insert a missing shared class tombstone', async () => {
  const { server, phone } = await twoBrowsers();
  requestTrashAction(server, phone, 'delete');
  server.tables.classes.length = 0;
  const calls = { remembered: 0, acknowledged: 0 };
  const store = phone.window.RAPS_CLASS_STORE;
  store.ownsTrashAction = () => false;
  store.rememberTrashAction = () => { calls.remembered++; throw new Error('Foreign outbox must not be replaced'); };
  store.acknowledgeTrashAction = () => { calls.acknowledged++; return true; };
  const before = server.writes.length;
  await phone.api.syncAll({ silent: true });
  assert.equal(server.tables.classes.length, 0);
  assert.equal(server.writes.length, before);
  assert.deepEqual(calls, { remembered: 0, acknowledged: 0 });
  assert.equal(phone.getClass('class-1').cloudSync.status, 'error');
  assert.match(phone.getClass('class-1').cloudSync.error, /another signed-in user/i);
});

test('legacy trash repair adopts a newer restoration on a paginated older class', async () => {
  const { server, phone } = await twoBrowsers({ rowCap: 2 });
  const local = phone.getClass('class-1');
  local.deletedAt = server.tick();
  local.cloudSync = { ...local.cloudSync, enabled: false, status: 'local' };
  const row = server.tables.classes[0];
  const restoredAt = server.tick();
  row.app_data.restoredAt = restoredAt;
  row.client_modified_at = new Date(restoredAt).toISOString();
  row.updated_at = new Date(restoredAt).toISOString();
  addNewerClasses(server);
  await phone.api.syncAll({ silent: true });
  assert.notEqual(row.status, 'archived');
  assert.equal(phone.getClass('class-1').deletedAt, null);
  assert.equal(phone.getClass('class-1').restoredAt, restoredAt);
});

test('legacy trash repair adopts completed retention state on a paginated older class', async () => {
  const { server, phone } = await twoBrowsers({ rowCap: 2 });
  const local = phone.getClass('class-1');
  local.deletedAt = server.tick();
  local.cloudSync = { ...local.cloudSync, enabled: false, status: 'local' };
  const closedAt = completeOnServer(server);
  addNewerClasses(server);
  const writesBefore = server.writes.length;
  await phone.api.syncAll({ silent: true });
  assert.equal(server.tables.classes.find(c => c.id === 'class-1').status, 'completed');
  assert.equal(phone.getClass('class-1').closedAt, closedAt);
  assert.equal(phone.getClass('class-1').deletedAt, null);
  assert.equal(server.writes.length, writesBefore);
});

test('delete-only desktop change archives the cloud class and hides it after phone pull', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  phone.getClass('class-1').students.push({ id: 'local-student', attempts: { 1: { id: 'local-evaluation', ratings: { M1: 'pass' } } } });
  const removedAt = requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.deletedAt, removedAt);
  const writesBeforePull = server.writes.length;
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
  assert.equal(phone.classes.filter(c => !c.deletedAt).length, 0);
  assert.equal(phone.getClass('class-1').students[0].attempts[1].ratings.M1, 'pass');
  assert.equal(server.writes.length, writesBeforePull, 'pulling the tombstone must remain read-only');
});

test('a stale phone metadata push cannot resurrect a class deleted on desktop', async () => {
  const { server, phone } = await twoBrowsers();
  phone.change('class-1', { name: 'Offline phone rename' });
  // Seed a tombstone independently so this also tests stale-device protection
  // when deletion came from a different app build or administrative client.
  const removedAt = archiveOnServer(server);
  await phone.api.pushClass(phone.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.deletedAt, removedAt);
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
  assert.equal(phone.classes.filter(c => !c.deletedAt).length, 0);
});

test('phone pull consumes an otherwise identical server tombstone', async () => {
  const { server, phone } = await twoBrowsers();
  const removedAt = archiveOnServer(server);
  const writesBeforePull = server.writes.length;
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
  assert.equal(server.writes.length, writesBeforePull);
});

test('remote deletion wins an existing local metadata conflict without losing local assessments', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  phone.getClass('class-1').students.push({ id: 'local-student', attempts: { 1: { id: 'local-evaluation', ratings: { M1: 'fail' } } } });
  phone.change('class-1', { name: 'Phone branch' });
  desktop.change('class-1', { name: 'Desktop branch' });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').cloudSync.status, 'conflict');
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  await phone.api.pullVisibleClasses();
  assert.ok(phone.getClass('class-1').deletedAt, 'the phone must consume the deletion even when its metadata was conflicted');
  assert.equal(phone.getClass('class-1').students[0].attempts[1].ratings.M1, 'fail');
  await phone.api.pushClass(phone.getClass('class-1'), { forceConflict: true });
  assert.equal(server.tables.classes[0].status, 'archived');
});

test('explicit enterprise restore is synchronized and a stale archived browser cannot re-delete it', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  await phone.api.pullVisibleClasses();
  assert.ok(phone.getClass('class-1').deletedAt);
  const restoredAt = requestTrashAction(server, desktop, 'restore');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  const row = server.tables.classes[0];
  assert.notEqual(row.status, 'archived');
  assert.equal(row.app_data.deletedAt, null);
  assert.ok(Number(row.app_data.restoredAt) >= restoredAt);
  const durableRestoredAt = row.app_data.restoredAt;
  await phone.api.pushClass(phone.getClass('class-1'), { forceConflict: true });
  assert.notEqual(row.status, 'archived', 'stale deletedAt cannot beat an explicit newer restore');
  assert.equal(row.app_data.restoredAt, durableRestoredAt);
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').deletedAt, null);
  assert.equal(phone.getClass('class-1').restoredAt, durableRestoredAt);
});

test('an old queued deletion cannot undo a later explicit restoration', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  requestTrashAction(server, phone, 'delete');
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  requestTrashAction(server, desktop, 'restore');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  const restoredAt = server.tables.classes[0].app_data.restoredAt;
  assert.ok(restoredAt);
  await phone.api.pushClass(phone.getClass('class-1'));
  assert.notEqual(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.restoredAt, restoredAt);
  assert.equal(server.tables.classes[0].app_data.deletedAt, null);
});

test('trash patch preserves another device metadata edits and unknown application data', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  phone.change('class-1', { name: 'Latest phone name' });
  await phone.api.pushClass(phone.getClass('class-1'));
  server.tables.classes[0].app_data.futureExtension = { keep: true };
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].name, 'Latest phone name');
  assert.deepEqual(server.tables.classes[0].app_data.futureExtension, { keep: true });
});

test('non-enterprise explicit trash intent cannot archive or restore a shared class', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  phone.window.RAPS_CLOUD.role = 'evaluator';
  Object.assign(phone.window.RAPS_CLOUD.memberships[0],{role:'evaluator',base_id:'base-1'});
  requestTrashAction(server, phone, 'delete');
  await phone.api.pushClass(phone.getClass('class-1'));
  assert.notEqual(server.tables.classes[0].status, 'archived');
  archiveOnServer(server);
  await desktop.api.pullVisibleClasses();
  await phone.api.pullVisibleClasses();
  requestTrashAction(server, phone, 'restore');
  await phone.api.pushClass(phone.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
});

test('an enterprise browser migrates an existing unsynchronized local trash entry', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  const removedAt = server.tick();
  desktop.change('class-1', { deletedAt: removedAt });
  assert.equal(desktop.getClass('class-1').cloudSync.trashAction, undefined);
  await desktop.api.syncAll({ silent: true });
  assert.equal(server.tables.classes[0].status, 'archived');
  await phone.api.pullVisibleClasses();
  assert.ok(phone.getClass('class-1').deletedAt);
});

test('legacy local trash falsely marked synced is migrated instead of silently discarded', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  const c = desktop.getClass('class-1');
  c.deletedAt = server.tick();
  c.cloudSync.status = 'synced';
  useLegacyMetadataBaseline(desktop);
  await desktop.api.syncAll({ silent: true });
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(desktop.getClass('class-1').cloudSync.status, 'synced');
  await phone.api.pullVisibleClasses();
  assert.ok(phone.getClass('class-1').deletedAt);
});

test('old fingerprint migration preserves a local metadata edit without inventing a conflict', async () => {
  const { server, phone } = await twoBrowsers();
  useLegacyMetadataBaseline(phone);
  phone.change('class-1', { name: 'Phone edit after app update' });
  assert.equal(await phone.api.pushClass(phone.getClass('class-1')), true);
  assert.equal(server.tables.classes[0].name, 'Phone edit after app update');
  assert.equal(phone.getClass('class-1').cloudSync.status, 'synced');
});

test('old fingerprint migration accepts a server-only metadata edit without inventing a conflict', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  useLegacyMetadataBaseline(phone);
  desktop.change('class-1', { name: 'Desktop edit after app update' });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  await phone.api.pullVisibleClasses();
  assert.equal(phone.getClass('class-1').name, 'Desktop edit after app update');
  assert.equal(phone.getClass('class-1').cloudSync.status, 'synced');
  assert.equal(server.tables.classes[0].status, 'draft');
});

test('an archive racing a metadata update rejects its CAS and cannot be resurrected', async () => {
  const { server, phone } = await twoBrowsers();
  phone.change('class-1', { name: 'Stale metadata update' });
  const before = server.writes.length;
  let removedAt;
  server.beforeNextUpdate(({ table }) => {
    assert.equal(table, 'classes');
    const row = server.tables.classes[0];
    const priorRevision = row.client_modified_at, priorUpdatedAt = row.updated_at;
    removedAt = archiveOnServer(server);
    // The status predicate must also protect the row if a lifecycle writer
    // changes status without advancing either timestamp.
    row.client_modified_at = priorRevision;
    row.updated_at = priorUpdatedAt;
  });
  await phone.api.pushClass(phone.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.deletedAt, removedAt);
  assert.equal(phone.getClass('class-1').deletedAt, removedAt);
  assert.equal(server.writes.slice(before).filter(write => write.affected > 0).length, 0);
});

test('a completion racing a metadata update remains a closed retention record', async () => {
  const { server, phone } = await twoBrowsers();
  phone.change('class-1', { name: 'Stale metadata update' });
  const before = server.writes.length;
  let closedAt;
  server.beforeNextUpdate(() => { closedAt = completeOnServer(server); });
  await phone.api.pushClass(phone.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'completed');
  assert.equal(server.tables.classes[0].app_data.closedAt, closedAt);
  assert.equal(phone.getClass('class-1').closedAt, closedAt);
  assert.equal(server.writes.slice(before).filter(write => write.affected > 0).length, 0);
});

test('a completion racing a trash delete PATCH cannot archive the completed class', async () => {
  const { server, desktop } = await twoBrowsers();
  requestTrashAction(server, desktop, 'delete');
  const before = server.writes.length;
  let closedAt;
  server.beforeNextUpdate(() => { closedAt = completeOnServer(server); });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'completed');
  assert.equal(server.tables.classes[0].app_data.closedAt, closedAt);
  assert.equal(server.tables.classes[0].app_data.deletedAt, null);
  assert.equal(desktop.getClass('class-1').closedAt, closedAt);
  assert.equal(server.writes.slice(before).filter(write => write.affected > 0).length, 0);
});

test('a completion racing an explicit restore PATCH cannot reopen the completed class', async () => {
  const { server, desktop } = await twoBrowsers();
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  requestTrashAction(server, desktop, 'restore');
  const before = server.writes.length;
  let closedAt;
  server.beforeNextUpdate(() => { closedAt = completeOnServer(server); });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'completed');
  assert.equal(server.tables.classes[0].app_data.closedAt, closedAt);
  assert.equal(desktop.getClass('class-1').closedAt, closedAt);
  assert.equal(server.writes.slice(before).filter(write => write.affected > 0).length, 0);
});

test('a replacement deletion racing a restore PATCH requires a new explicit restore', async () => {
  const { server, desktop } = await twoBrowsers();
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  requestTrashAction(server, desktop, 'restore');
  const before = server.writes.length;
  let latestDeletedAt;
  server.beforeNextUpdate(() => { latestDeletedAt = archiveOnServer(server); });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.deletedAt, latestDeletedAt);
  assert.equal(desktop.getClass('class-1').deletedAt, latestDeletedAt);
  assert.equal(server.writes.slice(before).filter(write => write.affected > 0).length, 0);
});

test('a newer local restore survives an in-flight delete acknowledgement and syncs next', async () => {
  const { server, desktop } = await twoBrowsers();
  const deletedAt = requestTrashAction(server, desktop, 'delete');
  let restoredAt;
  server.beforeNextUpdate(() => { restoredAt = requestTrashAction(server, desktop, 'restore'); });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.deletedAt, deletedAt);
  const pending = desktop.getClass('class-1');
  assert.equal(pending.deletedAt, null);
  assert.equal(pending.cloudSync.status, 'pending');
  assert.equal(pending.cloudSync.trashAction.kind, 'restore');
  assert.equal(pending.cloudSync.trashAction.requestedAt, restoredAt);
  assert.equal(pending.cloudSync.trashAction.expectedDeletedAt, deletedAt);
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.notEqual(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.deletedAt, null);
  assert.equal(server.tables.classes[0].app_data.restoredAt, restoredAt);
  assert.equal(desktop.getClass('class-1').cloudSync.status, 'synced');
  assert.equal(desktop.getClass('class-1').cloudSync.trashAction, null);
});

test('a newer local delete survives an in-flight restore acknowledgement and syncs next', async () => {
  const { server, desktop } = await twoBrowsers();
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  const restoredAt = requestTrashAction(server, desktop, 'restore');
  let deletedAt;
  server.beforeNextUpdate(() => { deletedAt = requestTrashAction(server, desktop, 'delete'); });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.notEqual(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.restoredAt, restoredAt);
  const pending = desktop.getClass('class-1');
  assert.equal(pending.deletedAt, deletedAt);
  assert.equal(pending.cloudSync.status, 'pending');
  assert.equal(pending.cloudSync.trashAction.kind, 'delete');
  assert.equal(pending.cloudSync.trashAction.requestedAt, deletedAt);
  assert.equal(pending.cloudSync.trashAction.expectedRestoredAt, restoredAt);
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.equal(server.tables.classes[0].app_data.deletedAt, deletedAt);
  assert.equal(server.tables.classes[0].app_data.restoredAt, restoredAt);
  assert.equal(desktop.getClass('class-1').cloudSync.status, 'synced');
  assert.equal(desktop.getClass('class-1').cloudSync.trashAction, null);
});

test('server assessment in progress prevents shared deletion until it is finalized', async () => {
  const { server, desktop } = await twoBrowsers();
  server.tables.evaluation_events.push({ id: 'event-1', class_id: 'class-1' });
  server.tables.evaluations.push({ id: 'evaluation-1', event_id: 'event-1', status: 'in_progress',
    started_at: new Date(server.tick()).toISOString(), completed_at: null });
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.notEqual(server.tables.classes[0].status, 'archived');
  server.tables.evaluations[0].status = 'finalized';
  server.tables.evaluations[0].completed_at = new Date(server.tick()).toISOString();
  requestTrashAction(server, desktop, 'delete');
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(server.tables.classes[0].status, 'archived');
});

test('closed classes remain authoritative retention records on local delete and stale push', async () => {
  const { server, desktop, phone } = await twoBrowsers();
  const row = server.tables.classes[0];
  const closedAt = server.tick();
  row.status = 'completed';
  row.app_data.closedAt = closedAt;
  row.app_data.closedBy = 'enterprise-user';
  row.client_modified_at = new Date(closedAt).toISOString();
  await desktop.api.pullVisibleClasses();
  const writesBefore = server.writes.length;
  desktop.change('class-1', { deletedAt: server.tick() });
  await desktop.api.pushClass(desktop.getClass('class-1'));
  phone.change('class-1', { name: 'Stale active phone' });
  await phone.api.pushClass(phone.getClass('class-1'));
  assert.equal(row.status, 'completed');
  assert.equal(row.app_data.closedAt, closedAt);
  assert.equal(row.app_data.deletedAt, null);
  assert.equal(server.writes.length, writesBefore);
});

function appLifecycleActions({ enterprise, closed = false }) {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const c = { id: 'class-1', name: 'Test class', deletedAt: null, closedAt: closed ? 1 : null, restoredAt: null };
  const alerts = [], saves = [], archiveRequests = [];
  const storage = new Map();
  const outboxPrefix = /const TRASH_OUTBOX_PREFIX\s*=\s*'([^']+)'/.exec(source)?.[1];
  assert.ok(outboxPrefix, 'Missing trash outbox storage key');
  let selectedClass = c;
  const context = vm.createContext({ db: { classes: [c] }, cls: () => selectedClass,
    isClassClosed: value => !!value.closedAt,
    alert: value => alerts.push(value), prompt: () => 'DELETE', now: () => 123,
    currentCloudUserId: () => 'enterprise-user', TRASH_OUTBOX_PREFIX: outboxPrefix,
    navigator: { onLine: true }, window: { RAPS_CLOUD:{user:{id:'enterprise-user'},connected:true,
      memberships:[{id:'test-membership',user_id:'enterprise-user',role:enterprise?'enterprise_admin':'evaluator',base_id:enterprise?null:'base-1',majcom_id:null,active:true}]},addEventListener(){} },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    saveDb: id => saves.push({ id, trashAction: copy(c.cloudSync?.trashAction || null) }),
    showHome() { selectedClass = null; }, renderHome() {},
    requestClosedClassArchiveDeletion: value => archiveRequests.push(value.id) });
  vm.runInContext(fs.readFileSync(path.join(root,'permissions.js'),'utf8'),context,{filename:'permissions.js'});
  for (const name of ['hasEnterpriseAccess','canAccessClass','requireClassAccess','readTrashOutbox', 'rememberTrashAction', 'applyTrashAction', 'queueTrashAction', 'deleteClass', 'restoreDeletedClass']) {
    const marker = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
    const match = marker.exec(source);
    assert.ok(match, `Missing app lifecycle function ${name}`);
    const lineEnd = source.indexOf('\n',match.index);
    const end = source.slice(match.index,lineEnd).trimEnd().endsWith('}') ? lineEnd : source.indexOf('\n}', match.index) + 2;
    vm.runInContext(source.slice(match.index, end), context);
  }
  return { context, c, alerts, saves, archiveRequests, storage, outboxPrefix, atHome: () => selectedClass === null };
}

test('application delete and Home restore save the target class with explicit lifecycle markers', async () => {
  const fixture = appLifecycleActions({ enterprise: true });
  fixture.c.restoredAt = 37;
  await vm.runInContext('deleteClass()', fixture.context);
  assert.equal(fixture.c.deletedAt, 123);
  assert.equal(fixture.atHome(), true);
  assert.equal(fixture.saves[0].id, 'class-1');
  assert.deepEqual(fixture.saves[0].trashAction, {
    kind: 'delete', requestedAt: 123, expectedDeletedAt: 0, expectedRestoredAt: 37
  });
  // Restoration occurs with no selected class, exactly as it does on Home.
  await vm.runInContext('restoreDeletedClass("class-1")', fixture.context);
  assert.equal(fixture.c.deletedAt, null);
  assert.equal(fixture.c.restoredAt, 124);
  assert.equal(fixture.saves[1].id, 'class-1');
  assert.deepEqual(fixture.saves[1].trashAction, {
    kind: 'restore', requestedAt: 124, expectedDeletedAt: 123, expectedRestoredAt: 37
  });
  assert.equal(fixture.c.cloudSync.enabled, true);
  assert.deepEqual(JSON.parse(fixture.storage.get(fixture.outboxPrefix + 'class-1')), {
    classId: 'class-1', userId: 'enterprise-user', action: fixture.saves[1].trashAction
  });
});

test('application delete and restore actions reject non-enterprise users', async () => {
  const fixture = appLifecycleActions({ enterprise: false });
  await vm.runInContext('deleteClass()', fixture.context);
  await vm.runInContext('restoreDeletedClass("class-1")', fixture.context);
  assert.equal(fixture.c.deletedAt, null);
  assert.equal(fixture.saves.length, 0);
  assert.equal(fixture.archiveRequests.length, 0);
  assert.equal(fixture.alerts.length, 2);
});

test('application closed-class deletion routes through archive controls and cannot use normal restore', async () => {
  const fixture = appLifecycleActions({ enterprise: true, closed: true });
  await vm.runInContext('deleteClass()', fixture.context);
  await vm.runInContext('restoreDeletedClass("class-1")', fixture.context);
  assert.deepEqual(fixture.archiveRequests, ['class-1']);
  assert.equal(fixture.c.deletedAt, null);
  assert.equal(fixture.saves.length, 0);
  assert.equal(fixture.alerts.length, 1);
});

function useRole(device, role, overrides={}) {
  const userId = overrides.userId || 'enterprise-user';
  device.window.RAPS_CLOUD = { user:{id:userId},role,connected:true,memberships:[{
    id:`${role}-membership`,user_id:userId,role,active:true,starts_at:null,ends_at:null,
    base_id:['evaluator','program_manager'].includes(role)?'base-1':null,
    majcom_id:role==='majcom_manager'?'majcom-1':null,...overrides
  }] };
}

test('automatic synchronization preserves device exclusions until an explicit class reload', async () => {
  const {server,desktop,phone}=await twoBrowsers();
  phone.classes.length=0;
  phone.hidden.add('class-1');
  const before=server.writes.length;
  assert.equal(await phone.api.pullVisibleClasses(),0);
  await phone.api.syncAll({silent:true});
  assert.equal(phone.getClass('class-1'),null);
  assert.equal(phone.hidden.has('class-1'),true);
  assert.equal(server.writes.length,before);
  assert.equal(await phone.api.loadClass('class-1'),true);
  assert.equal(phone.hidden.has('class-1'),false);
  assert.equal(phone.getClass('class-1').name,desktop.getClass('class-1').name);
  assert.equal(phone.api.classMetadataSignature(phone.getClass('class-1')),phone.getClass('class-1').cloudSync.baseMetadataSignature);
});

test('removing a copy while a pull is in flight cannot reimport it', async () => {
  const {server,phone}=await twoBrowsers();
  phone.classes.length=0;
  server.afterNextClassPage(()=>phone.hidden.add('class-1'));
  assert.equal(await phone.api.pullVisibleClasses(),0);
  assert.equal(phone.getClass('class-1'),null);
  assert.equal(phone.hidden.has('class-1'),true);
});

test('sign-out during a class fetch suppresses writes and local state changes', async () => {
  const {server,phone}=await twoBrowsers();
  phone.change('class-1',{name:'Pending old account change'});
  const gate=server.pauseNextClassFetch('phone');
  const beforeWrites=server.writes.length,beforePatches=phone.statePatches.length;
  const request=phone.api.pushClass(phone.getClass('class-1'));
  await gate.snapshotReady;
  phone.window.RAPS_CLOUD={user:null,connected:false,memberships:[]};
  gate.release();
  assert.equal(await request,false);
  assert.equal(server.writes.length,beforeWrites);
  assert.equal(phone.statePatches.length,beforePatches);
});

test('a full-sync push stops if that local class is excluded during its fetch', async () => {
  const {server,phone}=await twoBrowsers();
  phone.change('class-1',{name:'Pending local metadata'});
  const gate=server.pauseNextClassFetch('phone');
  const before=server.writes.length;
  const request=phone.api.syncAll({silent:true});
  await gate.snapshotReady;
  phone.hidden.add('class-1');
  const beforePatches=phone.statePatches.length;
  gate.release();
  await request;
  assert.equal(server.writes.length,before);
  assert.equal(phone.statePatches.length,beforePatches);
});

test('queued class pushes retain the account that queued them', async () => {
  const {server,phone}=await twoBrowsers();
  phone.change('class-1',{name:'Old-account queued change'});
  const gate=server.pauseNextClassFetch('phone');
  const first=phone.api.pushClass(phone.getClass('class-1'));
  await gate.snapshotReady;
  const queued=phone.api.pushClass(phone.getClass('class-1'));
  const before=server.writes.length,created=phone.clientSettings.length;
  useRole(phone,'enterprise_admin',{userId:'new-enterprise-user'});
  gate.release();
  assert.equal(await first,false);
  assert.equal(await queued,false);
  assert.equal(server.writes.length,before);
  assert.equal(phone.clientSettings.length,created);
});

test('cached, expired, inactive, missing, and offline memberships cannot perform live class synchronization', async () => {
  for (const invalid of ['cached','expired','inactive','missing','offline']) {
    const server=sharedServer(),device=browser(server,invalid);
    device.createClass();
    if(invalid==='cached')device.window.RAPS_CLOUD.offlineCached=true;
    if(invalid==='expired')device.window.RAPS_CLOUD.memberships[0].ends_at='2000-01-01T00:00:00Z';
    if(invalid==='inactive')device.window.RAPS_CLOUD.memberships[0].active=false;
    if(invalid==='missing')device.window.RAPS_CLOUD.memberships=[];
    if(invalid==='offline')vm.runInContext('navigator.onLine=false',device.context);
    assert.equal(await device.api.pushClass(device.getClass('class-1')),false,invalid);
    assert.equal(await device.api.pullVisibleClasses(),0,invalid);
    assert.equal(server.writes.length,0);
    assert.equal(server.reads.length,0);
    assert.equal(device.clientSettings.length,0);
  }
});

test('background synchronization never assigns unknown or another account local classes to the current user', async () => {
  for(const role of ['enterprise_admin','evaluator','program_manager']) {
    for(const owner of ['', 'other-user']) {
      const server=sharedServer(),device=browser(server,`${role}-${owner}`);
      useRole(device,role);
      const c=device.createClass();
      delete c.localCreatedByUserId;
      if(owner)c.localCreatedByUserId=owner;
      const before=server.writes.length;
      assert.equal(await device.api.pushClass(c),false,`${role}/${owner}`);
      await device.api.syncAll({silent:true});
      assert.equal(server.writes.length,before);
      assert.equal(server.tables.classes.length,0);
      assert.equal(c.localCreatedByUserId,owner || undefined);
    }
  }
  const server=sharedServer(),device=browser(server,'inconsistent-owner');
  const c=device.createClass();
  c.cloudSync.createdBy='other-user';
  assert.equal(await device.api.pushClass(c),false);
  assert.equal(server.writes.length,0);
});

test('class operations bind their bearer token and abort session changes before client creation', async () => {
  const server=sharedServer(),device=browser(server,'bound');
  device.createClass();
  assert.equal(await device.api.pushClass(device.getClass('class-1')),true);
  const settings=device.clientSettings[0];
  assert.equal(settings.global.headers.Authorization,'Bearer synthetic-enterprise-user');
  assert.equal(settings.auth.persistSession,false);
  assert.equal(settings.auth.autoRefreshToken,false);
  assert.equal(settings.auth.detectSessionInUrl,false);
  let release;
  device.window.RAPS_SUPABASE.auth.getSession=()=>new Promise(resolve=>{release=resolve;});
  const request=device.api.pullVisibleClasses();
  await new Promise(resolve=>setImmediate(resolve));
  const before=device.clientSettings.length;
  useRole(device,'enterprise_admin',{userId:'replacement-user'});
  release({data:{session:{user:{id:'enterprise-user'},access_token:'stale-token'}},error:null});
  assert.equal(await request,0);
  assert.equal(device.clientSettings.length,before);
});

test('relational class scope overrides editable app metadata for reads and writes', async () => {
  const {server,phone}=await twoBrowsers();
  server.tables.bases.push({id:'base-2',code:'OTHER',name:'Other Installation',majcom_id:'majcom-2',active:true});
  server.tables.majcoms.push({id:'majcom-2',code:'OTHER',name:'Other Command',active:true});
  const row=server.tables.classes[0];
  row.base_id='base-2';
  row.app_data.homeInstallationId='TEST';
  row.app_data.cloudScope={baseId:'base-1',majcomId:'majcom-1'};
  useRole(phone,'program_manager');
  const before=server.writes.length;
  phone.change('class-1',{name:'Attempted cross-scope update'});
  assert.equal(await phone.api.pushClass(phone.getClass('class-1')),false);
  phone.classes.length=0;
  assert.equal(await phone.api.pullVisibleClasses(),0);
  assert.equal(server.writes.length,before);
  await assert.rejects(phone.api.loadClass('class-1'),/access/);
});

test('Program Managers cannot move an existing class outside their installation', async () => {
  const {server,phone}=await twoBrowsers();
  server.tables.bases.push({id:'base-2',code:'OTHER',name:'Other Installation',majcom_id:'majcom-1',active:true});
  useRole(phone,'program_manager');
  phone.change('class-1',{homeInstallationId:'OTHER',homeInstallationName:'Other Installation'});
  const before=server.writes.length;
  assert.equal(await phone.api.pushClass(phone.getClass('class-1')),false);
  assert.equal(server.tables.classes[0].base_id,'base-1');
  assert.equal(server.writes.length,before);
});

test('MAJCOM oversight reads its command without class administration', async () => {
  const {server,phone}=await twoBrowsers();
  phone.classes.length=0;
  useRole(phone,'majcom_manager');
  assert.equal(await phone.api.pullVisibleClasses(),1);
  phone.change('class-1',{name:'Oversight cannot edit'});
  const before=server.writes.length;
  assert.equal(await phone.api.pushClass(phone.getClass('class-1')),false);
  assert.equal(server.writes.length,before);
});

test('class and event evaluator assignments grant read/evaluate access without metadata administration', async () => {
  for (const assignment of ['class','event']) {
    const {server,phone}=await twoBrowsers({rowCap:2});
    phone.classes.length=0;
    useRole(phone,'evaluator',{userId:'assigned-evaluator'});
    if(assignment==='class')server.tables.class_evaluators=[
      ...['aaa-1','aaa-2','aaa-3'].map(class_id=>({class_id,evaluator_id:'assigned-evaluator'})),
      {class_id:'class-1',evaluator_id:'assigned-evaluator'}];
    else server.tables.event_evaluators=[
      ...['aaa-1','aaa-2','aaa-3'].map(event_id=>({event_id,evaluator_id:'assigned-evaluator',evaluation_events:{class_id:'other'}})),
      {event_id:'separate-event',evaluator_id:'assigned-evaluator',evaluation_events:{class_id:'class-1'}}];
    assert.equal(await phone.api.pullVisibleClasses(),1,assignment);
    const c=phone.getClass('class-1');
    assert.equal(c.cloudScope.baseId,'base-1');
    assert.equal(c.cloudScope.majcomId,'majcom-1');
    assert.equal(c.cloudAccess.userId,'assigned-evaluator');
    assert.equal(c.cloudAccess.assignedEvaluator,true);
    assert.equal(phone.window.RAPS_PERMISSIONS.canClass('evaluate',c),true);
    phone.change('class-1',{name:'Assigned does not own metadata'});
    const before=server.writes.length;
    assert.equal(await phone.api.pushClass(c),false);
    assert.equal(server.writes.length,before);
  }
});

test('fresh assignment reads revoke cached access even when RLS no longer returns the class', async () => {
  for(const assignment of ['class','event']) {
    const {server,phone}=await twoBrowsers();
    phone.classes.length=0;
    useRole(phone,'evaluator',{userId:'assigned-evaluator'});
    if(assignment==='class')server.tables.class_evaluators=[{class_id:'class-1',evaluator_id:'assigned-evaluator'}];
    else server.tables.event_evaluators=[{event_id:'separate-event',evaluator_id:'assigned-evaluator',evaluation_events:{class_id:'class-1'}}];
    assert.equal(await phone.api.pullVisibleClasses(),1);
    const local=phone.getClass('class-1');
    local.students=[{id:'retained-learner',name:'Retained locally'}];
    assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',local),true);
    server.tables.class_evaluators=[];
    server.tables.event_evaluators=[];
    server.tables.classes=[]; // The authoritative row is now hidden by RLS.
    const before=phone.accessRefreshes.length;
    assert.equal(await phone.api.pullVisibleClasses(),0);
    assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',local),false);
    assert.equal(phone.window.RAPS_PERMISSIONS.canClass('evaluate',local),false);
    assert.equal(local.cloudAccess.assignedEvaluator,false);
    assert.equal(local.students[0].id,'retained-learner');
    assert.equal(phone.accessRefreshes.length,before+1);
  }
});

test('metadata equality and conflicts cannot retain revoked evaluator assignments', async () => {
  for(const conflict of [false,true]) {
    const {server,phone}=await twoBrowsers();
    useRole(phone,'majcom_manager');
    server.tables.class_evaluators=[{class_id:'class-1',evaluator_id:'enterprise-user'}];
    await phone.api.pullVisibleClasses();
    const local=phone.getClass('class-1');
    assert.equal(phone.window.RAPS_PERMISSIONS.canClass('evaluate',local),true);
    if(conflict) {
      phone.change('class-1',{name:'Unresolved local name'});
      local.cloudSync.status='conflict';
      server.tables.classes[0].name='Concurrent remote name';
    }
    server.tables.class_evaluators=[];
    await phone.api.pullVisibleClasses();
    assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',local),true);
    assert.equal(phone.window.RAPS_PERMISSIONS.canClass('evaluate',local),false);
    if(conflict)assert.equal(local.name,'Unresolved local name');
  }
});

test('fresh organizational catalogs remove stale command scope from retained copies', async () => {
  const {server,phone}=await twoBrowsers();
  useRole(phone,'majcom_manager');
  assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',phone.getClass('class-1')),true);
  server.tables.majcoms.push({id:'majcom-2',code:'OTHER',name:'Other Command',active:true});
  server.tables.bases[0].majcom_id='majcom-2';
  assert.equal(await phone.api.pullVisibleClasses(),0);
  assert.equal(phone.getClass('class-1').cloudScope.majcomId,'majcom-2');
  assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',phone.getClass('class-1')),false);
});

test('fresh catalogs revoke scoped and assigned cached access when the installation or parent command is inactive', async () => {
  for(const inactive of ['base','majcom']) {
    for(const role of ['program_manager','evaluator']) {
      const {server,phone}=await twoBrowsers();
      useRole(phone,role);
      if(role==='evaluator')server.tables.class_evaluators=[{class_id:'class-1',evaluator_id:'enterprise-user'}];
      await phone.api.pullVisibleClasses();
      const local=phone.getClass('class-1');
      assert.equal(local.cloudScope.available,true);
      assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',local),true);
      if(inactive==='base')server.tables.bases[0].active=false;
      else server.tables.majcoms[0].active=false;
      await phone.api.pullVisibleClasses();
      assert.equal(local.cloudScope.baseId,'base-1');
      assert.equal(local.cloudScope.available,false,`${inactive}/${role}`);
      assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',local),false,`${inactive}/${role}`);
      assert.equal(phone.window.RAPS_PERMISSIONS.canClass('evaluate',local),false,`${inactive}/${role}`);
      useRole(phone,'enterprise_admin');
      assert.equal(phone.window.RAPS_PERMISSIONS.canClass('readClass',local),true);
      assert.equal(phone.window.RAPS_PERMISSIONS.canClass('deleteClass',local),true);
    }
  }
});

test('only acknowledged shared-trash lifecycle writes notify reporting dashboards', async () => {
  const { server, desktop } = await twoBrowsers();
  assert.equal(desktop.lifecycleSyncs.length, 0, 'Ordinary class publishing is not a trash lifecycle change');
  requestTrashAction(server, desktop, 'delete');
  assert.equal(desktop.lifecycleSyncs.length, 0, 'Unpublished local intent must not refresh cloud reporting');
  assert.equal(await desktop.api.pushClass(desktop.getClass('class-1')), true);
  assert.equal(server.tables.classes[0].status, 'archived');
  assert.deepEqual(copy(desktop.lifecycleSyncs.map(event => event.detail)), [{ classId:'class-1', action:'delete' }]);
  requestTrashAction(server, desktop, 'restore');
  assert.equal(await desktop.api.pushClass(desktop.getClass('class-1')), true);
  assert.equal(server.tables.classes[0].status, 'draft');
  assert.deepEqual(copy(desktop.lifecycleSyncs.map(event => event.detail)), [
    { classId:'class-1', action:'delete' }, { classId:'class-1', action:'restore' }
  ]);
  await desktop.api.pushClass(desktop.getClass('class-1'));
  assert.equal(desktop.lifecycleSyncs.length, 2, 'Re-reading acknowledged state does not emit another lifecycle write');
});

test('a rejected shared deletion cannot claim cloud reporting was updated', async () => {
  const { server, desktop } = await twoBrowsers();
  server.tables.evaluation_events.push({ id:'class-1', class_id:'class-1' });
  server.tables.evaluations.push({ id:'active-evaluation', event_id:'class-1', status:'in_progress', started_at:new Date().toISOString() });
  requestTrashAction(server, desktop, 'delete');
  assert.equal(await desktop.api.pushClass(desktop.getClass('class-1')), false);
  assert.equal(server.tables.classes[0].status, 'draft');
  assert.equal(desktop.lifecycleSyncs.length, 0);
});
