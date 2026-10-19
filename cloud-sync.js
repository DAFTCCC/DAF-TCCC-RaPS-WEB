(() => {
'use strict';

const TIER_TO_COURSE = Object.freeze({ '1':'ASM', '2':'CLS', '3':'CMC', '4':'CPP' });
const COURSE_TO_TIER = Object.freeze({ ASM:'1', CLS:'2', CMC:'3', CPP:'4' });

let syncing = false;
const classPushTails = new Map();

const getStore = () => window.RAPS_CLASS_STORE;
const getClient = () => window.RAPS_SUPABASE;
let requestClientId = 0;

function checkedQuery(query, check) {
  return new Proxy(query, {
    get(target, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve()
        .then(() => { check(); return target; })
        .then(result => { check(); return result; }).then(resolve, reject);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? (...args) => { check(); return checkedQuery(value.apply(target, args),check); } : value;
    }
  });
}

function classRequestContext(parent, classId) {
  if (parent.classId === classId) return parent;
  const current = () => parent.current() && !parent.store.isLocalCopyHidden?.(classId);
  const check = () => { if (!current()) throw new Error('Your account or local class access changed. Sync again.'); };
  return {...parent,classId,current,check,
    ready:async () => {await parent.ready();check();},
    client:{from(table) {check();return checkedQuery(parent.client.from(table),check);}}};
}

function requestContext({ classId='', allowHidden=false }={}) {
  const permissions = window.RAPS_PERMISSIONS;
  const token = permissions?.snapshot?.();
  const source = getClient();
  const store = getStore();
  if (!source || !store || !permissions?.isCurrent?.(token)) return null;
  let bound = null, preparation = null;
  const current = () => permissions.isCurrent(token) && getStore() === store &&
    (!classId || allowHidden || !store.isLocalCopyHidden?.(classId));
  const check = () => {
    if (!current()) throw new Error('Your account or class access changed. Sign in and sync again.');
  };
  const ready = () => preparation ||= (async () => {
    check();
    const { data, error } = await source.auth.getSession();
    check();
    const session = data?.session, config = window.RAPS_CLOUD_CONFIG;
    if (error || !session?.access_token || session.user?.id !== token.userId ||
      !config?.projectUrl || !config?.publishableKey || !window.supabase?.createClient) {
      throw new Error('Your sign-in session is unavailable. Sign in again before syncing classes.');
    }
    bound = window.supabase.createClient(config.projectUrl, config.publishableKey, {
      auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:`raps-class-request-${++requestClientId}` },
      global:{ headers:{ Authorization:`Bearer ${session.access_token}` } }
    });
    check();
  })();
  return { token, userId:token.userId, identity:token.identity, store, classId, current, check, ready,
    client:{ from(table) { check(); if (!bound) throw new Error('Verify your session before syncing classes.'); return checkedQuery(bound.from(table),check); } } };
}

async function withContext(context, fallback, operation) {
  if (!context) return fallback;
  try { await context.ready(); context.check(); return await operation(context); }
  catch (error) { if (!context.current()) return fallback; throw error; }
}

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
    deletedAt:Number(c?.deletedAt||0)||null,
    restoredAt:Number(c?.restoredAt||0)||null,
    scenarioNT:[...(Array.isArray(c?.scenarioNT)?c.scenarioNT:[])].map(String).sort()
  };
}
function classMetadataSignature(c) {
  return JSON.stringify(classMetadataSnapshot(c));
}
function classMetadataState(c, remote, remoteModified) {
  const state=c?.cloudSync||{};
  let baselineSignature=String(state.baseMetadataSignature||'');
  // Normalize fingerprints saved before shared trash added lifecycle markers.
  try { if (baselineSignature) baselineSignature=classMetadataSignature(JSON.parse(baselineSignature)); } catch {}
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
  return !!(getClient() && window.RAPS_PERMISSIONS?.isCurrent?.(window.RAPS_PERMISSIONS.snapshot()));
}

