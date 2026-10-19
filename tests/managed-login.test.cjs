'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto, createHash, pbkdf2Sync } = require('node:crypto');
const CALLER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const NEW = '33333333-3333-4333-8333-333333333333';
const BASE = '44444444-4444-4444-8444-444444444444';
const VERSION = '55555555-5555-4555-8555-555555555555';
const TEMP = 'Original-temporary-password1!';
const NEXT = 'My different password 2!';
const NOW = Math.floor(Date.now()/1000);
const token = (id, iat = NOW-60, metadata = {}) => 'header.' + Buffer.from(JSON.stringify({ sub:id, iat,session_id:id,app_metadata:metadata })).toString('base64url') + '.signature';
const SALT='0123456789abcdef0123456789abcdef';
const permanentHash=value=>pbkdf2Sync(value,Buffer.from(SALT,'hex'),600000,32,'sha256').toString('hex');
const TEMP_VERIFIER=permanentHash(TEMP);
const sha = value => createHash('sha256').update(value).digest('hex');
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/managed-login/index.ts'),'utf8').replace(/^import .*?;\s*/m,''));
function harness(options = {}) {
  const events = [], logs = [];
  const records = new Map();
  const users = new Map([
    [CALLER,{ id:CALLER,email:'enterprise@example.mil',app_metadata:options.managedCaller ? {raps_managed_login:true,raps_managed_credential_version:VERSION} : {} }],
    [TARGET,{ id:TARGET,email:'test.user@login.raps.invalid',app_metadata:{raps_managed_login:true,raps_managed_credential_version:options.authCredentialVersion || VERSION} }]
  ]);
  const passwords = new Map([[TARGET,TEMP],[CALLER,'Enterprise-password1!']]);
  const base = { user_id:TARGET,username:'test.user',managed:true,state:'pending',credential_version:VERSION,
    password_salt:SALT,password_verifier:TEMP_VERIFIER,temporary_expires_at:new Date(Date.now()+86400000).toISOString(),temporary_password_digest:sha(TEMP),password_change_required:true,session_usable:false };
  records.set(TARGET,{ ...base,...options.record });
  if (options.managedCaller) records.set(CALLER,{ ...base,user_id:CALLER,username:'enterprise.user',state:'active',session_usable:true,password_change_required:false,...options.callerRecord });
  const sessions=new Set(options.unproved ? [] : [...records.values()].filter(r=>r.state==='active').map(r=>r.user_id));
  let handler; let creationCount=0;
  function status(id,iat) {
    const r = records.get(id);
    if (!r) return { managed:false,session_usable:true,password_change_required:false };
    return {...r,session_usable:r.state==='active' && sessions.has(id) && iat >= (r.not_before || 0),password_change_required:r.state!=='active' };
  }
  class Query {
    eq() { return this; } select() { return this; }
    then(resolve,reject) { return Promise.resolve({ data:options.noEnterprise ? [] : [{role:'enterprise_admin',active:true,base_id:null,majcom_id:null,starts_at:null,ends_at:null}],error:null }).then(resolve,reject); }
  }
  async function rpc(name,args) {
    events.push({kind:'rpc',name,args}); options.onRpc?.(name,args,{records,users,passwords,events});
    if (options.rpcError?.(name,args)) return {data:null,error:{code:options.rpcError(name,args)}};
    const data = (() => {
      if (name==='raps_managed_rate_limit') return {allowed:!options.rateLimited};
      if (name==='raps_managed_lookup') return [...records.values()].find(r=>r.username===args.p_username) || null;
      if (name==='raps_managed_status') return status(args.p_user_id,args.p_iat);
      if (name==='raps_managed_register_session') { sessions.add(args.p_user_id);return null; }
      if (name==='raps_managed_list') return {users:[...records.values()].map(r=>({id:r.user_id,...r})),next_offset:options.nextOffset ?? null};
      if (name==='raps_managed_create') {
        const r={...base,user_id:args.p_user_id,username:args.p_username,state:'issuing',temporary_password_digest:args.p_digest};records.set(args.p_user_id,r);return r;
      }
      if (name==='raps_managed_begin_reset') { const r=records.get(args.p_user_id);sessions.delete(args.p_user_id);r.state='issuing';r.credential_version='66666666-6666-4666-8666-666666666666';r.temporary_password_digest=args.p_digest;return r; }
      if (name==='raps_managed_finish_reset') { const r=records.get(args.p_user_id);r.state='pending';return r; }
      if (name==='raps_managed_begin_complete') { sessions.delete(args.p_user_id);records.get(args.p_user_id).state='changing';return {ok:true}; }
      if (name==='raps_managed_finish_complete') { const r=records.get(args.p_user_id);r.state='active';r.not_before=NOW+1;r.password_salt=args.p_salt;r.password_verifier=args.p_verifier;return {not_before:NOW+1}; }
      throw new Error('Unexpected RPC '+name);
    })();
    return {data,error:null};
  }
  const makeClient = (_url,key,settings={}) => ({
    rpc,from:()=>new Query(),auth:{
      getUser:async()=> {
        const jwt = settings.global?.headers?.Authorization?.replace(/^Bearer\s+/i,'') || '';
        let id; try { id=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString()).sub; } catch {}
        return {data:{user:options.unauthenticated ? null : users.get(id)},error:null};
      },
      signInWithPassword:async input=> {
        events.push({kind:'password-auth',email:input.email});
        const user=[...users.values()].find(u=>u.email===input.email);
        if (!user || passwords.get(user.id)!==input.password || options.authFailure) return {data:{},error:{message:'Invalid login credentials'}};
        return {data:{user,session:{access_token:token(user.id,options.signInIat ?? NOW,user.app_metadata),refresh_token:'synthetic-refresh-token'}},error:null};
      },
      admin:{
        createUser:async input=> {
          events.push({kind:'create',input});creationCount++;
          if (options.createError) return {data:{},error:{message:'Sensitive provider message'}};
          const user={id:NEW,email:input.email,app_metadata:input.app_metadata};users.set(NEW,user);passwords.set(NEW,input.password);
          return {data:{user},error:null};
        },
        updateUserById:async(id,input)=> {
          events.push({kind:'update-auth',id,input});
          if (options.updateError) return {data:null,error:{message:'Sensitive provider error'}};
          if (input.password) passwords.set(id,input.password);
          if (input.app_metadata) users.get(id).app_metadata = {...users.get(id).app_metadata,...input.app_metadata};
          return {data:{user:users.get(id)},error:null};
        },
        getUserById:async id=>({data:{user:options.targetAuthMismatch ? {...users.get(id),email:'legacy@example.mil'} : users.get(id)},error:null}),
        signOut:async(jwt,scope)=> {events.push({kind:'revoke',jwt,scope});return {error:options.revokeError ? {message:'Sensitive error'} : null};}
      }
    }
  });
  vm.runInNewContext(source,{
    Response,Request,Date,TextEncoder,TextDecoder,URL,atob,btoa,Uint8Array,crypto:webcrypto,createClient:makeClient,
    console:{error:(...args)=>logs.push(args),warn:(...args)=>logs.push(args),log:(...args)=>logs.push(args)},
    Deno:{env:{get:k=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[k]},serve:fn=>handler=fn}
  });
  return {events,records,users,passwords,logs,get creationCount(){return creationCount;},async invoke(body,opts={}) {
    const response=await handler(new Request('https://example.test/functions/v1/managed-login',{
      method:opts.method || 'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(opts.user || CALLER,opts.iat ?? NOW-60,opts.claimMetadata || users.get(opts.user || CALLER)?.app_metadata),...opts.headers},
      ...((opts.method || 'POST')==='POST' ? {body:opts.rawBody || JSON.stringify(body)} : {})
    }));return {status:response.status,body:await response.json(),response};
  }};
}
const create = {action:'create_user',username:'New.User',display_name:'Synthetic User',role:'evaluator',base_id:BASE,majcom_id:null};

