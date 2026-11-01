'use strict';

// Missed Trends: computed with synthetic rows whose correct answers are known.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'tiers.js'), 'utf8'), { window });
vm.runInNewContext(fs.readFileSync(path.join(root, 'trend-analytics.js'), 'utf8'), { window });
const { build, render } = window.RAPS_TRENDS;
const json = v => JSON.parse(JSON.stringify(v));
const tier1 = window.TCCC_TIERS['1'].sections.flatMap(s => s.items);
const critical = tier1.find(i => i.critical), other = tier1.find(i => !i.critical);
const criteria = [{ id: 'k1', criterion_code: critical.id, critical: true }, { id: 'k2', criterion_code: other.id, critical: false }];

let seq = 0;
function evaluation(evaluator, result, attempt = 1, participant = `p${++seq}`, month = '2026-10') {
  return { id: `e${++seq}`, event_id: 'ev1', participant_id: participant, evaluator_id: evaluator, attempt_number: attempt,
    status: 'finalized', overall_result: result, completed_at: `${month}-15T12:00:00Z` };
}

test('most-missed criteria are ranked by miss rate, need 5 grades, and show the main cause', () => {
  const evaluations = [], results = [];
  for (let i = 0; i < 10; i++) {
    const e = evaluation('u1', i < 4 ? 'fail' : 'pass'); evaluations.push(e);
    results.push({ evaluation_id: e.id, criterion_id: 'k1', result: i < 4 ? 'fail' : 'pass', failure_mode: 'omission', primary_contributor: i < 3 ? 'knowledge' : 'skill' });
    results.push({ evaluation_id: e.id, criterion_id: 'k2', result: i < 1 ? 'fail' : 'pass' });
  }
  const m = build({ evaluations, results, criteria });
  assert.equal(m.mostMissed[0].code, critical.id);
  assert.equal(m.mostMissed[0].missRate, 0.4);
  assert.equal(m.mostMissed[0].critical, true);
  assert.equal(m.mostMissed[0].contributor.key, 'knowledge');
  assert.ok(m.mostMissed[0].text.length > 0, 'Criterion text comes from the curriculum');
  assert.equal(m.mostMissed[1].missRate, 0.1);
  const few = build({ evaluations: evaluations.slice(0, 3), results: results.filter(r => evaluations.slice(0, 3).some(e => e.id === r.evaluation_id)), criteria });
  assert.equal(few.mostMissed.length, 0, 'Fewer than 5 grades is not ranked');
});

test('unfinalized evaluations and not-tested grades are ignored', () => {
  const done = evaluation('u1', 'pass'), open = { ...evaluation('u1', null), status: 'in_progress', overall_result: null };
  const results = [{ evaluation_id: open.id, criterion_id: 'k1', result: 'fail' }, { evaluation_id: done.id, criterion_id: 'k1', result: 'not_observed' }];
  const m = build({ evaluations: [done, open], results, criteria });
  assert.equal(m.kpis.gradedCriteria, 0);
  assert.equal(m.kpis.firstAttempts, 1);
});

test('first-attempt pass rate, retest recovery, and students awaiting retest', () => {
  const evaluations = [
    evaluation('u1', 'pass', 1, 'a'), evaluation('u1', 'pass', 1, 'b'),
    evaluation('u1', 'fail', 1, 'c'), evaluation('u2', 'pass', 2, 'c'),   // recovered
    evaluation('u1', 'fail', 1, 'd'), evaluation('u2', 'fail', 2, 'd'),   // not recovered
    evaluation('u1', 'fail', 1, 'e')                                       // awaiting retest
  ];
  const k = build({ evaluations, results: [], criteria }).kpis;
  assert.equal(k.firstAttempts, 5);
  assert.equal(k.firstPassRate, 0.4);
  assert.equal(k.failedFirst, 3);
  assert.equal(k.recovered, 1);
  assert.equal(k.awaitingRetest, 1);
  assert.equal(k.recoveryRate, 0.5, '1 of the 2 retested passed');
});

test('calibration flags an evaluator who fails far more than peers on the same criteria', () => {
  const evaluations = [], results = [];
  // Six consistent peers fail k1 10% of the time; u1 fails it 50%. With a
  // realistic team, one outlier barely moves the others' peer baseline.
  for (const [evaluator, failEvery] of [['u1', 2], ['u2', 10], ['u3', 10], ['u4', 10], ['u5', 10], ['u6', 10], ['u7', 10]]) {
    for (let i = 0; i < 30; i++) {
      const fail = i % failEvery === 0, e = evaluation(evaluator, fail ? 'fail' : 'pass'); evaluations.push(e);
      results.push({ evaluation_id: e.id, criterion_id: 'k1', result: fail ? 'fail' : 'pass' });
    }
  }
  const m = build({ evaluations, results, criteria, profiles: [{ id: 'u1', display_name: 'SSgt Strict' }] });
  const strict = m.calibration.find(r => r.id === 'u1');
  assert.equal(strict.name, 'SSgt Strict');
  assert.equal(strict.flag, 'stricter');
  assert.ok(Math.abs(strict.observed - 0.5) < 1e-9);
  assert.ok(Math.abs(strict.expected - 0.1) < 1e-9, 'Expected rate uses peers only, excluding u1');
  for (const id of ['u2', 'u3', 'u4', 'u5', 'u6', 'u7']) assert.equal(m.calibration.find(r => r.id === id).flag, '', `${id} is consistent with peers`);
});

test('calibration needs 20 shared grades before judging anyone', () => {
  const evaluations = [], results = [];
  for (const evaluator of ['u1', 'u2']) for (let i = 0; i < 10; i++) {
    const e = evaluation(evaluator, 'fail'); evaluations.push(e);
    results.push({ evaluation_id: e.id, criterion_id: 'k1', result: evaluator === 'u1' ? 'fail' : 'pass' });
  }
  assert.equal(build({ evaluations, results, criteria }).calibration.length, 0);
});

test('first-attempt pass rate is reported by month, oldest first', () => {
  const evaluations = [evaluation('u1', 'pass', 1, 'x', '2026-09'), evaluation('u1', 'fail', 1, 'y', '2026-09'), evaluation('u1', 'pass', 1, 'z', '2026-10')];
  const months = json(build({ evaluations, results: [], criteria }).monthly);
  assert.deepEqual(months.map(m => [m.month, m.rate]), [['2026-09', 0.5], ['2026-10', 1]]);
});

test('rendering is safe with hostile names and with no data', () => {
  const target = { innerHTML: '' };
  render(target, null);
  assert.match(target.innerHTML, /No finalized evaluations/);
  const evaluations = [], results = [];
  for (const evaluator of ['u1', 'u2']) for (let i = 0; i < 25; i++) {
    const e = evaluation(evaluator, 'fail'); evaluations.push(e);
    results.push({ evaluation_id: e.id, criterion_id: 'k1', result: evaluator === 'u1' ? 'fail' : (i % 5 ? 'pass' : 'fail'), primary_contributor: 'psychomotor' });
  }
  render(target, build({ evaluations, results, criteria, profiles: [{ id: 'u1', display_name: '<img src=x onerror=alert(1)>' }] }));
  assert.ok(!target.innerHTML.includes('<img'), 'Names are escaped');
  assert.match(target.innerHTML, /add hands-on practice/);
  assert.match(target.innerHTML, /calibration review/);
});
