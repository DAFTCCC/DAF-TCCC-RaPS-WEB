'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CALLER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const OTHER = '55555555-5555-4555-8555-555555555555';
const BASE = '33333333-3333-4333-8333-333333333333';
const MAJCOM = '44444444-4444-4444-8444-444444444444';
const PASSWORD = 'Aa1!synthetic-temporary-password';
const EXPIRY = '2999-01-01T00:00:00.000Z';
const account = (id = TARGET, username = 'test.person') => ({ id, username, password_change_required:true, temporary_expires_at:EXPIRY });
const credentials = (changes = {}) => ({ ok:true, user:{ id:TARGET, username:'test.person' }, temporary_password:PASSWORD, temporary_expires_at:EXPIRY, ...changes });
const result = data => ({ data, error:null });
const settle = () => new Promise(resolve => setImmediate(resolve));

function uiHarness(options = {}) {
  const nodes = new Map(), events = new Map(), timers = new Map();
  const calls = [], clients = [], reads = [], writes = [], clipboard = [], logs = [];
  let timerId = 0, inserted = '';
  class Node {
    constructor(id) {
      this.id=id; this.value=''; this.textContent=''; this.disabled=false; this.open=false; this.events=new Map(); this._html='';
      this.classList={ toggle() {} };
    }
    addEventListener(type, callback) { this.events.set(type,callback); }
    dispatch(type) { return this.events.get(type)?.({ preventDefault() {} }); }
    querySelectorAll() { return []; }
    showModal() { if (options.showModalError) throw new Error('Dialog unavailable'); this.open=true; }
    close() { this.open=false; this.dispatch('close'); }
    set innerHTML(value) {
      this._html=value;
      if (this.id==='adminManagedUser') this.value=(String(value).match(/<option value="([^"]*)"/) || [,''])[1];
    }
    get innerHTML() { return this._html; }
    insertAdjacentHTML(position,html) {
      inserted+=html;
      for(const match of html.matchAll(/\bid="([^"]+)"/g)) if(!nodes.has(match[1])) nodes.set(match[1],new Node(match[1]));
    }
  }
  nodes.set('areaProgram',new Node('areaProgram'));
  const role = options.role || 'enterprise_admin';
  const membership = {
    id:'caller-access',user_id:CALLER,role,base_id:['evaluator','program_manager'].includes(role)?BASE:null,
    majcom_id:role==='majcom_manager'?MAJCOM:null,active:true,starts_at:null,ends_at:null,...options.callerMembership
  };
  const tables = options.tables || {
    profiles:[{id:TARGET,email:'test.person@login.raps.invalid',display_name:'Test Person'}, {id:OTHER,email:'legacy@example.mil',display_name:'Legacy User'}],
    memberships:[{id:'target-membership',user_id:TARGET,role:'evaluator',base_id:BASE,majcom_id:null,active:true},
      {id:'legacy-membership',user_id:OTHER,role:'evaluator',base_id:BASE,majcom_id:null,active:true}],
    bases:[{id:BASE,name:'Test Installation',code:'TEST',active:true,majcom_id:MAJCOM}],
    majcoms:[{id:MAJCOM,name:'Test MAJCOM',code:'TESTCOM',active:true}],access_requests:[]
  };
  const window = {
    RAPS_CLOUD:{mode:'connected',connected:true,user:{id:CALLER},role,memberships:[membership],...options.cloud},
    RAPS_CLOUD_CONFIG:{projectUrl:'https://example.supabase.test',publishableKey:'synthetic-publishable-key'},
    addEventListener(type,fn) { const callbacks=events.get(type)||[];callbacks.push(fn);events.set(type,callbacks); },
    setTimeout(fn,ms) { const id=++timerId;timers.set(id,{fn,ms});return id; },
    clearTimeout(id) { timers.delete(id); },
    testRefreshes:0
  };
  window.RAPS_SUPABASE = {
    auth:{getSession:async()=>options.getSession?options.getSession():{data:{session:{access_token:'captured-access-token',user:{id:CALLER}}},error:null}},
    functions:{async invoke(name,payload) {
      calls.push({name,body:JSON.parse(JSON.stringify(payload.body))});
      if(options.invoke) return options.invoke(name,payload);
      if(payload.body.action==='list_users') return result({ok:true,users:[account()],next_offset:null});
      return result(credentials());
    }},
    from(table) {
      const request={table};const chain={
        select() {return chain;},order() {return chain;},eq() {return chain;},
        range(first,last) {request.first=first;request.last=last;return chain;},
        insert(value) {writes.push({table,value});return chain;},update(value) {writes.push({table,value});return chain;},
        then(resolve,reject) {
          reads.push(request);
          const rows=(tables[table]||[]).slice(request.first,request.last+1);
          return Promise.resolve({data:rows,error:null}).then(resolve,reject);
        }
      };return chain;
    }
  };
  window.supabase={createClient(url,key,settings) {
    clients.push({url,key,settings});
    const source=window.RAPS_SUPABASE,authorization=settings.global.headers.Authorization;
    return {from(table) {return source.from(table);},functions:{invoke(name,payload) {
      calls.push({boundAuthorization:authorization});return source.functions.invoke(name,payload);
    }}};
  }};
  const navigator={onLine:options.online!==false,clipboard:{async writeText(value) {clipboard.push(value);if(options.copy) return options.copy(value);}}};
  const context=vm.createContext({
    window,navigator,Date,console:{error(...args) {logs.push(args);},warn(...args) {logs.push(args);}},
    localStorage:{setItem() {throw new Error('Credentials must never enter localStorage');}},
    document:{readyState:'loading',getElementById:id=>nodes.get(id)||null,addEventListener() {},querySelectorAll:()=>[]},
    confirm:()=>options.confirm!==false,prompt:()=>null
  });
  const source=fs.readFileSync(path.join(__dirname,'../admin-ui.js'),'utf8').replace(
    'window.RAPS_ADMIN = Object.freeze({ refresh: loadAdminData });',
    `const actualLoadAdminData=loadAdminData;
     loadAdminData=async()=>{window.testRefreshes++;};
     window.__ui={inject,createManagedUser,resetManagedPassword,readManagedUsers,adminRequest,clearAdminData,clearTemporaryCredentials,
       copyTemporaryCredentials,showTemporaryCredentials,actualLoadAdminData,renderTable,renderManagedUsers,
       setManaged(users,ready=true) {managedUsers=users;managedReady=ready;renderManagedUsers();},
       setCatalog(value) {catalog=value;},getManaged:()=>({users:managedUsers,ready:managedReady})};`
  );
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../permissions.js'),'utf8'),context,{filename:'permissions.js'});
  vm.runInContext(source,context,{filename:'admin-ui.js'});
  const api=window.__ui;
  api.inject();
  api.setCatalog(tables);
  api.setManaged(options.managedUsers||[account(),account(CALLER,'admin.person')],options.managedReady!==false);
  for(const [id,value] of Object.entries({adminManagedUsername:'test.person',adminManagedName:'Test Person',adminManagedRole:'evaluator',adminManagedScope:BASE})) nodes.get(id).value=value;
  nodes.get('adminManagedUser').value=TARGET;
  const requests=()=>calls.filter(call=>call.name);
  return {...api,nodes,calls,requests,clients,reads,writes,clipboard,logs,timers,window,navigator,
    inserted:()=>inserted,message:()=>nodes.get('adminMessage').textContent,
    dispatch(type) {for(const callback of events.get(type)||[]) callback();},
    revoke() {window.RAPS_CLOUD.memberships[0].active=false;},
    switchIdentity() {window.RAPS_CLOUD={...window.RAPS_CLOUD,user:{id:OTHER},memberships:[]};}
  };
}

