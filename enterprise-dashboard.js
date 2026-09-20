(() => {
'use strict';

let mounted = false;
let loading = false;
let raw = null;

const byId = (id) => document.getElementById(id);
const cloud = () => window.RAPS_CLOUD || null;
const supabase = () => window.RAPS_SUPABASE || null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}

function isEnterpriseAdmin() {
  return cloud()?.role === 'enterprise_admin';
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

function ageDays(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

function selectedDays() {
  const n = Number(byId('enterprisePeriod')?.value || 90);
  return Number.isFinite(n) ? n : 90;
}

function selectedMajcomId() {
  return byId('enterpriseMajcomFilter')?.value || '';
}

function selectedBaseId() {
  return byId('enterpriseBaseFilter')?.value || '';
}

function selectedCourse() {
  return byId('enterpriseCourseFilter')?.value || '';
}

function cutoffMs(days) {
  return days ? Date.now() - (days * 86400000) : 0;
}

function setMessage(text, kind = '') {
  const el = byId('enterpriseDashboardMessage');
  if (!el) return;
  el.textContent = text;
  el.className = ('enterpriseDashboardMessage ' + kind).trim();
}

function setLoading(value) {
  loading = !!value;
  const btn = byId('enterpriseRefreshBtn');
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Refreshing…' : 'Refresh Enterprise Data';
  }
}

function inject() {
  if (mounted || byId('enterpriseOperationsDashboard')) return;

  const area = byId('areaProgram');
  if (!area) return;

  const section = document.createElement('section');
  section.id = 'enterpriseOperationsDashboard';
  section.className = 'card managementCard enterpriseOperationsDashboard hidden';

  section.innerHTML = [
    '<div class="cardHead">',
      '<span>Enterprise Operations</span>',
      '<span>Enterprise Admin · Global RaPS View</span>',
    '</div>',
    '<p class="helper">Enterprise-wide cloud view across all cataloged MAJCOMs and installations. Filters change the analytical view only; Supabase Row Level Security remains the authorization boundary.</p>',

    '<div class="enterpriseToolbar">',
      '<label><span>Reporting window</span><select id="enterprisePeriod">',
        '<option value="30">Last 30 days</option>',
        '<option value="90" selected>Last 90 days</option>',
        '<option value="365">Last 12 months</option>',
        '<option value="0">All available</option>',
      '</select></label>',
      '<label><span>MAJCOM</span><select id="enterpriseMajcomFilter"><option value="">All MAJCOMs</option></select></label>',
      '<label><span>Installation</span><select id="enterpriseBaseFilter"><option value="">All installations</option></select></label>',
      '<label><span>Course</span><select id="enterpriseCourseFilter">',
        '<option value="">All courses</option>',
        '<option value="ASM">ASM</option>',
        '<option value="CLS">CLS</option>',
        '<option value="CMC">CMC</option>',
        '<option value="CPP">CPP</option>',
      '</select></label>',
    '</div>',
    '<div class="enterpriseRefreshBar">',
      '<button id="enterpriseRefreshBtn" class="action primary enterpriseRefreshBtn" type="button">Refresh Enterprise Data</button>',
      '<span id="enterpriseDashboardMessage" class="enterpriseDashboardMessage"></span>',
    '</div>',

    '<div id="enterpriseKpis" class="analyticsKpis enterpriseKpis"></div>',

    '<details class="analyticsDetails" open>',
      '<summary>Operational Attention</summary>',
      '<p class="helper enterpriseInlineHelper">Flags are descriptive workflow signals, not performance rankings. Current thresholds: no recorded activity for 90+ days; incomplete load of 5+ or 20%+ of evaluations; contributor documentation below 80% when at least 5 failed observations exist.</p>',
      '<div id="enterpriseAttention"></div>',
    '</details>',

    '<details class="analyticsDetails" open>',
      '<summary>MAJCOM Comparison</summary>',
      '<div id="enterpriseMajcomTable"></div>',
    '</details>',

    '<details class="analyticsDetails" open>',
      '<summary>Installation Comparison</summary>',
      '<div id="enterpriseBaseTable"></div>',
    '</details>',

    '<details class="analyticsDetails">',
      '<summary>Monthly Enterprise Trend</summary>',
      '<div id="enterpriseTrendTable"></div>',
    '</details>',

    '<details class="analyticsDetails">',
      '<summary>Class Operations</summary>',
      '<div id="enterpriseClassTable"></div>',
    '</details>',

    '<details class="analyticsDetails">',
      '<summary>Evaluator Workload</summary>',
      '<div id="enterpriseEvaluatorTable"></div>',
    '</details>',

    '<details class="analyticsDetails">',
      '<summary>Incomplete Evaluations</summary>',
      '<div id="enterpriseIncompleteTable"></div>',
    '</details>',

    '<details class="analyticsDetails" open>',
      '<summary>Observed Failure Patterns</summary>',
      '<div class="analyticsSplit">',
        '<div><h3>Failure Modes</h3><div id="enterpriseFailureModes"></div></div>',
        '<div><h3>Primary Contributors</h3><div id="enterpriseContributors"></div></div>',
      '</div>',
    '</details>',

    '<div id="enterpriseDataQuality" class="dataQualityPanel"></div>',
    '<p class="helper enterpriseDashboardFoot">This dashboard is descriptive and depends on synchronized training records. It is not an authoritative DAF personnel, medical, or readiness system of record.</p>'
  ].join('');

  const intro = area.querySelector('.areaIntro');
  if (intro) intro.insertAdjacentElement('afterend', section);
  else area.insertAdjacentElement('afterbegin', section);

  byId('enterpriseRefreshBtn')?.addEventListener('click', () => load(true));
  byId('enterprisePeriod')?.addEventListener('change', render);
  byId('enterpriseCourseFilter')?.addEventListener('change', render);

  byId('enterpriseMajcomFilter')?.addEventListener('change', () => {
    refreshBaseOptions();
    render();
  });

  byId('enterpriseBaseFilter')?.addEventListener('change', render);

  document.querySelector('[data-home-area="program"]')?.addEventListener('click', () => {
    if (isEnterpriseAdmin()) window.setTimeout(() => load(false), 0);
  });

  mounted = true;
}

async function paged(makeQuery, pageSize = 1000) {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery(from, to);
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function queryChunks(table, select, column, values, extra = null, chunkSize = 100) {
  if (!values.length) return [];

  const out = [];

  for (let i = 0; i < values.length; i += chunkSize) {
    const ids = values.slice(i, i + chunkSize);

    const rows = await paged((from, to) => {
      let q = supabase().from(table).select(select).in(column, ids);
      if (extra) q = extra(q);
      return q.range(from, to);
    });

    out.push(...rows);
  }

  return out;
}

function courseLabel(c) {
  const tier = String(c?.app_data?.tierId || '');
  const map = { '1':'ASM', '2':'CLS', '3':'CMC', '4':'CPP' };
  return map[tier] || '—';
}

function groupCounts(rows, key) {
  const counts = new Map();

  rows.forEach((row) => {
    const label = row?.[key] || 'unclassified';
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return [...counts.entries()]
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

  el.innerHTML = rows.slice(0, 10).map((row) => {
    const width = Math.max(4, Math.round((row.count / max) * 100));

    return [
      '<div class="rootCauseRow">',
        '<div><span>', esc(pretty(row.label)), '</span><b>', row.count, '</b></div>',
        '<div class="rootCauseBar"><i style="width:', width, '%"></i></div>',
      '</div>'
    ].join('');
  }).join('');
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

function refreshFilterOptions() {
  if (!raw) return;

  const majcomSelect = byId('enterpriseMajcomFilter');
  const currentMajcom = majcomSelect?.value || '';

  if (majcomSelect) {
    majcomSelect.innerHTML =
      '<option value="">All MAJCOMs</option>' +
      raw.majcoms.map((m) =>
        '<option value="' + esc(m.id) + '">' +
        esc(m.code || m.name) + ' · ' + esc(m.name) +
        '</option>'
      ).join('');

    if (currentMajcom && raw.majcoms.some((m) => m.id === currentMajcom)) {
      majcomSelect.value = currentMajcom;
    }
  }

  refreshBaseOptions();
}

function refreshBaseOptions() {
  if (!raw) return;

  const select = byId('enterpriseBaseFilter');
  if (!select) return;

  const current = select.value || '';
  const majcomId = selectedMajcomId();

  const majcomById = new Map(raw.majcoms.map((majcom) => [majcom.id, majcom]));

  const bases = raw.bases
    .filter((base) => !majcomId || base.majcom_id === majcomId)
    .slice()
    .sort((a, b) => {
      const aMajcom = majcomById.get(a.majcom_id);
      const bMajcom = majcomById.get(b.majcom_id);
      const aMajcomLabel = aMajcom?.code || aMajcom?.name || 'Other';
      const bMajcomLabel = bMajcom?.code || bMajcom?.name || 'Other';

      return aMajcomLabel.localeCompare(bMajcomLabel) ||
        String(a.name || a.code).localeCompare(String(b.name || b.code));
    });

  const grouped = new Map();

  bases.forEach((base) => {
    const majcom = majcomById.get(base.majcom_id);
    const groupLabel = majcom?.code || majcom?.name || 'Other';

    if (!grouped.has(groupLabel)) grouped.set(groupLabel, []);
    grouped.get(groupLabel).push(base);
  });

  const groupedOptions = [...grouped.entries()].map(([groupLabel, groupBases]) =>
    '<optgroup label="' + esc(groupLabel) + '">' +
      groupBases.map((base) =>
        '<option value="' + esc(base.id) + '">' +
          esc(base.code || base.name) + ' · ' + esc(base.name) +
        '</option>'
      ).join('') +
    '</optgroup>'
  ).join('');

  select.innerHTML =
    '<option value="">All installations</option>' +
    groupedOptions;

  if (current && bases.some((base) => base.id === current)) {
    select.value = current;
  }
}

function organizationalBases() {
  if (!raw) return [];

  const majcomId = selectedMajcomId();
  const baseId = selectedBaseId();

  return raw.bases.filter((base) => {
    if (majcomId && base.majcom_id !== majcomId) return false;
    if (baseId && base.id !== baseId) return false;
    return true;
  });
}

function filteredData() {
  if (!raw) return null;

  const days = selectedDays();
  const cutoff = cutoffMs(days);
  const course = selectedCourse();
  const bases = organizationalBases();
  const baseIds = new Set(bases.map((base) => base.id));

  const classes = raw.classes.filter((c) => {
    if (!baseIds.has(c.base_id)) return false;
    if (course && courseLabel(c) !== course) return false;

    if (!cutoff) return true;
    if (c.status === 'active' || c.status === 'draft') return true;

    return c.start_date ? Date.parse(c.start_date) >= cutoff : false;
  });

  const classIds = new Set(classes.map((c) => c.id));
  const events = raw.events.filter((event) => classIds.has(event.class_id));
  const eventIds = new Set(events.map((event) => event.id));

  const evaluations = raw.evaluations.filter((evaluation) =>
    eventIds.has(evaluation.event_id)
  );

  const evaluationIds = new Set(evaluations.map((evaluation) => evaluation.id));

  const failures = raw.failures.filter((failure) =>
    evaluationIds.has(failure.evaluation_id)
  );

  return {
    majcoms: raw.majcoms,
    bases,
    classes,
    events,
    evaluations,
    failures,
    profileRows: raw.profileRows,
    participantRows: raw.participantRows
  };
}

function latestActivityForBase(baseId) {
  if (!raw) return null;

  const classes = raw.classes.filter((c) => c.base_id === baseId);
  const classIds = new Set(classes.map((c) => c.id));
  const events = raw.events.filter((event) => classIds.has(event.class_id));
  const eventIds = new Set(events.map((event) => event.id));
  const evaluations = raw.evaluations.filter((evaluation) => eventIds.has(evaluation.event_id));

  const stamps = [];

  classes.forEach((c) => {
    if (c.start_date) stamps.push(c.start_date);
    if (c.updated_at) stamps.push(c.updated_at);
  });

  events.forEach((event) => {
    if (event.event_date) stamps.push(event.event_date);
    if (event.updated_at) stamps.push(event.updated_at);
  });

  evaluations.forEach((evaluation) => {
    if (evaluation.completed_at) stamps.push(evaluation.completed_at);
    else if (evaluation.updated_at) stamps.push(evaluation.updated_at);
    else if (evaluation.started_at) stamps.push(evaluation.started_at);
  });

  const valid = stamps
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => b.ms - a.ms);

  return valid[0]?.value || null;
}

function buildModel(data) {
  const majcomById = new Map(data.majcoms.map((m) => [m.id, m]));
  const baseById = new Map(data.bases.map((base) => [base.id, base]));
  const classById = new Map(data.classes.map((c) => [c.id, c]));
  const eventById = new Map(data.events.map((event) => [event.id, event]));
  const profiles = new Map(data.profileRows.map((profile) => [profile.id, profile]));
  const participants = new Map(data.participantRows.map((participant) => [participant.id, participant]));

  const finalized = data.evaluations.filter((evaluation) => evaluation.status === 'finalized');
  const incomplete = data.evaluations.filter((evaluation) =>
    evaluation.status === 'draft' || evaluation.status === 'in_progress'
  );

  const pass = finalized.filter((evaluation) => evaluation.overall_result === 'pass').length;
  const fail = finalized.filter((evaluation) => evaluation.overall_result === 'fail').length;
  const rated = pass + fail;

  const repeatFinalized = finalized.filter((evaluation) =>
    Number(evaluation.attempt_number || 1) >= 2
  );

  const repeatPass = repeatFinalized.filter((evaluation) =>
    evaluation.overall_result === 'pass'
  ).length;

  const contributorDocumented = data.failures.filter((failure) =>
    !!failure.primary_contributor
  ).length;

  const failureModeDocumented = data.failures.filter((failure) =>
    !!failure.failure_mode
  ).length;

  const baseRows = data.bases.map((base) => {
    const classes = data.classes.filter((c) => c.base_id === base.id);
    const classIds = new Set(classes.map((c) => c.id));
    const events = data.events.filter((event) => classIds.has(event.class_id));
    const eventIds = new Set(events.map((event) => event.id));
    const evaluations = data.evaluations.filter((evaluation) => eventIds.has(evaluation.event_id));
    const evaluationIds = new Set(evaluations.map((evaluation) => evaluation.id));
    const failures = data.failures.filter((failure) => evaluationIds.has(failure.evaluation_id));

    const final = evaluations.filter((evaluation) => evaluation.status === 'finalized');
    const basePass = final.filter((evaluation) => evaluation.overall_result === 'pass').length;
    const baseFail = final.filter((evaluation) => evaluation.overall_result === 'fail').length;
    const baseIncomplete = evaluations.filter((evaluation) =>
      evaluation.status === 'draft' || evaluation.status === 'in_progress'
    ).length;

    const repeat = final.filter((evaluation) =>
      Number(evaluation.attempt_number || 1) >= 2
    );
    const repeatPassed = repeat.filter((evaluation) =>
      evaluation.overall_result === 'pass'
    ).length;

    const documentedContributor = failures.filter((failure) =>
      !!failure.primary_contributor
    ).length;

    const latest = latestActivityForBase(base.id);

    return {
      id: base.id,
      majcomId: base.majcom_id,
      majcom: majcomById.get(base.majcom_id)?.code || majcomById.get(base.majcom_id)?.name || '—',
      code: base.code || '',
      name: base.name || base.code || 'Unnamed installation',
      classes: classes.length,
      students: new Set(evaluations.map((evaluation) => evaluation.participant_id).filter(Boolean)).size,
      evaluations: evaluations.length,
      finalized: final.length,
      incomplete: baseIncomplete,
      incompleteRate: evaluations.length ? baseIncomplete / evaluations.length : 0,
      passRate: (basePass + baseFail) ? basePass / (basePass + baseFail) : null,
      repeatSuccess: repeat.length ? repeatPassed / repeat.length : null,
      evaluators: new Set(evaluations.map((evaluation) => evaluation.evaluator_id).filter(Boolean)).size,
      failureCount: failures.length,
      contributorRate: failures.length ? documentedContributor / failures.length : null,
      latestActivity: latest,
      latestAgeDays: ageDays(latest)
    };
  }).sort((a, b) =>
    a.majcom.localeCompare(b.majcom) ||
    a.name.localeCompare(b.name)
  );

  const majcomRows = data.majcoms
    .filter((majcom) => data.bases.some((base) => base.majcom_id === majcom.id))
    .map((majcom) => {
      const bases = baseRows.filter((base) => base.majcomId === majcom.id);
      const baseIds = new Set(bases.map((base) => base.id));
      const classes = data.classes.filter((c) => baseIds.has(c.base_id));
      const classIds = new Set(classes.map((c) => c.id));
      const events = data.events.filter((event) => classIds.has(event.class_id));
      const eventIds = new Set(events.map((event) => event.id));
      const evaluations = data.evaluations.filter((evaluation) => eventIds.has(evaluation.event_id));
      const evaluationIds = new Set(evaluations.map((evaluation) => evaluation.id));
      const failures = data.failures.filter((failure) => evaluationIds.has(failure.evaluation_id));

      const final = evaluations.filter((evaluation) => evaluation.status === 'finalized');
      const p = final.filter((evaluation) => evaluation.overall_result === 'pass').length;
      const f = final.filter((evaluation) => evaluation.overall_result === 'fail').length;
      const repeat = final.filter((evaluation) => Number(evaluation.attempt_number || 1) >= 2);
      const repeatPasses = repeat.filter((evaluation) => evaluation.overall_result === 'pass').length;
      const documented = failures.filter((failure) => !!failure.primary_contributor).length;

      return {
        id: majcom.id,
        code: majcom.code || '',
        name: majcom.name || majcom.code || 'Unnamed MAJCOM',
        bases: bases.length,
        activeBases: bases.filter((base) => base.classes || base.evaluations).length,
        classes: classes.length,
        students: new Set(evaluations.map((evaluation) => evaluation.participant_id).filter(Boolean)).size,
        evaluations: evaluations.length,
        finalized: final.length,
        incomplete: evaluations.filter((evaluation) =>
          evaluation.status === 'draft' || evaluation.status === 'in_progress'
        ).length,
        passRate: (p + f) ? p / (p + f) : null,
        repeatSuccess: repeat.length ? repeatPasses / repeat.length : null,
        contributorRate: failures.length ? documented / failures.length : null
      };
    })
    .sort((a, b) => b.evaluations - a.evaluations || a.name.localeCompare(b.name));

  const classRows = data.classes.map((c) => {
    const base = baseById.get(c.base_id);
    const majcom = majcomById.get(base?.majcom_id);
    const events = data.events.filter((event) => event.class_id === c.id);
    const eventIds = new Set(events.map((event) => event.id));
    const evaluations = data.evaluations.filter((evaluation) => eventIds.has(evaluation.event_id));
    const final = evaluations.filter((evaluation) => evaluation.status === 'finalized');
    const p = final.filter((evaluation) => evaluation.overall_result === 'pass').length;
    const f = final.filter((evaluation) => evaluation.overall_result === 'fail').length;

    return {
      majcom: majcom?.code || majcom?.name || '—',
      base: base?.code || base?.name || '—',
      name: c.name || 'Untitled Class',
      course: courseLabel(c),
      date: c.start_date,
      status: c.status || 'draft',
      evaluations: evaluations.length,
      finalized: final.length,
      incomplete: evaluations.filter((evaluation) =>
        evaluation.status === 'draft' || evaluation.status === 'in_progress'
      ).length,
      passRate: (p + f) ? p / (p + f) : null
    };
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const workload = new Map();

  data.evaluations.forEach((evaluation) => {
    const event = eventById.get(evaluation.event_id);
    const c = classById.get(event?.class_id);
    const base = baseById.get(c?.base_id);
    const majcom = majcomById.get(base?.majcom_id);
    const evaluatorId = evaluation.evaluator_id || 'unassigned';

    const row = workload.get(evaluatorId) || {
      evaluator: profileLabel(evaluation.evaluator_id, profiles),
      majcoms: new Set(),
      bases: new Set(),
      total: 0,
      finalized: 0,
      incomplete: 0,
      pass: 0,
      fail: 0,
      repeat: 0,
      last: null
    };

    if (majcom) row.majcoms.add(majcom.code || majcom.name);
    if (base) row.bases.add(base.code || base.name);

    row.total += 1;
    if (evaluation.status === 'finalized') row.finalized += 1;
    if (evaluation.status === 'draft' || evaluation.status === 'in_progress') row.incomplete += 1;
    if (evaluation.overall_result === 'pass') row.pass += 1;
    if (evaluation.overall_result === 'fail') row.fail += 1;
    if (Number(evaluation.attempt_number || 1) >= 2) row.repeat += 1;

    const latest = evaluation.completed_at || evaluation.updated_at || evaluation.started_at;
    if (latest && (!row.last || Date.parse(latest) > Date.parse(row.last))) row.last = latest;

    workload.set(evaluatorId, row);
  });

  const evaluatorRows = [...workload.values()]
    .sort((a, b) => b.total - a.total || a.evaluator.localeCompare(b.evaluator));

  const incompleteRows = incomplete.map((evaluation) => {
    const event = eventById.get(evaluation.event_id);
    const c = classById.get(event?.class_id);
    const base = baseById.get(c?.base_id);
    const majcom = majcomById.get(base?.majcom_id);

    return {
      majcom: majcom?.code || majcom?.name || '—',
      base: base?.code || base?.name || '—',
      className: c?.name || event?.name || 'Unknown class',
      participant: participantLabel(evaluation.participant_id, participants),
      evaluator: profileLabel(evaluation.evaluator_id, profiles),
      status: pretty(evaluation.status),
      attempt: evaluation.attempt_number || 1,
      started: evaluation.started_at,
      updated: evaluation.updated_at || evaluation.started_at
    };
  }).sort((a, b) => Date.parse(b.updated || 0) - Date.parse(a.updated || 0));

  const monthly = new Map();

  finalized.forEach((evaluation) => {
    const when = evaluation.completed_at || evaluation.updated_at || evaluation.started_at;
    const d = when ? new Date(when) : null;

    if (!d || Number.isNaN(d.getTime())) return;

    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    const row = monthly.get(key) || {
      key,
      finalized: 0,
      pass: 0,
      fail: 0,
      repeatFinalized: 0,
      repeatPass: 0
    };

    row.finalized += 1;
    if (evaluation.overall_result === 'pass') row.pass += 1;
    if (evaluation.overall_result === 'fail') row.fail += 1;

    if (Number(evaluation.attempt_number || 1) >= 2) {
      row.repeatFinalized += 1;
      if (evaluation.overall_result === 'pass') row.repeatPass += 1;
    }

    monthly.set(key, row);
  });

  const trendRows = [...monthly.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, 18)
    .map((row) => ({
      ...row,
      passRate: (row.pass + row.fail) ? row.pass / (row.pass + row.fail) : null,
      repeatSuccess: row.repeatFinalized ? row.repeatPass / row.repeatFinalized : null
    }));

  const attention = [];

  baseRows.forEach((base) => {
    if (base.latestAgeDays == null || base.latestAgeDays >= 90) {
      attention.push({
        type: 'No recent activity',
        severity: 'watch',
        majcom: base.majcom,
        base: base.code || base.name,
        detail: base.latestAgeDays == null
          ? 'No recorded class/evaluation activity found.'
          : 'Latest recorded activity was ' + base.latestAgeDays + ' days ago.'
      });
    }

    if (base.evaluations >= 5 && (base.incomplete >= 5 || base.incompleteRate >= 0.20)) {
      attention.push({
        type: 'Incomplete evaluation load',
        severity: 'attention',
        majcom: base.majcom,
        base: base.code || base.name,
        detail: base.incomplete + ' incomplete of ' + base.evaluations +
          ' evaluations (' + pct(base.incompleteRate) + ').'
      });
    }

    if (base.failureCount >= 5 && Number.isFinite(base.contributorRate) && base.contributorRate < 0.80) {
      attention.push({
        type: 'Contributor documentation',
        severity: 'attention',
        majcom: base.majcom,
        base: base.code || base.name,
        detail: 'Primary contributor documented on ' + pct(base.contributorRate) +
          ' of ' + base.failureCount + ' failed observations.'
      });
    }
  });

  return {
    kpis: {
      majcoms: majcomRows.length,
      activeMajcoms: majcomRows.filter((row) => row.classes || row.evaluations).length,
      installations: baseRows.length,
      activeInstallations: baseRows.filter((row) => row.classes || row.evaluations).length,
      classes: data.classes.length,
      students: new Set(data.evaluations.map((evaluation) => evaluation.participant_id).filter(Boolean)).size,
      evaluations: data.evaluations.length,
      finalized: finalized.length,
      incomplete: incomplete.length,
      passRate: rated ? pass / rated : null,
      failCount: fail,
      repeatSuccess: repeatFinalized.length ? repeatPass / repeatFinalized.length : null,
      repeatFinalized: repeatFinalized.length,
      evaluators: new Set(data.evaluations.map((evaluation) => evaluation.evaluator_id).filter(Boolean)).size,
      contributorRate: data.failures.length ? contributorDocumented / data.failures.length : null,
      failureModeRate: data.failures.length ? failureModeDocumented / data.failures.length : null
    },
    majcomRows,
    baseRows,
    classRows,
    evaluatorRows,
    incompleteRows,
    trendRows,
    attention: attention.sort((a, b) => {
      const order = { attention:0, watch:1 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9) ||
        a.majcom.localeCompare(b.majcom) ||
        a.base.localeCompare(b.base);
    }),
    failureModes: groupCounts(data.failures, 'failure_mode'),
    contributors: groupCounts(data.failures, 'primary_contributor'),
    quality: {
      classesWithoutEvents: data.classes.filter((c) =>
        !data.events.some((event) => event.class_id === c.id)
      ).length,
      evaluationsWithoutEvaluator: data.evaluations.filter((evaluation) =>
        !evaluation.evaluator_id
      ).length,
      failuresWithoutMode: data.failures.filter((failure) =>
        !failure.failure_mode
      ).length,
      failuresWithoutContributor: data.failures.filter((failure) =>
        !failure.primary_contributor
      ).length
    }
  };
}

function renderAttention(rows) {
  const el = byId('enterpriseAttention');
  if (!el) return;

  if (!rows.length) {
    el.innerHTML = '<div class="analyticsEmpty">No current operational attention flags in this scope.</div>';
    return;
  }

  el.innerHTML = [
    '<div class="analyticsTableWrap"><table class="analyticsTable enterpriseAttentionTable">',
    '<thead><tr><th>Signal</th><th>MAJCOM</th><th>Installation</th><th>Observed condition</th></tr></thead><tbody>',
    rows.map((row) => [
      '<tr>',
        '<td><span class="enterpriseFlag ', esc(row.severity), '">', esc(row.type), '</span></td>',
        '<td><b>', esc(row.majcom), '</b></td>',
        '<td>', esc(row.base), '</td>',
        '<td>', esc(row.detail), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('');
}

function render() {
  inject();

  const card = byId('enterpriseOperationsDashboard');
  if (!card) return;

  card.classList.toggle('hidden', !isEnterpriseAdmin());
  if (!isEnterpriseAdmin() || !raw) return;

  const data = filteredData();
  const model = buildModel(data);
  const k = model.kpis;

  byId('enterpriseKpis').innerHTML = [
    ['MAJCOMs', k.activeMajcoms + '/' + k.majcoms, 'with activity / in view'],
    ['Installations', k.activeInstallations + '/' + k.installations, 'with activity / in view'],
    ['Classes', k.classes, 'in reporting window'],
    ['Students assessed', k.students, 'unique participants'],
    ['Evaluations', k.evaluations, 'all attempts'],
    ['Finalized', k.finalized, 'completed evaluations'],
    ['Incomplete', k.incomplete, 'draft + in progress'],
    ['Pass rate', pct(k.passRate), k.failCount + ' finalized FAIL'],
    ['Remediation success', pct(k.repeatSuccess), k.repeatFinalized + ' finalized repeat attempts'],
    ['Evaluators', k.evaluators, 'with activity'],
    ['Contributor documented', pct(k.contributorRate), 'failed observations'],
    ['Failure mode documented', pct(k.failureModeRate), 'failed observations']
  ].map((item) => [
    '<div class="analyticsKpi">',
      '<small>', esc(item[0]), '</small>',
      '<strong>', esc(item[1]), '</strong>',
      '<span>', esc(item[2]), '</span>',
    '</div>'
  ].join('')).join('');

  renderAttention(model.attention);

  byId('enterpriseMajcomTable').innerHTML = model.majcomRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable enterpriseMajcomTable">',
    '<thead><tr><th>MAJCOM</th><th>Installations</th><th>Classes</th><th>Students</th><th>Evaluations</th><th>Incomplete</th><th>Pass rate</th><th>Remed success</th><th>Contributor doc</th><th>Drill-down</th></tr></thead><tbody>',
    model.majcomRows.map((row) => [
      '<tr>',
        '<td><b>', esc(row.code || row.name), '</b><div>', esc(row.name), '</div></td>',
        '<td>', row.activeBases, '/', row.bases, '</td>',
        '<td>', row.classes, '</td>',
        '<td>', row.students, '</td>',
        '<td>', row.finalized, '/', row.evaluations, '</td>',
        '<td class="', row.incomplete ? 'warnText' : '', '">', row.incomplete, '</td>',
        '<td>', esc(pct(row.passRate)), '</td>',
        '<td>', esc(pct(row.repeatSuccess)), '</td>',
        '<td>', esc(pct(row.contributorRate)), '</td>',
        '<td><button class="ghost small" type="button" data-enterprise-majcom="', esc(row.id), '">View MAJCOM</button></td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No MAJCOM data in this view.</div>';

  byId('enterpriseMajcomTable').querySelectorAll('[data-enterprise-majcom]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = byId('enterpriseMajcomFilter');
      if (filter) filter.value = button.dataset.enterpriseMajcom || '';
      refreshBaseOptions();
      render();
      byId('enterpriseOperationsDashboard')?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });

  const groupedBaseRows = new Map();

  model.baseRows.forEach((row) => {
    const groupLabel = row.majcom || 'Other';
    if (!groupedBaseRows.has(groupLabel)) groupedBaseRows.set(groupLabel, []);
    groupedBaseRows.get(groupLabel).push(row);
  });

  const groupedBaseTableBody = [...groupedBaseRows.entries()].map(([groupLabel, rows]) => [
    '<tr class="enterpriseMajcomGroupRow">',
      '<td colspan="11">',
        '<span>', esc(groupLabel), '</span>',
        '<small>', rows.length, ' installation', rows.length === 1 ? '' : 's', '</small>',
      '</td>',
    '</tr>',
    rows.map((row) => [
      '<tr>',
        '<td><span class="enterpriseMajcomRepeat">', esc(row.majcom), '</span></td>',
        '<td><b>', esc(row.code || row.name), '</b><div>', esc(row.name), '</div></td>',
        '<td>', row.classes, '</td>',
        '<td>', row.students, '</td>',
        '<td>', row.finalized, '/', row.evaluations, '</td>',
        '<td class="', row.incomplete ? 'warnText' : '', '">', row.incomplete, '</td>',
        '<td>', esc(pct(row.passRate)), '</td>',
        '<td>', esc(pct(row.repeatSuccess)), '</td>',
        '<td>', esc(pct(row.contributorRate)), '</td>',
        '<td>', esc(dateOnly(row.latestActivity)), '</td>',
        '<td><button class="ghost small" type="button" data-enterprise-base="', esc(row.id), '" data-enterprise-base-majcom="', esc(row.majcomId), '">View Base</button></td>',
      '</tr>'
    ].join('')).join('')
  ].join('')).join('');

  byId('enterpriseBaseTable').innerHTML = model.baseRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable enterpriseBaseTable">',
    '<thead><tr><th>MAJCOM</th><th>Installation</th><th>Classes</th><th>Students</th><th>Evaluations</th><th>Incomplete</th><th>Pass rate</th><th>Remed success</th><th>Contributor doc</th><th>Last activity</th><th>Drill-down</th></tr></thead><tbody>',
    groupedBaseTableBody,
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No installations in this view.</div>';

  byId('enterpriseBaseTable').querySelectorAll('[data-enterprise-base]').forEach((button) => {
    button.addEventListener('click', () => {
      const majcomFilter = byId('enterpriseMajcomFilter');
      const baseFilter = byId('enterpriseBaseFilter');

      if (majcomFilter) majcomFilter.value = button.dataset.enterpriseBaseMajcom || '';
      refreshBaseOptions();
      if (baseFilter) baseFilter.value = button.dataset.enterpriseBase || '';

      render();
      byId('enterpriseOperationsDashboard')?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });

  byId('enterpriseTrendTable').innerHTML = model.trendRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable enterpriseTrendTable">',
    '<thead><tr><th>Month</th><th>Finalized</th><th>PASS</th><th>FAIL</th><th>Pass rate</th><th>Repeat finalized</th><th>Remed success</th></tr></thead><tbody>',
    model.trendRows.map((row) => [
      '<tr>',
        '<td><b>', esc(row.key), '</b></td>',
        '<td>', row.finalized, '</td>',
        '<td>', row.pass, '</td>',
        '<td>', row.fail, '</td>',
        '<td>', esc(pct(row.passRate)), '</td>',
        '<td>', row.repeatFinalized, '</td>',
        '<td>', esc(pct(row.repeatSuccess)), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No finalized evaluations available for monthly trend analysis.</div>';

  byId('enterpriseClassTable').innerHTML = model.classRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable enterpriseClassTable">',
    '<thead><tr><th>MAJCOM</th><th>Installation</th><th>Class</th><th>Course</th><th>Date</th><th>Status</th><th>Finalized</th><th>Incomplete</th><th>Pass rate</th></tr></thead><tbody>',
    model.classRows.slice(0, 250).map((row) => [
      '<tr>',
        '<td><b>', esc(row.majcom), '</b></td>',
        '<td>', esc(row.base), '</td>',
        '<td>', esc(row.name), '</td>',
        '<td>', esc(row.course), '</td>',
        '<td>', esc(dateOnly(row.date)), '</td>',
        '<td>', esc(pretty(row.status)), '</td>',
        '<td>', row.finalized, '/', row.evaluations, '</td>',
        '<td class="', row.incomplete ? 'warnText' : '', '">', row.incomplete, '</td>',
        '<td>', esc(pct(row.passRate)), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>',
    model.classRows.length > 250
      ? '<div class="classificationRate">Showing the 250 most recent of ' + model.classRows.length + ' classes in this view.</div>'
      : ''
  ].join('') : '<div class="analyticsEmpty">No classes in this scope and reporting window.</div>';

  byId('enterpriseEvaluatorTable').innerHTML = model.evaluatorRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable enterpriseEvaluatorTable">',
    '<thead><tr><th>Evaluator</th><th>MAJCOMs</th><th>Installations</th><th>Total</th><th>Finalized</th><th>Incomplete</th><th>PASS</th><th>FAIL</th><th>Repeat attempts</th><th>Last activity</th></tr></thead><tbody>',
    model.evaluatorRows.slice(0, 250).map((row) => [
      '<tr>',
        '<td><b>', esc(row.evaluator), '</b></td>',
        '<td>', esc([...row.majcoms].join(', ') || '—'), '</td>',
        '<td>', esc([...row.bases].join(', ') || '—'), '</td>',
        '<td>', row.total, '</td>',
        '<td>', row.finalized, '</td>',
        '<td class="', row.incomplete ? 'warnText' : '', '">', row.incomplete, '</td>',
        '<td>', row.pass, '</td>',
        '<td class="', row.fail ? 'bad' : '', '">', row.fail, '</td>',
        '<td>', row.repeat, '</td>',
        '<td>', esc(dateTime(row.last)), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>'
  ].join('') : '<div class="analyticsEmpty">No evaluator activity in this view.</div>';

  byId('enterpriseIncompleteTable').innerHTML = model.incompleteRows.length ? [
    '<div class="analyticsTableWrap"><table class="analyticsTable enterpriseIncompleteTable">',
    '<thead><tr><th>MAJCOM</th><th>Installation</th><th>Class</th><th>Participant</th><th>Evaluator</th><th>Attempt</th><th>Status</th><th>Started</th><th>Last activity</th></tr></thead><tbody>',
    model.incompleteRows.slice(0, 200).map((row) => [
      '<tr>',
        '<td><b>', esc(row.majcom), '</b></td>',
        '<td>', esc(row.base), '</td>',
        '<td>', esc(row.className), '</td>',
        '<td>', esc(row.participant), '</td>',
        '<td>', esc(row.evaluator), '</td>',
        '<td>', esc(row.attempt), '</td>',
        '<td>', esc(row.status), '</td>',
        '<td>', esc(dateTime(row.started)), '</td>',
        '<td>', esc(dateTime(row.updated)), '</td>',
      '</tr>'
    ].join('')).join(''),
    '</tbody></table></div>',
    model.incompleteRows.length > 200
      ? '<div class="classificationRate">Showing the 200 most recent of ' + model.incompleteRows.length + ' incomplete evaluations.</div>'
      : ''
  ].join('') : '<div class="analyticsEmpty">No incomplete evaluations in this view.</div>';

  barList('enterpriseFailureModes', model.failureModes, 'No failed observations with a recorded failure mode.');
  barList('enterpriseContributors', model.contributors, 'No failed observations with a recorded primary contributor.');

  const q = model.quality;

  byId('enterpriseDataQuality').innerHTML = [
    '<h3>Enterprise data quality & sync health</h3>',
    '<div class="dataQualityGrid">',
      '<div class="dataQualityItem ', q.classesWithoutEvents ? 'warn' : 'good', '"><b>', q.classesWithoutEvents, '</b><span>classes without evaluation events</span></div>',
      '<div class="dataQualityItem ', q.evaluationsWithoutEvaluator ? 'warn' : 'good', '"><b>', q.evaluationsWithoutEvaluator, '</b><span>evaluations without evaluator attribution</span></div>',
      '<div class="dataQualityItem ', q.failuresWithoutMode ? 'warn' : 'good', '"><b>', q.failuresWithoutMode, '</b><span>failed observations missing failure mode</span></div>',
      '<div class="dataQualityItem ', q.failuresWithoutContributor ? 'warn' : 'good', '"><b>', q.failuresWithoutContributor, '</b><span>failed observations missing contributor</span></div>',
    '</div>'
  ].join('');

  const majcom = raw.majcoms.find((m) => m.id === selectedMajcomId());
  const base = raw.bases.find((b) => b.id === selectedBaseId());

  const windowText = selectedDays() === 0
    ? 'all available data'
    : selectedDays() === 365
      ? 'last 12 months'
      : 'last ' + selectedDays() + ' days';

  const scope = [
    majcom ? (majcom.code || majcom.name) : 'All MAJCOMs',
    base ? (base.code || base.name) : null,
    selectedCourse() || null,
    windowText
  ].filter(Boolean).join(' · ');

  setMessage(scope + ' · refreshed ' + new Date().toLocaleTimeString(), 'success');
}

async function load(force = false) {
  inject();

  const card = byId('enterpriseOperationsDashboard');
  if (!card) return;

  card.classList.toggle('hidden', !isEnterpriseAdmin());

  if (!isEnterpriseAdmin() || loading) return;

  if (!navigator.onLine || !cloud()?.connected) {
    setMessage('Connect to the network to refresh Enterprise Operations.', 'offline');
    return;
  }

  if (raw && !force) {
    render();
    return;
  }

  const client = supabase();
  if (!client) return;

  setLoading(true);
  setMessage('Loading enterprise cloud operations…', 'working');

  try {
    const [majcoms, bases] = await Promise.all([
      paged((from, to) =>
        client.from('majcoms')
          .select('id,code,name,active')
          .eq('active', true)
          .order('code')
          .range(from, to)
      ),
      paged((from, to) =>
        client.from('bases')
          .select('id,code,name,majcom_id,active')
          .eq('active', true)
          .order('name')
          .range(from, to)
      )
    ]);

    const classes = await queryChunks(
      'classes',
      'id,base_id,name,course_type,start_date,end_date,status,created_by,app_data,updated_at',
      'base_id',
      bases.map((base) => base.id)
    );

    const events = await queryChunks(
      'evaluation_events',
      'id,class_id,base_id,name,event_date,status,created_by,updated_at',
      'class_id',
      classes.map((c) => c.id)
    );

    const evaluations = await queryChunks(
      'evaluations',
      'id,event_id,participant_id,evaluator_id,curriculum_version_id,attempt_number,status,overall_result,score_numerator,score_denominator,started_at,completed_at,updated_at',
      'event_id',
      events.map((event) => event.id)
    );

    const failures = await queryChunks(
      'criterion_results',
      'evaluation_id,result,failure_mode,primary_contributor',
      'evaluation_id',
      evaluations.map((evaluation) => evaluation.id),
      (q) => q.eq('result', 'fail')
    );

    const evaluatorIds = [...new Set(
      evaluations.map((evaluation) => evaluation.evaluator_id).filter(Boolean)
    )];

    const participantIds = [...new Set(
      evaluations.map((evaluation) => evaluation.participant_id).filter(Boolean)
    )];

    let profileRows = [];
    if (evaluatorIds.length) {
      try {
        profileRows = await queryChunks(
          'profiles',
          'id,display_name,email',
          'id',
          evaluatorIds
        );
      } catch (error) {
        console.warn('Enterprise dashboard could not resolve evaluator profile names.', error);
      }
    }

    let participantRows = [];
    if (participantIds.length) {
      try {
        participantRows = await queryChunks(
          'participants',
          'id,participant_identifier,display_name',
          'id',
          participantIds
        );
      } catch (error) {
        console.warn('Enterprise dashboard could not resolve participant display names.', error);
      }
    }

    raw = {
      majcoms,
      bases,
      classes,
      events,
      evaluations,
      failures,
      profileRows,
      participantRows
    };

    refreshFilterOptions();
    render();
  } catch (error) {
    console.error('Enterprise Operations dashboard failed', error);
    setMessage('Dashboard load failed: ' + (error?.message || error), 'error');
  } finally {
    setLoading(false);
  }
}

window.addEventListener('raps-cloud-identity', () => {
  inject();
  raw = null;
  load(true);
});

window.addEventListener('online', () => {
  if (isEnterpriseAdmin()) load(true);
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

window.RAPS_ENTERPRISE_OPERATIONS_DASHBOARD = Object.freeze({
  refresh: () => load(true)
});

})();
