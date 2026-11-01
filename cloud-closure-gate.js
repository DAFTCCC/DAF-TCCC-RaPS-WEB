(() => {
'use strict';

// Multi-device class closure gate.
//
// The server cannot see records that live only on an offline phone. Every
// phone that synchronizes a class registers with the server for that class.
// After a Program Manager requests closure, the class can close only when every
// registered phone has synchronized with nothing left on it, or a manager has
// released a lost phone with a recorded reason. The server enforces the gate
// (close_class_with_device_gate); this module reports and displays it.

const getStore = () => window.RAPS_CLASS_STORE;
const getCloud = () => window.RAPS_CLOUD;
const getClient = () => window.RAPS_SUPABASE;
let reporting = null;

function isClosed(c) { return !!c && (!!c.closedAt || c.status === 'closed'); }
function rpcMissing(error) {
  const m = String(error?.message || '');
  return error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function|does not exist/i.test(m);
}

// Items on this phone that the server has not confirmed for this class.
function pendingCountFor(c) {
  const permissions = window.RAPS_PERMISSIONS, store = getStore(), uid = String(getCloud()?.user?.id || '');
  let n = 0;
  for (const s of c?.students || []) {
    for (const a of Object.values(s.attempts || {})) {
      if (!a || a.cloudShellOnly || a.voidedAt) continue;
      const mine = !uid || String(a.cloudEvaluatorUserId || a.startedByUserId || '') === uid;
      if (!mine) continue;
      const status = String(a.cloudGrading?.status || '').toLowerCase();
      if (a.pendingServerClaim || a.pendingServerFinalization || a.syncConflict) n++;
      else if (a.startedAt && !a.finalizedAt) n++;
      else if (['pending', 'error', 'offline', 'syncing', 'conflict'].includes(status)) n++;
    }
  }
  n += (store?.getRosterWithdrawals?.(c.id) || []).length;
  if (permissions?.canClass?.('manageClass', c, { online: false }) && c.cloudSync?.status && c.cloudSync.status !== 'synced') n++;
  return n;
}

function deviceLabel() {
  const cloud = getCloud() || {};
  const name = cloud.profile?.display_name || cloud.user?.email || 'Evaluator';
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const id = String(getStore()?.deviceId?.() || '').replace(/^device-/, '').slice(0, 6);
  return `${name} · ${kind} ${id}`.slice(0, 120);
}

async function sessionClient() {
  const client = getClient(), cloud = getCloud();
  if (!client?.rpc || !cloud?.user?.id || cloud.connected !== true || !navigator.onLine) return null;
  const { data } = await client.auth.getSession();
  if (data?.session?.user?.id !== cloud.user.id) return null;
  return client;
}

function rememberGate(c, patch) {
  c.closureGate = { ...(c.closureGate || {}), ...patch };
  getStore()?.persistCloudMerge?.();
}

async function reportClass(client, c) {
  const pending = pendingCountFor(c);
  const { data, error } = await client.rpc('report_class_device_sync', {
    p_class_id: c.id, p_device_id: String(getStore()?.deviceId?.() || ''),
    p_device_label: deviceLabel(), p_pending_count: pending
  });
  if (error) throw error;
  const requestedAt = data?.closureRequestedAt ? Date.parse(data.closureRequestedAt) : 0;
  const reportedAt = data?.reportedAt ? Date.parse(data.reportedAt) : Date.now();
  rememberGate(c, {
    requestedAt: requestedAt || 0,
    lastReportAt: reportedAt,
    pending,
    // Checked in only when clean after the closure request.
    checkedInAt: requestedAt && pending === 0 ? reportedAt : 0
  });
  return { pending, requestedAt };
}

async function reportAll() {
  if (reporting) return reporting;
  reporting = (async () => {
    const store = getStore(), permissions = window.RAPS_PERMISSIONS;
    const client = await sessionClient();
    if (!client || !store) return 0;
    let n = 0;
    for (const c of store.getClasses().filter(x => x?.cloudSync?.enabled && !x.deletedAt && !isClosed(x)
      && !store.isLocalCopyHidden?.(x.id) && permissions?.canClass?.('readClass', x))) {
      try { await reportClass(client, c); n++; }
      catch (error) {
        if (rpcMissing(error)) return n; // server update not deployed yet
        console.warn('Closure check-in failed', c.id, error);
      }
    }
    return n;
  })();
  try { return await reporting; } finally { reporting = null; }
}

async function call(name, args) {
  const client = await sessionClient();
  if (!client) throw new Error('This action needs a connection and a current RaPS sign-in.');
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (rpcMissing(error)) throw new Error('The RaPS server needs the class closure update. Contact the administrator.');
    throw error;
  }
  return data || {};
}

const status = classId => call('class_device_closure_status', { p_class_id: classId });
const requestClosure = classId => call('request_class_closure', { p_class_id: classId });
const releaseDevice = (classId, deviceId, reason) => call('release_class_device', { p_class_id: classId, p_device_id: deviceId, p_reason: reason });
const closeClass = classId => call('close_class_with_device_gate', { p_class_id: classId });

window.RAPS_CLOSURE_GATE = Object.freeze({ reportAll, reportClass, pendingCountFor, deviceLabel, status, requestClosure, releaseDevice, closeClass });
window.RAPS_CLOSURE_GATE_BUILD = '3.4.13-web.1';
})();