function assertNoCredentials(ui) {
  assert.equal(ui.nodes.get('adminTemporaryCredentials').open,false);
  assert.equal(ui.nodes.get('adminTemporaryPassword').value,'');
  assert.equal(ui.nodes.get('adminTemporaryUsername').value,'');
  assert.equal(ui.clipboard.length,0);
}

test('username provisioning requires a connected, current Enterprise administrator',async()=>{
  for(const options of [
    {role:'evaluator'},{role:'program_manager'},{role:'majcom_manager'},{online:false},{cloud:{connected:false}},
    {cloud:{offlineCached:true}},{cloud:{memberships:[]}},{callerMembership:{active:false}},
    {callerMembership:{starts_at:'2999-01-01T00:00:00Z'}},{callerMembership:{ends_at:'2000-01-01T00:00:00Z'}},
    {callerMembership:{starts_at:'invalid'}},{callerMembership:{base_id:BASE}},{managedReady:false}
  ]) {
    const ui=uiHarness(options);
    await ui.createManagedUser();await ui.resetManagedPassword();
    assert.equal(ui.requests().length,0,JSON.stringify(options));assertNoCredentials(ui);
  }
});

test('username create sends the selected role and scope with normalized username',async()=>{
  for(const [role,scope] of [['evaluator',BASE],['program_manager',BASE],['majcom_manager',MAJCOM],['enterprise_admin',null]]) {
    const ui=uiHarness();
    ui.nodes.get('adminManagedUsername').value=' Test.Person ';
    ui.nodes.get('adminManagedRole').value=role;ui.nodes.get('adminManagedScope').value=scope||'ignored';
    await ui.createManagedUser();
    assert.deepEqual(ui.requests()[0],{name:'managed-login',body:{action:'create_user',username:'test.person',display_name:'Test Person',role,
      base_id:['evaluator','program_manager'].includes(role)?scope:null,majcom_id:role==='majcom_manager'?scope:null}});
    assert.equal(ui.writes.length,0);assert.equal(ui.nodes.get('adminTemporaryPassword').value,PASSWORD);
    assert.equal(ui.nodes.get('adminTemporaryCredentials').open,true);assert.equal(ui.window.testRefreshes,1);
    assert.equal(ui.nodes.get('adminManagedUsername').value,'');assert.equal(ui.nodes.get('adminManagedName').value,'');
  }
});

