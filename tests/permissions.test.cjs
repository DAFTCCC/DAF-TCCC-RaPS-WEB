'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'permissions.js'), 'utf8');
const instant = Date.parse('2026-10-17T08:00:00Z');
const row = (role, extra={}) => ({id:'membership-'+role,user_id:'user-1',role,active:true,
  starts_at:'2026-10-01T00:00:00Z',ends_at:null,
  base_id:role==='evaluator'||role==='program_manager'?'base-1':null,
  majcom_id:role==='majcom_manager'?'majcom-1':null,
  bases:role==='evaluator'||role==='program_manager'?{id:'base-1',code:'TEST',active:true,majcom_id:'majcom-1',majcoms:{active:true}}:null,
  majcoms:role==='majcom_manager'?{id:'majcom-1',active:true}:null,...extra});
function harness(memberships=[row('enterprise_admin')]) {
  let time=instant;
  const listeners={};
  const window={RAPS_CLOUD:{user:{id:'user-1'},role:'enterprise_admin',connected:true,offlineCached:false,memberships},
    addEventListener(name,fn){listeners[name]=fn;}};
  const navigator={onLine:true};
  class Clock extends Date {static now(){return time;}}
  vm.runInNewContext(source,{window,navigator,Date:Clock});
  return {window,navigator,p:window.RAPS_PERMISSIONS,tick(ms){time+=ms;},identity(value){window.RAPS_CLOUD=value;listeners['raps-cloud-identity']?.();}};
}
const own={id:'class-1',homeInstallationId:'TEST',cloudScope:{baseId:'base-1',baseCode:'TEST',majcomId:'majcom-1'},cloudSync:{createdBy:'user-1'}};
const other={...own,id:'class-2',cloudSync:{createdBy:'user-2'}};
const outside={...other,id:'class-3',homeInstallationId:'OTHER',cloudScope:{baseId:'base-2',baseCode:'OTHER',majcomId:'majcom-2'}};

for(const role of ['evaluator','program_manager','majcom_manager','enterprise_admin']) {
  test(`${role}: least-privilege class actions and scope`,()=>{
    const {p}=harness([row(role)]);
    assert.equal(p.canClass('readClass',own),true);
    assert.equal(p.canClass('readClass',other),role!=='evaluator');
    assert.equal(p.canClass('manageRoster',other),['program_manager','enterprise_admin'].includes(role));
    assert.equal(p.canClass('manageClass',own),role!=='majcom_manager');
    assert.equal(p.canClass('evaluate',own),role!=='majcom_manager');
    assert.equal(p.canClass('closeClass',own),['program_manager','enterprise_admin'].includes(role));
    assert.equal(p.canClass('readClass',outside),role==='enterprise_admin');
    assert.equal(p.canClass('manageClass',outside),role==='enterprise_admin');
    for(const action of ['removeLocalCopy','deleteClass','restoreClass']) assert.equal(p.canClass(action,own),role==='enterprise_admin');
    assert.equal(p.canClass('unrecognized-action',own),false);
  });
  test(`${role}: cached offline identity cannot authorize administration or cloud writes`,()=>{
    const h=harness([row(role)]);
    h.window.RAPS_CLOUD.connected=false;h.window.RAPS_CLOUD.offlineCached=true;h.navigator.onLine=false;
    assert.equal(h.p.hasRole(role),false);
    for(const action of ['manageClass','manageRoster','closeClass','deleteClass','removeLocalCopy','evaluate']) assert.equal(h.p.canClass(action,own),false);
    assert.equal(h.p.canClass('readClass',own,{online:false}),true);
    assert.equal(h.p.canClass('evaluate',own,{online:false}),role!=='majcom_manager');
  });
}

test('a claimed role, DOM role, or primary membership cannot substitute for real valid memberships',()=>{
  const h=harness([]);h.window.RAPS_CLOUD.primaryMembership=row('enterprise_admin');
  assert.equal(h.p.hasRole('enterprise_admin'),false);
  assert.equal(h.p.canClass('removeLocalCopy',own),false);
  h.window.RAPS_CLOUD.memberships=[row('evaluator')];
  assert.equal(h.p.hasRole('enterprise_admin'),false);
});

for(const [name,patch] of Object.entries({inactive:{active:false},'string active':{active:'true'},expired:{ends_at:'2026-10-17T08:00:00Z'},future:{starts_at:'2026-10-18T00:00:00Z'},'bad start':{starts_at:'invalid'},'bad end':{ends_at:'invalid'},'empty start':{starts_at:''},'wrong user':{user_id:'another-user'},'scoped Enterprise':{base_id:'base-1'},'unknown role':{role:'superadmin'}})) {
  test(`invalid membership denied: ${name}`,()=>{
    const h=harness([row('enterprise_admin',patch)]);
    assert.equal(h.p.activeMemberships().length,0);
    assert.equal(h.p.canClass('removeLocalCopy',own),false);
  });
}