async function readAssignments(queryFactory, key) {
  const rows = [], seen = new Set();
  for (let offset=0;;) {
    const result = await queryFactory().order(key,{ascending:true}).order('evaluator_id',{ascending:true}).range(offset,offset+249);
    if (offset && result.error?.code === 'PGRST103') break;
    if (result.error) return result;
    if (!result.data?.length) break;
    for (const row of result.data) {
      const id = `${row[key]}|${row.evaluator_id}`;
      if (seen.has(id)) throw new Error('Evaluator assignments changed during synchronization. Sync classes again.');
      seen.add(id);
    }
    rows.push(...result.data);
    offset += result.data.length;
  }
  return {data:rows,error:null};
}

function refreshLocalClassAccess(context, loadedRefs) {
  context.check();
  let changed=false;
  for(const local of context.store.getClasses()) {
    const assigned=loadedRefs.assignedClassIds.has(local.id);
    // Refresh grants independently of content fingerprints. A removed
    // assignment may hide the row from RLS, so visible rows alone cannot
    // invalidate the permission cached with an earlier local copy.
    if(local.cloudAccess || assigned) {
      const next={userId:context.userId,assignedEvaluator:assigned};
      if(JSON.stringify(local.cloudAccess)!==JSON.stringify(next)) {
        local.cloudAccess=next;
        changed=true;
      }
    }
    if(local.cloudScope?.baseId) {
      const base=loadedRefs.bases.find(row=>row.id===local.cloudScope.baseId);
      const parent=base && loadedRefs.majcomById.get(base.majcom_id);
      const next={baseId:local.cloudScope.baseId,majcomId:parent?.id || '',baseCode:base?.code || '',available:!!(base && parent)};
      if(JSON.stringify(local.cloudScope)!==JSON.stringify(next)) {
        local.cloudScope=next;
        changed=true;
      }
    }
  }
  if(changed) {
    context.check();
    context.store.persistCloudMerge?.();
    window.dispatchEvent(new CustomEvent('raps-class-access-refresh'));
  }
}