test('invalid username or display name never creates an account',async()=>{
  for(const [username,name] of [['ab','Person'],['_person','Person'],['person+tag','Person'],['a'.repeat(33),'Person'],['person',''],['person','a'.repeat(121)],['person','A\nName']]) {
    const ui=uiHarness();ui.nodes.get('adminManagedUsername').value=username;ui.nodes.get('adminManagedName').value=name;
    await ui.createManagedUser();assert.equal(ui.requests().length,0);assertNoCredentials(ui);
  }
});

test('managed create uses a fixed captured JWT with session persistence and refresh disabled',async()=>{
  const ui=uiHarness();await ui.createManagedUser();
  assert.equal(ui.clients.length,1);
  const settings=ui.clients[0].settings;
  assert.equal(settings.global.headers.Authorization,'Bearer captured-access-token');
  assert.equal(settings.auth.persistSession,false);assert.equal(settings.auth.autoRefreshToken,false);assert.equal(settings.auth.detectSessionInUrl,false);
  assert.deepEqual(ui.calls.filter(call=>call.boundAuthorization).map(call=>call.boundAuthorization),['Bearer captured-access-token']);
});

test('a changed or mismatched session cannot initialize managed account requests',async()=>{
  for(const change of ['identity','revoke','mismatch','error']) {
    let release;const ui=uiHarness({getSession:()=>new Promise(resolve=>{release=resolve;})});
    const pending=ui.createManagedUser();await settle();
    if(change==='identity') ui.switchIdentity();if(change==='revoke') ui.revoke();
    release({data:{session:{access_token:'old-token',user:{id:change==='mismatch'?OTHER:CALLER}}},error:change==='error'?{message:'expired'}:null});
    await pending;assert.equal(ui.clients.length,0);assert.equal(ui.requests().length,0);assertNoCredentials(ui);
  }
});