test('new username login authenticates with password before returning only public session contract',async()=>{
  const h=harness();const r=await h.invoke({action:'sign_in',username:' TEST.USER ',password:TEMP});
  assert.equal(r.status,200);assert.equal(r.body.user.username,'test.user');assert.equal(r.body.password_change_required,true);
  assert.equal(r.body.session.refresh_token,'synthetic-refresh-token');assert.equal(r.response.headers.get('cache-control'),'no-store');
  assert.ok(!JSON.stringify(r.body).includes('@login.raps.invalid'));assert.ok(!JSON.stringify(r.body).includes('temporary_password_digest'));
});
test('unknown username and wrong password share generic failure without a public resolver',async()=>{
  for(const [username,password] of [['unknown.user',TEMP],['test.user','Wrong-password1!']]){
    const h=harness();const r=await h.invoke({action:'sign_in',username,password});assert.equal(r.status,401);assert.equal(r.body.code,'MANAGED_AUTH');
    assert.equal(h.events.filter(e=>e.kind==='password-auth').length,1);assert.ok(!r.body.session);
  }
});
test('rate limits are persistent RPC hashes and stop Auth password attempts',async()=>{
  const h=harness({rateLimited:true});const r=await h.invoke({action:'sign_in',username:'test.user',password:TEMP});
  assert.equal(r.status,429);assert.equal(h.events.filter(e=>e.kind==='password-auth').length,0);
  assert.ok(h.events.filter(e=>e.name==='raps_managed_rate_limit').every(e=>/^[a-f0-9]{64}$/.test(e.args.p_key)));
});
test('expired setup and operation-in-progress never release session tokens',async()=>{
  for(const record of [{temporary_expires_at:new Date(Date.now()-1000).toISOString()},{state:'issuing'},{state:'changing'}]){
    const h=harness({record});const r=await h.invoke({action:'sign_in',username:'test.user',password:TEMP});
    assert.ok([403,409].includes(r.status));assert.ok(!r.body.session);
  }
});
test('status hides trusted state, versions, hashes and identifies legacy email users',async()=>{
  const h=harness();const r=await h.invoke({action:'status'},{user:TARGET});assert.equal(r.body.managed,true);assert.equal(r.body.session_usable,false);
  for(const key of ['credential_version','temporary_password_digest','password_salt','password_verifier','state'])assert.ok(!(key in r.body));
  const legacy=await h.invoke({action:'status'});assert.equal(legacy.body.managed,false);assert.equal(legacy.body.session_usable,true);
});
test('create generates once-only random password, bans before registering and unbans only after SQL gate',async()=>{
  const h=harness();const r=await h.invoke(create);assert.equal(r.status,200);assert.equal(r.body.user.username,'new.user');
  assert.match(r.body.temporary_password,/^Aa1![A-Za-z0-9_-]{32}$/);assert.equal(r.body.temporary_expires_at,h.records.get(NEW).temporary_expires_at);
  const created=h.events.find(e=>e.kind==='create');assert.equal(created.input.email,'new.user@login.raps.invalid');assert.equal(created.input.ban_duration,'876000h');assert.equal(created.input.app_metadata.raps_managed_login,true);
  const register=h.events.findIndex(e=>e.name==='raps_managed_create');const unban=h.events.findIndex(e=>e.kind==='update-auth');assert.ok(register<unban);
  assert.equal(h.records.get(NEW).temporary_password_digest,sha(r.body.temporary_password));assert.deepEqual(h.logs,[]);
});
test('non-Enterprise or gated managed Enterprise cannot create or list accounts',async()=>{
  for(const options of [{noEnterprise:true},{managedCaller:true,callerRecord:{state:'pending'}}]){
    const h=harness(options);assert.equal((await h.invoke(create)).status,403);assert.equal(h.creationCount,0);
    assert.equal((await h.invoke({action:'list_users'})).status,403);
  }
});
test('revocation before Auth creation stops privileged side effects',async()=>{
  const h=harness({rpcError:(name,args)=>name==='raps_managed_status' && args.p_user_id===CALLER ? '42501' : ''});
  assert.equal((await h.invoke(create)).status,403);assert.equal(h.creationCount,0);
});
test('invalid usernames/scopes/extra fields do not create Auth users',async()=>{
  for(const data of [{username:'ab'},{username:'not@example.mil'},{role:'enterprise_admin'},{display_name:'\u0000Bad'},{other:'unexpected'}]){
    const h=harness();assert.equal((await h.invoke({...create,...data})).status,400);assert.equal(h.creationCount,0);
  }
});
test('failed registration retains new account ban and never returns temporary credential',async()=>{
  const h=harness({rpcError:name=>name==='raps_managed_create' ? '22023' : ''});const r=await h.invoke(create);
  assert.equal(r.status,400);assert.ok(!r.body.temporary_password);assert.equal(h.events.filter(e=>e.kind==='update-auth').length,0);
});
test('reset supports only other verified managed identities and gates before changing Auth password',async()=>{
  const h=harness();const r=await h.invoke({action:'reset_password',user_id:TARGET});assert.equal(r.status,200);
  const begin=h.events.findIndex(e=>e.name==='raps_managed_begin_reset');const change=h.events.findIndex(e=>e.kind==='update-auth');
  const revoke=h.events.findIndex(e=>e.kind==='revoke');const finish=h.events.findIndex(e=>e.name==='raps_managed_finish_reset');assert.ok(begin<change && change<revoke && revoke<finish);
  assert.equal(h.events.find(e=>e.kind==='revoke').scope,'global');
  for(const id of [CALLER,'99999999-9999-4999-8999-999999999999'])assert.equal((await harness().invoke({action:'reset_password',user_id:id})).status,400);
  assert.equal((await harness({targetAuthMismatch:true}).invoke({action:'reset_password',user_id:TARGET})).status,409);
});
test('list pagination and public fields are bounded and sanitized',async()=>{
  const h=harness({nextOffset:500});const r=await h.invoke({action:'list_users',offset:0,limit:500});assert.equal(r.status,200);assert.equal(r.body.next_offset,500);
  assert.ok(r.body.users.every(u=>!u.temporary_password_digest && !u.credential_version && !u.state));
  assert.equal((await h.invoke({action:'list_users',offset:-1})).status,400);assert.equal((await h.invoke({action:'list_users',limit:501})).status,400);
});
test('password completion verifies current password, serializes mutation, revokes sessions then activates cutoff',async()=>{
  const h=harness();const r=await h.invoke({action:'complete_password',current_password:TEMP,new_password:NEXT},{user:TARGET});assert.equal(r.status,200);
  assert.equal(r.body.sign_in_required,true);assert.equal(r.body.not_before,NOW+1);assert.ok(!r.body.session);
  const begin=h.events.findIndex(e=>e.name==='raps_managed_begin_complete');const update=h.events.findIndex(e=>e.kind==='update-auth');const revoke=h.events.findIndex(e=>e.kind==='revoke');const finish=h.events.findIndex(e=>e.name==='raps_managed_finish_complete');
  assert.ok(begin<update && update<revoke && revoke<finish);assert.equal(h.records.get(TARGET).state,'active');
  assert.equal((await h.invoke({action:'status'},{user:TARGET,iat:NOW-60})).body.session_usable,false);
});
test('wrong current password, original temporary reuse, short and oversized passwords cause no Auth mutation',async()=>{
  for(const data of [{current_password:'Wrong password'},{new_password:TEMP},{new_password:'short'},{new_password:'🩺'.repeat(19)}]){
    const h=harness();const r=await h.invoke({action:'complete_password',current_password:TEMP,new_password:NEXT,...data},{user:TARGET});
    assert.ok([400,401].includes(r.status));assert.equal(h.events.filter(e=>e.kind==='update-auth').length,0);
  }
});
test('revoke failure leaves account gated and never marks completion successful',async()=>{
  const h=harness({revokeError:true});const r=await h.invoke({action:'complete_password',current_password:TEMP,new_password:NEXT},{user:TARGET});
  assert.equal(r.status,503);assert.equal(h.records.get(TARGET).state,'changing');assert.equal(h.events.filter(e=>e.name==='raps_managed_finish_complete').length,0);
  assert.ok(!JSON.stringify(r.body).includes(TEMP));assert.ok(!JSON.stringify(r.body).includes(NEXT));assert.deepEqual(h.logs,[]);
});
test('legacy email user cannot use managed password completion; active managed users can change voluntarily',async()=>{
  const body={action:'complete_password',current_password:TEMP,new_password:NEXT};assert.equal((await harness().invoke(body)).status,400);
  assert.equal((await harness({record:{state:'active',password_change_required:false,temporary_expires_at:null}}).invoke(body,{user:TARGET})).status,200);
});
test('unknown action, malformed JSON, oversized bodies and unauthenticated requests fail closed',async()=>{
  const h=harness();assert.equal((await h.invoke({action:'unknown'})).status,400);assert.equal((await h.invoke({}, {rawBody:'{bad'})).status,400);
  assert.equal((await h.invoke({action:'status',x:'x'.repeat(9000)})).status,400);
  assert.equal((await harness({unauthenticated:true}).invoke({action:'status'})).status,401);
});

