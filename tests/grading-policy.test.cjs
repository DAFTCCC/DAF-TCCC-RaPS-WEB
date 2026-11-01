'use strict';

// Run with: node --test tests/grading-policy.test.cjs
// Policy comparisons deliberately use the pre-usability-change commit, so adding
// diagnostic fields cannot silently redefine the approved assessment behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = 'be124a1d36af411ea4676eba283eb1b3b762cd14';
const original = execFileSync('git', ['show', `${BASELINE}:app.js`], {cwd: ROOT, encoding: 'utf8'});
const current = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const tiersBytes = fs.readFileSync(path.join(ROOT, 'tiers.js'));
const tiersContext = {window: {}};
vm.runInNewContext(tiersBytes.toString(), tiersContext);
const tiers = JSON.parse(JSON.stringify(tiersContext.window.TCCC_TIERS));
const clone = value => JSON.parse(JSON.stringify(value));

// Ask the JS parser where the named function ends; do not split on braces in
// templates, comments, or nested callbacks, or execute the application's IIFE.
function functionSource(source, name) {
  const pattern = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
  const start = source.search(pattern);
  assert.ok(start >= 0, `Missing function ${name}`);
  for (let end = source.indexOf('}', start); end >= 0; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(start, end + 1);
    try {
      new vm.Script(`(${candidate})`);
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw new Error(`Cannot extract ${name}`);
}

function policyHarness(source) {
  return new vm.Script(`(() => {
    let fixture;
    const tier = () => fixture.t;
    const evalState = () => fixture.st;
    const timerAggregateStatus = d => fixture.statuses[d.id] ?? 'met';
    const activeTimerDefs = () => fixture.active;
    ${functionSource(source, 'scoreStats')}
    ${functionSource(source, 'proficiency')}
    return input => {
      fixture = input;
      return {score: scoreStats(input.t, input.st), proficiency: proficiency(input.t, input.st)};
    };
  })()`).runInNewContext();
}

const oldPolicy = policyHarness(original);
const newPolicy = policyHarness(current);

function passingFixture(t) {
  return {
    t: clone(t),
    st: {
      ratings: Object.fromEntries(t.sections.flatMap(section => section.items.map(item => [item.id, 'pass']))),
      failureDetails: {}, timerForced: {}, notes: {}, timers: {}, events: [],
    },
    statuses: Object.fromEntries((t.timers || []).map(timer => [timer.id, 'met'])),
    active: [],
  };
}

function compareFixture(fixture, expected) {
  const before = clone(fixture);
  const baseline = clone(oldPolicy(clone(fixture)));
  const actual = clone(newPolicy(fixture));
  assert.deepEqual(actual, baseline, 'The same evidence must produce the pre-change grading result');
  assert.deepEqual(fixture, before, 'Scoring must not modify the supplied evidence');
  if (expected) assert.equal(actual.proficiency.result, expected);
  return actual;
}

test('approved criterion wording, criticality, timing definitions, and tier rules are byte-identical', () => {
  assert.equal(createHash('sha256').update(tiersBytes).digest('hex'),
    '297d83f691d03ac3995abb2a323b0a119f9018696f847b77994164003f25bc0a');
});

test('server lifecycle remains unchanged: authoritativeEvaluationClient', () => {
  assert.equal(functionSource(current, 'authoritativeEvaluationClient'), functionSource(original, 'authoritativeEvaluationClient'));
});

// 3.4.13 adds offline field evaluation in front of the online server path.
// Every approved baseline line must still be present, in order, so the online
// claim, finalize, and void workflow is untouched. The only baseline lines that
// may differ are the reviewed replacements below, and each replacement must be
// present exactly as written.
const APPROVED_LIFECYCLE_REPLACEMENTS = {
  openEvaluation: [
    ["function openEvaluation(studentId,attemptNo){", "function openEvaluation(studentId,attemptNo,options={}){"],
    ["  if(attemptNo===2 && s.attempts?.['1']?.finalResult!=='FAIL'){alert('Attempt 2 is reserved for remediation after a finalized Attempt 1 FAIL.');return;}",
      "  if(attemptNo===2){const blocked=attempt2BlockReason(s,{retestWithoutLocalA1});if(blocked){alert(blocked);return;}}"],
    ["$('formModalBody').innerHTML=`<div class=\"startGate\">", "${retestWithoutLocalA1?'<div class=\"startWarning\"><b>Retest from another phone</b>"],
    ["    if(btn){btn.disabled=true;btn.textContent='CLAIMING ASSESSMENT…';}", "    if(btn){btn.disabled=true;btn.textContent=offline?'STARTING OFFLINE…':'CLAIMING ASSESSMENT…';}"],
    ["    let claimClient=null,claimedId='';", "    let claimClient=null,claimedId='',candidate=null;"],
    ["      const candidate=makeAttempt(c,s,attemptNo);", "      candidate=makeAttempt(c,s,attemptNo);"],
    ["      if(attemptNo===2)candidate.remediation={reason,action,at:now()};", "      if(attemptNo===2)candidate.remediation={reason,action,at:now(),...(retestWithoutLocalA1?{attempt1OnAnotherDevice:true}:{})};"]
  ],
  finalizeEvaluation: [],
  voidCurrentAttempt: []
};
for (const [name, replacements] of Object.entries(APPROVED_LIFECYCLE_REPLACEMENTS)) {
  test(`server lifecycle baseline is preserved: ${name}`, () => {
    const before = functionSource(original, name).split('\n');
    const after = functionSource(current, name);
    const lines = after.split('\n');
    let cursor = 0;
    for (const line of before) {
      const at = lines.indexOf(line, cursor);
      if (at >= 0) { cursor = at + 1; continue; }
      const approved = replacements.find(([old]) => line.startsWith(old) || line.includes(old));
      assert.ok(approved, `Unapproved change to ${name}: ${line.slice(0, 140)}`);
      assert.ok(after.includes(approved[1]), `Approved replacement missing in ${name}: ${approved[1].slice(0, 140)}`);
    }
  });
}

test('offline finalization seals locally only when the server is unreachable or the claim is pending', () => {
  const body = functionSource(current, 'finalizeEvaluation');
  const offline = body.indexOf('if(!cloudReachable()||st.pendingServerClaim){');
  const online = body.indexOf("client.rpc('finalize_evaluation_authoritatively'");
  assert.ok(offline > 0 && online > offline, 'The local seal must be an explicit branch ahead of the unchanged server finalize');
  assert.ok(functionSource(current, 'finalizeLocallyPendingServer').includes('st.pendingServerFinalization=true'));
});

test('claim protocol is unchanged apart from requiring confirmed roster synchronization', () => {
  const guard = "  const managesRoster=canAccessClass('manageRoster',c);\n" +
    "  const rosterSynced=await window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(c);\n" +
    "  if((managesRoster&&rosterSynced!==true)||String(c?.cloudSync?.status||'')==='conflict')throw new Error('The server has not confirmed this class and roster. Use Sync Classes and resolve any errors or conflicts before starting an assessment.');";
  const claim = functionSource(current, 'claimEvaluationOnServer');
  assert.ok(claim.includes(guard));
  assert.equal(claim.replace(guard, '  await window.RAPS_ROSTER_SYNC.pushClassRosterAndShells(c);'),
    functionSource(original, 'claimEvaluationOnServer'));
});

for (const t of Object.values(tiers)) {
  const items = t.sections.flatMap(section => section.items);
  const critical = items.filter(item => item.critical);
  const ordinary = items.filter(item => !item.critical);
  const global = t.timers.find(timer => timer.section === 'GLOBAL');
  const prefix = `Tier ${t.id}`;

  test(`${prefix}: all criteria passed with required timing met`, () => {
    const actual = compareFixture(passingFixture(t), 'PASS');
    assert.deepEqual(actual.score, {
      pass: items.length, fail: 0, nt: 0, ungraded: 0,
      denom: items.length, percent: 1, percentText: '100.0%',
    });
  });

  for (const [label, detail, expected] of [
    ['classified critical failure', {mode: 'incorrect', contributor: 'skill-execution'}, 'FAIL'],
    ['critical failure awaiting explanation', null, 'INCOMPLETE'],
    ['critical failure with unclassified mode', {mode: 'unclassified', contributor: 'knowledge'}, 'INCOMPLETE'],
    ['critical failure with missing mode', {contributor: 'knowledge'}, 'INCOMPLETE'],
    ['critical failure with missing contributor', {mode: 'omitted', contributor: ''}, 'INCOMPLETE'],
  ]) {
    test(`${prefix}: ${label}`, () => {
      const f = passingFixture(t);
      f.st.ratings[critical[0].id] = 'fail';
      if (detail) f.st.failureDetails[critical[0].id] = detail;
      compareFixture(f, expected);
    });
  }

  for (const [label, item, rating] of [
    ['ungraded critical', critical[0], undefined],
    ['ungraded noncritical', ordinary[0], undefined],
    ['NT on a critical criterion', critical[0], 'nt'],
  ]) {
    test(`${prefix}: ${label} blocks completion`, () => {
      const f = passingFixture(t);
      if (rating) f.st.ratings[item.id] = rating;
      else delete f.st.ratings[item.id];
      compareFixture(f, 'INCOMPLETE');
    });
  }

  test(`${prefix}: noncritical NT is excluded from the denominator`, () => {
    const f = passingFixture(t);
    f.st.ratings[ordinary[0].id] = 'nt';
    const {score} = compareFixture(f, 'PASS');
    assert.equal(score.nt, 1);
    assert.equal(score.denom, items.length - 1);
    assert.equal(score.percent, 1);
  });

  for (const [offset, expected] of [[-1, 'FAIL'], [0, 'PASS'], [1, 'PASS']]) {
    test(`${prefix}: score ${offset < 0 ? 'below' : offset ? 'above' : 'at'} the 75% boundary`, () => {
      const f = passingFixture(t);
      const ntCount = items.length % 4;
      ordinary.slice(0, ntCount).forEach(item => { f.st.ratings[item.id] = 'nt'; });
      const denominator = items.length - ntCount;
      const failCount = denominator / 4 - offset;
      ordinary.slice(ntCount, ntCount + failCount).forEach(item => { f.st.ratings[item.id] = 'fail'; });
      assert.ok(ntCount + failCount <= ordinary.length, 'Fixture must fail only noncritical items');
      const {score} = compareFixture(f, expected);
      assert.equal(score.percent, 0.75 + offset / denominator);
    });
  }

  test(`${prefix}: no grades cannot create a passing result`, () => {
    const f = passingFixture(t);
    f.st.ratings = {};
    const {score} = compareFixture(f, 'INCOMPLETE');
    assert.equal(score.denom, 0);
    assert.equal(score.percent, 0);
    assert.equal(score.ungraded, items.length);
  });

  for (const [status, expected] of [['met', 'PASS'], ['notmet', 'FAIL'], ['incomplete', 'INCOMPLETE'], ['live-met', 'INCOMPLETE']]) {
    test(`${prefix}: global timing ${status}`, () => {
      const f = passingFixture(t);
      f.statuses[global.id] = status;
      compareFixture(f, expected);
    });
  }

  for (const timer of t.timers) {
    for (const activeKind of ['running', 'paused']) {
      test(`${prefix}: ${timer.id} ${activeKind} prevents finalization even when expired`, () => {
        const f = passingFixture(t);
        f.active = [{...timer, testActiveKind: activeKind}];
        f.statuses[timer.id] = 'notmet';
        compareFixture(f, 'INCOMPLETE');
      });
    }
    if (!timer.linkedItemId) continue;
    for (const status of ['incomplete', 'live-met', 'notmet']) {
      test(`${prefix}: linked PASS requires ${timer.id} to be stopped and MET (${status})`, () => {
        const f = passingFixture(t);
        f.statuses[timer.id] = status;
        const actual = compareFixture(f, 'INCOMPLETE');
        assert.ok(actual.proficiency.timerPassMissing.some(d => d.id === timer.id));
      });
    }
  }

  test(`${prefix}: diagnostic context cannot change official ratings or the computed outcome`, () => {
    const f = passingFixture(t);
    f.st.ratings[ordinary[0].id] = 'fail';
    f.st.failureDetails[ordinary[0].id] = {mode: 'incorrect', contributor: 'skill-execution'};
    const initial = compareFixture(f, 'PASS');
    f.st.failureDetails[ordinary[0].id] = {
      ...f.st.failureDetails[ordinary[0].id],
      comment: 'Missed the observed endpoint; learner explained equipment difficulty.',
      contributors: ['skill-execution', 'environment-system'], confidence: 'uncertain',
      observedBehavior: 'Observed behavior', learnerAccount: 'Learner explanation',
      practiceTask: 'Targeted practice', reassessment: 'Independent demonstration',
    };
    f.st.observations = {[ordinary[0].id]: {tags: ['prompted', 'self-corrected'], reviewNeeded: true}};
    f.st.overallNotes = 'Diagnostic hypotheses do not modify grading requirements.';
    const enriched = compareFixture(f, 'PASS');
    assert.deepEqual(enriched, initial);
  });
}

function timerHarness(source) {
  const names = ['timerStore', 'currentInstance', 'timerNeedsRecovery', 'elapsedSafe',
    'gradingDuration', 'rawTimerResult', 'timerAggregateStatus', 'activeTimerDefs'];
  return new vm.Script(`(() => {
    const RUNTIME_ID = 'test-runtime';
    const now = () => 10000000;
    const monoNow = () => null;
    let fixture;
    const tier = () => fixture.t;
    const evalState = () => fixture.st;
    ${names.map(name => functionSource(source, name)).join('\n')}
    return input => {
      fixture = input;
      return {
        aggregate: timerAggregateStatus(input.d),
        active: activeTimerDefs(input.t).map(d => d.id),
        raw: input.st.timers[input.d.id].instances.map(x => rawTimerResult(input.d, x)),
      };
    };
  })()`).runInNewContext();
}
const oldTimers = timerHarness(original);
const newTimers = timerHarness(current);

function timerInstance(duration, extra = {}) {
  return {wallStart: 1000, wallStop: 2000, finalDurationMs: duration,
    runtimeId: 'test-runtime', activeMs: duration, continuousMs: duration,
    maxContinuousMs: duration, adminPauseMs: 0, running: false, paused: false,
    ...extra};
}

for (const t of Object.values(tiers)) {
  for (const d of t.timers) {
    const low = (d.mode === 'max' ? d.seconds : d.mode === 'min' ? d.seconds : d.minSeconds) * 1000;
    const boundaries = d.mode === 'max'
      ? [[low - 1, 'met'], [low, 'met'], [low + 1, 'notmet']]
      : d.mode === 'min'
        ? [[low - 1, 'notmet'], [low, 'met'], [low + 1, 'met']]
        : [[low - 1, 'notmet'], [low, 'met'], [d.maxSeconds * 1000, 'met'], [d.maxSeconds * 1000 + 1, 'notmet']];
    for (const [duration, expected] of boundaries) {
      test(`Tier ${t.id}: ${d.id} ${duration} ms timing boundary`, () => {
        const fixture = {t, d, st: {timers: {[d.id]: {instances: [timerInstance(duration)], currentIndex: 0}}}};
        const before = clone(oldTimers(clone(fixture)));
        const actual = clone(newTimers(clone(fixture)));
        assert.deepEqual(actual, before);
        assert.equal(actual.aggregate, expected);
        assert.deepEqual(actual.active, []);
      });
    }
  }
}

for (const [label, instances, expected, active] of [
  ['no instances', [], 'incomplete', false],
  ['repeat all met', [timerInstance(1000), timerInstance(2000)], 'met', false],
  ['one repeated failure persists', [timerInstance(1000), timerInstance(60001)], 'notmet', false],
  ['voided failed instance excluded', [timerInstance(1000), timerInstance(60001, {voided: true})], 'met', false],
  ['running maximum expired', [timerInstance(60001, {wallStop: null, running: true})], 'notmet', true],
  ['paused maximum expired', [timerInstance(60001, {wallStop: null, paused: true})], 'notmet', true],
  ['running maximum within limit', [timerInstance(1000, {wallStop: null, running: true})], 'live-met', true],
]) {
  test(`timing instance policy: ${label}`, () => {
    const d = {id: 'fixture', section: 'GLOBAL', mode: 'max', seconds: 60, gradingClock: 'active'};
    const fixture = {t: {timers: [d]}, d, st: {timers: {[d.id]: {instances, currentIndex: instances.length - 1}}}};
    const before = clone(oldTimers(clone(fixture)));
    const actual = clone(newTimers(clone(fixture)));
    assert.deepEqual(actual, before);
    assert.equal(actual.aggregate, expected);
    assert.equal(actual.active.length > 0, active);
  });
}
