'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const instant = 1700000000000;

// Parse isolated production functions without starting the browser application.
function functionSource(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing ${name}`);
  for (let end = source.indexOf('}', start); end >= 0; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`Cannot parse ${name}`);
}

const functions = ['scoreStats', 'proficiencyFor', 'matchedReassessmentStats', 'criticalFailCount',
  'classAnalytics', 'rootCauseStats', 'diagnosticTagLabel', 'diagnosticLines', 'diagnosticExportRecord',
  'diagnosticExportValues', 'buildReviewText', 'wrap', 'opText', 'opRect', 'buildCoachingDetailPages',
  'exportIndividualCsv', 'exportClassSummaryCsv', 'exportClassCriteriaCsv', 'exportEnterpriseAnalyticsCsvForClasses',
  'exportClassAnalyticsCsv', 'criterionGapStats', 'evaluatorSignalStats', 'classAttempt1s', 'median', 'finalAttemptForStudent'];
function harness(fixture) {
  const context = vm.createContext({ fixture, console });
  return vm.runInContext(`(() => {
    const APP_VERSION='test', ANALYTICS_SCHEMA_VERSION='TCCC_ANALYTICS_3.0';
    const CLASS_LOCATION_HEADERS=[], LOCATION_DATA={}, CONTRIBUTOR_LABELS={equipment:'Equipment / Environment'};
    const allItems=t=>t.sections.flatMap(s=>s.items), tier=()=>fixture.t, cls=()=>fixture.c;
    const student=()=>fixture.s, evalState=()=>fixture.a, proficiency=()=>fixture.p;
    const now=()=>${instant}, iso=v=>v?new Date(v).toISOString():'', safe=v=>v, fmt=v=>String(v);
    const classLocationExportValues=()=>[], lifecycleStatus=()=> 'ACTIVE', ensureLocationFields=()=>{};
    const bytes=value=>value, csv=rows=>JSON.parse(JSON.stringify(rows));
    const saveFile=async(name,data)=>{fixture.exports.push({name,data});return true;};
    const timerAggregateStatus=()=> 'met', timerStore=()=>({instances:[]});
    const ${source.match(/^const DIAGNOSTIC_EXPORT_HEADERS=.*;$/m)[0].slice(6)}
    ${functions.map(functionSource).join('\n')}
    return {${functions.join(',')}};
  })()`, context);
}

function fixture(count = 7) {
  const items = Array.from({length: count}, (_, n) => ({id:`M${n + 1}`,section:'M',text:`Approved task ${n + 1}`,critical:n===0,sourceReference:'JTS source'}));
  const t={id:'1',shortName:'ASM',source:'JTS source',sections:[{code:'M',title:'M phase',items}],timers:[]};
  const a={id:'attempt-1',attemptNo:1,startedAt:instant-5000,ratings:Object.fromEntries(items.map(i=>[i.id,'pass'])),
    observations:{},failureDetails:{},methods:{},stamps:{},notes:{},events:[],timers:{}};
  const s={id:'student-1',name:'Test learner',attempts:{1:a}};
  const c={id:'class-1',name:'Test class',tierId:'1',tierSnapshot:t,students:[s]};
  const p={result:'PASS',score:{pass:count,fail:0,nt:0,ungraded:0,denom:count,percent:1,percentText:'100.0%'},
    criticalFail:[],criticalCauseMissing:[],criticalUnresolved:[],otherUnresolved:[],activeTimers:[]};
  return {t,a,s,c,p,exports:[]};
}

test('unfinalized export results remain provisional regardless of checklist, timer, or stale result', () => {
  const f=fixture(), h=harness(f);
  for (const finalResult of [undefined,'PASS','FAIL']) {
    f.a.finalResult=finalResult;
    f.a.timers.GLOBAL={instances:[{wallStart:instant-900000,wallStop:instant,finalDurationMs:900000}]};
    assert.equal(h.proficiencyFor(f.t,f.a).result,'PROVISIONAL');
  }
  f.a.finalizedAt=instant;f.a.finalResult='FAIL';
  assert.equal(h.proficiencyFor(f.t,f.a).result,'FAIL');
  f.a.ratings.M1='fail';f.a.finalResult='PASS';
  assert.equal(h.proficiencyFor(f.t,f.a).result,'PASS','Recorded server outcome remains authoritative');
});

test('matched reassessment uses the same failed criteria and explicit A2 independence evidence', () => {
  const f=fixture(),h=harness(f);
  f.a.finalizedAt=instant;
  for(let n=1;n<=6;n++)f.a.ratings[`M${n}`]='fail';
  const a2={finalizedAt:instant+1000,ratings:{M1:'pass',M2:'pass',M3:'pass',M4:'fail',M5:'nt',M7:'pass'},
    observations:{M1:{tags:['independent']},M2:{tags:['prompted']},M3:{tags:['self-corrected']}},
    failureDetails:{M3:{reassessmentOutcome:'independent-pass',reassessedAt:instant}}};
  const before=copy({a1:f.a,a2});
  assert.deepEqual(copy(h.matchedReassessmentStats(f.t,f.a,a2)),{failed:6,retested:4,pass:3,independent:1,assisted:1,unknown:1,repeatFail:1,nt:1,ungraded:1,pending:0});
  assert.deepEqual({a1:f.a,a2},before,'Analytics must not alter evidence');
  delete a2.finalizedAt;
  assert.equal(h.matchedReassessmentStats(f.t,f.a,a2).pending,6);
  assert.equal(h.matchedReassessmentStats(f.t,f.a,a2).pass,0,'An in-progress A2 does not establish improvement');
});

test('contributor summaries separate failed observations, learners, and explicitly linked episodes', () => {
  const f=fixture(3),h=harness(f);
  f.a.finalizedAt=instant;f.a.ratings={M1:'fail',M2:'fail',M3:'pass'};
  f.a.failureDetails={M1:{contributor:'equipment',episodeId:'episode-1'},M2:{contributor:'equipment',episodeId:'episode-1'},M3:{contributor:'equipment'}};
  f.c.students.push({id:'student-2',attempts:{1:{id:'attempt-2',finalizedAt:instant,ratings:{M1:'fail'},failureDetails:{M1:{contributor:'equipment',episodeId:'episode-1'}}}}});
  f.c.students.push({id:'student-3',attempts:{1:{ratings:{M1:'fail'},failureDetails:{M1:{contributor:'equipment'}}}}});
  const result=h.rootCauseStats(f.c,f.t);
  assert.equal(result.total,3);assert.equal(result.learners,2);assert.equal(result.episodes,2);
  assert.equal(result.linkedObservations,3);assert.equal(result.unlinkedObservations,0);
  assert.deepEqual(copy(result.rows[0]),{label:'equipment',count:3,pct:1,learners:2,episodes:2});
  delete f.a.failureDetails.M2.episodeId;
  assert.equal(h.rootCauseStats(f.c,f.t).unlinkedObservations,1,'Unlinked observations must not become inferred episodes');
});

test('review text preserves observed evidence, contributor uncertainty, plans, and historical notes after PASS', () => {
  const f=fixture(2),h=harness(f);
  f.a.ratings.M1='fail';f.a.failureDetails.M1={mode:'incorrect',comment:'Failure evidence with a comma, and a newline\nsecond line',
    contributor:'equipment',additionalContributors:['knowledge'],confidence:'possible',learnerExplanation:'Learner explanation',
    episodeId:'episode-4',practicePlan:'Practice this specific task',reassessmentPlan:'Repeat without prompts',
    reassessmentOutcome:'independent-pass',reassessedAt:instant,retentionDueAt:instant+86400000,classifiedAt:instant};
  f.a.failureDetails.M2={comment:'Historical failure evidence retained'};
  f.p.criticalFail=[f.t.sections[0].items[0]];
  f.a.observations.M2={tags:['prompted'],reviewNeeded:true};
  const text=h.buildReviewText();
  for(const expected of ['PROVISIONAL STATUS','Failure evidence with a comma','second line','Learner explanation','Practice this specific task',
    'Repeat without prompts','Contributor confidence: possible','Linked failure episode: episode-4','Retention check planned for',
    'Historical failure evidence retained','M2 — Current grade: PASS','Contributor selections are hypotheses'])assert.ok(text.includes(expected),expected);
});

test('coaching detail pagination includes every failure and all evaluator notes without clipping', () => {
  const f=fixture(12),h=harness(f);
  f.a.ratings=Object.fromEntries(f.t.sections[0].items.map(i=>[i.id,'fail']));
  for(const item of f.t.sections[0].items)f.a.failureDetails[item.id]={comment:`UNIQUE_EVIDENCE_${item.id} ${'Observation detail. '.repeat(60)}`,practicePlan:`PRACTICE_${item.id}`};
  f.a.overallNotes='Long evaluator note. '.repeat(300)+' FINAL_NOTE_MARKER';
  const pages=h.buildCoachingDetailPages(f.t,f.a,f.s.name);
  assert.ok(pages.length>2);
  const texts=pages.flat().filter(o=>o.type==='text');
  const text=texts.map(o=>o.text).join(' ');
  for(const item of f.t.sections[0].items){assert.ok(text.includes(`UNIQUE_EVIDENCE_${item.id}`));assert.ok(text.includes(`PRACTICE_${item.id}`));}
  assert.ok(text.includes('FINAL_NOTE_MARKER'));
  assert.ok(texts.every(o=>o.y>=48),'Every detail line stays inside the printable area');
});

test('individual, class, and enterprise CSV exports append diagnostics and label provisional outcomes consistently', async () => {
  const f=fixture(1),h=harness(f);
  f.a.finalResult='PASS'; // A stale draft result must not escape as an official PASS.
  f.a.failureDetails.M1={comment:'A comma, newline\nquote"',learnerExplanation:'Reason',confidence:'uncertain',additionalContributors:['equipment'],
    episodeId:'linked-1',practicePlan:'Practice',reassessmentPlan:'Recheck',reassessmentOutcome:'not-assessed',classifiedAt:instant};
  f.a.observations.M1={tags:['prompted'],reviewNeeded:true,observedAt:instant,recordedAt:instant+200};
  const before=copy(f.a);
  await h.exportIndividualCsv();await h.exportClassCriteriaCsv();await h.exportEnterpriseAnalyticsCsvForClasses([f.c]);await h.exportClassSummaryCsv();
  assert.equal(f.exports.length,4);
  for(const {name,data} of f.exports){
    const [header,...rows]=data;
    assert.ok(rows.every(row=>row.length===header.length),name);
    const status=header.indexOf('result_status');assert.ok(status>=0,name);
    for(const row of rows)assert.equal(row[status],'PROVISIONAL',name);
    const result=header.indexOf('result')>=0?header.indexOf('result'):header.indexOf('attempt_result');
    if(result>=0)for(const row of rows)assert.equal(row[result],'PROVISIONAL',name);
    if(header.includes('learner_explanation')){
      const row=header.includes('record_type')?rows.find(r=>r[header.indexOf('record_type')]==='CRITERION'):rows[0];
      assert.equal(row[header.indexOf('learner_explanation')],'Reason',name);
      assert.equal(row[header.indexOf('observation_tags')],'["prompted"]',name);
      assert.equal(row[header.indexOf('failure_comment')],'A comma, newline\nquote"',name);
      assert.equal(row[header.indexOf('additional_contributors')],'["equipment"]',name);
    }
  }
  assert.deepEqual(f.a,before,'Exports must not change the assessment');
});

test('analytics CSV exports matched coverage and separate learner and episode counts', async () => {
  const f=fixture(2),h=harness(f);
  f.a.finalizedAt=instant;f.a.finalResult='FAIL';f.a.ratings={M1:'fail',M2:'fail'};
  f.a.failureDetails={M1:{contributor:'equipment',episodeId:'one-episode'},M2:{contributor:'equipment',episodeId:'one-episode'}};
  f.s.attempts[2]={attemptNo:2,finalizedAt:instant+1000,finalResult:'PASS',ratings:{M1:'pass',M2:'nt'},observations:{M1:{tags:['independent']}}};
  await h.exportClassAnalyticsCsv();
  const [header,...rows]=f.exports[0].data;
  assert.ok(rows.every(row=>row.length===header.length));
  const metric=name=>rows.find(row=>row[0]==='METRIC'&&row[1]===name)?.[2];
  assert.equal(metric('matched_a1_failed_criteria_failed'),2);
  assert.equal(metric('matched_a1_failed_criteria_pass'),1);
  assert.equal(metric('matched_a1_failed_criteria_nt'),1);
  assert.equal(metric('explicit_linked_failure_episodes'),1);
  const contributor=rows.find(row=>row[0]==='ROOT_CAUSE');
  assert.equal(contributor[header.indexOf('root_cause_count')],2);
  assert.equal(contributor[header.indexOf('learners_affected')],1);
  assert.equal(contributor[header.indexOf('explicit_linked_episodes')],1);
});