test('direct Auth password changes never become trusted managed credentials',async()=>{
  for(const record of [{state:'pending'},{state:'active',temporary_expires_at:null}]){
    const h=harness({record});h.passwords.set(TARGET,NEXT);
    const login=await h.invoke({action:'sign_in',username:'test.user',password:NEXT});
    assert.equal(login.status,401);assert.equal(login.body.code,'MANAGED_AUTH');assert.ok(!login.body.session);
    const change=await h.invoke({action:'complete_password',current_password:NEXT,new_password:'Another permanent password 3!'},{user:TARGET});
    assert.equal(change.status,401);assert.equal(h.events.filter(e=>e.kind==='update-auth').length,0);
    assert.equal(h.events.filter(e=>e.name==='raps_managed_register_session').length,0);
  }
});
test('a fresh permanent login must prove the trusted password before registering its Auth session',async()=>{
  const h=harness({record:{state:'active',temporary_expires_at:null},unproved:true});
  assert.equal((await h.invoke({action:'status'},{user:TARGET})).body.session_usable,false);
  const r=await h.invoke({action:'sign_in',username:'test.user',password:TEMP});
  assert.equal(r.status,200);assert.equal(r.body.password_change_required,false);
  const register=h.events.find(e=>e.name==='raps_managed_register_session');
  assert.equal(register.args.p_session_id,TARGET);assert.equal(register.args.p_version,VERSION);
  assert.equal((await h.invoke({action:'status'},{user:TARGET})).body.session_usable,true);
});
test('stale Auth metadata or a stale JWT credential version cannot authorize managed access',async()=>{
  const OLD='77777777-7777-4777-8777-777777777777';
  const h=harness({record:{state:'active'},authCredentialVersion:OLD});
  assert.equal((await h.invoke({action:'sign_in',username:'test.user',password:TEMP})).status,401);
  assert.equal((await h.invoke({action:'status'},{user:TARGET})).status,403);
  const current=harness({record:{state:'active'}});
  assert.equal((await current.invoke({action:'status'},{user:TARGET,claimMetadata:{raps_managed_login:true,raps_managed_credential_version:OLD}})).status,403);
});
test('original temporary password stays forbidden after a permanent password change',async()=>{
  const h=harness({record:{state:'active',password_verifier:permanentHash(NEXT),temporary_expires_at:null}});
  h.passwords.set(TARGET,NEXT);
  const r=await h.invoke({action:'complete_password',current_password:NEXT,new_password:TEMP},{user:TARGET});
  assert.equal(r.status,400);assert.equal(h.events.filter(e=>e.kind==='update-auth').length,0);
});
test('a competing reset reservation prevents password completion from changing Auth',async()=>{
  const h=harness({rpcError:name=>name==='raps_managed_begin_complete' ? '42501' : ''});
  const r=await h.invoke({action:'complete_password',current_password:TEMP,new_password:NEXT},{user:TARGET});
  assert.equal(r.status,403);assert.equal(h.events.filter(e=>e.kind==='update-auth').length,0);
});
test('permanent verifier uses a fresh 128-bit salt and 600000-round PBKDF2 without exposing it',async()=>{
  const h=harness();const r=await h.invoke({action:'complete_password',current_password:TEMP,new_password:NEXT},{user:TARGET});
  assert.equal(r.status,200);
  const saved=h.events.find(e=>e.name==='raps_managed_finish_complete').args;
  assert.match(saved.p_salt,/^[a-f0-9]{32}$/);assert.match(saved.p_verifier,/^[a-f0-9]{64}$/);
  assert.equal(saved.p_verifier,pbkdf2Sync(NEXT,Buffer.from(saved.p_salt,'hex'),600000,32,'sha256').toString('hex'));
  assert.ok(!JSON.stringify(r.body).includes(saved.p_verifier));assert.deepEqual(h.logs,[]);
});

