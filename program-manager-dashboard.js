(() => {
'use strict';

let mounted = false;
let busy = false;
let lastLoadedBaseId = null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function cloud() { return window.RAPS_CLOUD || null; }
function client() { return window.RAPS_SUPABASE || null; }
function membership() { return cloud()?.primaryMembership || null; }
function isProgramManager() {
  const c = cloud(), m = membership();
  return c?.role === 'program_manager' && !!m?.base_id;
}
function baseLabel() {
  const m = membership();
  return m?.bases?.code || m?.bases?.name || cloud()?.scope || 'Assigned base';
}
function humanize(value) {
  if (!value) return 'Unclassified';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
function shortId(id) {
  const v = String(id || '');
  return v ? `Evaluator ${v.slice(0, 8)}` : 'Unassigned';
}
function fmtPct(n) {
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
}
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}
function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}
function daysValue() {
  const n = Number($('pmBasePeriod')?.value || 90);
  return Number.isFinite(n) ? n : 90;
}
function cutoffIso(days) {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function setStatus(message, kind='') {
  const el = $('pmBaseStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `pmBaseStatus ${kind}`.trim();
}
function setBusy(on) {
  busy = !!on;
  const btn = $('pmBaseRefresh');
  if (btn) {
    btn.disabled = busy;
    btn.textContent = busy ? 'Refreshing…' : 'Refresh Cloud Data';
  }
}

function inject() {
  if (mounted || $('programManagerBaseCard')) return;
  const area = $('areaProgram');
  if (!area) return;
  const intro = area.querySelector('.areaIntro');
  const card = `
    <section id="programManagerBaseCard" class="card managementCard pmBaseCard hidden">
      <div class="cardHead">
        <span>My Base Operations</span>
        <span id="pmBaseScope">Program Manager</span>
      </div>
      <p class="helper">Cloud-scoped operational view for your assigned installation. Data is filtered by your Supabase role and Row Level Security; this dashboard does not expand your access.</p>
      <div class="pmBaseToolbar">
        <label>
          <span>Reporting window</span>
          <select id="pmBasePeriod">
            <option value="30">Last 30 days</option>
            <option value="90" selected>Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="0">All available</option>
          </select>
        </label>
        <button id="pmBaseRefresh" class="action primary" type="button">Refresh Cloud Data</button>
        <span id="pmBaseStatus" class="pmBaseStatus">Waiting for Program Manager identity…</span>
      </div>

      <div id="pmBaseKpis" class="analyticsKpis"></div>

      <details class="analyticsDetails" open>
        <summary>Class Operations</summary>
        <div id="pmBaseClassTable"></div>
      </details>

      <details class="analyticsDetails" open>
        <summary>Evaluator Workload</summary>
        <div id="pmBaseEvaluatorTable"></div>
      </details>

      <details class="analyticsDetails">
        <summary>Incomplete Evaluations</summary>
        <div id="pmBaseIncompleteTable"></div>
      </details>

      <details class="analyticsDetails" open>
        <summary>Observed Failure Patterns</summary>
        <div class="analyticsSplit">
          <div><h3>Failure Modes</h3><div id="pmBaseFailureModes"></div></div>
          <div><h3>Primary Contributors</h3><div id="pmBaseContributors"></div></div>
        </div>
      </details>

      <p class="helper pmBaseFoot">Operational metrics are descriptive. Pass/fail rates use finalized evaluations only; incomplete evaluations remain visible separately.</p>
    </section>
  `;
  if (intro) intro.insertAdjacentHTML('afterend', card);
  else area.insertAdjacentHTML('afterbegin', card);

  $('pmBaseRefresh')?.addEventListener('click', () => loadDashboard(true));
  $('pmBasePeriod')?.addEventListener('change', () => loadDashboard(true));
  document.querySelector('[data-home-area="program"]')?.addEventListener('click', () => {
    if (isProgramManager()) window.setTimeout(() => loadDashboard(false), 0);
  });
  mounted = true;
}

async function pagedQuery(makeQuery, pageSize=1000) {
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

async function queryInChunks(table, select, column, values, extraBuilder=null, chunkSize=100) {
  if (!values.length) return [];
  const out = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const ids = values.slice(i, i + chunkSize);
    const part = await pagedQuery((from, to) => {
      let q = client().from(table).select(select).in(column, ids);
      if (extraBuilder) q = extraBuilder(q);
      return q.range(from, to);
    });
    out.push(...part);
  }
  return out;
}

function groupCounts(rows, key) {
  const counts = new Map();
  rows.forEach(row => {
    const value = row?.[key] || 'unclassified';
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a,b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function renderBars(targetId, rows, emptyText) {
  const el = $(targetId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = `<div class="analyticsEmpty">${esc(emptyText)}</div>`;
    return;
  }
  const max = Math.max(...rows.map(r => r.count), 1);
  el.innerHTML = rows.slice(0, 8).map(r => `
    <div class="rootCauseRow">
      <div><span>${esc(humanize(r.label))}</span><b>${r.count}</b></div>
      <div class="rootCauseBar"><i style="width:${Math.max(4, Math.round((r.count / max) * 100))}%"></i></div>
    </div>
  `).join('');
}

function tierLabel(c) {
  const tier = String(c?.app_data?.tierId || '');
  const map = { '1':'ASM', '2':'CLS', '3':'CMC', '4':'CPP' };
  return map[tier] || c?.course_type || '—';
}

function evaluatorName(id, profiles) {
  const p = profiles.get(id);
  return p?.display_name || p?.email || shortId(id);
}

function participantName(id, participants) {
  const p = participants.get(id);
  return p?.display_name || p?.participant_identifier || (id ? `Participant ${String(id).slice(0,8)}` : '—');
}

function buildModel(data) {
  const { classes, events, evaluations, failures, profileRows, participantRows } = data;
  const eventById = new Map(events.map(x => [x.id, x]));
  const classById = new Map(classes.map(x => [x.id, x]));
  const profiles = new Map(profileRows.map(x => [x.id, x]));
  const participants = new Map(participantRows.map(x => [x.id, x]));

  const finalized = evaluations.filter(e => e.status === 'finalized');
  const incomplete = evaluations.filter(e => e.status === 'draft' || e.status === 'in_progress');
  const pass = finalized.filter(e => e.overall_result === 'pass').length;
  const fail = finalized.filter(e => e.overall_result === 'fail').length;
  const ratedFinal = pass + fail;
  const evaluatorIds = [...new Set(evaluations.map(e => e.evaluator_id).filter(Boolean))];
  const assessedParticipants = new Set(evaluations.map(e => e.participant_id).filter(Boolean)).size;

  const classRows = classes.map(c => {
    const eventIds = events.filter(ev => ev.class_id === c.id).map(ev => ev.id);
    const set = new Set(eventIds);
    const evs = evaluations.filter(e => set.has(e.event_id));
    const fin = evs.filter(e => e.status === 'finalized');
    const p = fin.filter(e => e.overall_result === 'pass').length;
    const f = fin.filter(e => e.overall_result === 'fail').length;
    const incompleteCount = evs.filter(e => e.status === 'draft' || e.status === 'in_progress').length;
    const evalNames = [...new Set(evs.map(e => evaluatorName(e.evaluator_id, profiles)).filter(Boolean))];
    return {
      id:c.id,
      name:c.name || 'Untitled Class',
      tier:tierLabel(c),
      start:c.start_date,
      status:c.status || 'draft',
      evaluations:evs.length,
      finalized:fin.length,
      incomplete:incompleteCount,
      pass:p,
      fail:f,
      passRate:(p+f) ? p/(p+f) : null,
      evaluators:evalNames
    };
  }).sort((a,b) => String(b.start || '').localeCompare(String(a.start || '')));

  const workloadMap = new Map();
  evaluations.forEach(e => {
    const id = e.evaluator_id || 'unassigned';
    const w = workloadMap.get(id) || {
      id,
      name:evaluatorName(e.evaluator_id, profiles),
      total:0, finalized:0, incomplete:0, pass:0, fail:0, last:null
    };
    w.total++;
    if (e.status === 'finalized') w.finalized++;
    if (e.status === 'draft' || e.status === 'in_progress') w.incomplete++;
    if (e.overall_result === 'pass') w.pass++;
    if (e.overall_result === 'fail') w.fail++;
    const stamp = e.completed_at || e.updated_at || e.started_at;
    if (stamp && (!w.last || Date.parse(stamp) > Date.parse(w.last))) w.last = stamp;
    workloadMap.set(id, w);
  });
  const evaluatorRows = [...workloadMap.values()].sort((a,b) => b.total - a.total || a.name.localeCompare(b.name));

  const incompleteRows = incomplete.map(e => {
    const ev = eventById.get(e.event_id);
    const c = classById.get(ev?.class_id);
    return {
      className:c?.name || ev?.name || 'Unknown class',
      participant:participantName(e.participant_id, participants),
      evaluator:evaluatorName(e.evaluator_id, profiles),
      status:humanize(e.status),
      started:e.started_at,
      updated:e.updated_at || e.started_at
    };
  }).sort((a,b) => Date.parse(b.updated || 0) - Date.parse(a.updated || 0));

  return {
    kpis: {
      classes:classes.length,
      assessedParticipants,
      evaluations:evaluations.length,
      finalized:finalized.length,
      incomplete:incomplete.length,
      passRate:ratedFinal ? pass/ratedFinal : null,
      failCount:fail,
      evaluators:evaluatorIds.length
    },
    classRows,
    evaluatorRows,
    incompleteRows,
    failureModes:groupCounts(failures, 'failure_mode'),
    contributors:groupCounts(failures, 'primary_contributor')
  };
}

function renderModel(model) {
  const k = model.kpis;
  $('pmBaseKpis').innerHTML = [
    ['Classes', k.classes, 'Cloud classes in window'],
    ['Students assessed', k.assessedParticipants, 'Unique participants with evaluations'],
    ['Evaluations', k.evaluations, 'All attempts in scope'],
    ['Finalized', k.finalized, 'Completed evaluations'],
    ['Incomplete', k.incomplete, 'Draft + in progress'],
    ['Pass rate', fmtPct(k.passRate), `${k.failCount} finalized FAIL`],
    ['Evaluators', k.evaluators, 'Evaluators with activity']
  ].map(([label,value,sub]) => `
    <div class="analyticsKpi">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
      <span>${esc(sub)}</span>
    </div>
  `).join('');

  $('pmBaseClassTable').innerHTML = model.classRows.length ? `
    <div class="analyticsTableWrap">
      <table class="analyticsTable pmClassTable">
        <thead><tr><th>Class</th><th>Course</th><th>Date</th><th>Status</th><th>Evaluations</th><th>Incomplete</th><th>Pass rate</th><th>Evaluator activity</th></tr></thead>
        <tbody>${model.classRows.map(r => `
          <tr>
            <td><b>${esc(r.name)}</b></td>
            <td>${esc(r.tier)}</td>
            <td>${esc(fmtDate(r.start))}</td>
            <td><span class="statusPill ${r.status === 'completed' ? 'pass' : r.status === 'active' ? 'warn' : ''}">${esc(humanize(r.status).toUpperCase())}</span></td>
            <td>${r.finalized}/${r.evaluations}</td>
            <td class="${r.incomplete ? 'warnText' : ''}">${r.incomplete}</td>
            <td>${esc(fmtPct(r.passRate))}</td>
            <td>${r.evaluators.length ? esc(r.evaluators.join(', ')) : '—'}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>
  ` : '<div class="analyticsEmpty">No cloud classes were found for this base and reporting window.</div>';

  $('pmBaseEvaluatorTable').innerHTML = model.evaluatorRows.length ? `
    <div class="analyticsTableWrap">
      <table class="analyticsTable pmEvaluatorTable">
        <thead><tr><th>Evaluator</th><th>Total</th><th>Finalized</th><th>Incomplete</th><th>PASS</th><th>FAIL</th><th>Last activity</th></tr></thead>
        <tbody>${model.evaluatorRows.map(r => `
          <tr>
            <td><b>${esc(r.name)}</b></td>
            <td>${r.total}</td>
            <td>${r.finalized}</td>
            <td class="${r.incomplete ? 'warnText' : ''}">${r.incomplete}</td>
            <td>${r.pass}</td>
            <td class="${r.fail ? 'bad' : ''}">${r.fail}</td>
            <td>${esc(fmtDateTime(r.last))}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>
  ` : '<div class="analyticsEmpty">No evaluator activity was found in this reporting window.</div>';

  $('pmBaseIncompleteTable').innerHTML = model.incompleteRows.length ? `
    <div class="analyticsTableWrap">
      <table class="analyticsTable pmIncompleteTable">
        <thead><tr><th>Class</th><th>Participant</th><th>Evaluator</th><th>Status</th><th>Started</th><th>Last activity</th></tr></thead>
        <tbody>${model.incompleteRows.slice(0, 100).map(r => `
          <tr>
            <td><b>${esc(r.className)}</b></td>
            <td>${esc(r.participant)}</td>
            <td>${esc(r.evaluator)}</td>
            <td><span class="statusPill warn">${esc(r.status.toUpperCase())}</span></td>
            <td>${esc(fmtDateTime(r.started))}</td>
            <td>${esc(fmtDateTime(r.updated))}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>
    ${model.incompleteRows.length > 100 ? `<div class="classificationRate">Showing the 100 most recent of ${model.incompleteRows.length} incomplete evaluations.</div>` : ''}
  ` : '<div class="analyticsEmpty">No incomplete evaluations in this reporting window.</div>';

  renderBars('pmBaseFailureModes', model.failureModes, 'No failed criterion observations with a failure mode in this window.');
  renderBars('pmBaseContributors', model.contributors, 'No failed criterion observations with a primary contributor in this window.');
}

async function loadDashboard(force=false) {
  inject();
  const card = $('programManagerBaseCard');
  if (!card) return;

  card.classList.toggle('hidden', !isProgramManager());
  if (!isProgramManager()) return;
  if (busy) return;

  const c = cloud();
  const m = membership();
  const supabase = client();
  if (!supabase || !c?.user?.id) {
    setStatus('Cloud client is unavailable.', 'error');
    return;
  }
  if (!navigator.onLine || !c.connected) {
    setStatus('Connect to the network to refresh the My Base dashboard.', 'offline');
    return;
  }

  const baseId = m.base_id;
  const label = baseLabel();
  $('pmBaseScope').textContent = `${label} · Program Manager`;

  if (!force && lastLoadedBaseId === baseId && $('pmBaseKpis')?.children.length) return;

  setBusy(true);
  setStatus(`Loading ${label} cloud operations…`, 'working');

  try {
    const days = daysValue();
    const cutoff = cutoffIso(days);

    const classes = await pagedQuery((from,to) => {
      let q = supabase.from('classes')
        .select('id,base_id,name,course_type,start_date,end_date,status,created_by,app_data,updated_at')
        .eq('base_id', baseId)
        .order('start_date', { ascending:false, nullsFirst:false });
      if (cutoff) q = q.or(`start_date.gte.${cutoff},status.eq.active,status.eq.draft`);
      return q.range(from,to);
    });

    const classIds = classes.map(x => x.id);
    let events = [];
    if (classIds.length) {
      events = await queryInChunks(
        'evaluation_events',
        'id,class_id,base_id,name,event_date,status,created_by,updated_at',
        'class_id',
        classIds
      );
    }

    const eventIds = events.map(x => x.id);
    let evaluations = [];
    if (eventIds.length) {
      evaluations = await queryInChunks(
        'evaluations',
        'id,event_id,participant_id,evaluator_id,status,overall_result,score_numerator,score_denominator,started_at,completed_at,updated_at',
        'event_id',
        eventIds
      );
    }

    const evaluationIds = evaluations.map(x => x.id);
    let failures = [];
    if (evaluationIds.length) {
      failures = await queryInChunks(
        'criterion_results',
        'evaluation_id,result,failure_mode,primary_contributor',
        'evaluation_id',
        evaluationIds,
        q => q.eq('result','fail')
      );
    }

    const evaluatorIds = [...new Set(evaluations.map(x => x.evaluator_id).filter(Boolean))];
    const participantIds = [...new Set(evaluations.map(x => x.participant_id).filter(Boolean))];

    let profileRows = [];
    if (evaluatorIds.length) {
      try {
        profileRows = await queryInChunks(
          'profiles',
          'id,display_name,email',
          'id',
          evaluatorIds
        );
      } catch (error) {
        console.warn('Program Manager dashboard could not resolve evaluator profile names.', error);
      }
    }

    let participantRows = [];
    if (participantIds.length) {
      try {
        participantRows = await queryInChunks(
          'participants',
          'id,participant_identifier,display_name',
          'id',
          participantIds
        );
      } catch (error) {
        console.warn('Program Manager dashboard could not resolve participant display names.', error);
      }
    }

    const model = buildModel({ classes, events, evaluations, failures, profileRows, participantRows });
    renderModel(model);
    lastLoadedBaseId = baseId;

    const windowLabel = days ? `last ${days === 365 ? '12 months' : `${days} days`}` : 'all available data';
    setStatus(`${label} · ${windowLabel} · refreshed ${new Date().toLocaleTimeString()}`, 'success');
  } catch (error) {
    console.error('Program Manager My Base dashboard failed', error);
    setStatus(`Dashboard load failed: ${error?.message || error}`, 'error');
  } finally {
    setBusy(false);
  }
}

window.addEventListener('raps-cloud-identity', () => {
  inject();
  lastLoadedBaseId = null;
  loadDashboard(true);
});

window.addEventListener('online', () => {
  if (isProgramManager()) loadDashboard(true);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    inject();
    loadDashboard(false);
  }, { once:true });
} else {
  inject();
  loadDashboard(false);
}

window.RAPS_PROGRAM_MANAGER_DASHBOARD = Object.freeze({
  refresh: () => loadDashboard(true)
});

})();