test('duplicate create and reset clicks issue only one request per pending action',async()=>{
  for(const action of ['createManagedUser','resetManagedPassword']) {
    let release;const ui=uiHarness({invoke:()=>new Promise(resolve=>{release=resolve;})});
    const pending=ui[action]();await settle();await ui[action]();
    assert.equal(ui.requests().length,1);
    const button=ui.nodes.get(action==='createManagedUser'?'adminManagedCreateBtn':'adminManagedResetBtn');assert.equal(button.disabled,true);
    release(result(credentials()));await pending;assert.equal(button.disabled,false);
  }
});

test('late managed create/reset responses cannot reveal secrets after identity change or revocation',async()=>{
  for(const action of ['createManagedUser','resetManagedPassword']) for(const change of ['identity','revoke']) {
    let release;const ui=uiHarness({invoke:()=>new Promise(resolve=>{release=resolve;})});
    const pending=ui[action]();await settle();
    if(change==='identity') ui.switchIdentity();else ui.revoke();
    release(result(credentials()));await pending;
    assertNoCredentials(ui);assert.equal(ui.window.testRefreshes,0);assert.equal(ui.logs.length,0);
  }
});

test('managed reset requires a known non-self account and explicit confirmation',async()=>{
  for(const options of [{confirm:false},{managedUsers:[account(CALLER,'admin.person')]},{managedUsers:[]}]) {
    const ui=uiHarness(options);if(options.managedUsers?.length) ui.nodes.get('adminManagedUser').value=CALLER;
    await ui.resetManagedPassword();assert.equal(ui.requests().length,0);assertNoCredentials(ui);
  }
  const ui=uiHarness();await ui.resetManagedPassword();
  assert.deepEqual(ui.requests()[0],{name:'managed-login',body:{action:'reset_password',user_id:TARGET}});
  assert.equal(ui.nodes.get('adminTemporaryPassword').value,PASSWORD);
});

test('malformed or mismatched credential responses never show a password',async()=>{
  const invalid=[{},credentials({ok:false}),credentials({user:{id:'------------------------------------',username:'test.person'}}),
    credentials({user:{id:TARGET,username:'different.person'}}),credentials({temporary_password:'short'}),
    credentials({temporary_password:'A'.repeat(201)}),credentials({temporary_password:'Aa1!password\ncontrol'}),
    credentials({temporary_expires_at:'invalid'}),credentials({temporary_expires_at:'2000-01-01T00:00:00Z'})];
  for(const data of invalid) {
    const ui=uiHarness({invoke:()=>result(data)});await ui.createManagedUser();assertNoCredentials(ui);
    assert.match(ui.message(),/incomplete/);assert.equal(ui.window.testRefreshes,0);assert.equal(ui.logs.length,0);
  }
  const wrong=uiHarness({invoke:()=>result(credentials({user:{id:OTHER,username:'test.person'}}))});
  await wrong.resetManagedPassword();assertNoCredentials(wrong);assert.match(wrong.message(),/different account/);
});

test('credential values are assigned to input properties and never stored in page HTML, logs, or clipboard automatically',async()=>{
  const password='Aa1!<img src=x onerror=alert(1)> and "quotes"';
  const ui=uiHarness({invoke:()=>result(credentials({temporary_password:password}))});await ui.createManagedUser();
  assert.equal(ui.nodes.get('adminTemporaryPassword').value,password);
  assert.ok(!ui.inserted().includes(password));
  for(const node of ui.nodes.values()) assert.ok(!node.innerHTML.includes(password));
  assert.equal(ui.logs.length,0);assert.equal(ui.clipboard.length,0);
  assert.equal(ui.nodes.get('adminTemporaryPassword').events.size,0);
  assert.match(ui.inserted(),/<dialog id="adminTemporaryCredentials"/);
});

