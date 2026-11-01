(() => {
'use strict';

// Missed-trend analytics shared by the Program Manager, MAJCOM, and Enterprise
// dashboards. Inputs are the server rows each dashboard already loads under its
// own access scope. Everything here is descriptive: it shows where students
// miss, why, how retests recover, and where instructors may need calibration.

const MIN_GRADED = 5;          // criterion must be graded this often to rank
const MIN_CALIBRATION = 20;    // evaluator graded criteria needed for calibration
const CALIBRATION_GAP = 0.10;  // flag a 10-point gap from peers on the same criteria

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = n => n == null || !Number.isFinite(n) ? '—' : `${Math.round(n * 100)}%`;
const human = v => String(v || 'unspecified').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function criterionText(code) {
  for (const tier of Object.values(window.TCCC_TIERS || {})) {
    for (const section of tier.sections || []) {
      const item = (section.items || []).find(i => i.id === code);
      if (item) return { text: item.text || '', tier: tier.shortName || '' };
    }
  }
  return { text: '', tier: '' };
}
function top(counts) {
  let best = '', n = 0, total = 0;
  for (const [key, value] of counts) { total += value; if (value > n) { best = key; n = value; } }
  return best ? { key: best, share: total ? n / total : 0 } : null;
}
function monthKey(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : '';
}

function build({ evaluations = [], results = [], criteria = [], profiles = [] } = {}) {
  const finalized = evaluations.filter(e => e.status === 'finalized' && ['pass', 'fail'].includes(String(e.overall_result || '').toLowerCase()));
  const evalById = new Map(finalized.map(e => [e.id, e]));
  const criterionById = new Map(criteria.map(c => [c.id, c]));
  const names = new Map(profiles.map(p => [p.id, p.display_name || p.email || 'Evaluator']));

  // Criterion miss rates: finalized evaluations only, PASS/FAIL grades only.
  const byCriterion = new Map();
  const graded = results.filter(r => evalById.has(r.evaluation_id) && ['pass', 'fail'].includes(r.result) && criterionById.has(r.criterion_id));
  for (const r of graded) {
    const row = byCriterion.get(r.criterion_id) || { id: r.criterion_id, graded: 0, fails: 0, modes: new Map(), contributors: new Map() };
    row.graded++;
    if (r.result === 'fail') {
      row.fails++;
      if (r.failure_mode) row.modes.set(r.failure_mode, (row.modes.get(r.failure_mode) || 0) + 1);
      if (r.primary_contributor) row.contributors.set(r.primary_contributor, (row.contributors.get(r.primary_contributor) || 0) + 1);
    }
    byCriterion.set(r.criterion_id, row);
  }
  const criteriaRows = [...byCriterion.values()].map(r => {
    const meta = criterionById.get(r.id) || {}, info = criterionText(meta.criterion_code);
    return { id: r.id, code: meta.criterion_code || '', critical: !!meta.critical, text: info.text, tier: info.tier,
      graded: r.graded, fails: r.fails, missRate: r.graded ? r.fails / r.graded : 0, mode: top(r.modes), contributor: top(r.contributors) };
  });
  const mostMissed = criteriaRows.filter(r => r.graded >= MIN_GRADED && r.fails > 0)
    .sort((a, b) => b.missRate - a.missRate || b.fails - a.fails || a.code.localeCompare(b.code)).slice(0, 10);

  // First attempts and retest recovery, per student and class event.
  const firsts = finalized.filter(e => Number(e.attempt_number || 1) === 1);
  const retests = finalized.filter(e => Number(e.attempt_number || 1) === 2);
  const firstPass = firsts.filter(e => String(e.overall_result).toLowerCase() === 'pass').length;
  const failedFirst = firsts.filter(e => String(e.overall_result).toLowerCase() === 'fail');
  const retestKey = e => `${e.event_id}|${e.participant_id}`;
  const retested = new Map(retests.map(e => [retestKey(e), e]));
  const recovered = failedFirst.filter(e => String(retested.get(retestKey(e))?.overall_result || '').toLowerCase() === 'pass').length;
  const awaitingRetest = failedFirst.filter(e => !retested.has(retestKey(e))).length;

  // Evaluator calibration: each evaluator's miss rate compared with what their
  // peers' rates on the same criteria would predict.
  const evaluatorStats = new Map();
  for (const r of graded) {
    const e = evalById.get(r.evaluation_id); if (!e?.evaluator_id) continue;
    const s = evaluatorStats.get(e.evaluator_id) || { id: e.evaluator_id, byCriterion: new Map() };
    const t = s.byCriterion.get(r.criterion_id) || { graded: 0, fails: 0 };
    t.graded++; if (r.result === 'fail') t.fails++;
    s.byCriterion.set(r.criterion_id, t); evaluatorStats.set(e.evaluator_id, s);
  }
  const calibration = [];
  for (const s of evaluatorStats.values()) {
    // Peer rate per criterion excludes this evaluator's own grades.
    let counted = 0, observedFails = 0, expectedFails = 0;
    for (const [criterionId, own] of s.byCriterion) {
      const all = byCriterion.get(criterionId), peerGraded = all.graded - own.graded;
      if (peerGraded < 1) continue;
      counted += own.graded; observedFails += own.fails;
      expectedFails += own.graded * (all.fails - own.fails) / peerGraded;
    }
    if (counted < MIN_CALIBRATION) continue;
    const observed = observedFails / counted, expected = expectedFails / counted, gap = observed - expected;
    calibration.push({ id: s.id, name: names.get(s.id) || 'Evaluator', graded: counted, observed, expected, gap,
      flag: Math.abs(gap) >= CALIBRATION_GAP ? (gap > 0 ? 'stricter' : 'more lenient') : '' });
  }
  calibration.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  // First-attempt pass rate by month.
  const months = new Map();
  for (const e of firsts) {
    const k = monthKey(e.completed_at); if (!k) continue;
    const m = months.get(k) || { month: k, total: 0, pass: 0 };
    m.total++; if (String(e.overall_result).toLowerCase() === 'pass') m.pass++;
    months.set(k, m);
  }
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
    .map(m => ({ ...m, rate: m.total ? m.pass / m.total : null }));

  return {
    kpis: { firstAttempts: firsts.length, firstPassRate: firsts.length ? firstPass / firsts.length : null,
      failedFirst: failedFirst.length, recovered, recoveryRate: failedFirst.length - awaitingRetest ? recovered / (failedFirst.length - awaitingRetest) : null,
      awaitingRetest, gradedCriteria: graded.length },
    mostMissed, calibration, monthly, thresholds: { MIN_GRADED, MIN_CALIBRATION, CALIBRATION_GAP }
  };
}

function cause(row) {
  const c = row.contributor;
  if (!c) return '—';
  const key = String(c.key).toLowerCase();
  const advice = /knowledge|recall|protocol/.test(key) ? 'review the content'
    : /skill|psychomotor|execution|technique/.test(key) ? 'add hands-on practice'
    : /equipment|resource/.test(key) ? 'check equipment and setup'
    : /sequenc|priorit|decision|judg/.test(key) ? 'drill sequencing and decisions' : 'review with instructors';
  return `${esc(human(c.key))} (${pct(c.share)}) · ${advice}`;
}

function render(target, model) {
  if (!target) return;
  if (!model || !model.kpis.firstAttempts) {
    target.innerHTML = '<p class="helper">No finalized evaluations in this window yet.</p>';
    return;
  }
  const k = model.kpis;
  const kpis = [
    ['First-attempt pass rate', pct(k.firstPassRate), `${k.firstAttempts} first attempts`],
    ['Retest recovery', pct(k.recoveryRate), `${k.recovered} of ${k.failedFirst - k.awaitingRetest} retested passed`],
    ['Awaiting retest', k.awaitingRetest, 'Failed Attempt 1, no retest yet']
  ].map(([label, value, sub]) => `<div class="kpi"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(sub)}</span></div>`).join('');
  const missed = model.mostMissed.length ? `<table class="analyticsTable trendTable"><thead><tr><th>Criterion</th><th>Missed</th><th>Main cause · suggestion</th></tr></thead><tbody>${
    model.mostMissed.map(r => `<tr><td><b>${esc(r.code)}</b>${r.critical ? ' <span class="crit">CRITICAL</span>' : ''}<br><small>${esc(r.text || '')}${r.tier ? ` · ${esc(r.tier)}` : ''}</small></td><td>${pct(r.missRate)}<br><small>${r.fails}/${r.graded}</small></td><td>${cause(r)}</td></tr>`).join('')
  }</tbody></table>` : `<p class="helper">No criterion has been graded ${model.thresholds.MIN_GRADED}+ times with a miss yet.</p>`;
  const calibration = model.calibration.length ? `<table class="analyticsTable trendTable"><thead><tr><th>Evaluator</th><th>Miss rate</th><th>Peers, same criteria</th><th>Check</th></tr></thead><tbody>${
    model.calibration.map(r => `<tr><td>${esc(r.name)}<br><small>${r.graded} graded</small></td><td>${pct(r.observed)}</td><td>${pct(r.expected)}</td><td>${r.flag ? `<span class="calibrationFlag">Grades ${r.flag} than peers · calibration review</span>` : 'Consistent with peers'}</td></tr>`).join('')
  }</tbody></table>` : `<p class="helper">Calibration needs evaluators with ${model.thresholds.MIN_CALIBRATION}+ graded criteria shared with peers.</p>`;
  const monthly = model.monthly.length ? model.monthly.map(m => `<div class="trendBar"><span>${esc(m.month)}</span><div><i style="width:${Math.round((m.rate || 0) * 100)}%"></i></div><b>${pct(m.rate)}</b><small>${m.total}</small></div>`).join('') : '';
  target.innerHTML = `<div class="analyticsKpis trendKpis">${kpis}</div>
    <h3>Most-missed criteria</h3>${missed}
    <h3>First-attempt pass rate by month</h3>${monthly || '<p class="helper">No dated first attempts.</p>'}
    <h3>Grading consistency</h3>${calibration}
    <p class="helper">Descriptive only. Miss rates use PASS/FAIL grades from finalized evaluations; criteria need ${model.thresholds.MIN_GRADED}+ grades to rank. Calibration compares each evaluator with peers on the same criteria and flags gaps of ${Math.round(model.thresholds.CALIBRATION_GAP * 100)}+ points for review, not as a finding. Comparisons are most meaningful with five or more instructors.</p>`;
}

window.RAPS_TRENDS = Object.freeze({ build, render });
})();
