(() => {
'use strict';

const TIER_TO_COURSE = Object.freeze({ '1':'ASM', '2':'CLS', '3':'CMC', '4':'CPP' });
const COURSE_TO_TIER = Object.freeze({ ASM:'1', CLS:'2', CMC:'3', CPP:'4' });

let refs = null;
let syncing = false;
let lastIdentityUserId = null;

const getStore = () => window.RAPS_CLASS_STORE;
const getCloud = () => window.RAPS_CLOUD;
const getClient = () => window.RAPS_SUPABASE;

function isoFromMs(ms) {
  return Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString() : null;
}
function msFromIso(value) {
  const n = value ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function shortError(error) {
  return String(error?.message || error || 'Unknown sync error').slice(0, 240);
}
function setGlobalStatus(text, mode='') {
  const el = document.getElementById('classSyncStatus');
  if (!el) return;
  el.textContent = text;
  el.dataset.mode = mode;
}
function setButtonBusy(on) {
  const btn = document.getElementById('syncClassesBtn');
  if (!btn) return;
  btn.disabled = !!on;
  btn.textContent = on ? 'Syncing…' : 'Sync Classes';
}
function cloudReady() {
  const cloud = getCloud();
  return !!(getClient() && cloud?.user?.id && (cloud.connected || cloud.offlineCached));
}

async function loadRefs(force=false) {
  if (refs && !force) return refs;
  const client = getClient();
  if (!client) throw new Error('Supabase client is unavailable.');

  const [basesResult, curriculumResult, majcomResult] = await Promise.all([
    client.from('bases').select('id, majcom_id, code, name, active').eq('active', true),
    client.from('curriculum_versions').select('id, course_type, version, title, published').eq('published', true),
    client.from('majcoms').select('id, code, name, active').eq('active', true)
  ]);

  if (basesResult.error) throw basesResult.error;
  if (curriculumResult.error) throw curriculumResult.error;
  if (majcomResult.error) throw majcomResult.error;

  const majcomById = new Map((majcomResult.data || []).map(row => [row.id, row]));
  refs = {
    bases: basesResult.data || [],
    curricula: curriculumResult.data || [],
    majcoms: majcomResult.data || [],
    baseByCode: new Map((basesResult.data || []).filter(x => x.code).map(row => [String(row.code).toUpperCase(), row])),
    curriculumByKey: new Map((curriculumResult.data || []).map(row => [`${row.course_type}|${row.version}`, row])),
    majcomById
  };
  return refs;
}

function serializeAppData(c) {
  return {
    schemaVersion: 1,
    tierId: c.tierId || '',
    roster: c.roster || '',
    scenario: c.scenario || '',
    scenarioVersion: c.scenarioVersion || '1',
    siteCode: c.siteCode || '',
    courseType: c.courseType || 'initial',
    scenarioDifficulty: c.scenarioDifficulty || 'standard',
    scenarioProfile: c.scenarioProfile || '',
    leadEvaluator: c.leadEvaluator || '',
    evaluatorId: c.evaluatorId || '',
    curriculumId: c.curriculumId || '',
    appVersion: c.appVersion || '',
    contentVersion: c.contentVersion || '',
    component: c.component || 'ACTIVE_DUTY',
    majcom: c.majcom || '',
    unit: c.unit || '',
    exercise: c.exercise || '',
    homeInstallationId: c.homeInstallationId || '',
    homeInstallationName: c.homeInstallationName || '',
    homeInstallationState: c.homeInstallationState || '',
    homeInstallationCountry: c.homeInstallationCountry || '',
    trainingLocationType: c.trainingLocationType || 'SAME_AS_HOME',
    trainingInstallationId: c.trainingInstallationId || '',
    trainingLocationName: c.trainingLocationName || '',
    trainingLocationState: c.trainingLocationState || '',
    trainingLocationCountry: c.trainingLocationCountry || '',
    location: c.location || '',
    scenarioNT: Array.isArray(c.scenarioNT) ? c.scenarioNT : [],
    closedAt: c.closedAt || null,
    closedBy: c.closedBy || '',
    deletedAt: c.deletedAt || null
  };
}

function mapLocalStatusToCloud(c) {
  if (c.deletedAt) return 'archived';
  if (c.closedAt || c.status === 'closed') return 'completed';
  if (c.status === 'active') return 'active';
  return 'draft';
}

function resolveBaseForClass(c, loadedRefs) {
  const code = String(c.homeInstallationId || '').toUpperCase();
  return code ? loadedRefs.baseByCode.get(code) || null : null;
}

function resolveCurriculumForClass(c, loadedRefs) {
  const tierId = String(c.tierId || '');
  const course = TIER_TO_COURSE[tierId];
  const version = window.TCCC_TIERS?.[tierId]?.source || c.tierSnapshot?.source || '';
  if (!course || !version) return null;
  return loadedRefs.curriculumByKey.get(`${course}|${version}`) || null;
}

function patchState(classId, patch) {
  getStore()?.patchCloudState(classId, patch);
}

async function fetchRemoteById(id) {
  const client = getClient();
  const { data, error } = await client
    .from('classes')
    .select('id, base_id, name, course_type, curriculum_version_id, start_date, end_date, status, created_by, created_at, updated_at, app_data, client_modified_at, source_device_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function pushClass(c) {
  const client = getClient();
  const cloud = getCloud();
  if (!client || !cloud?.user?.id) return false;

  const loadedRefs = await loadRefs();
  const base = resolveBaseForClass(c, loadedRefs);
  const curriculum = resolveCurriculumForClass(c, loadedRefs);

  if (!base) {
    patchState(c.id, {
      enabled: true,
      status: 'error',
      error: 'Cloud sync requires a catalog home installation.',
      lastAttemptAt: Date.now()
    });
    return false;
  }
  if (!curriculum) {
    patchState(c.id, {
      enabled: true,
      status: 'error',
      error: 'Published curriculum version not found in Supabase.',
      lastAttemptAt: Date.now()
    });
    return false;
  }

  patchState(c.id, { enabled:true, status:'syncing', error:'', lastAttemptAt:Date.now() });

  const existing = await fetchRemoteById(c.id);
  const localModified = Number(c.modifiedAt || c.createdAt || Date.now());
  const remoteModified = msFromIso(existing?.client_modified_at || existing?.updated_at);
  const lastRemoteSeen = Number(c.cloudSync?.remoteModifiedAt || 0);

  if (existing && remoteModified > localModified + 1000 && remoteModified > lastRemoteSeen + 1000) {
    patchState(c.id, {
      enabled: true,
      status: 'conflict',
      error: 'A newer cloud version exists. Pull before overwriting.',
      remoteModifiedAt: remoteModified
    });
    return false;
  }

  const payload = {
    id: c.id,
    base_id: base.id,
    name: c.name || 'Untitled Class',
    course_type: c.courseType || 'initial',
    curriculum_version_id: curriculum.id,
    start_date: c.date || null,
    end_date: c.closedAt ? new Date(c.closedAt).toISOString().slice(0,10) : null,
    status: mapLocalStatusToCloud(c),
    created_by: existing?.created_by || c.cloudSync?.createdBy || cloud.user.id,
    app_data: serializeAppData(c),
    client_modified_at: isoFromMs(localModified),
    source_device_id: getStore()?.deviceId?.() || null
  };

  const { data, error } = await client
    .from('classes')
    .upsert(payload, { onConflict: 'id' })
    .select('id, created_by, updated_at, client_modified_at')
    .single();

  if (error) {
    patchState(c.id, { enabled:true, status:navigator.onLine ? 'error' : 'offline', error:shortError(error) });
    throw error;
  }

  const remoteMs = msFromIso(data?.client_modified_at || data?.updated_at) || localModified;
  patchState(c.id, {
    enabled: true,
    status: 'synced',
    error: '',
    createdBy: data?.created_by || payload.created_by,
    lastSyncedAt: Date.now(),
    localModifiedAt: localModified,
    remoteModifiedAt: remoteMs
  });
  return true;
}

function remoteToLocal(row, loadedRefs) {
  const appData = row.app_data && typeof row.app_data === 'object' ? row.app_data : {};
  const curriculum = loadedRefs.curricula.find(x => x.id === row.curriculum_version_id);
  const tierId = String(appData.tierId || COURSE_TO_TIER[curriculum?.course_type] || '');
  const tier = window.TCCC_TIERS?.[tierId] || null;
  const base = loadedRefs.bases.find(x => x.id === row.base_id) || null;
  const majcom = base ? loadedRefs.majcomById.get(base.majcom_id) : null;
  const remoteModifiedAt = msFromIso(row.client_modified_at || row.updated_at) || Date.now();
  const createdAt = msFromIso(row.created_at) || remoteModifiedAt;

  return {
    id: row.id,
    name: row.name || 'Untitled Class',
    tierId,
    roster: appData.roster || '',
    scenario: appData.scenario || '',
    scenarioVersion: appData.scenarioVersion || '1',
    date: row.start_date || '',
    siteCode: appData.siteCode || '',
    courseType: appData.courseType || row.course_type || 'initial',
    scenarioDifficulty: appData.scenarioDifficulty || 'standard',
    scenarioProfile: appData.scenarioProfile || '',
    leadEvaluator: appData.leadEvaluator || '',
    evaluatorId: appData.evaluatorId || '',
    curriculumId: appData.curriculumId || `TCCC-TIER${tierId}`,
    appVersion: appData.appVersion || window.TCCC_BUILD?.versionName || '',
    createdAt,
    modifiedAt: remoteModifiedAt,
    deviceId: appData.deviceId || '',
    lastModifiedDeviceId: row.source_device_id || '',
    syncStatus: 'CLOUD',
    status: row.status === 'completed' ? 'closed' : row.status === 'archived' ? 'draft' : (row.status || 'draft'),
    closedAt: appData.closedAt || (row.status === 'completed' ? remoteModifiedAt : null),
    closedBy: appData.closedBy || '',
    deletedAt: row.status === 'archived' ? (appData.deletedAt || remoteModifiedAt) : null,
    scenarioNT: Array.isArray(appData.scenarioNT) ? appData.scenarioNT : [],
    students: [],
    contentVersion: appData.contentVersion || (tier ? `${tier.source} | app ${window.TCCC_BUILD?.versionName || ''}` : ''),
    tierSnapshot: tier ? JSON.parse(JSON.stringify(tier)) : null,
    component: appData.component || 'ACTIVE_DUTY',
    majcom: appData.majcom || majcom?.code || '',
    unit: appData.unit || '',
    exercise: appData.exercise || '',
    homeInstallationId: appData.homeInstallationId || base?.code || '',
    homeInstallationName: appData.homeInstallationName || base?.name || '',
    homeInstallationState: appData.homeInstallationState || '',
    homeInstallationCountry: appData.homeInstallationCountry || '',
    trainingLocationType: appData.trainingLocationType || 'SAME_AS_HOME',
    trainingInstallationId: appData.trainingInstallationId || appData.homeInstallationId || base?.code || '',
    trainingLocationName: appData.trainingLocationName || appData.homeInstallationName || base?.name || '',
    trainingLocationState: appData.trainingLocationState || appData.homeInstallationState || '',
    trainingLocationCountry: appData.trainingLocationCountry || appData.homeInstallationCountry || '',
    location: appData.location || appData.trainingLocationName || appData.homeInstallationName || base?.name || '',
    cloudSync: {
      enabled: true,
      status: 'synced',
      error: '',
      createdBy: row.created_by || '',
      lastSyncedAt: Date.now(),
      localModifiedAt: remoteModifiedAt,
      remoteModifiedAt
    }
  };
}

async function pullVisibleClasses() {
  const client = getClient();
  const store = getStore();
  if (!client || !store) return 0;
  const loadedRefs = await loadRefs();

  const { data, error } = await client
    .from('classes')
    .select('id, base_id, name, course_type, curriculum_version_id, start_date, end_date, status, created_by, created_at, updated_at, app_data, client_modified_at, source_device_id')
    .order('updated_at', { ascending:false });

  if (error) throw error;

  let imported = 0;
  for (const row of data || []) {
    const remote = remoteToLocal(row, loadedRefs);
    const local = store.getClass(row.id);
    if (!local) {
      store.upsertFromCloud(remote);
      imported++;
      continue;
    }

    const remoteMs = Number(remote.modifiedAt || 0);
    const localMs = Number(local.modifiedAt || 0);
    const state = local.cloudSync || {};

    if ((state.status === 'pending' || state.status === 'offline' || state.status === 'error') && localMs > Number(state.remoteModifiedAt || 0) + 1000) {
      continue;
    }

    if (remoteMs > localMs + 1000) {
      store.upsertFromCloud(remote, { preserveStudents:true });
      imported++;
    } else {
      patchState(local.id, {
        enabled: true,
        status: 'synced',
        error: '',
        createdBy: row.created_by || state.createdBy || '',
        lastSyncedAt: Date.now(),
        remoteModifiedAt: remoteMs,
        localModifiedAt: localMs
      });
    }
  }
  return imported;
}

async function pushPendingClasses() {
  const store = getStore();
  if (!store) return { attempted:0, synced:0 };
  const classes = store.getClasses().filter(c =>
    c?.cloudSync?.enabled === true &&
    ['pending','offline','error'].includes(c.cloudSync?.status || '')
  );

  let synced = 0;
  for (const c of classes) {
    try {
      if (await pushClass(c)) synced++;
    } catch (error) {
      console.warn('RaPS class sync failed', c.id, error);
    }
  }
  return { attempted:classes.length, synced };
}

async function syncAll({ silent=false }={}) {
  if (syncing) return;
  const cloud = getCloud();
  if (!cloud?.user?.id) return;

  if (!navigator.onLine) {
    setGlobalStatus('Offline · class changes queued locally', 'offline');
    return;
  }

  syncing = true;
  setButtonBusy(true);
  setGlobalStatus('Syncing classes…', 'syncing');

  try {
    refs = null;
    await loadRefs(true);
    const pulled = await pullVisibleClasses();
    const pushed = await pushPendingClasses();
    const total = getStore()?.getClasses()?.filter(c => c?.cloudSync?.enabled)?.length || 0;
    setGlobalStatus(`Cloud classes synced · ${total} managed`, 'synced');
    if (!silent && (pulled || pushed.synced)) {
      console.info(`RaPS class sync complete: ${pulled} pulled, ${pushed.synced} pushed.`);
    }
  } catch (error) {
    console.error('RaPS class sync error', error);
    setGlobalStatus(`Class sync error · ${shortError(error)}`, 'error');
  } finally {
    syncing = false;
    setButtonBusy(false);
  }
}

function queueClass(classId) {
  const store = getStore();
  const c = store?.getClass(classId);
  if (!c) return;
  patchState(classId, {
    enabled:true,
    status:navigator.onLine ? 'pending' : 'offline',
    error:''
  });
  if (navigator.onLine && getCloud()?.user?.id) {
    window.setTimeout(() => pushClass(c).catch(error => console.warn('Queued class sync failed', error)), 50);
  }
}

function bindUi() {
  const btn = document.getElementById('syncClassesBtn');
  if (btn && !btn.dataset.boundCloudSync) {
    btn.dataset.boundCloudSync = '1';
    btn.addEventListener('click', () => syncAll());
  }
}

window.addEventListener('raps-local-class-change', event => {
  const id = event.detail?.classId;
  if (id) queueClass(id);
});

window.addEventListener('raps-cloud-identity', event => {
  bindUi();
  const detail = event.detail || {};
  if (!detail?.user?.id) return;
  if (lastIdentityUserId !== detail.user.id) {
    refs = null;
    lastIdentityUserId = detail.user.id;
  }
  syncAll({ silent:true });
});

window.addEventListener('online', () => syncAll({ silent:true }));
window.addEventListener('offline', () => {
  setGlobalStatus('Offline · class changes queued locally', 'offline');
  const store = getStore();
  for (const c of store?.getClasses?.() || []) {
    if (c?.cloudSync?.enabled && c?.cloudSync?.status === 'pending') {
      patchState(c.id, { status:'offline' });
    }
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bindUi();
    if (cloudReady()) syncAll({ silent:true });
  }, { once:true });
} else {
  bindUi();
  if (cloudReady()) syncAll({ silent:true });
}

window.RAPS_CLASS_SYNC = Object.freeze({
  syncAll,
  pushClass,
  pullVisibleClasses
});

})();