test('one-time credentials clear on Done, dialog close, cancellation, timeout, and identity events',async()=>{
  for(const finish of ['done','close','cancel','timeout','identity']) {
    const ui=uiHarness();await ui.createManagedUser();
    assert.equal(ui.timers.size,1);assert.equal([...ui.timers.values()][0].ms,5*60*1000);
    if(finish==='done') ui.nodes.get('adminTemporaryCloseBtn').dispatch('click');
    if(finish==='close') ui.nodes.get('adminTemporaryCredentials').close();
    if(finish==='cancel') ui.nodes.get('adminTemporaryCredentials').dispatch('cancel');
    if(finish==='timeout') [...ui.timers.values()][0].fn();
    if(finish==='identity') {ui.switchIdentity();ui.dispatch('raps-cloud-identity');}
    assertNoCredentials(ui);assert.equal(ui.nodes.get('adminTemporaryExpiry').textContent,'');
    assert.equal(ui.nodes.get('adminTemporaryCopyStatus').textContent,'');assert.equal(ui.timers.size,0);
  }
});

test('copy credentials requires an explicit click, open dialog, and current Enterprise access',async()=>{
  const ui=uiHarness();await ui.createManagedUser();assert.equal(ui.clipboard.length,0);
  await ui.nodes.get('adminTemporaryCopyBtn').dispatch('click');
  assert.deepEqual(ui.clipboard,[`RaPS username: test.person\nTemporary password: ${PASSWORD}`]);
  assert.match(ui.nodes.get('adminTemporaryCopyStatus').textContent,/Copied/);
  ui.clearTemporaryCredentials();await ui.copyTemporaryCredentials();assert.equal(ui.clipboard.length,1);
  const revoked=uiHarness();await revoked.createManagedUser();revoked.revoke();await revoked.copyTemporaryCredentials();assert.equal(revoked.clipboard.length,0);
});

test('managed account lists read every page with the bound JWT',async()=>{
  const ui=uiHarness({invoke:(name,{body})=>result(body.offset===0?{ok:true,users:[account()],next_offset:1}:{ok:true,users:[account(OTHER,'other.person')],next_offset:null})});
  const access=ui.adminRequest();const users=await ui.readManagedUsers(access);
  assert.deepEqual(JSON.parse(JSON.stringify(users.users)),[account(),account(OTHER,'other.person')]);
  assert.deepEqual(ui.requests().map(call=>call.body),[{action:'list_users',offset:0,limit:500},{action:'list_users',offset:1,limit:500}]);
  assert.ok(ui.calls.filter(call=>call.boundAuthorization).every(call=>call.boundAuthorization==='Bearer captured-access-token'));
});

test('inconsistent managed pages fail closed without partial account recovery access',async()=>{
  for(const page of [
    {ok:true,users:[account()],next_offset:0},{ok:true,users:[],next_offset:1},
    {ok:true,users:[account()],next_offset:3},{ok:true,users:[account(),account()],next_offset:null},
    {ok:true,users:[account(TARGET,'Bad Username')],next_offset:null},{ok:true,users:'invalid',next_offset:null},
    {ok:false,users:[],next_offset:null}
  ]) {
    const ui=uiHarness({invoke:()=>result(page)});
    await assert.rejects(ui.readManagedUsers(ui.adminRequest()),/unavailable|inconsistent/);
  }
  let page=0;const duplicate=uiHarness({invoke:()=>result({ok:true,users:[account()],next_offset:page++===0?1:null})});
  await assert.rejects(duplicate.readManagedUsers(duplicate.adminRequest()),/inconsistent/);
});