test('inactive installation and parent command invalidate scoped access',()=>{
  for(const base of [{id:'base-1',active:false},{id:'base-1',active:true,majcoms:{active:false}},{id:'wrong-base',active:true}]) {
    const {p}=harness([row('program_manager',{bases:base})]);
    assert.equal(p.canClass('closeClass',own),false);
  }
  const {p}=harness([row('majcom_manager',{majcoms:{id:'majcom-1',active:false}})]);
  assert.equal(p.canClass('readClass',own),false);
});

test('secondary memberships grant their own explicit scope without global role dominance',()=>{
  const {p}=harness([row('majcom_manager'),row('program_manager',{base_id:'base-2',bases:{id:'base-2',code:'OTHER',active:true}})]);
  assert.equal(p.hasRole('program_manager'),true);
  assert.equal(p.canClass('closeClass',own),false);
  assert.equal(p.canClass('closeClass',outside),true);
});

test('explicit assignment permits cross-installation assessment but not roster administration',()=>{
  const {p}=harness([row('evaluator')]);
  const assigned={...outside,cloudAccess:{userId:'user-1',assignedEvaluator:true}};
  assert.equal(p.canClass('readClass',assigned),true);
  assert.equal(p.canClass('evaluate',assigned),true);
  assert.equal(p.canClass('manageRoster',assigned),false);
  assert.equal(p.canClass('closeClass',assigned),false);
  assert.equal(p.canClass('evaluate',{...assigned,cloudAccess:{userId:'user-2',assignedEvaluator:true}}),false);
});

test('fresh unavailable organization proof overrides stale membership and assignment caches',()=>{
  const unavailable={...own,cloudScope:{...own.cloudScope,available:false},
    cloudAccess:{userId:'user-1',assignedEvaluator:true}};
  for(const role of ['evaluator','program_manager','majcom_manager']) {
    const {p}=harness([row(role)]);
    for(const action of ['readClass','exportClass','evaluate','manageClass','manageRoster','closeClass']) {
      assert.equal(p.canClass(action,unavailable),false,`${role}: ${action}`);
      assert.equal(p.canClass(action,unavailable,{online:false}),false,`${role}: cached ${action}`);
    }
  }
  const {p}=harness([row('enterprise_admin')]);
  assert.equal(p.canClass('readClass',unavailable),true);
  assert.equal(p.canClass('deleteClass',unavailable),true);
  assert.equal(p.canClass('restoreClass',unavailable),true);
});

test('supported MAJCOM labels and app_data cannot spoof relational class scope',()=>{
  const {p}=harness([row('majcom_manager')]);
  assert.equal(p.canClass('readClass',{...outside,majcom:'majcom-1',app_data:{majcom:'majcom-1'}}),false);
  assert.equal(p.canClass('readClass',{id:'unknown-scope',majcom:'majcom-1'}),false);
});

test('new local classes resolve scoped permissions through server catalog or assigned installation',()=>{
  const h=harness([row('evaluator')]);
  assert.equal(h.p.canClass('manageClass',{homeInstallationId:'TEST'}),true);
  assert.equal(h.p.canClass('manageClass',{homeInstallationId:'OTHER'}),false);
  assert.equal(h.p.canClass('readClass',{id:'new-local',homeInstallationId:'TEST',localCreatedByUserId:'user-1'}),true);
  const mm=harness([row('majcom_manager')]);
  mm.p.registerBases([{id:'base-1',code:'TEST',majcom_id:'majcom-1',active:true}]);
  assert.equal(mm.p.canClass('readClass',{id:'existing',homeInstallationId:'TEST'}),true);
  assert.equal(mm.p.canClass('manageClass',{homeInstallationId:'TEST'}),false);
  const token=mm.p.snapshot();
  mm.identity({...mm.window.RAPS_CLOUD});
  assert.equal(mm.p.isCurrent(token),false);
  assert.equal(mm.p.canClass('readClass',{id:'existing',homeInstallationId:'TEST'}),false);
});

test('snapshots reject sign-out, account switch, demotion, and membership expiry during work',()=>{
  for(const change of [h=>h.identity(null),h=>h.identity({...h.window.RAPS_CLOUD,user:{id:'user-2'}}),h=>{h.window.RAPS_CLOUD.memberships=[];},h=>h.tick(1000)]) {
    const h=harness([row('enterprise_admin',{ends_at:'2026-10-17T08:00:01Z'})]);
    const token=h.p.snapshot();assert.equal(h.p.isCurrent(token),true);
    change(h);assert.equal(h.p.isCurrent(token),false);
  }
});
