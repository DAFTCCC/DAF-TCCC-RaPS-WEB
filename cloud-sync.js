(() => {
'use strict';

const TIER_TO_COURSE = Object.freeze({ '1':'ASM', '2':'CLS', '3':'CMC', '4':'CPP' });
const COURSE_TO_TIER = Object.freeze({ ASM:'1', CLS:'2', CMC:'3', CPP:'4' });

let refs = null;
let syncing = false;
let lastIdentityUserId = null;
const classPushTails = new Map();

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
function classMetadataSnapshot(c) {
  return {
    name:String(c?.name||''),
    tierId:String(c?.tierId||''),
    roster:String(c?.roster||''),
    date:String(c?.date||''),
    scenario:String(c?.scenario||''),
    scenarioVersion:String(c?.scenarioVersion||'1'),
    siteCode:String(c?.siteCode||''),
    courseType:String(c?.courseType||'initial'),
    scenarioDifficulty:String(c?.scenarioDifficulty||'standard'),
    scenarioProfile:String(c?.scenarioProfile||''),
    leadEvaluator:String(c?.leadEvaluator||''),
    evaluatorId:String(c?.evaluatorId||''),
    curriculumId:String(c?.curriculumId||''),
    component:String(c?.component||'ACTIVE_DUTY'),
    majcom:String(c?.majcom||''),
    unit:String(c?.unit||''),
    exercise:String(c?.exercise||''),
    homeInstallationId:String(c?.homeInstallationId||''),
    homeInstallationName:String(c?.homeInstallationName||''),
    homeInstallationState:String(c?.homeInstallationState||''),
    homeInstallationCountry:String(c?.homeInstallationCountry||''),
    trainingLocationType:String(c?.trainingLocationType||'SAME_AS_HOME'),
    trainingInstallationId:String(c?.trainingInstallationId||''),
    trainingLocationName:String(c?.trainingLocationName||''),
    trainingLocationState:String(c?.trainingLocationState||''),
    trainingLocationCountry:String(c?.trainingLocationCountry||''),
    location:String(c?.location||''),
    scenarioNT:[...(Array.isArray(c?.scenarioNT)?c.scenarioNT:[])].map(String).sort()
  };
}
function classMetadataSignature(c) {
  return JSON.stringify(classMetadataSnapshot(c));
}
function classMetadataState(c, remote, remoteModified) {
  const state=c?.cloudSync||{};
  const baselineSignature=String(state.baseMetadataSignature||'');
  const localSignature=classMetadataSignature(c);
  const remoteSignature=remote?classMetadataSignature(remote):'';
  const hasBaseline=!!baselineSignature;
  const localChanged=hasBaseline&&localSignature!==baselineSignature;
  const remoteChanged=hasBaseline&&remoteSignature!==baselineSignature;
  const sameMetadata=!!remote&&localSignature===remoteSignature;
  return {
    baselineSignature,
    localSignature,
    remoteSignature,
    hasBaseline,
    localChanged,
    remoteChanged,
    sameMetadata,
    remoteModified:Number(remoteModified||0),
    conflict:!!remote&&hasBaseline&&localChanged&&remoteChanged&&!sameMetadata
  };
}
function markClassConflict(c, metadata, message) {
  patchState(c.id,{
    enabled:true,
    status:'conflict',
    error:message||'Class metadata changed on this browser and another device since the last synchronized metadata baseline.',
    conflictBaseMetadataSignature:String(metadata?.baselineSignature||''),
    localMetadataSignature:String(metadata?.localSignature||classMetadataSignature(c)),
    remoteMetadataSignature:String(metadata?.remoteSignature||''),
    localModifiedAt:Number(c?.modifiedAt||0),
    remoteModifiedAt:Number(metadata?.remoteModified||0)
  });
}
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
function snapshotLocalClass(c) {
  return {
    capturedAt: Date.now(),
    class: {
      id:c?.id||'',
      name:c?.name||'',
      roster:c?.roster||'',
      date:c?.date||'',
      scenario:c?.scenario||'',
      scenarioVersion:c?.scenarioVersion||'1',
      siteCode:c?.siteCode||'',
      courseType:c?.courseType||'initial',
      scenarioDifficulty:c?.scenarioDifficulty||'standard',
      scenarioProfile:c?.scenarioProfile||'',
      leadEvaluator:c?.leadEvaluator||'',
      evaluatorId:c?.evaluatorId||'',
      component:c?.component||'ACTIVE_DUTY',
      majcom:c?.majcom||'',
      unit:c?.unit||'',
      exercise:c?.exercise||'',
      homeInstallationId:c?.homeInstallationId||'',
      homeInstallationName:c?.homeInstallationName||'',
      trainingLocationType:c?.trainingLocationType||'SAME_AS_HOME',
      trainingInstallationId:c?.trainingInstallationId||'',
      trainingLocationName:c?.trainingLocationName||'',
      location:c?.location||'',
      modifiedAt:Number(c?.modifiedAt||0),
      lastModifiedDeviceId:c?.lastModifiedDeviceId||''
    }
  };
}
function saveClassConflictRecovery(c, inspection, strategy) {
  const history=Array.isArray(c?.classConflictRecoveryHistory)?c.classConflictRecoveryHistory:[];
  history.push({
    capturedAt:Date.now(),
    strategy,
    local:snapshotLocalClass(c),
    server:cloneJson(inspection)
  });
  c.classConflictRecoveryHistory=history.slice(-3);
}
function isClosedClass(c) {
  return !!c && (!!c.closedAt || c.status === 'closed');
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
    participantIds: Array.isArray(c.students) ? c.students.map(s => s?.id).filter(Boolean) : [],
    closedAt: c.closedAt || null,
    closedBy: c.closedBy || '',
    closureMode: c.closureMode || '',
    closureVersion: Number(c.closureVersion || 0) || null,
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

async function pushClassUnlocked(c, options={}) {
  const forceConflict=options?.forceConflict===true;
  const expectedRemoteModifiedAt=Number(options?.expectedRemoteModifiedAt||0);
  const casRetry=Number(options?.casRetry||0);
  const client = getClient();
  const cloud = getCloud();

  if (String(c?.cloudSync?.status||'')==='conflict' && !forceConflict) {
    patchState(c.id,{
      enabled:true,
      status:'conflict',
      error:c.cloudSync?.error||'Resolve the class metadata conflict before syncing this class.'
    });
    return false;
  }
  if (!client || !cloud?.user?.id) return false;

  // Closed classes are server-authoritative retention records. Never push
  // local metadata back into a closed class, even if a background sync path
  // calls this function directly.
  if (isClosedClass(c)) {
    patchState(c.id, {
      enabled:true,
      status:'synced',
      error:'',
      lastSyncedAt:Date.now()
    });
    return true;
  }

  // A stale browser may still think the class is open. Check the server
  // before writing so an authoritative completed class is pull-only.
  const existing=await fetchRemoteById(c.id);
  const loadedRefs=await loadRefs();
  const remote=existing?remoteToLocal(existing,loadedRefs):null;
  const remoteModified=msFromIso(existing?.client_modified_at||existing?.updated_at);
  const metadata=classMetadataState(c,remote,remoteModified);

  if (existing?.status==='completed') {
    patchState(c.id,{
      enabled:true,
      status:'synced',
      error:'',
      createdBy:existing.created_by||c.cloudSync?.createdBy||'',
      lastSyncedAt:Date.now(),
      remoteModifiedAt:remoteModified,
      baseMetadataSignature:metadata.remoteSignature
    });
    return true;
  }

  // web.12 migration repair: web.11 could mark a timestamp-only conflict
  // even when the class metadata was identical. Identical metadata is not a
  // conflict; converge immediately and establish the metadata baseline.
  if (!forceConflict && remote && metadata.sameMetadata) {
    patchState(c.id,{
      enabled:true,
      status:'synced',
      error:'',
      createdBy:existing?.created_by||c.cloudSync?.createdBy||'',
      lastSyncedAt:Date.now(),
      localModifiedAt:Number(c.modifiedAt||0),
      remoteModifiedAt:remoteModified,
      baseMetadataSignature:metadata.remoteSignature,
      conflictBaseMetadataSignature:'',
      localMetadataSignature:'',
      remoteMetadataSignature:''
    });
    return true;
  }

  // Once a web.12 baseline exists, conflict is based on the actual class
  // metadata branches, never the class-wide modifiedAt timestamp.
  if (!forceConflict && metadata.conflict) {
    markClassConflict(
      c,
      metadata,
      'Class metadata changed on this browser and another device since the last synchronized metadata baseline. Choose SERVER or LOCAL before continuing.'
    );
    return false;
  }

  // Server-only metadata change: this browser has no competing metadata edit,
  // so adopt the server branch instead of writing stale local metadata back.
  if (!forceConflict && metadata.hasBaseline && metadata.remoteChanged && !metadata.localChanged) {
    getStore()?.upsertFromCloud?.(remote,{preserveStudents:true});
    const active=getStore()?.getClass?.(c.id);
    if (active) {
      active.cloudSync={
        ...(active.cloudSync||{}),
        enabled:true,
        status:'synced',
        error:'',
        createdBy:existing?.created_by||active.cloudSync?.createdBy||'',
        lastSyncedAt:Date.now(),
        localModifiedAt:remoteModified,
        remoteModifiedAt:remoteModified,
        baseMetadataSignature:metadata.remoteSignature
      };
      getStore()?.persistCloudMerge?.();
    }
    return true;
  }

  // Upgrade safety: if an older build left a conflict without a metadata
  // baseline and the branches are genuinely different, do not guess.
  if (!forceConflict && String(c?.cloudSync?.status||'')==='conflict' && !metadata.hasBaseline) {
    markClassConflict(
      c,
      metadata,
      'Class metadata differs from the server, but this browser predates metadata fingerprints. Choose SERVER or LOCAL before continuing.'
    );
    return false;
  }

  // One-time migration guard for pending/offline/error states created by
  // web.11. If both the old timestamp baseline and the server advanced while
  // local work is pending, preserve both branches rather than overwrite.
  if (!forceConflict && existing && !metadata.hasBaseline && !metadata.sameMetadata) {
    const oldBaselineMs=Number(c?.cloudSync?.remoteModifiedAt||0);
    const priorStatus=String(c?.cloudSync?.status||'');
    const legacyLocalDirty=['pending','offline','error'].includes(priorStatus);
    const legacyRemoteAdvanced=oldBaselineMs>0&&remoteModified>oldBaselineMs+10;
    if (legacyLocalDirty&&legacyRemoteAdvanced) {
      markClassConflict(
        c,
        metadata,
        'Class metadata differs during the web.12 fingerprint migration and the server also advanced. Choose SERVER or LOCAL before continuing.'
      );
      return false;
    }
  }

  const localModified=Number(c.modifiedAt||c.createdAt||Date.now());
  const publishModified=forceConflict
    ? Math.max(Date.now(),localModified+1,remoteModified+1,expectedRemoteModifiedAt+1)
    : localModified;

  if (forceConflict && expectedRemoteModifiedAt && Math.abs(remoteModified-expectedRemoteModifiedAt)>10) {
    const latest=await fetchRemoteById(c.id);
    const latestRemote=latest?remoteToLocal(latest,loadedRefs):null;
    const latestModified=msFromIso(latest?.client_modified_at||latest?.updated_at);
    const latestMetadata=classMetadataState(c,latestRemote,latestModified);
    if (latestMetadata.sameMetadata) {
      patchState(c.id,{
        enabled:true,status:'synced',error:'',
        lastSyncedAt:Date.now(),
        remoteModifiedAt:latestModified,
        baseMetadataSignature:latestMetadata.remoteSignature
      });
      return true;
    }
    markClassConflict(c,latestMetadata,'Cloud class metadata changed again while resolving the conflict. Review the latest server version before choosing again.');
    return false;
  }

  const base=resolveBaseForClass(c,loadedRefs);
  const curriculum=resolveCurriculumForClass(c,loadedRefs);

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
    client_modified_at: isoFromMs(publishModified),
    source_device_id: getStore()?.deviceId?.() || null
  };

  // Compare-and-swap the exact revision inspected above. This closes the
  // fetch -> write race: if another browser changes the row after our preflight
  // read, the conditional update affects zero rows and becomes a conflict
  // instead of silently overwriting the newer server branch.
  let data=null;

  if (existing) {
    let write=client.from('classes').update(payload).eq('id',c.id);
    if (existing.client_modified_at) {
      write=write.eq('client_modified_at',existing.client_modified_at);
    } else if (existing.updated_at) {
      write=write.eq('updated_at',existing.updated_at);
    }

    const result=await write
      .select('id, base_id, name, course_type, curriculum_version_id, start_date, end_date, status, created_by, created_at, updated_at, app_data, client_modified_at, source_device_id')
      .maybeSingle();

    if (result.error) {
      patchState(c.id,{
        enabled:true,
        status:navigator.onLine?'error':'offline',
        error:shortError(result.error)
      });
      throw result.error;
    }

    if (!result.data) {
      const latest=await fetchRemoteById(c.id);
      const latestRemote=latest?remoteToLocal(latest,loadedRefs):null;
      const latestModified=msFromIso(latest?.client_modified_at||latest?.updated_at);
      const latestMetadata=classMetadataState(c,latestRemote,latestModified);

      if (latestMetadata.sameMetadata) {
        patchState(c.id,{
          enabled:true,status:'synced',error:'',
          createdBy:latest?.created_by||c.cloudSync?.createdBy||'',
          lastSyncedAt:Date.now(),
          localModifiedAt:Number(c.modifiedAt||0),
          remoteModifiedAt:latestModified,
          baseMetadataSignature:latestMetadata.remoteSignature
        });
        return true;
      }

      if (!forceConflict && latestMetadata.hasBaseline &&
          latestMetadata.remoteChanged && !latestMetadata.localChanged) {
        getStore()?.upsertFromCloud?.(latestRemote,{preserveStudents:true});
        const active=getStore()?.getClass?.(c.id);
        if (active) {
          active.cloudSync={
            ...(active.cloudSync||{}),
            enabled:true,status:'synced',error:'',
            createdBy:latest?.created_by||active.cloudSync?.createdBy||'',
            lastSyncedAt:Date.now(),
            localModifiedAt:latestModified,
            remoteModifiedAt:latestModified,
            baseMetadataSignature:latestMetadata.remoteSignature
          };
          getStore()?.persistCloudMerge?.();
        }
        return true;
      }

      if (!forceConflict && latestMetadata.hasBaseline &&
          latestMetadata.localChanged && !latestMetadata.remoteChanged &&
          casRetry<1) {
        return pushClassUnlocked(c,{...options,casRetry:casRetry+1});
      }

      if (!forceConflict && latestMetadata.conflict) {
        markClassConflict(c,latestMetadata,'Cloud class metadata changed during synchronization. No local metadata was overwritten; choose SERVER or LOCAL before continuing.');
        return false;
      }

      // No fingerprint baseline means this is an upgrade-era race. Preserve
      // both differing branches instead of guessing which one should win.
      markClassConflict(c,latestMetadata,'Cloud class metadata changed during synchronization before a fingerprint baseline was established. Choose SERVER or LOCAL before continuing.');
      return false;
    }
    data=result.data;
  } else {
    const result=await client
      .from('classes')
      .insert(payload)
      .select('id, base_id, name, course_type, curriculum_version_id, start_date, end_date, status, created_by, created_at, updated_at, app_data, client_modified_at, source_device_id')
      .single();

    if (result.error) {
      if (String(result.error?.code||'')==='23505') {
        const latest=await fetchRemoteById(c.id);
        const latestRemote=latest?remoteToLocal(latest,loadedRefs):null;
        const latestModified=msFromIso(latest?.client_modified_at||latest?.updated_at);
        const latestMetadata=classMetadataState(c,latestRemote,latestModified);
        if (latestMetadata.sameMetadata) {
          patchState(c.id,{
            enabled:true,status:'synced',error:'',
            createdBy:latest?.created_by||c.cloudSync?.createdBy||'',
            lastSyncedAt:Date.now(),
            localModifiedAt:Number(c.modifiedAt||0),
            remoteModifiedAt:latestModified,
            baseMetadataSignature:latestMetadata.remoteSignature
          });
          return true;
        }
        markClassConflict(c,latestMetadata,'This class appeared on the server with different metadata while this browser was creating it. Choose SERVER or LOCAL before continuing.');
        return false;
      }
      patchState(c.id,{
        enabled:true,
        status:navigator.onLine?'error':'offline',
        error:shortError(result.error)
      });
      throw result.error;
    }
    data=result.data;
  }

  if (!data) {
    const error=new Error('Class write completed without a returned server revision.');
    patchState(c.id,{enabled:true,status:'error',error:error.message});
    throw error;
  }

  const remoteMs = msFromIso(data.client_modified_at || data.updated_at) || publishModified;
  if (forceConflict) {
    c.modifiedAt=remoteMs;
    c.lastModifiedDeviceId=getStore()?.deviceId?.()||c.lastModifiedDeviceId||'';
    c.syncStatus='CLOUD';
  }
  const savedRemote=remoteToLocal(data,loadedRefs);
  const savedSignature=classMetadataSignature(savedRemote);
  patchState(c.id,{
    enabled:true,
    status:'synced',
    error:'',
    createdBy:data.created_by||payload.created_by,
    lastSyncedAt:Date.now(),
    localModifiedAt:remoteMs,
    remoteModifiedAt:remoteMs,
    baseMetadataSignature:savedSignature,
    conflictBaseMetadataSignature:'',
    localMetadataSignature:'',
    remoteMetadataSignature:''
  });
  return true;
}

// Serialize writes per class instead of deduplicating them. If a second sync
// request arrives while the first is running, it executes afterward and reads
// the class's latest local state (for example draft -> active after A1 starts).
// This prevents out-of-order writes from regressing lifecycle state.
function pushClass(c, options={}) {
  if (!c?.id) return Promise.resolve(false);

  const previous = classPushTails.get(c.id) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(() => pushClassUnlocked(c, options));

  classPushTails.set(c.id, task);

  return task.finally(() => {
    if (classPushTails.get(c.id) === task) {
      classPushTails.delete(c.id);
    }
  });
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
    closureMode: appData.closureMode || '',
    closureVersion: Number(appData.closureVersion || 0) || null,
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
      enabled:true,
      status:'synced',
      error:'',
      createdBy:row.created_by||'',
      lastSyncedAt:Date.now(),
      localModifiedAt:remoteModifiedAt,
      remoteModifiedAt,
      baseMetadataSignature:''
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
    const remote=remoteToLocal(row,loadedRefs);
    remote.cloudSync={...(remote.cloudSync||{}),baseMetadataSignature:classMetadataSignature(remote)};
    const local=store.getClass(row.id);
    if (!local) {
      store.upsertFromCloud(remote);
      imported++;
      continue;
    }

    const remoteMs=Number(remote.modifiedAt||0);
    const localMs=Number(local.modifiedAt||0);
    const state=local.cloudSync||{};
    const priorStatus=String(state.status||'');
    const metadata=classMetadataState(local,remote,remoteMs);

    // Identical metadata always converges, including migration from a false
    // web.11 timestamp-only conflict.
    if (metadata.sameMetadata) {
      patchState(local.id,{
        enabled:true,
        status:'synced',
        error:'',
        createdBy:row.created_by||state.createdBy||'',
        lastSyncedAt:Date.now(),
        remoteModifiedAt:remoteMs,
        localModifiedAt:localMs,
        baseMetadataSignature:metadata.remoteSignature,
        conflictBaseMetadataSignature:'',
        localMetadataSignature:'',
        remoteMetadataSignature:''
      });
      continue;
    }

    // Existing web.12 conflict: never overwrite the local branch. Refresh the
    // observed remote signature/revision so the resolver inspects current data.
    if (priorStatus==='conflict'&&metadata.hasBaseline) {
      patchState(local.id,{
        enabled:true,
        status:'conflict',
        error:'Class metadata conflict is unresolved. Review the current SERVER and LOCAL branches before choosing a winner.',
        remoteModifiedAt:remoteMs,
        remoteMetadataSignature:metadata.remoteSignature
      });
      continue;
    }

    if (metadata.conflict) {
      markClassConflict(
        local,
        metadata,
        'Class metadata changed on this browser and another device since the last synchronized metadata baseline. Choose SERVER or LOCAL before continuing.'
      );
      continue;
    }

    // Upgrade safety for a pre-web.12 conflict with genuinely different
    // metadata. Preserve both branches rather than inventing a baseline.
    if (priorStatus==='conflict'&&!metadata.hasBaseline) {
      markClassConflict(
        local,
        metadata,
        'Class metadata differs from the server, but this browser predates metadata fingerprints. Choose SERVER or LOCAL before continuing.'
      );
      continue;
    }

    const localDirty=['pending','offline','error'].includes(priorStatus) &&
      (metadata.hasBaseline ? metadata.localChanged : localMs>Number(state.remoteModifiedAt||0)+10);
    if (localDirty) continue;

    if (metadata.hasBaseline && metadata.remoteChanged && !metadata.localChanged) {
      store.upsertFromCloud(remote,{preserveStudents:true});
      const active=store.getClass(row.id);
      if (active) {
        active.cloudSync={...(active.cloudSync||{}),baseMetadataSignature:metadata.remoteSignature};
        store.persistCloudMerge?.();
      }
      imported++;
    } else if (!metadata.hasBaseline && remoteMs>localMs+10) {
      store.upsertFromCloud(remote,{preserveStudents:true});
      const active=store.getClass(row.id);
      if (active) {
        active.cloudSync={...(active.cloudSync||{}),baseMetadataSignature:metadata.remoteSignature};
        store.persistCloudMerge?.();
      }
      imported++;
    } else {
      patchState(local.id,{
        enabled:true,
        status:'synced',
        error:'',
        createdBy:row.created_by||state.createdBy||'',
        lastSyncedAt:Date.now(),
        remoteModifiedAt:remoteMs,
        localModifiedAt:localMs,
        baseMetadataSignature:metadata.remoteSignature
      });
    }
  }
  return imported;
}

async function inspectClassConflict(c) {
  if (!c?.id) throw new Error('Class is unavailable.');
  if (!navigator.onLine) throw new Error('Class conflict resolution requires an online connection.');
  const loadedRefs=await loadRefs();
  const row=await fetchRemoteById(c.id);
  if (!row) throw new Error('The server class no longer exists.');
  const remote=remoteToLocal(row,loadedRefs);
  return {
    classId:c.id,
    localModifiedAt:Number(c.modifiedAt||0),
    remoteModifiedAt:Number(remote.modifiedAt||0),
    localDeviceId:getStore()?.deviceId?.()||'',
    remoteDeviceId:row.source_device_id||'',
    localSummary:snapshotLocalClass(c).class,
    remoteSummary:snapshotLocalClass(remote).class,
    serverSnapshot:cloneJson(row)
  };
}

async function resolveClassConflict(c, strategy) {
  strategy=String(strategy||'').toLowerCase();
  if (!['server','local'].includes(strategy)) throw new Error('Class conflict resolution must choose SERVER or LOCAL.');
  if (String(c?.cloudSync?.status||'')!=='conflict') throw new Error('This class is not currently in conflict.');

  const inspection=await inspectClassConflict(c);
  const expected=Number(c.cloudSync?.remoteModifiedAt||0);
  if (expected && Math.abs(inspection.remoteModifiedAt-expected)>10) {
    patchState(c.id,{
      status:'conflict',
      error:'Cloud class changed again while resolving the conflict. Review the latest server version before choosing again.',
      remoteModifiedAt:inspection.remoteModifiedAt
    });
    return false;
  }

  saveClassConflictRecovery(c,inspection,strategy);

  if (strategy==='server') {
    const loadedRefs=await loadRefs();
    const remote=remoteToLocal(inspection.serverSnapshot,loadedRefs);
    remote.cloudSync={...(remote.cloudSync||{}),baseMetadataSignature:classMetadataSignature(remote)};
    getStore()?.upsertFromCloud?.(remote,{preserveStudents:true});
    const active=getStore()?.getClass?.(c.id);
    if (active) {
      active.classConflictRecoveryHistory=c.classConflictRecoveryHistory;
      active.classConflictResolution={
        resolvedAt:Date.now(),
        strategy:'server',
        preservedBackup:true,
        previousRemoteModifiedAt:inspection.remoteModifiedAt
      };
      getStore()?.persistCloudMerge?.();
    }
    return true;
  }

  const ok=await pushClass(c,{
    forceConflict:true,
    expectedRemoteModifiedAt:inspection.remoteModifiedAt
  });
  if (!ok) return false;
  c.classConflictResolution={
    resolvedAt:Date.now(),
    strategy:'local',
    preservedBackup:true,
    previousRemoteModifiedAt:inspection.remoteModifiedAt
  };
  getStore()?.persistCloudMerge?.();
  return true;
}

async function pushPendingClasses() {
  const store = getStore();
  if (!store) return { attempted:0, synced:0 };
  const classes = store.getClasses().filter(c =>
    c?.cloudSync?.enabled === true &&
    !isClosedClass(c) &&
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
    window.dispatchEvent(new CustomEvent('raps-class-sync-complete',{detail:{pulled,pushed:pushed.synced,total}}));
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
  if (String(c?.cloudSync?.status||'')==='conflict') {
    patchState(classId,{
      enabled:true,
      status:'conflict',
      error:c.cloudSync?.error||'Resolve the class metadata conflict before syncing this class.'
    });
    return;
  }
  if (isClosedClass(c)) {
    patchState(classId, {
      enabled:true,
      status:'synced',
      error:'',
      lastSyncedAt:Date.now()
    });
    return;
  }
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

window.RAPS_CLASS_SYNC_BUILD = '3.4.11-web.12';

window.RAPS_CLASS_SYNC = Object.freeze({
  syncAll,
  pushClass,
  pullVisibleClasses,
  inspectClassConflict,
  resolveClassConflict
});

})();