test('managed list service failures disable username features while preserving legacy administration',async()=>{
  const ui=uiHarness({invoke:()=>({data:null,error:{message:'Not deployed'}})});
  await ui.actualLoadAdminData();
  assert.equal(ui.getManaged().ready,false);assert.equal(ui.nodes.get('adminManagedCreateBtn').disabled,true);
  assert.equal(ui.nodes.get('adminManagedResetBtn').disabled,true);
  assert.match(ui.nodes.get('adminManagedStatus').textContent,/unavailable/);
  assert.match(ui.nodes.get('adminMembershipTable').innerHTML,/legacy@example\.mil/);
  assert.match(ui.nodes.get('adminMembershipTable').innerHTML,/data-admin-setup-user="55555555/);
  assert.doesNotMatch(ui.nodes.get('adminMembershipTable').innerHTML,/@login\.raps\.invalid/);
  assert.doesNotMatch(ui.nodes.get('adminMembershipTable').innerHTML,/data-admin-setup-user="22222222/);
  assert.match(ui.message(),/loaded/);
});

test('managed labels show usernames and hide synthetic email and email-reset controls',async()=>{
  const ui=uiHarness();await ui.actualLoadAdminData();
  const table=ui.nodes.get('adminMembershipTable').innerHTML;
  assert.match(table,/test\.person/);assert.doesNotMatch(table,/@login\.raps\.invalid/);
  assert.doesNotMatch(table,/data-admin-setup-user="22222222/);
  assert.match(table,/data-admin-setup-user="55555555/);
  assert.equal(ui.getManaged().ready,true);assert.equal(ui.nodes.get('adminManagedCreateBtn').disabled,false);
});

test('a failed native dialog clears credentials before reporting incomplete delivery',async()=>{
  const ui=uiHarness({showModalError:true});await ui.createManagedUser();
  assertNoCredentials(ui);assert.equal(ui.timers.size,0);assert.match(ui.message(),/incomplete/);
});

test('copy failure reports manual-copy guidance without logging or retaining a second secret copy',async()=>{
  const ui=uiHarness({copy:async()=>{throw new Error('Clipboard denied');}});await ui.createManagedUser();
  await ui.copyTemporaryCredentials();
  assert.match(ui.nodes.get('adminTemporaryCopyStatus').textContent,/Copy unavailable/);
  assert.equal(ui.logs.length,0);assert.equal(ui.nodes.get('adminTemporaryPassword').value,PASSWORD);
  ui.clearTemporaryCredentials();assert.equal(ui.nodes.get('adminTemporaryCopyStatus').textContent,'');
});

test('managed list completion cannot repopulate account recovery after switching users',async()=>{
  let release;const ui=uiHarness({invoke:()=>new Promise(resolve=>{release=resolve;})});
  const pending=ui.actualLoadAdminData();await settle();ui.switchIdentity();ui.dispatch('raps-cloud-identity');
  release(result({ok:true,users:[account()],next_offset:null}));await pending;
  assert.equal(ui.getManaged().ready,false);assert.equal(ui.getManaged().users.length,0);
  assert.equal(ui.nodes.get('adminManagedCreateBtn').disabled,true);
  assert.equal(ui.nodes.get('adminManagedUser').value,'');
  assert.equal(ui.nodes.get('adminMembershipTable').innerHTML,'');assertNoCredentials(ui);
});

test('replacement credentials clear the prior dialog value and reset its timeout',async()=>{
  const ui=uiHarness();await ui.createManagedUser();const firstTimer=[...ui.timers.keys()][0];
  await ui.copyTemporaryCredentials();
  const data=credentials({temporary_password:'Aa1!second-synthetic-password'});
  ui.showTemporaryCredentials(data,'test.person',ui.adminRequest());
  assert.equal(ui.nodes.get('adminTemporaryPassword').value,data.temporary_password);
  assert.equal(ui.nodes.get('adminTemporaryCopyStatus').textContent,'');
  assert.equal(ui.timers.size,1);assert.equal(ui.timers.has(firstTimer),false);
});

test('delayed error-body parsing cannot write old account details into a new identity view',async()=>{
  for(const action of ['createManagedUser','resetManagedPassword']) {
    let release;
    const parsed=new Promise(resolve=>{release=resolve;});
    const ui=uiHarness({invoke:()=>({data:null,error:{message:'Request failed',context:{clone:()=>({json:()=>parsed})}}})});
    const pending=ui[action]();await settle();
    ui.switchIdentity();ui.dispatch('raps-cloud-identity');
    release({error:'Old administrator-specific error detail'});await pending;
    assert.equal(ui.message(),'');assertNoCredentials(ui);
  }
});