function legacyAdminGate(file,options={}) {
  let handler;const calls=[];
  const metadata={raps_managed_login:true,raps_managed_credential_version:VERSION};
  const user={id:CALLER,app_metadata:metadata};
  const input=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions',file,'index.ts'),'utf8').replace(/^import .*?;\s*/m,''));
  vm.runInNewContext(input,{
    Response,Request,Date,TextEncoder,TextDecoder,URL,atob,btoa,Uint8Array,
    console:{error(){},warn(){},log(){}},
    createClient:()=>({auth:{getUser:async()=>({data:{user},error:null})},
      rpc:async(name,args)=>{calls.push({name,args});return {data:options.status || {managed:true,session_usable:false,credential_version:VERSION},error:options.rpcError ? {code:'XX000'} : null};},
      from:()=>{throw new Error('Privileged membership read must not run for gated identity');}}),
    Deno:{env:{get:k=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[k]},serve:fn=>handler=fn}
  });
  return {calls,async invoke(){return handler(new Request('https://example.test/functions/v1/'+file,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(CALLER,NOW,options.claimMetadata || metadata)},body:'{}'}));}};
}
for(const file of ['admin-invite-user','admin-manage-user']) {
  test(file+' rejects pending managed administrators before privileged side effects',async()=>{
    const h=legacyAdminGate(file);const r=await h.invoke();assert.equal(r.status,403);
    assert.equal(h.calls[0].name,'raps_managed_status');assert.equal(h.calls[0].args.p_session_id,CALLER);
  });
  test(file+' rejects missing proof, stale metadata, and failed trusted status checks',async()=>{
    for(const options of [
      {status:{managed:true,session_usable:false,credential_version:VERSION}},
      {status:{managed:true,session_usable:true,credential_version:'77777777-7777-4777-8777-777777777777'}},
      {rpcError:true},
      {status:{managed:true,session_usable:true,credential_version:VERSION},claimMetadata:{raps_managed_login:true,raps_managed_credential_version:'77777777-7777-4777-8777-777777777777'}}
    ]) assert.equal((await legacyAdminGate(file,options).invoke()).status,403);
  });
}


test('Unicode password minimum counts code points before reserving the credential operation',async()=>{
  const short=harness();const rejected=await short.invoke({action:'complete_password',current_password:TEMP,new_password:'🩺'.repeat(11)},{user:TARGET});
  assert.equal(rejected.status,400);
  assert.equal(short.events.filter(e=>e.name==='raps_managed_begin_complete').length,0);
  assert.equal(short.events.filter(e=>e.kind==='update-auth').length,0);
  const valid=harness();const accepted=await valid.invoke({action:'complete_password',current_password:TEMP,new_password:'🩺'.repeat(12)},{user:TARGET});
  assert.equal(accepted.status,200);
  assert.equal(valid.events.find(e=>e.kind==='update-auth').input.password,'🩺'.repeat(12));
});
