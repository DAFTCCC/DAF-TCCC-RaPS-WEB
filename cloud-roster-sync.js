(() => {
'use strict';

let busy = false;
let lastIdentityUserId = null;
const rosterPushInFlight = new Map();

const getClient = () => window.RAPS_SUPABASE;
const getCloud = () => window.RAPS_CLOUD;
const getStore = () => window.RAPS_CLASS_STORE;

function shortError(error) {
  return String(error?.message || error || 'Unknown sync error').slice(0, 240);
}
function isoFromMs(ms) {
  if (ms === null || ms === undefined || ms === '') return null;
  const n = Number(ms);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
function msFromIso(value) {
  const n = value ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function isVoidedEvaluation(row) {
  return String(row?.status || '').toLowerCase() === 'voided';
}
function isClosedClass(c) {
  return !!c && (!!c.closedAt || c.status === 'closed');
}
async function remoteClassIsClosed(classId) {
  const client = getClient();
  if (!client || !classId) return false;
  const { data, error } = await client
    .from('classes')
    .select('status')
    .eq('id', classId)
    .maybeSingle();
  if (error) throw error;
  return data?.status === 'completed';
}
function reconcileClassLifecycleFromEvaluations(classes, events, evaluations) {
  const classIdByEventId = new Map(
    (events || []).map(event => [String(event.id), String(event.class_id || '')])
  );
  const startedClassIds = new Set();

  for (const row of evaluations || []) {
    if (isVoidedEvaluation(row) || !row?.started_at) continue;
    const classId = classIdByEventId.get(String(row.event_id || ''));
    if (classId) startedClassIds.add(classId);
  }

  let changed = 0;
  for (const c of classes || []) {
    if (!c || c.deletedAt || c.closedAt || c.status === 'closed') continue;
    const nextStatus = startedClassIds.has(String(c.id)) ? 'active' : 'draft';
    if (c.status === nextStatus) continue;
    c.status = nextStatus;
    changed++;
  }

  return changed;
}
function removeLocalAttemptByEvaluationId(c, s, evaluationId) {
  if (!s?.attempts || !evaluationId) return false;

  let removed = false;
  let attemptNumber = null;

  for (const [key, a] of Object.entries(s.attempts)) {
    if (!a || String(a.id || '') !== String(evaluationId)) continue;
    if (attemptNumber === null) attemptNumber = Number(a.attemptNo || key || 1);
    delete s.attempts[key];
    removed = true;
  }

  if (removed) {
    window.dispatchEvent(new CustomEvent('raps-evaluation-tombstoned', {
      detail: {
        classId: c?.id || '',
        participantId: s.id || '',
        evaluationId: String(evaluationId),
        attemptNumber: Number(attemptNumber || 1)
      }
    }));
  }

  return removed;
}
function eventStatus(c) {
  if (c?.closedAt || c?.status === 'closed') return 'closed';
  const started = (c?.students || []).some(s => Object.values(s.attempts || {}).some(a => a?.startedAt));
  return started ? 'active' : 'draft';
}
function evaluationStatus(a) {
  if (a?.voidedAt) return 'voided';
  if (a?.pendingServerFinalization) return a?.startedAt ? 'in_progress' : 'draft';
  if (a?.finalizedAt) return 'finalized';
  return a?.startedAt ? 'in_progress' : 'draft';
}
async function lookupBaseAndCurriculum(c) {
  const client = getClient();
  const tier = window.TCCC_TIERS?.[String(c?.tierId || '')];
  const courseMap = { '1':'ASM', '2':'CLS', '3':'CMC', '4':'CPP' };
  const course = courseMap[String(c?.tierId || '')];
  const version = tier?.source || c?.tierSnapshot?.source || '';

  const [baseResult, curriculumResult] = await Promise.all([
    client.from('bases').select('id, code').eq('code', c.homeInstallationId).maybeSingle(),
    client.from('curriculum_versions').select('id, course_type, version')
      .eq('course_type', course)
      .eq('version', version)
      .eq('published', true)
      .maybeSingle()
  ]);
  if (baseResult.error) throw baseResult.error;
  if (curriculumResult.error) throw curriculumResult.error;
  if (!baseResult.data) throw new Error('Cloud roster sync requires a catalog home installation.');
  if (!curriculumResult.data) throw new Error('Published curriculum version not found for this tier.');
  return { base: baseResult.data, curriculum: curriculumResult.data };
}

async function ensureEvent(c, refs) {
  const client = getClient();
  const cloud = getCloud();
  const payload = {
    id: c.id,
    class_id: c.id,
    base_id: refs.base.id,
    name: c.scenario ? `${c.name} · ${c.scenario}` : c.name,
    event_date: c.date || new Date().toISOString().slice(0,10),
    curriculum_version_id: refs.curriculum.id,
    scenario_id: null,
    status: eventStatus(c),
    created_by: c.cloudSync?.createdBy || cloud.user.id,
    app_data: {
      schemaVersion: 1,
      localClassId: c.id,
      scenario: c.scenario || '',
      scenarioVersion: c.scenarioVersion || '1',
      siteCode: c.siteCode || '',
      appVersion: c.appVersion || ''
    },
    client_modified_at: isoFromMs(c.modifiedAt || Date.now()),
    source_device_id: getStore()?.deviceId?.() || null
  };

  const { data: existing, error: existingError } = await client
    .from('evaluation_events')
    .select('id')
    .eq('id', c.id)
    .maybeSingle();

  if (existingError) throw existingError;

  let writeResult;

  if (existing) {
    writeResult = await client
      .from('evaluation_events')
      .update(payload)
      .eq('id', c.id);
  } else {
    writeResult = await client
      .from('evaluation_events')
      .insert(payload);
  }

  if (writeResult.error) throw writeResult.error;

  const { data, error } = await client
    .from('evaluation_events')
    .select('id, updated_at, client_modified_at')
    .eq('id', c.id)
    .single();

  if (error) throw error;
  return data;
}

async function pushParticipants(c, refs) {
  const client = getClient();
  const cloud = getCloud();

  const rows = (c.students || []).map(s => ({
    id: s.id,
    participant_identifier: `RAPS-${s.id}`,
    display_name: s.name || null,
    home_base_id: refs.base.id,
    created_by: cloud.user.id,
    app_data: {
      schemaVersion: 1,
      localStudentId: s.id,
      classId: c.id,
      rank: s.rank || '',
      trainingId: s.trainingId || '',
      appVersion: s.appVersion || c.appVersion || '',
      contentVersion: s.contentVersion || c.contentVersion || ''
    },
    client_modified_at: isoFromMs(
      s.modifiedAt || s.createdAt || c.modifiedAt || Date.now()
    ),
    source_device_id: getStore()?.deviceId?.() || null
  }));

  if (!rows.length) return [];

  const ids = rows.map(r => r.id);

  const { data: existingRows, error: existingError } = await client
    .from('participants')
    .select('id, created_by')
    .in('id', ids);

  if (existingError) throw existingError;

  const existingById = new Map(
    (existingRows || []).map(r => [r.id, r])
  );

  for (const row of rows) {
    const existing = existingById.get(row.id);

    if (existing) {
      const updatePayload = {
        ...row,
        created_by: existing.created_by || row.created_by
      };

      const { error } = await client
        .from('participants')
        .update(updatePayload)
        .eq('id', row.id);

      if (error) throw error;
    } else {
      const { error } = await client
        .from('participants')
        .insert(row);

      // Another sync path may have inserted it after our lookup.
      if (error && error.code !== '23505') throw error;
    }
  }

  const { data, error } = await client
    .from('participants')
    .select('id')
    .in('id', ids);

  if (error) throw error;
  return data || [];
}

async function pushEvaluationShells(c, refs) {
  const client = getClient();
  const cloud = getCloud();
  const candidates = [];

  for (const s of c.students || []) {
    for (const [attemptKey, a] of Object.entries(s.attempts || {})) {
      if (
        !a?.id
        || a?.voidedAt
        || String(a?.cloudStatus || '').toLowerCase() === 'voided'
      ) continue;
      candidates.push({ s, attemptKey, a });
    }
  }
  if (!candidates.length) return [];

  const ids = candidates.map(x => x.a.id);
  const { data: existingRows, error: existingError } = await client
    .from('evaluations')
    .select('id')
    .in('id', ids);
  if (existingError) throw existingError;

  const existing = new Set((existingRows || []).map(x => x.id));
  const rows = candidates
    .filter(x => !existing.has(x.a.id))
    .map(({s,attemptKey,a}) => ({
      id: a.id,
      event_id: c.id,
      participant_id: s.id,
      evaluator_id: cloud.user.id,
      curriculum_version_id: refs.curriculum.id,
      attempt_number: Number(a.attemptNo || attemptKey || 1),
      status: evaluationStatus(a),
      overall_result: null,
      score_numerator: null,
      score_denominator: null,
      started_at: isoFromMs(a.startedAt),
      completed_at: null,
      app_data: {
        schemaVersion: 1,
        shellOnly: true,
        localClassId: c.id,
        localParticipantId: s.id,
        localAttemptId: a.id,
        appVersion: a.appVersion || c.appVersion || '',
        contentVersion: a.contentVersion || c.contentVersion || ''
      },
      client_modified_at: isoFromMs(a.modifiedAt || a.startedAt || Date.now()),
      source_device_id: getStore()?.deviceId?.() || null
    }));

  if (!rows.length) return [];

  for (const row of rows) {
    const { error } = await client
      .from('evaluations')
      .insert(row);

    // Another sync path may have created the same shell after our
    // existence check. Treat that duplicate as success.
    if (error && error.code !== '23505') throw error;
  }

  const { data, error: readError } = await client
    .from('evaluations')
    .select('id, participant_id, attempt_number')
    .in('id', rows.map(r => r.id));

  if (readError) throw readError;
  return data || [];
}
async function pushClassRosterAndShells(c, options = {}) {
  const client = getClient();
  const cloud = getCloud();
  if (!client || !cloud?.user?.id || !c?.id) return false;
  if (!navigator.onLine) return false;
  if (String(c?.cloudSync?.status||'')==='conflict') {
    getStore()?.patchRosterCloudState?.(c.id,{
      status:'conflict',
      error:'Resolve the class metadata conflict before syncing roster/event data.'
    });
    return false;
  }

  // Closed classes are retention records. All normal browser synchronization
  // becomes pull-only after authoritative closure.
  if (isClosedClass(c) || await remoteClassIsClosed(c.id)) {
    getStore()?.patchRosterCloudState?.(c.id, {
      status:'synced',
      error:'',
      lastSyncedAt:Date.now()
    });
    return true;
  }

  if (rosterPushInFlight.has(c.id)) {
    return rosterPushInFlight.get(c.id);
  }

  const task = (async () => {
    if (window.RAPS_CLASS_SYNC?.pushClass) {
      await window.RAPS_CLASS_SYNC.pushClass(c);
    }

    const refs = await lookupBaseAndCurriculum(c);
    await ensureEvent(c, refs);
    await pushParticipants(c, refs);
    if (options?.skipEvaluationShells !== true) {
      await pushEvaluationShells(c, refs);
    }

    getStore()?.patchRosterCloudState?.(c.id, {
      status:'synced',
      error:'',
      lastSyncedAt:Date.now()
    });

    return true;
  })();

  rosterPushInFlight.set(c.id, task);

  try {
    return await task;
  } finally {
    if (rosterPushInFlight.get(c.id) === task) {
      rosterPushInFlight.delete(c.id);
    }
  }
}

function makeShellAttempt(row, c, s) {
  if (isVoidedEvaluation(row)) return null;
  const startedMs = msFromIso(row.started_at) || null;
  const modifiedMs = msFromIso(row.client_modified_at || row.updated_at) || Date.now();
  return {
    id: row.id,
    attemptNo: Number(row.attempt_number || 1),
    startedAt: startedMs,
    finalizedAt: null,
    finalResult: null,
    section: c.tierSnapshot?.sections?.[0]?.code || window.TCCC_TIERS?.[c.tierId]?.sections?.[0]?.code || 'CUF',
    ratings:{},
    methods:{},
    stamps:{},
    ntReasons:{},
    failureDetails:{},
    notes:{},
    noteOpen:{},
    observeMode:true,
    fieldMode:true,
    timerForced:{},
    timers:{},
    events:[],
    instants:{},
    trainerSign:'',
    evaluatorId:'',
    studentSign:'',
    overallNotes:'',
    showNt:false,
    appVersion: window.TCCC_BUILD?.versionName || '',
    createdAt: startedMs || modifiedMs,
    modifiedAt: modifiedMs,
    deviceId:'',
    lastModifiedDeviceId: row.source_device_id || '',
    syncStatus:'CLOUD_SHELL',
    classId:c.id,
    participantId:s.id,
    cloudStatus:String(row.status||'draft'),
    cloudEvaluatorUserId:row.evaluator_id||'',
    curriculumId:c.curriculumId || `TCCC-TIER${c.tierId}`,
    contentVersion:c.contentVersion || '',
    scenarioVersion:c.scenarioVersion || '1',
    remediation:null,
    cloudShellOnly:true
  };
}

async function pullRosterAndShells() {
  const client = getClient();
  const store = getStore();
  if (!client || !store) return {participants:0,evaluations:0};

  const classes = store.getClasses().filter(c => c?.cloudSync?.enabled);
  if (!classes.length) return {participants:0,evaluations:0};

  const classIds = classes.map(c => c.id);
  const { data: events, error: eventError } = await client
    .from('evaluation_events')
    .select('id, class_id, base_id, curriculum_version_id, status, updated_at, client_modified_at, source_device_id, app_data')
    .in('class_id', classIds);
  if (eventError) throw eventError;

  const eventIds = (events || []).map(e => e.id);
  if (!eventIds.length) return {participants:0,evaluations:0};

  const { data: evals, error: evalError } = await client
    .from('evaluations')
    .select('id, event_id, participant_id, evaluator_id, attempt_number, status, started_at, updated_at, client_modified_at, source_device_id, app_data')
    .in('event_id', eventIds);
  if (evalError) throw evalError;

  // Evaluation lifecycle is authoritative for whether an open class has
  // started. A second browser may pull the class row while it still says
  // "draft", then discover an already-started evaluation moments later.
  // Reconcile the local lifecycle from non-voided started evaluations before
  // the push phase so both the local UI and server class/event status converge.
  const lifecycleChanges = reconcileClassLifecycleFromEvaluations(
    classes,
    events || [],
    evals || []
  );

  // Pull the full class roster even when participants do not yet have
  // evaluation rows.  pushParticipants() persists app_data.classId for
  // this purpose; relying only on evaluations made fresh rosters invisible
  // on a second device until somebody started an assessment.
  const participants = [];
  for (const classId of classIds) {
    const { data, error } = await client
      .from('participants')
      .select('id, participant_identifier, display_name, home_base_id, created_at, updated_at, client_modified_at, source_device_id, app_data')
      .eq('app_data->>classId', classId);
    if (error) throw error;
    participants.push(...(data || []));
  }

  const participantById = new Map(participants.map(p => [p.id, p]));
  const eventById = new Map((events || []).map(e => [e.id, e]));
  let participantImports = 0;
  let evaluationImports = 0;
  let evaluationTombstones = 0;

  // Hydrate roster members before attaching evaluation shells.
  for (const p of participants) {
    const app = p.app_data && typeof p.app_data === 'object' ? p.app_data : {};
    const c = store.getClass(app.classId);
    if (!c) continue;

    let s = (c.students || []).find(x => x.id === p.id);
    if (!s) {
      s = {
        id:p.id,
        classId:c.id,
        name:p.display_name || app.trainingId || 'Cloud participant',
        rank:app.rank || '',
        trainingId:app.trainingId || '',
        appVersion:app.appVersion || window.TCCC_BUILD?.versionName || '',
        contentVersion:app.contentVersion || c.contentVersion || '',
        createdAt:msFromIso(p.created_at || p.client_modified_at || p.updated_at) || Date.now(),
        modifiedAt:msFromIso(p.client_modified_at || p.updated_at) || Date.now(),
        deviceId:'',
        lastModifiedDeviceId:p.source_device_id || '',
        syncStatus:'CLOUD',
        attempts:{}
      };
      c.students.push(s);
      participantImports++;
    }
  }

  // Apply server VOID rows first as tombstones. A tombstone removes only
  // the exact local evaluation UUID it represents; a newer replacement
  // attempt with the same attempt number but a different UUID is preserved.
  for (const row of evals || []) {
    if (!isVoidedEvaluation(row)) continue;

    const event = eventById.get(row.event_id);
    const c = store.getClass(event?.class_id);
    if (!c) continue;

    const s = (c.students || []).find(x => x.id === row.participant_id);
    if (!s) continue;

    if (removeLocalAttemptByEvaluationId(c, s, row.id)) {
      evaluationTombstones++;
    }
  }

  // Only non-voided evaluations are eligible to become local cloud shells.
  for (const row of evals || []) {
    if (isVoidedEvaluation(row)) continue;

    const event = eventById.get(row.event_id);
    const c = store.getClass(event?.class_id);
    if (!c) continue;

    const p = participantById.get(row.participant_id);
    if (!p) continue;

    let s = (c.students || []).find(x => x.id === p.id);
    if (!s) {
      const app = p.app_data && typeof p.app_data === 'object' ? p.app_data : {};
      s = {
        id:p.id,
        classId:c.id,
        name:p.display_name || app.trainingId || 'Cloud participant',
        rank:app.rank || '',
        trainingId:app.trainingId || '',
        appVersion:app.appVersion || window.TCCC_BUILD?.versionName || '',
        contentVersion:app.contentVersion || c.contentVersion || '',
        createdAt:msFromIso(p.created_at || p.client_modified_at || p.updated_at) || Date.now(),
        modifiedAt:msFromIso(p.client_modified_at || p.updated_at) || Date.now(),
        deviceId:'',
        lastModifiedDeviceId:p.source_device_id || '',
        syncStatus:'CLOUD',
        attempts:{}
      };
      c.students.push(s);
      participantImports++;
    }

    const key = String(row.attempt_number || 1);
    if (!s.attempts) s.attempts = {};
    if (!s.attempts[key]) {
      const shell = makeShellAttempt(row, c, s);
      if (shell) {
        s.attempts[key] = shell;
        evaluationImports++;
      }
    }
  }

  if (participantImports || evaluationImports || evaluationTombstones || lifecycleChanges) {
    store.persistCloudMerge?.();
  }

  for (const c of classes) {
    store.patchRosterCloudState?.(c.id, {
      status:'synced',
      error:'',
      lastSyncedAt:Date.now()
    });
  }

  return {
    participants: participantImports,
    evaluations: evaluationImports,
    tombstones: evaluationTombstones,
    lifecycleChanges
  };
}

async function syncAll({silent=false}={}) {
  if (busy) return;
  const cloud = getCloud();
  const store = getStore();
  if (!cloud?.user?.id || !store) return;
  if (!navigator.onLine) {
    for (const c of store.getClasses()) {
      if (c?.cloudSync?.enabled) store.patchRosterCloudState?.(c.id,{status:'offline'});
    }
    return;
  }

  busy = true;
  try {
    await pullRosterAndShells();
    for (const c of store.getClasses().filter(x => x?.cloudSync?.enabled && !isClosedClass(x))) {
      try {
        await pushClassRosterAndShells(c);
      } catch (error) {
        console.warn('RaPS roster/event sync failed', c.id, error);
        store.patchRosterCloudState?.(c.id,{
          status:'error',
          error:shortError(error),
          lastAttemptAt:Date.now()
        });
      }
    }
  } finally {
    busy = false;
  }
}

window.addEventListener('raps-local-class-change', event => {
  const id = event.detail?.classId;
  const c = getStore()?.getClass(id);
  if (!c || !c.cloudSync?.enabled) return;
  if (isClosedClass(c)) {
    getStore()?.patchRosterCloudState?.(id,{
      status:'synced',
      error:'',
      lastSyncedAt:Date.now()
    });
    return;
  }
  getStore()?.patchRosterCloudState?.(id,{
    status:navigator.onLine?'pending':'offline',
    error:''
  });
  if (navigator.onLine) {
    window.setTimeout(() => pushClassRosterAndShells(c).catch(error => {
      getStore()?.patchRosterCloudState?.(id,{status:'error',error:shortError(error)});
    }), 150);
  }
});

window.addEventListener('raps-cloud-identity', event => {
  const userId = event.detail?.user?.id;
  if (!userId) return;
  if (userId !== lastIdentityUserId) lastIdentityUserId = userId;
  syncAll({silent:true});
});

window.addEventListener('online', () => syncAll({silent:true}));
window.addEventListener('raps-class-sync-complete', () => syncAll({silent:true}));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => syncAll({silent:true}), {once:true});
} else {
  syncAll({silent:true});
}

window.RAPS_ROSTER_SYNC = Object.freeze({
  syncAll,
  pushClassRosterAndShells,
  pullRosterAndShells
});

window.RAPS_ROSTER_SYNC_BUILD = '3.4.11-web.12';

})();
