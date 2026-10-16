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
function sharedServer() {
  let clock = Date.now();
  let nextUpdateHook = null;
  const tick = () => ++clock;
  const tables = {
    classes: [],
    bases: [{ id: 'base-1', code: 'TEST', name: 'Test Installation', majcom_id: 'majcom-1', active: true }],
    majcoms: [{ id: 'majcom-1', code: 'TEST', name: 'Test Command', active: true }],
    curriculum_versions: [{ id: 'curriculum-1', course_type: 'ASM', version: 'JTS-standard', published: true }],
    evaluation_events: [], evaluations: []
  };
  const writes = [];
  function client(deviceId) {
    return { from(table) {
      const filters = [];
      let action = 'select', payload, one = false;
      const query = {
        select() { return query; },
        order() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        is(key, value) { filters.push(row => value === null ? row[key] == null : row[key] === value); return query; },
        not(key, operator, value) { filters.push(row => operator === 'is' && value === null ? row[key] != null : row[key] !== value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        limit() { return query; },
        maybeSingle() { one = true; return query; },
        single() { one = true; return query; },
        update(value) { action = 'update'; payload = copy(value); return query; },
        insert(value) { action = 'insert'; payload = copy(value); return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
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
            return { data: copy(one ? selected[0] || null : selected), error: null };
          }).then(resolve, reject);
        }
      };
      return query;
    } };
  }
  return { tables, writes, tick, client, beforeNextUpdate(hook) { nextUpdateHook = hook; } };
}

function browser(server, deviceId) {
  const classes = [];
  const tier = { id: '1', source: 'JTS-standard', sections: [{ code: 'M', items: [] }], timers: [] };
  const getClass = id => classes.find(c => c.id === id) || null;
  const store = {
    getClasses: () => classes,
    getClass,
    deviceId: () => deviceId,
    persistCloudMerge() {},
    patchCloudState(id, patch) {
      const c = getClass(id);
      if (c) c.cloudSync = { ...(c.cloudSync || {}), ...patch };
      return c;
    },
    upsertFromCloud(remote, options = {}) {
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
    RAPS_CLOUD: { user: { id: 'enterprise-user' }, role: 'enterprise_admin', connected: true },
    RAPS_SUPABASE: server.client(deviceId),
    TCCC_TIERS: { 1: tier },
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); },
    setTimeout(callback) { scheduled.push(callback); }
  };
  const context = vm.createContext({ window, navigator: { onLine: true }, console,
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(syncSource, context, { filename: 'cloud-sync.js' });
  const api = window.RAPS_CLASS_SYNC;
  function change(id, patch) {
    const c = getClass(id);
    Object.assign(c, patch, { modifiedAt: server.tick(), lastModifiedDeviceId: deviceId });
    c.cloudSync = { ...c.cloudSync, status: 'pending', localModifiedAt: c.modifiedAt };
    return c;
  }
  return {
    api, classes, window, getClass, change,
    createClass() {
      const now = server.tick();
      const c = { id: 'class-1', name: 'TCCC skills assessment', tierId: '1', roster: 'A', date: '2026-10-15',
        scenario: 'Standard scenario', scenarioVersion: '1', courseType: 'initial', scenarioDifficulty: 'standard',
        curriculumId: 'TCCC-TIER1', component: 'ACTIVE_DUTY', majcom: 'TEST',
        homeInstallationId: 'TEST', homeInstallationName: 'Test Installation', trainingLocationType: 'SAME_AS_HOME',
        trainingInstallationId: 'TEST', trainingLocationName: 'Test Installation', location: 'Test Installation',
        status: 'draft', deletedAt: null, closedAt: null, tierSnapshot: copy(tier),
        students: [], createdAt: now, modifiedAt: now, lastModifiedDeviceId: deviceId,
        cloudSync: { enabled: true, status: 'pending', remoteModifiedAt: 0 } };
      classes.push(c);
      return c;
    },
    async flushScheduled() { while (scheduled.length) await scheduled.shift()(); }
  };
}

async function twoBrowsers() {
  const server = sharedServer();
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
  let selectedClass = c;
  const context = vm.createContext({ db: { classes: [c] }, cls: () => selectedClass,
    hasEnterpriseAccess: () => enterprise, isClassClosed: value => !!value.closedAt,
    alert: value => alerts.push(value), prompt: () => 'DELETE', now: () => 123,
    saveDb: id => saves.push({ id, trashAction: copy(c.cloudSync?.trashAction || null) }),
    showHome() { selectedClass = null; }, renderHome() {},
    requestClosedClassArchiveDeletion: value => archiveRequests.push(value.id) });
  for (const name of ['deleteClass', 'restoreDeletedClass']) {
    const marker = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
    const match = marker.exec(source);
    assert.ok(match, `Missing app lifecycle function ${name}`);
    const end = source.indexOf('\n}', match.index) + 2;
    vm.runInContext(source.slice(match.index, end), context);
  }
  return { context, c, alerts, saves, archiveRequests, atHome: () => selectedClass === null };
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
  assert.equal(fixture.c.restoredAt, 123);
  assert.equal(fixture.saves[1].id, 'class-1');
  assert.deepEqual(fixture.saves[1].trashAction, {
    kind: 'restore', requestedAt: 123, expectedDeletedAt: 123, expectedRestoredAt: 37
  });
  assert.equal(fixture.c.cloudSync.enabled, true);
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