async function loadRefs(force=false, context) {
  context.check();
  if (context.refs && !force) return context.refs;
  const client = context.client;

  const [basesResult, curriculumResult, majcomResult, classAssignments, eventAssignments] = await Promise.all([
    client.from('bases').select('id, majcom_id, code, name, active').eq('active', true),
    client.from('curriculum_versions').select('id, course_type, version, title, published').eq('published', true),
    client.from('majcoms').select('id, code, name, active').eq('active', true),
    readAssignments(() => client.from('class_evaluators').select('class_id,evaluator_id').eq('evaluator_id', context.userId),'class_id'),
    readAssignments(() => client.from('event_evaluators').select('event_id,evaluator_id,evaluation_events(class_id)').eq('evaluator_id', context.userId),'event_id')
  ]);

  if (basesResult.error) throw basesResult.error;
  if (curriculumResult.error) throw curriculumResult.error;
  if (majcomResult.error) throw majcomResult.error;
  if (classAssignments.error) throw classAssignments.error;
  if (eventAssignments.error) throw eventAssignments.error;
  context.check();

  const majcomById = new Map((majcomResult.data || []).map(row => [row.id, row]));
  context.refs = {
    userId:context.userId,
    assignedClassIds:new Set([...(classAssignments.data || []).map(row => row.class_id),
      ...(eventAssignments.data || []).flatMap(row => Array.isArray(row.evaluation_events)
        ? row.evaluation_events.map(event => event.class_id) : [row.evaluation_events?.class_id])].filter(Boolean)),
    bases: basesResult.data || [],
    curricula: curriculumResult.data || [],
    majcoms: majcomResult.data || [],
    baseByCode: new Map((basesResult.data || []).filter(x => x.code).map(row => [String(row.code).toUpperCase(), row])),
    curriculumByKey: new Map((curriculumResult.data || []).map(row => [`${row.course_type}|${row.version}`, row])),
    majcomById
  };
  window.RAPS_PERMISSIONS.registerBases(context.refs.bases, { identity:context.identity });
  refreshLocalClassAccess(context,context.refs);
  return context.refs;
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
    deletedAt: c.deletedAt || null,
    restoredAt: c.restoredAt || null
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

async function fetchRemoteById(id, context) {
  context.check();
  const client = context.client;
  const { data, error } = await client
    .from('classes')
    .select('id, base_id, name, course_type, curriculum_version_id, start_date, end_date, status, created_by, created_at, updated_at, app_data, client_modified_at, source_device_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// A tombstone is authoritative until an explicit restore names that exact
// deletion. Ordinary metadata conflict resolution cannot undo shared trash.
function trashDecision(c,remote) {
  let action=c.cloudSync?.trashAction||null;
  const removed=Number(remote?.deletedAt||0), restored=Number(remote?.restoredAt||0);
  if (!action && c.deletedAt && !removed && !restored) {
    // Migrate the local-only trash left by older builds, including entries
    // those builds incorrectly labelled as already synchronized.
    action={kind:'delete',requestedAt:Number(c.deletedAt),expectedDeletedAt:0,expectedRestoredAt:0};
  }
  if (action && !['delete','restore'].includes(action.kind)) action=null;
  if (action && remote) {
    if (action.kind==='restore' && removed &&
        Number(action.expectedDeletedAt||0)===removed && Number(action.expectedRestoredAt||0)===restored) return {action};
    if (action.kind==='delete' && !removed && Number(action.expectedRestoredAt||0)===restored) return {action};
    if (action.kind==='restore' && !removed && !restored) return {action};
    return {adopt:true};
  }
  if (remote && (removed || Number(c.deletedAt||0)!==removed || Number(c.restoredAt||0)!==restored)) return {adopt:true};
  return {action};
}

function adoptLifecycle(c,remote) {
  if (!remote) return;
  const action=getStore()?.ownsTrashAction?.(c.id)===false?null:c.cloudSync?.trashAction;
  if (classMetadataSignature(c)!==classMetadataSignature(remote)) {
    saveClassConflictRecovery(c,{serverSnapshot:remote},'server-lifecycle');
  }
  getStore()?.upsertFromCloud?.(remote,{preserveStudents:true});
  if (action && getStore()?.acknowledgeTrashAction?.(c.id,action)===false) {
    // Another tab may have queued a newer intent while this request was in
    // flight. Its independent outbox entry survives the remote upsert.
    getStore()?.recoverTrashActions?.();
    const next=getStore()?.getClass?.(c.id)?.cloudSync?.trashAction;
    const newer=next && (next.kind!==action.kind || Number(next.requestedAt)!==Number(action.requestedAt));
    patchState(c.id,{
      enabled:true,status:newer?'pending':'error',
      error:newer?'':'Cloud class updated, but this device could not clear its queued change. Use Sync Classes to retry.',
      remoteModifiedAt:Number(remote.modifiedAt||0),baseMetadataSignature:classMetadataSignature(remote)
    });
    return;
  }
  patchState(c.id,{
    enabled:true,status:'synced',error:'',trashAction:null,
    lastSyncedAt:Date.now(),remoteModifiedAt:Number(remote.modifiedAt||0),
    baseMetadataSignature:classMetadataSignature(remote),
    conflictBaseMetadataSignature:'',localMetadataSignature:'',remoteMetadataSignature:''
  });
}

function trashActionUnchanged(c,action) {
  getStore()?.recoverTrashActions?.();
  if (getStore()?.ownsTrashAction?.(c.id)===false) return false;
  const latest=getStore()?.getClass?.(c.id)?.cloudSync?.trashAction;
  return !latest || (latest.kind===action.kind && Number(latest.requestedAt)===Number(action.requestedAt));
}

function acknowledgeTrashAction(c,saved,action) {
  if (!trashActionUnchanged(c,action)) {
    patchState(c.id,{enabled:true,status:'pending',error:'',remoteModifiedAt:Number(saved.modifiedAt||0),baseMetadataSignature:classMetadataSignature(saved)});
  } else {
    adoptLifecycle(c,saved);
  }
}

async function hasUnfinishedAssessment(c, context) {
  context.check();
  if ((c.students||[]).some(s=>Object.values(s.attempts||{}).some(a=>a.startedAt&&!a.finalizedAt&&!a.voidedAt))) return true;
  const client=context.client;
  const events=await client.from('evaluation_events').select('id').eq('class_id',c.id);
  if (events.error) throw events.error;
  const ids=[...new Set([c.id,...(events.data||[]).map(row=>row.id)])];
  const evaluations=await client.from('evaluations').select('id,status,started_at,completed_at').in('event_id',ids);
  if (evaluations.error) throw evaluations.error;
  return (evaluations.data||[]).some(a=>a.status!=='voided' && !a.completed_at && (a.started_at||a.status==='in_progress'));
}

async function pushTrashAction(c,existing,remote,action,options) {
  const context = options.context;
  context.check();
  if (Number(options.casRetry||0)>=3) {
    patchState(c.id,{status:'error',error:'Class changed during trash synchronization. Sync Classes to retry.'});
    return false;
  }
  const unfinished=action.kind==='delete' && await hasUnfinishedAssessment(c,context);
  context.check();
  // Home can queue Restore while the delete request is awaiting the server.
  // Never replace that newer intent with the older request's acknowledgement.
  if (!trashActionUnchanged(c,action)) return pushClassUnlocked(c,{...options,casRetry:Number(options.casRetry||0)+1});
  if (unfinished) {
    adoptLifecycle(c,remote);
    patchState(c.id,{status:'error',error:'Class was not deleted. Finalize or void every assessment in progress, then delete the class again.'});
    return false;
  }
  const at=Number(action.requestedAt)||Date.now();
  const revision=Math.max(Date.now(),Number(remote.modifiedAt||0)+1,Number(c.modifiedAt||0)+1);
  const appData={...(existing.app_data||{})};
  if (action.kind==='delete') {
    appData.trashPreviousStatus=existing.status==='active'?'active':'draft';
    appData.deletedAt=at;
    appData.deletedBy=context.userId;
  } else {
    appData.deletedAt=null;
    appData.restoredAt=at;
    appData.restoredBy=context.userId;
  }
  const payload={
    status:action.kind==='delete'?'archived':appData.trashPreviousStatus==='active'?'active':'draft',
    app_data:appData,client_modified_at:isoFromMs(revision),source_device_id:getStore()?.deviceId?.()||null
  };
  patchState(c.id,{enabled:true,status:'syncing',error:'',trashAction:action});
  let write=context.client.from('classes').update(payload).eq('id',c.id).eq('status',existing.status);
  if (existing.client_modified_at) write=write.eq('client_modified_at',existing.client_modified_at);
  if (existing.updated_at) write=write.eq('updated_at',existing.updated_at);
  const {data,error}=await write.select('*').maybeSingle();
  context.check();
  if (error) {
    patchState(c.id,{status:navigator.onLine?'error':'offline',error:shortError(error)});
    throw error;
  }
  if (!data) return pushClassUnlocked(c,{...options,casRetry:Number(options.casRetry||0)+1});
  const saved=remoteToLocal(data,await loadRefs(false,context));
  context.check();
  acknowledgeTrashAction(c,saved,action);
  window.dispatchEvent(new CustomEvent('raps-class-lifecycle-synced',{detail:{classId:c.id,action:action.kind}}));
  return true;
}

async function pushClassUnlocked(c, options={}) {
  const context = options.context;
  context.check();
  c=getStore()?.getClass?.(c.id)||c;
  const forceConflict=options?.forceConflict===true;
  const expectedRemoteModifiedAt=Number(options?.expectedRemoteModifiedAt||0);
  const casRetry=Number(options?.casRetry||0);
  const client = context.client;
  const cloud = context.identity;

  if (!client || !cloud?.user?.id) return false;

  // A stale browser may still think the class is open. Check the server
  // before writing so an authoritative completed class is pull-only.
  const existing=await fetchRemoteById(c.id,context);
  const loadedRefs=await loadRefs(false,context);
  const remote=existing?remoteToLocal(existing,loadedRefs):null;
  const remoteModified=msFromIso(existing?.client_modified_at||existing?.updated_at);
  const metadata=classMetadataState(c,remote,remoteModified);
  context.check();
  if (remote && !window.RAPS_PERMISSIONS.canClass('readClass',remote)) return false;
  if (remote) {
    c.cloudScope = remote.cloudScope;
    c.cloudAccess = remote.cloudAccess;
  }
  // Closed records remain pull-only, but still require an authorized server
  // row; a local closed flag cannot certify synchronization or access.
  if (isClosedClass(c)) {
    if (!remote) return false;
    adoptLifecycle(c,remote);
    return true;
  }

  if (existing?.status==='completed') {
    adoptLifecycle(c,remote);
    return true;
  }

  if (getStore()?.ownsTrashAction?.(c.id)===false && (c.deletedAt || c.cloudSync?.trashAction)) {
    if (remote) { adoptLifecycle(c,remote); return true; }
    patchState(c.id,{status:'error',error:'This device has a queued class change belonging to another signed-in user. Sign in as that user to synchronize it.'});
    return false;
  }

  const visibility=trashDecision(c,remote);
  if (visibility.action && !window.RAPS_PERMISSIONS.hasRole('enterprise_admin')) {
    patchState(c.id,{enabled:true,status:'error',error:'Enterprise Administrator access is required to synchronize class deletion or restoration.'});
    return false;
  }
  if (visibility.adopt) { adoptLifecycle(c,remote); return true; }
  if (remote && !window.RAPS_PERMISSIONS.canClass('manageClass',remote)) {
    patchState(c.id,{enabled:true,status:'error',error:'Your account does not have permission to manage this class.'});
    return false;
  }
  if (visibility.action && existing) {
    return pushTrashAction(c,existing,remote,visibility.action,options);
  }
  const unfinishedNewTrash=visibility.action?.kind==='delete' && !existing && await hasUnfinishedAssessment(c,context);
  context.check();
  if (unfinishedNewTrash) {
    patchState(c.id,{enabled:true,status:'error',error:'Finalize or void every assessment in progress before deleting this class.'});
    return false;
  }
  if (String(c?.cloudSync?.status||'')==='conflict' && !forceConflict) {
    return false;
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
    const latest=await fetchRemoteById(c.id,context);
    context.check();
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

  if (!base || !loadedRefs.majcomById.has(base.majcom_id)) {
    patchState(c.id, {
      enabled: true,
      status: 'error',
      error: 'Cloud sync requires a catalog home installation.',
      lastAttemptAt: Date.now()
    });
    return false;
  }
  const proposed = {...c, id:existing ? c.id : '', cloudScope:{baseId:base.id,majcomId:base.majcom_id,baseCode:base.code},
    cloudSync:{...(c.cloudSync || {}),createdBy:existing?.created_by || context.userId}};
  const knownOwners = [c.localCreatedByUserId,c.cloudSync?.createdBy].filter(Boolean);
  if ((!existing && (!knownOwners.length || knownOwners.some(id => id !== context.userId))) ||
    !window.RAPS_PERMISSIONS.canClass('manageClass',proposed)) {
    patchState(c.id,{enabled:true,status:'error',error:'Your account cannot create or move a class into the selected installation.'});
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
    created_by: existing?.created_by || context.userId,
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
    let write=client.from('classes').update(payload).eq('id',c.id).eq('status',existing.status);
    if (existing.client_modified_at) {
      write=write.eq('client_modified_at',existing.client_modified_at);
    }
    if (existing.updated_at) {
      write=write.eq('updated_at',existing.updated_at);
    }

    const result=await write
      .select('id, base_id, name, course_type, curriculum_version_id, start_date, end_date, status, created_by, created_at, updated_at, app_data, client_modified_at, source_device_id')
      .maybeSingle();
    context.check();

    if (result.error) {
      patchState(c.id,{
        enabled:true,
        status:navigator.onLine?'error':'offline',
        error:shortError(result.error)
      });
      throw result.error;
    }

    if (!result.data) {
      const latest=await fetchRemoteById(c.id,context);
      context.check();
      const latestRemote=latest?remoteToLocal(latest,loadedRefs):null;
      const latestModified=msFromIso(latest?.client_modified_at||latest?.updated_at);
      const latestMetadata=classMetadataState(c,latestRemote,latestModified);

      if (latest && (latest.status==='completed'||latest.status==='archived'||
          Number(latestRemote.restoredAt||0)!==Number(c.restoredAt||0))) {
        return pushClassUnlocked(c,{...options,casRetry:casRetry+1});
      }

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
    // INSERT ... RETURNING evaluates the SELECT policies in the insertion
    // statement's snapshot. The restrictive class-visibility helper cannot
    // see that new class yet. Write without a representation, then verify the
    // committed row through the normal authenticated SELECT in a new request.
    const result=await client
      .from('classes')
      .insert(payload);
    context.check();

    if (result.error) {
      if (String(result.error?.code||'')==='23505') {
        if (casRetry<2) return pushClassUnlocked(c,{...options,casRetry:casRetry+1});
        const latest=await fetchRemoteById(c.id,context);
        context.check();
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
    try {
      data=await fetchRemoteById(c.id,context);
      context.check();
    } catch (error) {
      context.check();
      patchState(c.id,{
        enabled:true,status:navigator.onLine?'error':'offline',error:shortError(error)
      });
      throw error;
    }
    if (data) {
      const insertedRemote=remoteToLocal(payload,loadedRefs);
      const verifiedRemote=remoteToLocal(data,loadedRefs);
      if (data.base_id!==payload.base_id || data.created_by!==payload.created_by ||
          data.curriculum_version_id!==payload.curriculum_version_id || data.status!==payload.status ||
          classMetadataSignature(verifiedRemote)!==classMetadataSignature(insertedRemote)) {
        markClassConflict(c,classMetadataState(c,verifiedRemote,msFromIso(data.client_modified_at||data.updated_at)),
          'The server class changed after creation. No local metadata was overwritten; use Sync Classes and review the conflict before continuing.');
        return false;
      }
    }
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
  if (visibility.action) { acknowledgeTrashAction(c,savedRemote,visibility.action); return true; }
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
  const context = options.context ? classRequestContext(options.context,c.id) : requestContext({classId:c.id});
  if (!context) return Promise.resolve(false);
  getStore()?.recoverTrashActions?.();

  const previous = classPushTails.get(c.id) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(() => withContext(context,false, token => pushClassUnlocked(c, {...options,context:token})));

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
    cloudScope:{ baseId:row.base_id || '', majcomId:base?.majcom_id || '', baseCode:base?.code || '', available:!!(base && majcom) },
    cloudAccess:{ userId:loadedRefs.userId, assignedEvaluator:loadedRefs.assignedClassIds.has(row.id) },
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
    restoredAt: appData.restoredAt || null,
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

async function pullVisibleClassesUnlocked(context) {
  context.check();
  const client = context.client;
  const store = context.store;
  if (!client || !store) return 0;
  const loadedRefs = await loadRefs(false,context);

  const data=[];
  const pageSize=250;
  // PostgREST can cap a response below the requested page size. Keep reading
  // until an empty page and advance by the number actually returned. ID order
  // stays stable while another device changes class metadata or lifecycle.
  for (let offset=0;;) {
    const page=await client.from('classes')
      .select('id, base_id, name, course_type, curriculum_version_id, start_date, end_date, status, created_by, created_at, updated_at, app_data, client_modified_at, source_device_id')
      .order('id',{ascending:true}).range(offset,offset+pageSize-1);
    if (offset>0 && page.error?.code==='PGRST103') break;
    if (page.error) throw page.error;
    if (!page.data?.length) break;
    data.push(...page.data);
    offset+=page.data.length;
  }

  let imported = 0;
  for (let row of data) {
    context.check();
    if (store.isLocalCopyHidden?.(row.id)) continue;
    // A push may have read an older active revision before another device
    // deleted this class. Settle it and fetch the lifecycle again; skipping
    // the tombstone here used to leave a visible class labelled SYNCED.
    if (classPushTails.has(row.id)) {
      while (classPushTails.has(row.id)) {
        await classPushTails.get(row.id).catch(()=>{});
      }
      row=await fetchRemoteById(row.id,context);
      context.check();
      if (!row) continue; // Absence is not evidence of an authorized deletion.
    }
    const remote=remoteToLocal(row,loadedRefs);
    if (!window.RAPS_PERMISSIONS.canClass('readClass',remote)) continue;
    if (store.isLocalCopyHidden?.(row.id)) continue;
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

    if (row.status==='completed') {
      adoptLifecycle(local,remote); imported++; continue;
    }
    if (store.ownsTrashAction?.(local.id)===false && (local.deletedAt || local.cloudSync?.trashAction)) {
      adoptLifecycle(local,remote); imported++; continue;
    }
    const visibility=trashDecision(local,remote);
    if (visibility.adopt) {
      adoptLifecycle(local,remote); imported++; continue;
    }
    if (visibility.action) {
      patchState(local.id,{enabled:true,status:navigator.onLine?'pending':'offline',trashAction:visibility.action});
      continue;
    }

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

function pullVisibleClasses(context=null) {
  return withContext(context || requestContext(),0,pullVisibleClassesUnlocked);
}

function loadClass(classId) {
  if (typeof classId !== 'string' || !classId) return Promise.resolve(false);
  const context = requestContext({classId,allowHidden:true});
  return withContext(context,false,async token => {
    const loadedRefs = await loadRefs(false,token);
    const row = await fetchRemoteById(classId,token);
    if (!row) throw new Error('This class is unavailable or your account no longer has access.');
    const remote = remoteToLocal(row,loadedRefs);
    if (!window.RAPS_PERMISSIONS.canClass('readClass',remote)) throw new Error('Your account does not have access to this class.');
    token.check();
    remote.cloudSync.baseMetadataSignature = classMetadataSignature(remote);
    return !!token.store.upsertFromCloud(remote,{restoreLocalCopy:true,preserveStudents:true});
  });
}

async function inspectClassConflict(c, context=null) {
  if (!context) return withContext(requestContext({classId:c?.id}),null, token => inspectClassConflict(c,token));
  context.check();
  if (!window.RAPS_PERMISSIONS.canClass('resolveConflict',c)) throw new Error('You do not have permission to resolve this class conflict.');
  if (!c?.id) throw new Error('Class is unavailable.');
  if (!navigator.onLine) throw new Error('Class conflict resolution requires an online connection.');
  const loadedRefs=await loadRefs(false,context);
  const row=await fetchRemoteById(c.id,context);
  if (!row) throw new Error('The server class no longer exists.');
  const remote=remoteToLocal(row,loadedRefs);
  if (!window.RAPS_PERMISSIONS.canClass('resolveConflict',remote)) throw new Error('Your account does not have permission to resolve this class conflict.');
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

async function resolveClassConflict(c, strategy, context=null) {
  if (!context) return withContext(requestContext({classId:c?.id}),false, token => resolveClassConflict(c,strategy,token));
  context.check();
  strategy=String(strategy||'').toLowerCase();
  if (!['server','local'].includes(strategy)) throw new Error('Class conflict resolution must choose SERVER or LOCAL.');
  if (String(c?.cloudSync?.status||'')!=='conflict') throw new Error('This class is not currently in conflict.');

  const inspection=await inspectClassConflict(c,context);
  context.check();
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
    const loadedRefs=await loadRefs(false,context);
    context.check();
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
    context,
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

async function pushPendingClasses(context) {
  context.check();
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
      if (await pushClass(c,{context})) synced++;
      context.check();
    } catch (error) {
      if (!context.current()) throw error;
      patchState(c.id,{status:navigator.onLine?'error':'offline',error:shortError(error)});
      console.warn('RaPS class sync failed', c.id, error);
    }
  }
  return { attempted:classes.length, synced };
}

function queueUnconfirmedTrash() {
  const store=getStore();
  if (!store || !window.RAPS_PERMISSIONS?.hasRole('enterprise_admin')) return;
  for (const c of store.getClasses()) {
    if (!c || isClosedClass(c)) continue;
    if (store.isLocalCopyHidden?.(c.id)) continue;
    if (store.ownsTrashAction?.(c.id)===false) continue;
    const state=c.cloudSync||{};
    if (state.trashAction) {
      store.rememberTrashAction?.(c.id,state.trashAction);
      if (!classPushTails.has(c.id)) patchState(c.id,{enabled:true,status:navigator.onLine?'pending':'offline'});
      continue;
    }
    if (!c.deletedAt) continue;
    let confirmed=0;
    try { confirmed=Number(JSON.parse(state.baseMetadataSignature||'{}').deletedAt||0); } catch {}
    if (confirmed===Number(c.deletedAt) && state.status==='synced') continue;
    const action={kind:'delete',requestedAt:Number(c.deletedAt),expectedDeletedAt:0,expectedRestoredAt:Number(c.restoredAt||0)};
    store.rememberTrashAction?.(c.id,action);
    patchState(c.id,{
      enabled:true,status:navigator.onLine?'pending':'offline',error:'',
      trashAction:action
    });
  }
}

async function syncAll({ silent=false }={}) {
  if (syncing && syncing.current()) return;
  const context = requestContext();
  if (!context) return;

  syncing = context;
  setButtonBusy(true);
  setGlobalStatus('Syncing classes…', 'syncing');

  try {
    await context.ready();
    context.check();
    getStore()?.recoverTrashActions?.();
    queueUnconfirmedTrash();
    await loadRefs(true,context);
    const pulled = await pullVisibleClasses(context);
    context.check();
    getStore()?.recoverTrashActions?.();
    queueUnconfirmedTrash();
    const pushed = await pushPendingClasses(context);
    context.check();
    const total = getStore()?.getClasses()?.filter(c => c?.cloudSync?.enabled)?.length || 0;
    const remaining=getStore()?.getClasses()?.filter(c=>c?.cloudSync?.enabled &&
      (c.cloudSync.trashAction || classPushTails.has(c.id) || ['pending','offline','error','conflict','syncing'].includes(c.cloudSync.status)))||[];
    setGlobalStatus(remaining.length?`${remaining.length} class change(s) need synchronization · review sync status`:`Cloud classes synced · ${total} managed`,remaining.length?'error':'synced');
    if (!silent && (pulled || pushed.synced)) {
      console.info(`RaPS class sync complete: ${pulled} pulled, ${pushed.synced} pushed.`);
    }
    window.dispatchEvent(new CustomEvent('raps-class-sync-complete',{detail:{pulled,pushed:pushed.synced,total}}));
  } catch (error) {
    if (!context.current()) return;
    console.error('RaPS class sync error', error);
    setGlobalStatus(`Class sync error · ${shortError(error)}`, 'error');
  } finally {
    if (syncing === context) {
      syncing = false;
      if (context.current()) setButtonBusy(false);
    }
  }
}

function queueClass(classId) {
  const store = getStore();
  const c = store?.getClass(classId);
  if (!c) return;
  if (store.isLocalCopyHidden?.(classId) || !window.RAPS_PERMISSIONS?.canClass('manageClass',c,{online:false})) return;
  if (String(c?.cloudSync?.status||'')==='conflict' && !c.cloudSync?.trashAction) {
    patchState(classId,{
      enabled:true,
      status:'conflict',
      error:c.cloudSync?.error||'Resolve the class metadata conflict before syncing this class.'
    });
    return;
  }
  if (isClosedClass(c)) {
    return;
  }
  patchState(classId, {
    enabled:true,
    status:navigator.onLine ? 'pending' : 'offline',
    error:''
  });
  const context = requestContext({classId});
  if (context) {
    window.setTimeout(() => pushClass(c,{context}).then(ok=>{
      if (context.current() && !ok) setGlobalStatus('Class change is not synchronized · review sync status','error');
    }).catch(error => {
      if (!context.current()) return;
      patchState(c.id,{status:'error',error:shortError(error)});
      setGlobalStatus(`Class sync error · ${shortError(error)}`,'error');
    }), 50);
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
  if (!detail?.user?.id) {
    setButtonBusy(false);
    setGlobalStatus('Sign in to synchronize classes.','');
    return;
  }
  syncAll({ silent:true });
});

window.addEventListener('online', () => syncAll({ silent:true }));
window.addEventListener('focus', () => { if (cloudReady()) syncAll({silent:true}); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState==='visible' && cloudReady()) syncAll({silent:true});
});
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

window.RAPS_CLASS_SYNC_BUILD = '3.4.12-web.12';

window.RAPS_CLASS_SYNC = Object.freeze({
  syncAll,
  pushClass,
  pullVisibleClasses,
  loadClass,
  classMetadataSignature,
  inspectClassConflict,
  resolveClassConflict
});

})();
