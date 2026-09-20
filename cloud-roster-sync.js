(() => {
'use strict';

let busy = false;
let lastIdentityUserId = null;

const getClient = () => window.RAPS_SUPABASE;
const getCloud = () => window.RAPS_CLOUD;
const getStore = () => window.RAPS_CLASS_STORE;

function shortError(error) {
  return String(error?.message || error || 'Unknown sync error').slice(0, 240);
}
function isoFromMs(ms) {
  return Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString() : null;
}
function msFromIso(value) {
  const n = value ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function eventStatus(c) {
  if (c?.closedAt || c?.status === 'closed') return 'closed';
  const started = (c?.students || []).some(s => Object.values(s.attempts || {}).some(a => a?.startedAt));
  return started ? 'active' : 'draft';
}
function evaluationStatus(a) {
  if (a?.voidedAt) return 'voided';
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
    created_by: cloud.user.id,
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

  const { data, error } = await client
    .from('evaluation_events')
    .upsert(payload, { onConflict:'id' })
    .select('id, updated_at, client_modified_at')
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
    client_modified_at: isoFromMs(s.modifiedAt || s.createdAt || c.modifiedAt || Date.now()),
    source_device_id: getStore()?.deviceId?.() || null
  }));

  if (!rows.length) return [];
  const { data, error } = await client
    .from('participants')
    .upsert(rows, { onConflict:'id' })
    .select('id');
  if (error) throw error;
  return data || [];
}

async function pushEvaluationShells(c, refs) {
  const client = getClient();
  const cloud = getCloud();
  const rows = [];

  for (const s of c.students || []) {
    for (const [attemptKey, a] of Object.entries(s.attempts || {})) {
      if (!a?.id) continue;
      rows.push({
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
      });
    }
  }

  if (!rows.length) return [];
  const { data, error } = await client
    .from('evaluations')
    .upsert(rows, { onConflict:'id' })
    .select('id, participant_id, attempt_number');
  if (error) throw error;
  return data || [];
}

async function pushClassRosterAndShells(c) {
  const client = getClient();
  const cloud = getCloud();
  if (!client || !cloud?.user?.id || !c?.id) return false;
  if (!navigator.onLine) return false;

  if (window.RAPS_CLASS_SYNC?.pushClass) {
    await window.RAPS_CLASS_SYNC.pushClass(c);
  }

  const refs = await lookupBaseAndCurriculum(c);
  await ensureEvent(c, refs);
  await pushParticipants(c, refs);
  await pushEvaluationShells(c, refs);

  getStore()?.patchRosterCloudState?.(c.id, {
    status:'synced',
    error:'',
    lastSyncedAt:Date.now()
  });
  return true;
}

function makeShellAttempt(row, c, s) {
  const nowMs = msFromIso(row.started_at) || Date.now();
  return {
    id: row.id,
    attemptNo: Number(row.attempt_number || 1),
    startedAt: nowMs,
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
    createdAt: nowMs,
    modifiedAt: msFromIso(row.client_modified_at || row.updated_at) || nowMs,
    deviceId:'',
    lastModifiedDeviceId: row.source_device_id || '',
    syncStatus:'CLOUD_SHELL',
    classId:c.id,
    participantId:s.id,
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
    .select('id, event_id, participant_id, attempt_number, status, started_at, updated_at, client_modified_at, source_device_id, app_data')
    .in('event_id', eventIds);
  if (evalError) throw evalError;

  const participantIds = [...new Set((evals || []).map(e => e.participant_id).filter(Boolean))];
  let participants = [];
  if (participantIds.length) {
    const { data, error } = await client
      .from('participants')
      .select('id, participant_identifier, display_name, home_base_id, updated_at, client_modified_at, source_device_id, app_data')
      .in('id', participantIds);
    if (error) throw error;
    participants = data || [];
  }

  const participantById = new Map(participants.map(p => [p.id, p]));
  const eventById = new Map((events || []).map(e => [e.id, e]));
  let participantImports = 0;
  let evaluationImports = 0;

  for (const row of evals || []) {
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
      s.attempts[key] = makeShellAttempt(row, c, s);
      evaluationImports++;
    }
  }

  if (participantImports || evaluationImports) {
    store.persistCloudMerge?.();
  }

  for (const c of classes) {
    store.patchRosterCloudState?.(c.id, {
      status:'synced',
      error:'',
      lastSyncedAt:Date.now()
    });
  }

  return {participants:participantImports,evaluations:evaluationImports};
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
    for (const c of store.getClasses().filter(x => x?.cloudSync?.enabled)) {
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

})();
