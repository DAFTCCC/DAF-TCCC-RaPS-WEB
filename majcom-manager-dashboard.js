(() => {
'use strict';

let mounted = false;
let loadGeneration = 0;
let loading = false;
let raw = null;

const byId = (id) => document.getElementById(id);
const cloud = () => window.RAPS_CLOUD || null;
const supabase = () => window.RAPS_SUPABASE || null;
const membership = () => window.RAPS_PERMISSIONS?.membership('majcom_manager') || null;

// Shared Enterprise Trash retains its server records for recovery, but is not
// training activity. Closed/completed retention records remain reportable.
function isReportableClass(c) {
  return !!c && c.status !== 'archived' && !c.app_data?.deletedAt;
}

function dashboardRequest() {
  const permissions = window.RAPS_PERMISSIONS;
  const token = permissions?.snapshot();
  const client = supabase();
  const generation = loadGeneration;
  const current = () => generation === loadGeneration && permissions?.isCurrent(token) && isMajcomManager();
  return { client, current, assert() {
    if (!current()) throw new Error('Your account or reporting access changed. Refresh the dashboard.');
  } };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}

function isMajcomManager() {
  return window.RAPS_PERMISSIONS?.hasRole('majcom_manager') === true;
}

function majcomName() {
  const m = membership();
  return m?.majcoms?.code || m?.majcoms?.name || 'Assigned MAJCOM';
}

function pretty(value) {
  if (!value) return 'Unclassified';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function pct(value) {
  return Number.isFinite(value) ? Math.round(value * 100) + '%' : '—';
}

function dateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

function dateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function selectedDays() {
  const n = Number(byId('majcomPeriod')?.value || 90);
  return Number.isFinite(n) ? n : 90;
}

function selectedBaseId() {
  return byId('majcomBaseFilter')?.value || '';
}

function cutoffMs(days) {
  if (!days) return 0;
  return Date.now() - (days * 86400000);
}

function setMessage(text, kind = '') {
  const el = byId('majcomDashboardMessage');
  if (!el) return;
  el.textContent = text;
  el.className = ('majcomDashboardMessage ' + kind).trim();
}

function clearRenderedReport() {
  for (const id of ['majcomBaseFilter', 'majcomBaseTable', 'majcomClassTable', 'majcomContributors', 'majcomCourseTable', 'majcomDataQuality', 'majcomEvaluatorTable', 'majcomFailureModes', 'majcomIncompleteTable', 'majcomKpis']) {
    const element = byId(id);
    if (element) element.innerHTML = '';
  }
}

function setLoading(value) {
  loading = !!value;
  const btn = byId('majcomRefreshBtn');
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Refreshing…' : 'Refresh Cloud Data';
  }
}

function inject() {
  if (mounted || byId('majcomManagerDashboard')) return;

  const area = byId('areaProgram');
  if (!area) return;

  const section = document.createElement('section');
  section.id = 'majcomManagerDashboard';
  section.className = 'card managementCard majcomDashboard hidden';
  section.innerHTML = [
    '<div class="cardHead">',
      '<span>My MAJCOM Operations</span>',
      '<span id="majcomDashboardScope">MAJCOM Manager</span>',
    '</div>',
    '<p class="helper">Cloud-scoped view of every active installation assigned to your MAJCOM. Supabase Row Level Security remains the security boundary; this dashboard does not broaden your account access.</p>',
    '<p class="helper">Removing a local copy keeps the server record in these reports. Shared Enterprise Trash and verified NUC CSV archives are excluded. Pending or failed CSV archives remain counted; closed classes remain as training history.</p>',

    '<div class="majcomToolbar">',
      '<label><span>Reporting window</span><select id="majcomPeriod">',
        '<option value="30">Last 30 days</option>',
        '<option value="90" selected>Last 90 days</option>',
        '<option value="365">Last 12 months</option>',
        '<option value="0">All available</option>',
      '</select></label>',
      '<label><span>Installation</span><select id="majcomBaseFilter"><option value="">All assigned installations</option></select></label>',
      '<button id="majcomRefreshBtn" class="action primary" type="button">Refresh Cloud Data</button>',
      '<span id="majcomDashboardMessage" class="majcomDashboardMessage"></span>',
    '</div>',

    '<div id="majcomKpis" class="analyticsKpis"></div>',

    '<details class="analyticsDetails" open>',
      '<summary>Installation Comparison</summary>',
      '<div id="majcomBaseTable"></div>',
    '</details>',

    '<details class="analyticsDetails" open>',
      '<summary>Class Operations</summary>',
      '<div id="majcomClassTable"></div>',
    '</details>',

    '<details class="analyticsDetails" open>',
      '<summary>Evaluator Workload by Installation</summary>',
      '<div id="majcomEvaluatorTable"></div>',
    '</details>',

    '<details class="analyticsDetails">',
      '<summary>Incomplete Evaluations</summary>',
      '<div id="majcomIncompleteTable"></div>',
    '</details>',

    '<details class="analyticsDetails" open>',
      '<summary>Observed Failure Patterns</summary>',
      '<div class="analyticsSplit">',
        '<div><h3>Failure Modes</h3><div id="majcomFailureModes"></div></div>',
        '<div><h3>Primary Contributors</h3><div id="majcomContributors"></div></div>',
      '</div>',
    '</details>',

    '<details class="analyticsDetails" open>',
      '<summary>Missed Trends</summary>',
      '<div id="majcomTrends"></div>',
    '</details>',
    '<div id="majcomDataQuality" class="dataQualityPanel"></div>',
    '<p class="helper majcomDashboardFoot">Metrics are descriptive. PASS rate uses finalized evaluations with an overall PASS/FAIL result. Incomplete evaluations are shown separately.</p>'
  ].join('');

  const intro = area.querySelector('.areaIntro');
  if (intro) intro.insertAdjacentElement('afterend', section);
  else area.insertAdjacentElement('afterbegin', section);

  byId('majcomRefreshBtn')?.addEventListener('click', () => load(true));
  byId('majcomPeriod')?.addEventListener('change', render);
  byId('majcomBaseFilter')?.addEventListener('change', render);

  document.querySelector('[data-home-area="program"]')?.addEventListener('click', () => {
    if (isMajcomManager()) window.setTimeout(() => load(true), 0);
  });

  mounted = true;
}

async function paged(makeQuery, pageSize = 1000, access = null) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    access?.assert();
    const { data, error } = await makeQuery(from, to);
    access?.assert();
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function queryChunks(table, select, column, values, extra = null, size = 100, access = null) {
  access?.assert();
  if (!values.length) return [];
  const out = [];

  for (let i = 0; i < values.length; i += size) {
    const ids = values.slice(i, i + size);
    const rows = await paged((from, to) => {
      let q = (access?.client || supabase()).from(table).select(select).in(column, ids);
      if (extra) q = extra(q);
      return q.range(from, to);
    }, 1000, access);
    out.push(...rows);
  }

  return out;
}

function groupCounts(rows, key) {
  const map = new Map();

  rows.forEach((row) => {
    const label = row?.[key] || 'unclassified';
    map.set(label, (map.get(label) || 0) + 1);
  });

  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function barList(targetId, rows, emptyText) {
  const el = byId(targetId);
  if (!el) return;

  if (!rows.length) {
    el.innerHTML = '<div class="analyticsEmpty">' + esc(emptyText) + '</div>';
    return;
  }

  const max = Math.max(...rows.map((row) => row.count), 1);

  el.innerHTML = rows.slice(0, 8).map((row) => {
    const width = Math.max(4, Math.round((row.count / max) * 100));
    return [
      '<div class="rootCauseRow">',
        '<div><span>', esc(pretty(row.label)), '</span><b>', row.count, '</b></div>',
        '<div class="rootCauseBar"><i style="width:', width, '%"></i></div>',
      '</div>'
    ].join('');
  }).join('');
}

function courseLabel(c) {
  const tier = String(c?.app_data?.tierId || '');
  const map = { '1':'ASM', '2':'CLS', '3':'CMC', '4':'CPP' };
  return map[tier] || c?.course_type || '—';
}

function profileLabel(id, profiles) {
  const profile = profiles.get(id);
  if (profile?.display_name) return profile.display_name;
  if (profile?.email) return profile.email;
  return id ? 'Evaluator ' + String(id).slice(0, 8) : 'Unassigned';
}

function participantLabel(id, participants) {
  const participant = participants.get(id);
  if (participant?.display_name) return participant.display_name;
  if (participant?.participant_identifier) return participant.participant_identifier;
  return id ? 'Participant ' + String(id).slice(0, 8) : '—';
}

function filteredData() {
  if (!raw) return null;

  const baseFilter = selectedBaseId();
  const days = selectedDays();
  const cutoff = cutoffMs(days);

  const bases = baseFilter
    ? raw.bases.filter((base) => base.id === baseFilter)
    : raw.bases.slice();

  const baseIds = new Set(bases.map((base) => base.id));

  const classes = raw.classes.filter((c) => {
    if (!baseIds.has(c.base_id)) return false;
    if (!cutoff) return true;
    if (c.status === 'active' || c.status === 'draft') return true;
    return c.start_date ? Date.parse(c.start_date) >= cutoff : false;
  });

  const classIds = new Set(classes.map((c) => c.id));
  const events = raw.events.filter((event) => classIds.has(event.class_id));
  const eventIds = new Set(events.map((event) => event.id));
  const evaluations = raw.evaluations.filter((evaluation) => eventIds.has(evaluation.event_id));
  const evaluationIds = new Set(evaluations.map((evaluation) => evaluation.id));
  const failures = raw.failures.filter((failure) => evaluationIds.has(failure.evaluation_id));
  const results = (raw.results || []).filter((result) => evaluationIds.has(result.evaluation_id));

  return {
    bases,
    classes,
    events,
    evaluations,
    failures,
    results,
    profileRows: raw.profileRows,
    participantRows: raw.participantRows
  };
}

function buildModel(data) {
  const baseById = new Map(data.bases.map((base) => [base.id, base]));
  const classById = new Map(data.classes.map((c) => [c.id, c]));
  const eventById = new Map(data.events.map((event) => [event.id, event]));
  const profiles = new Map(data.profileRows.map((profile) => [profile.id, profile]));
  const participants = new Map(data.participantRows.map((participant) => [participant.id, participant]));

  const finalized = data.evaluations.filter((evaluation) => evaluation.status === 'finalized');
  const incomplete = data.evaluations.filter((evaluation) => evaluation.status === 'draft' || evaluation.status === 'in_progress');
  const pass = finalized.filter((evaluation) => evaluation.overall_result === 'pass').length;
  const fail = finalized.filter((evaluation) => evaluation.overall_result === 'fail').length;
  const rated = pass + fail;

  const baseRows = data.bases.map((base) => {
    const classes = data.classes.filter((c) => c.base_id === base.id);
    const classIds = new Set(classes.map((c) => c.id));
    const events = data.events.filter((event) => classIds.has(event.class_id));
    const eventIds = new Set(events.map((event) => event.id));
    const evaluations = data.evaluations.filter((evaluation) => eventIds.has(evaluation.event_id));
    const final = evaluations.filter((evaluation) => evaluation.status === 'finalized');
    const basePass = final.filter((evaluation) => evaluation.overall_result === 'pass').length;
    const baseFail = final.filter((evaluation) => evaluation.overall_result === 'fail').length;

    return {
      id: base.id,
      code: base.code || '',
      name: base.name || base.code || 'Unnamed installation',
      classes: classes.length,
      students: new Set(evaluations.map((evaluation) => evaluation.participant_id).filter(Boolean)).size,
      evaluations: evaluations.length,
      finalized: final.length,
      incomplete: evaluations.filter((evaluation) => evaluation.status === 'draft' || evaluation.status === 'in_progress').length,
      passRate: (basePass + baseFail) ? basePass / (basePass + baseFail) : null,
      evaluators: new Set(evaluations.map((evaluation) => evaluation.evaluator_id).filter(Boolean)).size
    };
  }).sort((a, b) => b.evaluations - a.evaluations || a.name.localeCompare(b.name));

  const classRows = data.classes.map((c) => {
    const base = baseById.get(c.base_id);
    const events = data.events.filter((event) => event.class_id === c.id);
    const eventIds = new Set(events.map((event) => event.id));
    const evaluations = data.evaluations.filter((evaluation) => eventIds.has(evaluation.event_id));
    const final = evaluations.filter((evaluation) => evaluation.status === 'finalized');
    const classPass = final.filter((evaluation) => evaluation.overall_result === 'pass').length;
    const classFail = final.filter((evaluation) => evaluation.overall_result === 'fail').length;

    return {
      base: base?.code || base?.name || '—',
      name: c.name || 'Untitled Class',
      course: courseLabel(c),
      date: c.start_date,
      status: c.status || 'draft',
      evaluations: evaluations.length,
      finalized: final.length,
      incomplete: evaluations.filter((evaluation) => evaluation.status === 'draft' || evaluation.status === 'in_progress').length,
      passRate: (classPass + classFail) ? classPass / (classPass + classFail) : null
    };
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const workload = new Map();

  data.evaluations.forEach((evaluation) => {
    const event = eventById.get(evaluation.event_id);
    const c = classById.get(event?.class_id);
    const base = baseById.get(c?.base_id);
    const evaluatorId = evaluation.evaluator_id || 'unassigned';
    const key = evaluatorId + '|' + (base?.id || 'unknown');

    const row = workload.get(key) || {
      base: base?.code || base?.name || '—',
      evaluator: profileLabel(evaluation.evaluator_id, profiles),
      total: 0,
      finalized: 0,
      incomplete: 0,
      pass: 0,
      fail: 0,
      last: null
    };

    row.total += 1;
    if (evaluation.status === 'finalized') row.finalized += 1;
    if (evaluation.status === 'draft' || evaluation.status === 'in_progress') row.incomplete += 1;
    if (evaluation.overall_result === 'pass') row.pass += 1;
    if (evaluation.overall_result === 'fail') row.fail += 1;

    const last = evaluation.completed_at || evaluation.updated_at || evaluation.started_at;
    if (last && (!row.last || Date.parse(last) > Date.parse(row.last))) row.last = last;

    workload.set(key, row);
  });

  const evaluatorRows = [...workload.values()]
    .sort((a, b) => b.total - a.total || a.base.localeCompare(b.base) || a.evaluator.localeCompare(b.evaluator));

  const incompleteRows = incomplete.map((evaluation) => {
    const event = eventById.get(evaluation.event_id);
    const c = classById.get(event?.class_id);
    const base = baseById.get(c?.base_id);

    return {
      base: base?.code || base?.name || '—',
      className: c?.name || event?.name || 'Unknown class',
      participant: participantLabel(evaluation.participant_id, participants),
      evaluator: profileLabel(evaluation.evaluator_id, profiles),
      status: pretty(evaluation.status),
      started: evaluation.started_at,
      updated: evaluation.updated_at || evaluation.started_at
    };
  }).sort((a, b) => Date.parse(b.updated || 0) - Date.parse(a.updated || 0));

  return {
    kpis: {
      installations: data.bases.length,
      activeInstallations: baseRows.filter((row) => row.classes || row.evaluations).length,
      classes: data.classes.length,
      students: new Set(data.evaluations.map((evaluation) => evaluation.participant_id).filter(Boolean)).size,
      evaluations: data.evaluations.length,
      finalized: finalized.length,
      incomplete: incomplete.length,
      passRate: rated ? pass / rated : null,
      failCount: fail,
      evaluators: new Set(data.evaluations.map((evaluation) => evaluation.evaluator_id).filter(Boolean)).size
    },
    baseRows,
    classRows,
    evaluatorRows,
    incompleteRows,
    failureModes: groupCounts(data.failures, 'failure_mode'),
    contributors: groupCounts(data.failures, 'primary_contributor'),
    quality: {
      classesWithoutEvents: data.classes.filter((c) => !data.events.some((event) => event.class_id === c.id)).length,
      evaluationsWithoutEvaluator: data.evaluations.filter((evaluation) => !evaluation.evaluator_id).length,
      failuresWithoutContributor: data.failures.filter((failure) => !failure.primary_contributor).length
    }
  };
}

function render() {
  inject();

  const card = byId('majcomManagerDashboard');
  if (!card) return;

  card.classList.toggle('hidden', !isMajcomManager());
  if (!isMajcomManager() || !raw) return;

  const data = filteredData();
  const model = buildModel(data);
  const k = model.kpis;
  window.RAPS_TRENDS?.render(byId('majcomTrends'), window.RAPS_TRENDS.build({
    evaluations: data.evaluations, results: data.results, criteria: raw.criteria || [], profiles: data.profileRows }));

  byId('majcomKpis').innerHTML = [
    ['Installations', k.activeInstallations + '/' + k.installations, 'with activity / in view'],
    ['Classes', k.classes, 'in reporting window'],
    ['Students assessed', k.students, 'unique participants'],
    ['Evaluations', k.evaluations, 'all attempts'],
    ['Finalized', k.finalized, 'completed evaluations'],
    ['Incomplete', k.incomplete, 'draft + in progress'],
    ['Pass rate', pct(k.passRate), k.failCount + ' finalized FAIL'],
    ['Evaluators', k.evaluators, 'with activity']
  ].map((item) => [
    '<div class="analyticsKpi">',
      '<small>', esc(item[0]), '</small>',
      '<strong>', esc(item[1]), '</strong>',
      '<span>', esc(item[2]), '</span>',
    '</div>'
  ].join('')).join('');

  byId('majcomBaseTable').innerHTML = model.baseRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable majcomBaseTable">',
    '<thead><tr><th>Installation</th><th>Classes</th><th>Students</th><th>Evaluations</th><th>Incomplete</th><th>Pass rate</th><th>Evaluators</th><th>Drill-down</th></tr></thead><tbody>',
    model.baseRows.map((row) => [
      '<tr>',
        '<td><b>', esc(row.code || row.name), '</b><div>', esc(row.name), '</div></td>',
        '<td>', row.classes, '</td>',
        '<td>', row.students, '</td>',
        '<td>', row.finalized, '/', row.evaluations, '</td>',
        '<td class="', row.incomplete ? 'warnText' : '', '">', row.incomplete, '</td>',
        '<td>', esc(pct(row.passRate)), '</td>',
        '<td>', row.evaluators, '</td>',
        '<td><button class="ghost small" type="button" data-majcom-base="', esc(row.id), '">View Base</button></td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No installations are assigned to this MAJCOM.</div>';

  byId('majcomBaseTable').querySelectorAll('[data-majcom-base]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = byId('majcomBaseFilter');
      if (filter) filter.value = button.dataset.majcomBase || '';
      render();
      byId('majcomManagerDashboard')?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });

  byId('majcomClassTable').innerHTML = model.classRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable majcomClassTable">',
    '<thead><tr><th>Installation</th><th>Class</th><th>Course</th><th>Date</th><th>Status</th><th>Finalized</th><th>Incomplete</th><th>Pass rate</th></tr></thead><tbody>',
    model.classRows.slice(0, 200).map((row) => [
      '<tr>',
        '<td><b>', esc(row.base), '</b></td>',
        '<td>', esc(row.name), '</td>',
        '<td>', esc(row.course), '</td>',
        '<td>', esc(dateOnly(row.date)), '</td>',
        '<td>', esc(pretty(row.status)), '</td>',
        '<td>', row.finalized, '/', row.evaluations, '</td>',
        '<td class="', row.incomplete ? 'warnText' : '', '">', row.incomplete, '</td>',
        '<td>', esc(pct(row.passRate)), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No classes were found for this scope and reporting window.</div>';

  byId('majcomEvaluatorTable').innerHTML = model.evaluatorRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable majcomEvaluatorTable">',
    '<thead><tr><th>Installation</th><th>Evaluator</th><th>Total</th><th>Finalized</th><th>Incomplete</th><th>PASS</th><th>FAIL</th><th>Last activity</th></tr></thead><tbody>',
    model.evaluatorRows.map((row) => [
      '<tr>',
        '<td><b>', esc(row.base), '</b></td>',
        '<td>', esc(row.evaluator), '</td>',
        '<td>', row.total, '</td>',
        '<td>', row.finalized, '</td>',
        '<td class="', row.incomplete ? 'warnText' : '', '">', row.incomplete, '</td>',
        '<td>', row.pass, '</td>',
        '<td class="', row.fail ? 'bad' : '', '">', row.fail, '</td>',
        '<td>', esc(dateTime(row.last)), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No evaluator activity was found in this view.</div>';

  byId('majcomIncompleteTable').innerHTML = model.incompleteRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable majcomIncompleteTable">',
    '<thead><tr><th>Installation</th><th>Class</th><th>Participant</th><th>Evaluator</th><th>Status</th><th>Started</th><th>Last activity</th></tr></thead><tbody>',
    model.incompleteRows.slice(0, 150).map((row) => [
      '<tr>',
        '<td><b>', esc(row.base), '</b></td>',
        '<td>', esc(row.className), '</td>',
        '<td>', esc(row.participant), '</td>',
        '<td>', esc(row.evaluator), '</td>',
        '<td>', esc(row.status), '</td>',
        '<td>', esc(dateTime(row.started)), '</td>',
        '<td>', esc(dateTime(row.updated)), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No incomplete evaluations in this view.</div>';

  barList('majcomFailureModes', model.failureModes, 'No failed observations with a recorded failure mode.');
  barList('majcomContributors', model.contributors, 'No failed observations with a recorded primary contributor.');

  const q = model.quality;
  byId('majcomDataQuality').innerHTML = [
    '<h3>Data quality</h3><div class="dataQualityGrid">',
      '<div class="dataQualityItem ', q.classesWithoutEvents ? 'warn' : 'good', '"><b>', q.classesWithoutEvents, '</b><span>classes without evaluation events</span></div>',
      '<div class="dataQualityItem ', q.evaluationsWithoutEvaluator ? 'warn' : 'good', '"><b>', q.evaluationsWithoutEvaluator, '</b><span>evaluations without evaluator attribution</span></div>',
      '<div class="dataQualityItem ', q.failuresWithoutContributor ? 'warn' : 'good', '"><b>', q.failuresWithoutContributor, '</b><span>failed observations missing contributor</span></div>',
    '</div>'
  ].join('');

  const baseId = selectedBaseId();
  const base = raw.bases.find((item) => item.id === baseId);
  const windowText = selectedDays() === 0
    ? 'all available data'
    : selectedDays() === 365
      ? 'last 12 months'
      : 'last ' + selectedDays() + ' days';

  setMessage(
    majcomName() + ' · ' + (base ? (base.code || base.name) : 'All assigned installations') +
    ' · ' + windowText + ' · refreshed ' + new Date().toLocaleTimeString(),
    'success'
  );
}

async function load(force = false) {
  inject();

  const card = byId('majcomManagerDashboard');
  if (!card) return;

  card.classList.toggle('hidden', !isMajcomManager());
  if (!isMajcomManager() || loading) return;

  if (!navigator.onLine || !cloud()?.connected) {
    setMessage('Connect to the network to refresh the My MAJCOM dashboard.', 'offline');
    return;
  }

  if (raw && !force) {
    render();
    return;
  }

  const client = supabase();
  const m = membership();
  if (!client || !m?.majcom_id) return;

  const access = dashboardRequest();
  const readPages = (makeQuery, pageSize = 1000) => paged(makeQuery, pageSize, access);
  const readChunks = (table, select, column, values, extra = null, chunkSize = 100) =>
    queryChunks(table, select, column, values, extra, chunkSize, access);

  setLoading(true);
  setMessage('Loading ' + majcomName() + ' cloud operations…', 'working');
  byId('majcomDashboardScope').textContent = majcomName() + ' · MAJCOM Manager';

  try {
    const bases = await readPages((from, to) =>
      client.from('bases')
        .select('id,code,name,majcom_id,active')
        .eq('majcom_id', m.majcom_id)
        .eq('active', true)
        .order('name')
        .range(from, to)
    );

    const baseIds = bases.map((base) => base.id);

    const allClasses = (await readChunks(
      'classes',
      'id,base_id,name,course_type,start_date,end_date,status,created_by,app_data,updated_at',
      'base_id',
      baseIds,
      (q) => q.neq('status', 'archived')
    )).filter(isReportableClass);

    let reportingArchives;
    try {
      reportingArchives = await readPages((from, to) =>
        client.from('class_reporting_archives')
          .select('class_id,request_id,status,requested_at,archived_at,worker_error')
          .order('class_id')
          .range(from, to)
      );
    } catch (error) {
      access.assert();
      throw new Error('NUC CSV archive status is unavailable. Check the server archive setup, then refresh this report.');
    }
    const archivedIds = new Set(reportingArchives.filter(row => row.status === 'archived').map(row => row.class_id));
    const classes = allClasses.filter(c => !archivedIds.has(c.id));

    const events = await readChunks(
      'evaluation_events',
      'id,class_id,base_id,name,event_date,status,created_by,updated_at',
      'class_id',
      classes.map((c) => c.id)
    );

    const evaluations = await readChunks(
      'evaluations',
      'id,event_id,participant_id,evaluator_id,attempt_number,status,overall_result,score_numerator,score_denominator,started_at,completed_at,updated_at',
      'event_id',
      events.map((event) => event.id)
    );

    // All graded results (PASS/FAIL) with the criterion, for Missed Trends.
    // Failure panels keep using the FAIL subset exactly as before.
    const results = await readChunks(
      'criterion_results',
      'evaluation_id,criterion_id,result,failure_mode,primary_contributor',
      'evaluation_id',
      evaluations.map((evaluation) => evaluation.id),
      (q) => q.in('result', ['pass', 'fail']).order('id')
    );
    const failures = results.filter((r) => r.result === 'fail');
    const criterionIds = [...new Set(results.map((r) => r.criterion_id).filter(Boolean))];
    let criteria = [];
    if (criterionIds.length) {
      try { criteria = await readChunks('criteria', 'id,criterion_code,critical', 'id', criterionIds); }
      catch (error) { console.warn('Criteria catalog unavailable for Missed Trends.', error); }
    }

    const evaluatorIds = [...new Set(evaluations.map((evaluation) => evaluation.evaluator_id).filter(Boolean))];
    const participantIds = [...new Set(evaluations.map((evaluation) => evaluation.participant_id).filter(Boolean))];

    let profileRows = [];
    if (evaluatorIds.length) {
      try {
        profileRows = await readChunks('profiles', 'id,display_name,email', 'id', evaluatorIds);
      } catch (error) {
        console.warn('MAJCOM dashboard could not resolve evaluator profile names.', error);
      }
    }

    let participantRows = [];
    if (participantIds.length) {
      try {
        participantRows = await readChunks('participants', 'id,participant_identifier,display_name', 'id', participantIds);
      } catch (error) {
        console.warn('MAJCOM dashboard could not resolve participant display names.', error);
      }
    }

    access.assert();
    raw = {
      bases,
      reportingArchives,
      classes,
      events,
      evaluations,
      failures,
      results,
      criteria,
      profileRows,
      participantRows
    };

    const filter = byId('majcomBaseFilter');
    const previous = filter?.value || '';

    if (filter) {
      filter.innerHTML =
        '<option value="">All assigned installations</option>' +
        bases.map((base) =>
          '<option value="' + esc(base.id) + '">' +
          esc(base.code || base.name) + ' · ' + esc(base.name) +
          '</option>'
        ).join('');

      if (previous && bases.some((base) => base.id === previous)) {
        filter.value = previous;
      }
    }

    render();
  } catch (error) {
    if (!access.current()) return;
    raw = null;
    clearRenderedReport();
    console.error('MAJCOM Manager dashboard failed', error);
    setMessage('Dashboard load failed: ' + (error?.message || error), 'error');
  } finally {
    if (access.current()) setLoading(false);
  }
}

window.addEventListener('raps-cloud-identity', () => {
  inject();
  loadGeneration++;
  setLoading(false);
  clearRenderedReport();
  setMessage('');
  raw = null;
  load(true);
});

// A completed sync may have moved classes to/from shared Trash. Cancel older
// report reads so they cannot put a pre-sync snapshot back on screen.
for (const eventName of ['raps-class-sync-complete', 'raps-class-lifecycle-synced']) {
  window.addEventListener(eventName, () => {
    if (!isMajcomManager()) return;
    loadGeneration++;
    raw = null;
    setLoading(false);
    load(true);
  });
}

window.addEventListener('online', () => {
  if (isMajcomManager()) load(true);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    inject();
    load(false);
  }, { once:true });
} else {
  inject();
  load(false);
}

window.RAPS_MAJCOM_MANAGER_DASHBOARD = Object.freeze({
  refresh: () => load(true)
});

})();
