'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

function functionSource(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  for (let end = source.indexOf('}', start); end >= 0; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error('Cannot parse ' + name);
}

// Exercise the actual Begin Assessment click handler and claim function. The
// DOM, session and server are synthetic; no NUC or external request is possible.
function harness(options = {}) {
  const course = {id:'class-1',name:'Synthetic class',tierId:'1',status:'draft',
    cloudSync:{status:options.conflict?'conflict':'pending'},
    students:[{id:'learner-1',name:'Synthetic learner',attempts:{}}]};
  const nodes = new Map(), alerts = [], calls = [];
  const state = {saved:0,view:null};
  function node(id) {
    if (!nodes.has(id)) nodes.set(id,{id,checked:true,disabled:false,textContent:'',innerHTML:''});
    return nodes.get(id);
  }
  const client = {
    from(table) {
      calls.push({action:'read',table});
      const query = {select(){return query;},eq(){return query;},
        async maybeSingle(){return {data:{id:course.id,curriculum_version_id:'curriculum-1',status:'open'},error:null};}};
      return query;
    },
    async rpc(name, args) {
      calls.push({action:'rpc',name,args});
      return {data:options.denied?{claimed:false,reason:'evaluation_owned_by_other_evaluator'}:
        {claimed:true,evaluationId:args.p_evaluation_id,startedAt:'2026-10-18T12:00:00Z'},error:null};
    }
  };
  const context = vm.createContext({
    window:{RAPS_ROSTER_SYNC:{async pushClassRosterAndShells(){
      if (options.syncError) throw new Error('Class read permission rejected');
      return options.synced !== false;
    }}},
    document:{body:{contains:()=>true}},console:{error(){}},
    $:node,cls:()=>course,findActiveEvaluationLock:()=>null,
    evaluationTargetMatchesLock:()=>false,isClassClosed:()=>false,esc:String,
    authoritativeEvaluationClient:()=>client,
    canAccessClass:()=>options.assignedOnly!==true,
    makeAttempt:()=>({id:'assessment-1',attemptNo:1,startedAt:1}),
    currentCloudUserId:()=> 'evaluator-1',serverTimeMs:value=>Date.parse(value),
    serverActiveEvaluationText:()=> 'Other evaluator claim',now:()=>1,
    openModal(){},closeModal(){},renderClass(){},renderEval(){},requestEvalWakeLock(){},
    saveDb(){state.saved++;},showView(value){state.view=value;},alert:value=>alerts.push(value),
    currentStudentId:null,currentAttemptNo:null,db:{deviceId:'device-1'}
  });
  vm.runInContext(functionSource('claimEvaluationOnServer')+'\n'+functionSource('openEvaluation'),context);
  return {course,alerts,calls,state,async begin(){
    context.openEvaluation('learner-1',1);
    await node('beginAttemptBtn').onclick();
  }};
}

for (const options of [{synced:false},{syncError:true},{conflict:true},{synced:false,assignedOnly:true,conflict:true}]) {
  test('failed or conflicted class sync cannot claim or create an assessment: '+JSON.stringify(options), async () => {
    const f=harness(options); await f.begin();
    assert.deepEqual(f.calls,[]);
    assert.deepEqual(f.course.students[0].attempts,{});
    assert.equal(f.state.saved,0);
    assert.equal(f.state.view,null);
    assert.match(f.alerts[0],/ASSESSMENT NOT STARTED/);
    assert.match(f.alerts[0],/did not create a local evaluation/);
  });
}

for (const options of [{},{assignedOnly:true,synced:false}]) {
  test('confirmed owner or assigned grader starts exactly one server-owned assessment: '+JSON.stringify(options), async () => {
    const f=harness(options); await f.begin();
    const claims=f.calls.filter(call=>call.action==='rpc');
    assert.equal(claims.length,1);
    assert.equal(claims[0].name,'claim_evaluation_authoritatively');
    assert.deepEqual(JSON.parse(JSON.stringify(claims[0].args)),{p_evaluation_id:'assessment-1',p_event_id:'class-1',
      p_participant_id:'learner-1',p_curriculum_version_id:'curriculum-1',p_attempt_number:1,p_source_device_id:'device-1'});
    assert.equal(Object.keys(f.course.students[0].attempts).length,1);
    assert.equal(f.course.students[0].attempts[1].serverClaimedBy,'evaluator-1');
    assert.equal(f.state.saved,1);
    assert.equal(f.state.view,'evalView');
    assert.deepEqual(f.alerts,[]);
  });
}

test('a server-denied claim creates no local evaluation after successful sync', async () => {
  const f=harness({denied:true}); await f.begin();
  assert.equal(f.calls.filter(call=>call.action==='rpc').length,1);
  assert.deepEqual(f.course.students[0].attempts,{});
  assert.equal(f.state.saved,0);
  assert.match(f.alerts[0],/owned by another evaluator/);
});
