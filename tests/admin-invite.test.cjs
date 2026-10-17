'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { randomUUID } = require('node:crypto');

const CALLER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const BASE = '33333333-3333-4333-8333-333333333333';
const MAJCOM = '44444444-4444-4444-8444-444444444444';
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '../supabase/functions/admin-invite-user/index.ts'), 'utf8')
  .replace(/^import .*?;\s*/m, ''));
const initialInvite = { email:'student@example.mil', display_name:'Student', role:'evaluator', base_id:BASE, majcom_id:null };

function harness(options = {}) {
  const events = [];
  const tables = {
    memberships:[{ id:'caller-membership', user_id:CALLER, role:'enterprise_admin', base_id:null, majcom_id:null, active:true, starts_at:null, ends_at:null, ...options.callerMembership }],
    profiles:options.profiles || [],
    bases:[{ id:BASE, active:options.baseActive !== false, majcom_id:options.baseMajcomMissing ? null : MAJCOM }],
    majcoms:[{ id:MAJCOM, active:options.majcomActive !== false }],
    audit_log:[]
  };
  if (options.targetMembership !== false) tables.memberships.push({
    id:'target-membership', user_id:TARGET, role:'evaluator', base_id:BASE, majcom_id:null, active:true, starts_at:null, ends_at:null, ...options.targetMembership
  });
  const env = {
    SUPABASE_URL:'https://supabase.example.test', SUPABASE_ANON_KEY:'anon', SUPABASE_SERVICE_ROLE_KEY:'service',
    RAPS_SITE_URL:'https://raps.example.test/training/?view=home#old', ...options.env
  };
  let handler;
  class Query {
    constructor(client, table) { this.client = client; this.table = table; this.filters = []; this.operation = 'select'; this.one = false; }
    select(columns) { this.columns = columns?.split(',').map(column => column.trim()); return this; }
    eq(column, value) { (this.equalities ||= {})[column] = value; this.filters.push(row => row[column] === value); return this; }
    ilike(column, value) {
      const exact = value.replace(/\\([\\%_])/g, '$1').toLowerCase();
      this.filters.push(row => String(row[column] || '').toLowerCase() === exact); return this;
    }
    limit(n) { this.count = n; return this; }
    maybeSingle() { this.one = true; return this; }
    single() { this.one = true; return this; }
    insert(values) { this.operation = 'insert'; this.values = values; return this; }
    update(values) { this.operation = 'update'; this.values = values; return this; }
    delete() { this.operation = 'delete'; return this; }
    then(resolve, reject) {
      if (!this.result) this.result = Promise.resolve().then(() => this.run());
      return this.result.then(resolve, reject);
    }
    run() {
      const entry = { client:this.client, table:this.table, operation:this.operation, values:this.values };
      events.push(entry);
      options.onQuery?.(this, tables);
      if (this.table === 'memberships' && this.operation === 'select' && options.membershipReadError) return { data:null, error:{ message:'Membership lookup failed' } };
      if (this.table === 'memberships' && this.operation === 'select' && options.targetMembershipReadError && this.equalities.user_id === TARGET) return { data:null, error:{ message:'Target membership lookup failed' } };
      if (this.table === options.scopeReadErrorTable) return { data:null, error:{ message:'Scope lookup failed' } };
      if (this.table === 'profiles' && this.operation === 'select' && options.profileReadError) return { data:null, error:{ message:'Profile lookup failed' } };
      if (this.operation === 'insert') {
        if (this.table === 'audit_log' && options.auditError?.(this.values.action)) return { data:null, error:{ message:'Audit unavailable' } };
        if (this.table === 'memberships' && options.membershipError) return { data:null, error:{ message:'Assignment failed' } };
        const row = { id:randomUUID(), ...this.values };
        tables[this.table].push(row);
        const selected = this.columns ? Object.fromEntries(this.columns.map(column => [column, row[column]])) : row;
        return { data:this.one ? selected : [selected], error:null };
      }
      const matched = tables[this.table].filter(row => this.filters.every(filter => filter(row))).slice(0, this.count);
      if (this.operation === 'delete') {
        if (options.cleanupError) return { data:null, error:{ message:'Cleanup denied' } };
        if (options.cleanupNoRows) return { data:[], error:null };
        tables[this.table] = tables[this.table].filter(row => !matched.includes(row));
      }
      if (this.operation === 'update') {
        if (this.table === 'profiles' && options.profileUpdateError) return { data:null, error:{ message:'Profile update failed' } };
        matched.forEach(row => Object.assign(row, this.values));
      }
      const selected = this.columns ? matched.map(row => Object.fromEntries(this.columns.map(column => [column, row[column]]))) : matched;
      return { data:this.one ? selected[0] || null : selected, error:null };
    }
  }
  const client = kind => ({
    from:table => new Query(kind, table),
    auth:{
      getUser:async () => ({ data:{ user:options.unauthorized ? null : { id:CALLER } }, error:options.authError?.() ? { message:'Expired token' } : null }),
      resetPasswordForEmail:async (email, settings) => {
        events.push({ operation:'reset-email', email, settings });
        return { data:{}, error:options.resetError ? { message:'SMTP unavailable' } : null };
      },
      admin:{
        getUserById:async id => {
          options.onTargetLookup?.(tables);
          return { data:{ user:options.targetMissing ? null : { id, email:options.targetAuthEmail || 'existing@example.mil' } }, error:null };
        },
        inviteUserByEmail:async (email, settings) => {
          events.push({ operation:'invite-email', email, settings });
          if (options.inviteThrows) throw new Error('Unexpected SDK error');
          return { data:{ user:options.inviteError ? null : { id:TARGET, email } }, error:options.inviteError || null };
        },
        deleteUser:async () => { events.push({ operation:'DELETE_AUTH_USER' }); throw new Error('Auth accounts must never be deleted by this handler'); }
      }
    }
  });
  vm.runInNewContext(source, {
    URL, Response, Request, Date:class extends Date { static now() { return options.now?.() ?? Date.now(); } }, TextDecoder, crypto:{ randomUUID }, console:{ error() {}, warn() {} },
    createClient:(_url, key) => client(key === 'service' ? 'service' : 'caller'),
    Deno:{ env:{ get:key => env[key] }, serve:fn => { handler = fn; } }
  }, { filename:'admin-invite-user/index.ts' });
  return {
    events, tables,
    async invoke(body = initialInvite, settings = {}) {
      const method = settings.method || 'POST';
      const response = await handler(new Request('https://supabase.example.test/functions/v1/admin-invite-user', {
        method, headers:{ Authorization:'Bearer synthetic-user', 'Content-Type':'application/json', ...settings.headers },
        ...(settings.rawBody?.getReader ? { duplex:'half' } : {}),
        ...(method === 'POST' ? { body:settings.rawBody ?? JSON.stringify(body) } : {})
      }));
      const result = await response.text();
      return { status:response.status, body:result === 'ok' ? result : JSON.parse(result), response };
    }
  };
}

const mailEvents = app => app.events.filter(e => ['invite-email','reset-email'].includes(e.operation));
const setup = { action:'send_setup_link', user_id:TARGET };

test('revoked access, exact membership expiry, and expired tokens during a streamed body block all account actions', async () => {
  for (const body of [initialInvite, setup, { action:'verify_account_email', user_id:TARGET, email:'existing@example.mil' }]) {
    for (const change of ['revoked','expired','token']) {
      let clock=Date.parse('2026-10-17T00:00:00Z'), validToken=true, controller;
      const app=harness({now:()=>clock,authError:()=>!validToken,
        callerMembership:{ends_at:'2026-10-17T00:00:01Z'}});
      const stream=new ReadableStream({start(value){controller=value;}});
      const request=app.invoke(body,{rawBody:stream});
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(app.events.filter(event=>event.table==='memberships').length,1);
      if(change==='revoked')app.tables.memberships[0].active=false;
      if(change==='expired')clock+=1000;
      if(change==='token')validToken=false;
      controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
      controller.close();
      const result=await request;
      assert.equal(result.status,403,`${body.action || 'invite'}/${change}`);
      assert.equal(mailEvents(app).length,0);
      assert.equal(app.events.some(event=>event.operation!=='select'),false);
    }
  }
});

test('revocation while writing the requested-email audit blocks invitation and reset delivery', async () => {
  for(const body of [initialInvite,setup]) {
    const app=harness({onQuery(query,tables) {
      if(query.table==='audit_log' && /_requested$/.test(query.values?.action || ''))tables.memberships[0].active=false;
    }});
    assert.equal((await app.invoke(body)).status,403);
    assert.equal(mailEvents(app).length,0);
    assert.equal(app.events.some(event=>event.table==='memberships' && event.operation!=='select'),false);
  }
});

test('revocation during Auth account lookup prevents disclosing the verified account result', async () => {
  const app=harness({onTargetLookup(tables){tables.memberships[0].active=false;}});
  const result=await app.invoke({action:'verify_account_email',user_id:TARGET,email:'existing@example.mil'});
  assert.equal(result.status,403);
  assert.equal(result.body.user,undefined);
  assert.equal(mailEvents(app).length,0);
});

test('invitation function handles preflight and restricts the HTTP method', async () => {
  const app = harness();
  assert.equal((await app.invoke({}, { method:'OPTIONS' })).status, 200);
  assert.equal((await app.invoke({}, { method:'GET' })).status, 405);
  assert.equal(app.events.length, 0);
});

test('server credentials are required before constructing any client', async () => {
  const app = harness({ env:{ SUPABASE_SERVICE_ROLE_KEY:'' } });
  assert.equal((await app.invoke()).status, 503);
  assert.equal(app.events.length, 0);
});

test('signed-out users cannot invite or send setup emails', async () => {
  for (const body of [initialInvite, setup, { action:'verify_account_email', user_id:TARGET, email:'existing@example.mil' }]) {
    const app = harness({ unauthorized:true });
    assert.equal((await app.invoke(body)).status, 401);
    assert.equal(mailEvents(app).length, 0);
  }
});

test('role assignment identity verification uses Auth email and never writable profiles', async () => {
  const body = { action:'verify_account_email', user_id:TARGET, email:' Victim@Example.Mil ' };
  const spoof = harness({ profiles:[{ id:TARGET, email:'victim@example.mil' }], targetAuthEmail:'attacker@example.mil' });
  const denied = await spoof.invoke(body);
  assert.equal(denied.status, 409);
  assert.equal(denied.body.code, 'INVITE_IDENTITY');
  assert.equal(mailEvents(spoof).length, 0);
  assert.equal(spoof.events.some(e => e.table === 'profiles' || e.operation !== 'select'), false);
  const valid = harness({ targetAuthEmail:'VICTIM@example.mil', env:{ RAPS_SITE_URL:'' } });
  const accepted = await valid.invoke(body);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.ok, true);
  assert.deepEqual(accepted.body.user, { id:TARGET, email:'victim@example.mil' });
  assert.equal(mailEvents(valid).length, 0);
  assert.equal(valid.events.some(e => e.operation !== 'select'), false);
  for (const changes of [{ email:['victim@example.mil'] }, { user_id:[TARGET] }, { role:'enterprise_admin' }]) {
    assert.equal((await harness().invoke({ ...body, ...changes })).status, 400);
  }
  assert.equal((await harness({ targetMissing:true }).invoke(body)).status, 404);
  assert.equal((await harness({ callerMembership:{ role:'program_manager' } }).invoke(body)).status, 403);
});

for (const [name, membership] of [
  ['inactive', { active:false }], ['wrong role', { role:'evaluator' }],
  ['future', { starts_at:'2999-01-01T00:00:00Z' }], ['expired', { ends_at:'2000-01-01T00:00:00Z' }],
  ['malformed start', { starts_at:'invalid' }], ['malformed end', { ends_at:'invalid' }],
  ['empty start', { starts_at:'' }], ['non-string end', { ends_at:0 }],
  ['base-scoped Enterprise', { base_id:BASE }], ['MAJCOM-scoped Enterprise', { majcom_id:MAJCOM }]
]) {
  test(`${name} administrator membership cannot send account emails`, async () => {
    const app = harness({ callerMembership:membership });
    assert.equal((await app.invoke()).status, 403);
    assert.equal(mailEvents(app).length, 0);
  });
}

for (const siteUrl of ['', 'not-a-url', 'http://raps.example.test/', 'javascript:alert(1)', 'https://user:secret@raps.example.test/']) {
  test(`unsafe or missing application URL blocks mail: ${siteUrl || '(missing)'}`, async () => {
    const app = harness({ env:{ RAPS_SITE_URL:siteUrl } });
    const result = await app.invoke();
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'INVITE_SITE_CONFIG');
    assert.equal(mailEvents(app).length, 0);
  });
}

test('malformed JSON and unsupported actions do not send email', async () => {
  const app = harness();
  assert.equal((await app.invoke({}, { rawBody:'{' })).status, 400);
  assert.equal((await app.invoke({ action:'delete_account' })).status, 400);
  assert.equal(mailEvents(app).length, 0);
});

test('untyped, ambiguous, and oversized account requests cannot send mail or grant access', async () => {
  const invalidBodies = [null, [], 'invite', { ...initialInvite, action:null }, { ...initialInvite, email:['student@example.mil'] },
    { ...initialInvite, role:['evaluator'] }, { ...initialInvite, display_name:{} },
    { ...initialInvite, user_id:TARGET }, { ...setup, role:'enterprise_admin' }, { ...setup, user_id:[TARGET] },
    { ...initialInvite, email:'student\u0000@example.mil' }, { ...initialInvite, display_name:'Student\nAdmin' }];
  for (const body of invalidBodies) {
    const app = harness();
    assert.equal((await app.invoke(body)).status, 400, JSON.stringify(body));
    assert.equal(mailEvents(app).length, 0);
    assert.equal(app.events.some(e => e.operation === 'insert'), false);
  }
  for (const settings of [{ headers:{ 'Content-Length':'9000' } }, { rawBody:JSON.stringify({ ...initialInvite, display_name:'x'.repeat(9000) }) }]) {
    const app = harness();
    assert.equal((await app.invoke(initialInvite, settings)).status, 413);
    assert.equal(mailEvents(app).length, 0);
  }
  const app = harness();
  assert.equal((await app.invoke(initialInvite, { headers:{ 'Content-Type':'text/plain' } })).status, 415);
  assert.equal(mailEvents(app).length, 0);
});

for (const [name, changes] of [
  ['invalid email', { email:'not-an-email' }], ['oversized name', { display_name:'x'.repeat(121) }],
  ['unknown role', { role:'student' }], ['missing base', { base_id:null }],
  ['extra MAJCOM', { majcom_id:MAJCOM }], ['invalid base ID', { base_id:'not-a-uuid' }],
  ['array base ID', { base_id:[BASE] }], ['array MAJCOM ID', { role:'majcom_manager', base_id:null, majcom_id:[MAJCOM] }],
  ['non-string optional Enterprise scope', { role:'enterprise_admin', base_id:false }],
  ['missing MAJCOM', { role:'majcom_manager', base_id:null }],
  ['extra base for MAJCOM', { role:'majcom_manager', majcom_id:MAJCOM }],
  ['scoped Enterprise', { role:'enterprise_admin' }]
]) {
  test(`invitation rejects ${name} before mail or role writes`, async () => {
    const app = harness();
    assert.equal((await app.invoke({ ...initialInvite, ...changes })).status, 400);
    assert.equal(mailEvents(app).length, 0);
    assert.equal(app.tables.memberships.length, 2);
  });
}

test('inactive organizational scope is rejected', async () => {
  const app = harness({ baseActive:false });
  assert.equal((await app.invoke()).status, 400);
  assert.equal(mailEvents(app).length, 0);
});

test('base-scoped invitations reject inactive or missing parent MAJCOM before mail', async () => {
  for (const role of ['evaluator', 'program_manager']) {
    for (const options of [{ majcomActive:false }, { baseMajcomMissing:true }]) {
      const app = harness(options);
      const result = await app.invoke({ ...initialInvite, role });
      assert.equal(result.status, 400);
      assert.equal(result.body.code, 'INVITE_SCOPE');
      assert.equal(mailEvents(app).length, 0);
      assert.equal(app.events.some(e => e.table === 'memberships' && e.operation === 'insert'), false);
    }
  }
});

test('initial invitation preserves the deployment path, audits mail and assigns caller-scoped access', async () => {
  const app = harness({ targetMembership:false });
  const result = await app.invoke({ ...initialInvite, email:' Student@Example.Mil ' });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.email_sent, true);
  assert.equal(result.body.delivery, 'accepted');
  const email = mailEvents(app)[0];
  assert.equal(email.email, 'student@example.mil');
  assert.equal(email.settings.redirectTo, 'https://raps.example.test/training/?view=home&raps_activation=1');
  const preflight = app.events.findIndex(e => e.values?.action === 'user_invite_requested');
  assert.ok(preflight >= 0 && preflight < app.events.indexOf(email));
  assert.equal(app.events.find(e => e.table === 'profiles' && e.operation === 'update').client, 'service');
  const assignment = app.events.find(e => e.table === 'memberships' && e.operation === 'insert');
  assert.equal(assignment.client, 'caller');
  assert.equal(assignment.values.created_by, CALLER);
  assert.equal(assignment.values.base_id, BASE);
  assert.equal(assignment.values.majcom_id, null);
  assert.equal(app.tables.audit_log.at(-1).action, 'user_invited');
});

test('valid MAJCOM and Enterprise scopes remain supported', async () => {
  for (const body of [
    { ...initialInvite, role:'majcom_manager', base_id:null, majcom_id:MAJCOM },
    { ...initialInvite, role:'enterprise_admin', base_id:null }
  ]) {
    const app = harness({ targetMembership:false });
    assert.equal((await app.invoke(body)).status, 200);
  }
});

test('an existing email returns actionable guidance without sending or changing access', async () => {
  const app = harness({ profiles:[{ id:TARGET, email:'STUDENT@example.mil' }] });
  const result = await app.invoke();
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'INVITE_EXISTING_ACCOUNT');
  assert.match(result.body.error, /Assign Access to Existing Account/);
  assert.equal(mailEvents(app).length, 0);
  assert.equal(app.tables.memberships.length, 2);
});

test('profile email lookup escapes wildcard characters', async () => {
  const app = harness({ profiles:[{ id:TARGET, email:'studentXname@example.mil' }], targetMembership:false });
  assert.equal((await app.invoke({ ...initialInvite, email:'student_name@example.mil' })).status, 200);
});

test('an auth-level existing account returns the same actionable response', async () => {
  const app = harness({ inviteError:{ code:'email_exists', message:'Already registered' } });
  const result = await app.invoke();
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'INVITE_EXISTING_ACCOUNT');
  assert.equal(app.tables.audit_log.at(-1).action, 'user_invite_failed');
  assert.equal(app.events.some(e => e.operation === 'DELETE_AUTH_USER'), false);
});

test('failed lookup or required audit blocks initial email and access assignment', async () => {
  for (const options of [{ profileReadError:true }, { auditError:action => action === 'user_invite_requested' }]) {
    const app = harness(options);
    assert.equal((await app.invoke()).status, 500);
    assert.equal(mailEvents(app).length, 0);
    assert.equal(app.tables.memberships.length, 2);
  }
});

test('SMTP rejection does not assign access or claim a successful invitation', async () => {
  const app = harness({ inviteError:{ message:'SMTP unavailable' } });
  const result = await app.invoke();
  assert.equal(result.status, 502);
  assert.notEqual(result.body.ok, true);
  assert.equal(app.tables.memberships.length, 2);
  assert.equal(app.tables.audit_log.at(-1).action, 'user_invite_failed');
});

test('membership failure reports the already accepted email and retains the account', async () => {
  const app = harness({ membershipError:true });
  const result = await app.invoke();
  assert.equal(result.status, 500);
  assert.equal(result.body.email_sent, true);
  assert.equal(result.body.membership_assigned, false);
  assert.match(result.body.error, /account was retained/);
  assert.equal(app.events.some(e => e.operation === 'DELETE_AUTH_USER'), false);
});

test('completion audit failure removes only the newly created membership', async () => {
  const app = harness({ auditError:action => action === 'user_invited' });
  const result = await app.invoke();
  assert.equal(result.status, 500);
  assert.equal(result.body.email_sent, true);
  assert.equal(result.body.membership_assigned, false);
  assert.equal(app.tables.memberships.length, 2);
  assert.equal(app.tables.memberships[1].id, 'target-membership');
  assert.equal(app.events.some(e => e.operation === 'DELETE_AUTH_USER'), false);
});

test('failed or unverified membership cleanup does not claim access was removed', async () => {
  for (const failure of [{ cleanupError:true }, { cleanupNoRows:true }]) {
    const app = harness({ ...failure, auditError:action => action === 'user_invited' });
    const result = await app.invoke();
    assert.equal(result.status, 500);
    assert.equal(result.body.membership_assigned, true);
    assert.match(result.body.error, /may still have access/);
    assert.equal(app.tables.memberships.length, 3);
  }
});

test('profile update failure returns an honest warning after successful email and access', async () => {
  const app = harness({ profileUpdateError:true });
  const result = await app.invoke();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.match(result.body.warning, /display name/);
});

test('setup/reset sends an audited recovery email without changing target access', async () => {
  const app = harness();
  const result = await app.invoke(setup);
  assert.equal(result.status, 200);
  assert.equal(result.body.email_sent, true);
  assert.equal(mailEvents(app)[0].operation, 'reset-email');
  assert.equal(mailEvents(app)[0].email, 'existing@example.mil');
  assert.equal(mailEvents(app)[0].settings.redirectTo, 'https://raps.example.test/training/?view=home&raps_activation=1');
  assert.deepEqual(app.tables.audit_log.map(e => e.action), ['user_setup_email_requested', 'user_setup_email_sent']);
  assert.equal(app.events.some(e => e.table === 'memberships' && e.operation !== 'select'), false);
});

test('setup/reset requires an existing account ID and active approved access', async () => {
  const invalid = harness();
  assert.equal((await invalid.invoke({ ...setup, user_id:'invalid' })).status, 400);
  for (const options of [{ targetMissing:true }, { targetMembership:false }, { targetMembership:{ ends_at:'2000-01-01T00:00:00Z' } }]) {
    const app = harness(options);
    assert.ok([404, 409].includes((await app.invoke(setup)).status));
    assert.equal(mailEvents(app).length, 0);
  }
});

test('setup/reset requires a recognized role with valid active organizational scope', async () => {
  const rejected = [
    { targetMembership:{ role:'unknown' } }, { targetMembership:{ base_id:null } },
    { targetMembership:{ majcom_id:MAJCOM } }, { targetMembership:{ starts_at:'' } },
    { targetMembership:{ ends_at:0 } }, { targetMembership:{ role:'enterprise_admin' } },
    { targetMembership:{ role:'majcom_manager', base_id:null, majcom_id:null } },
    { baseActive:false }, { majcomActive:false }, { baseMajcomMissing:true }
  ];
  for (const options of rejected) {
    const app = harness(options);
    assert.equal((await app.invoke(setup)).status, 409, JSON.stringify(options));
    assert.equal(mailEvents(app).length, 0);
    assert.equal(app.events.some(e => e.operation === 'insert'), false);
  }
  for (const targetMembership of [
    { role:'enterprise_admin', base_id:null, majcom_id:null },
    { role:'majcom_manager', base_id:null, majcom_id:MAJCOM },
    { role:'program_manager' }
  ]) {
    const app = harness({ targetMembership });
    assert.equal((await app.invoke(setup)).status, 200);
    assert.equal(mailEvents(app).length, 1);
  }
});

test('organizational and target-access lookup failures block privileged email requests', async () => {
  for (const table of ['bases', 'majcoms']) {
    for (const body of [initialInvite, setup]) {
      const app = harness({ scopeReadErrorTable:table });
      assert.equal((await app.invoke(body)).status, 500);
      assert.equal(mailEvents(app).length, 0);
      assert.equal(app.events.some(e => e.operation === 'insert'), false);
    }
  }
  const app = harness({ targetMembershipReadError:true });
  assert.equal((await app.invoke(setup)).status, 500);
  assert.equal(mailEvents(app).length, 0);
});

test('setup/reset audit failure blocks email before requesting delivery', async () => {
  const app = harness({ auditError:action => action === 'user_setup_email_requested' });
  assert.equal((await app.invoke(setup)).status, 500);
  assert.equal(mailEvents(app).length, 0);
});

test('setup/reset SMTP failure is reported and audited without access changes', async () => {
  const app = harness({ resetError:true });
  assert.equal((await app.invoke(setup)).status, 502);
  assert.equal(app.tables.audit_log.at(-1).action, 'user_setup_email_failed');
  assert.equal(app.tables.memberships.length, 2);
});

test('setup/reset completion audit failure acknowledges the email already accepted', async () => {
  const app = harness({ auditError:action => action === 'user_setup_email_sent' });
  const result = await app.invoke(setup);
  assert.equal(result.status, 500);
  assert.equal(result.body.email_sent, true);
  assert.match(result.body.error, /accepted.*completion audit/);
});

test('unexpected SDK failure returns a controlled response with review guidance', async () => {
  const app = harness({ inviteThrows:true });
  const result = await app.invoke();
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'INVITE_SERVICE');
  assert.match(result.body.error, /review account access/);
});

function adminUi(options = {}) {
  const nodes = new Map();
  for (const [id, value] of Object.entries({ adminInviteEmail:'student@example.mil', adminInviteName:'Student', adminInviteRole:'evaluator', adminInviteScope:BASE })) {
    nodes.set(id, { value, disabled:false });
  }
  nodes.set('adminInviteBtn', { disabled:false });
  nodes.set('adminAssignBtn', { disabled:false });
  nodes.set('adminMessage', { textContent:'', className:'' });
  nodes.set('approveRequest', { disabled:false, dataset:{ adminApproveRequest:'request-1' } });
  nodes.set('denyRequest', { disabled:false, dataset:{ adminDenyRequest:'request-1' } });
  nodes.set('enterpriseAdminCard', { classList:{ toggle() {} } });
  nodes.set('adminExistingUser', { innerHTML:'', value:TARGET });
  nodes.set('adminExistingRole', { value:'evaluator' });
  nodes.set('adminExistingScope', { value:BASE });
  const calls = [];
  const verificationCalls = [];
  const isolatedClients = [];
  const boundRequests = [];
  const mutations = [];
  const reads = [];
  const catalog = {
    profiles:options.profiles || [], memberships:options.memberships || [], bases:[], majcoms:[],
    accessRequests:[{ id:'request-1', email:'student@example.mil', display_name:'Student', requested_role:'evaluator', base_id:BASE, majcom_id:null, bases:{ name:'Test Base' } }]
  };
  const defaultResult = { data:{ ok:true, email_sent:true, delivery:'accepted', user:{ id:TARGET, email:'student@example.mil' }, membership:{ id:'assigned-membership' } }, error:null };
  const role = options.role || 'enterprise_admin';
  const membership = { id:'caller-access', user_id:CALLER, role, active:true, starts_at:null, ends_at:null,
    base_id:['evaluator', 'program_manager'].includes(role) ? BASE : null, majcom_id:role === 'majcom_manager' ? MAJCOM : null,
    ...options.callerMembership };
  const window = {
    RAPS_CLOUD:{ mode:'connected', connected:true, role, user:{ id:CALLER }, memberships:[membership], ...options.cloud },
    RAPS_CLOUD_CONFIG:{ projectUrl:'https://supabase.example.test', publishableKey:'synthetic-anon' },
    addEventListener() {}, testRefreshes:0,
    RAPS_SUPABASE:{
      auth:{ getSession:async () => options.getSession ? options.getSession() : { data:{ session:{ user:{ id:CALLER }, access_token:'synthetic-captured-token' } }, error:null } },
      functions:{ invoke:async (name, payload) => {
        if (payload.body.action === 'verify_account_email') {
          verificationCalls.push({ name, ...payload });
          return options.verificationResult || { data:{ ok:true, user:{ id:payload.body.user_id, email:payload.body.email } }, error:null };
        }
        calls.push({ name, ...payload });
        return options.invoke ? options.invoke(name, payload) : options.result || defaultResult;
      } },
      from(table) {
        const entry = { table };
        const filters = [];
        const builder = {
          insert(values) { entry.operation = 'insert'; entry.values = values; mutations.push(entry); return builder; },
          update(values) { entry.operation = 'update'; entry.values = values; mutations.push(entry); return builder; },
          eq(column, value) { (entry.filters ||= []).push([column, value]); filters.push(row => (row[column] ?? null) === value); return builder; },
          is(column, value) { return builder.eq(column, value); },
          ilike(column, value) {
            const exact = value.replace(/\\([\\%_])/g, '$1').toLowerCase();
            filters.push(row => String(row[column] || '').toLowerCase() === exact); return builder;
          },
          select() { return builder; }, single() { return builder; }, maybeSingle() { entry.one = true; return builder; },
          order(column) { (entry.orders ||= []).push(column); return builder; },
          range(start, end) { entry.range = [start, end]; reads.push(entry); return builder; },
          then(resolve, reject) {
            if (entry.range && options.catalogTables) {
              const [start, end] = entry.range;
              const rows = (options.catalogTables[table] || []).slice(start, Math.min(end + 1, start + (options.pageCap || 500)));
              return Promise.resolve({ data:rows, error:null }).then(resolve, reject);
            }
            if (table === 'profiles') {
              if (options.profileLookup) return Promise.resolve(options.profileLookup()).then(resolve, reject);
              const found = (options.lookupProfiles || options.profiles || []).filter(row => filters.every(fn => fn(row)));
              return Promise.resolve({ data:found[0] || null, error:options.profileLookupError || null }).then(resolve, reject);
            }
            if (table === 'memberships' && entry.operation !== 'insert') {
              const found = (options.lookupMemberships || options.memberships || []).filter(row => filters.every(fn => fn(row)));
              return Promise.resolve({ data:found, error:options.scopeReadError || null }).then(resolve, reject);
            }
            return Promise.resolve(table === 'memberships'
              ? { data:{ id:'new-membership' }, error:null }
              : options.review ? options.review(entry)
              : { data:options.reviewedRows || [{ id:'request-1' }], error:options.reviewError || null }).then(resolve, reject);
          }
        };
        return builder;
      }
    }
  };
  window.supabase = { createClient:(url, key, settings) => {
    isolatedClients.push({ url, key, settings });
    const source=window.RAPS_SUPABASE;
    const authorization=settings.global.headers.Authorization;
    return { from(table) {boundRequests.push({table,authorization});return source.from(table);},
      functions:{invoke(name,payload) {boundRequests.push({name,authorization});return source.functions.invoke(name,payload);}} };
  } };
  const uiSource = fs.readFileSync(path.join(__dirname, '../admin-ui.js'), 'utf8').replace(
    'window.RAPS_ADMIN = Object.freeze({ refresh: loadAdminData });',
    `const actualLoadAdminData = loadAdminData;
     loadAdminData = async () => { window.testRefreshes++; setMessage('Refreshed users', 'success'); };
     window.__adminTest = { inviteUser, approveAccessRequest, denyAccessRequest, sendSetupEmail, assignExisting, deleteAccount, requireAccountEmailResult,
       actualLoadAdminData, readAllAdminRows, getCatalog:() => catalog, setCatalog(value) { catalog = value; } };`
  );
  const context = vm.createContext({
    window, document:{ readyState:'loading', getElementById:id => nodes.get(id) || null,
      querySelectorAll:() => [nodes.get('approveRequest'), nodes.get('denyRequest')], addEventListener() {} },
    console:{ error() {}, warn() {} }, confirm:() => options.confirm !== false, prompt:() => 'DELETE', Date,
    navigator:{ onLine:options.online !== false }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../permissions.js'), 'utf8'), context, { filename:'permissions.js' });
  vm.runInContext(uiSource, context, { filename:'admin-ui.js' });
  window.__adminTest.setCatalog(catalog);
  return { ...window.__adminTest, nodes, calls, verificationCalls, isolatedClients, boundRequests, mutations, reads, window, message:() => nodes.get('adminMessage').textContent };
}

const settleAdmin = () => new Promise(resolve => setImmediate(resolve));

test('admin requests bind a fixed bearer token and never initialize after a stale session lookup', async () => {
  const ui = adminUi();
  await ui.inviteUser();
  assert.equal(ui.isolatedClients.length, 1);
  const settings = ui.isolatedClients[0].settings;
  assert.equal(settings.global.headers.Authorization, 'Bearer synthetic-captured-token');
  assert.equal(settings.auth.persistSession, false);
  assert.equal(settings.auth.autoRefreshToken, false);
  assert.equal(settings.auth.detectSessionInUrl, false);
  for (const revoke of [false, true]) {
    let release;
    const delayed = adminUi({ getSession:() => new Promise(resolve => { release = resolve; }) });
    const request = delayed.inviteUser();
    await settleAdmin();
    if (revoke) delayed.window.RAPS_CLOUD.memberships[0].active = false;
    else delayed.window.RAPS_CLOUD = { ...delayed.window.RAPS_CLOUD, user:{ id:TARGET }, memberships:[] };
    release({ data:{ session:{ user:{ id:CALLER }, access_token:'old-token' } }, error:null });
    await request;
    assert.equal(delayed.isolatedClients.length, 0);
    assert.equal(delayed.calls.length, 0);
    assert.equal(delayed.mutations.length, 0);
  }
});

test('later SDK session changes cannot replace the bearer token of an ongoing approval', async () => {
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const ui=adminUi({profileLookup:()=>pending});
  const approval=ui.approveAccessRequest('request-1');
  await settleAdmin();
  ui.window.RAPS_SUPABASE.auth.getSession=async()=>({data:{session:{user:{id:CALLER},access_token:'replacement-sdk-token'}},error:null});
  release({data:{id:TARGET,email:'student@example.mil'},error:null});
  await approval;
  assert.equal(ui.verificationCalls.length,1);
  assert.equal(ui.calls.length,1);
  assert.ok(ui.boundRequests.length>=4);
  assert.ok(ui.boundRequests.every(request=>request.authorization==='Bearer synthetic-captured-token'));
});

test('an editable profile email cannot grant membership without matching Auth verification', async () => {
  for (const verificationResult of [
    { data:{ ok:true, user:{ id:TARGET, email:'attacker@example.mil' } }, error:null },
    { data:{ ok:true, user:{ id:CALLER, email:'student@example.mil' } }, error:null },
    { data:{}, error:null }, { data:null, error:{ message:'Auth email does not match' } }
  ]) {
    for (const action of ['approve', 'assign']) {
      const ui = adminUi({ profiles:[{ id:TARGET, email:'student@example.mil' }], verificationResult });
      if (action === 'approve') await ui.approveAccessRequest('request-1');
      else await ui.assignExisting();
      assert.equal(ui.verificationCalls.length, 1);
      assert.equal(ui.mutations.length, 0);
      assert.equal(ui.calls.length, 0);
    }
  }
});

test('manual account assignment verifies the intended Auth recipient before granting access', async () => {
  const ui = adminUi({ profiles:[{ id:TARGET, email:'STUDENT@example.mil' }] });
  await ui.assignExisting();
  assert.equal(ui.verificationCalls[0].body.user_id, TARGET);
  assert.equal(ui.verificationCalls[0].body.email, 'student@example.mil');
  assert.equal(ui.mutations[0].table, 'memberships');
  assert.equal(ui.mutations[0].values.user_id, TARGET);
});

test('account deletion UI requires matching server confirmation and retains audit warnings', async () => {
  for (const data of [{}, { ok:true }, { ok:true, deleted_user_id:CALLER }]) {
    const ui = adminUi({ result:{ data, error:null } });
    await ui.deleteAccount(TARGET, 'Student');
    assert.match(ui.message(), /not confirm|could not|failed/i);
    assert.doesNotMatch(ui.message(), /was permanently deleted/);
  }
  const ui = adminUi({ result:{ data:{ ok:true, deleted_user_id:TARGET, audit_warning:'Completion audit unavailable' }, error:null } });
  await ui.deleteAccount(TARGET, 'Student');
  assert.match(ui.message(), /deleted/i);
  assert.match(ui.message(), /Completion audit unavailable/);
  assert.match(ui.message(), /already deleted/i);
  assert.equal(ui.window.testRefreshes, 1);
});

test('manual invitation UI preserves the confirmed email result after refresh', async () => {
  const ui = adminUi();
  await ui.inviteUser();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].body.role, 'evaluator');
  assert.equal(ui.calls[0].body.base_id, BASE);
  assert.equal(ui.nodes.get('adminInviteEmail').value, '');
  assert.equal(ui.window.testRefreshes, 1);
  assert.match(ui.message(), /accepted the invitation.*choose a password/);
  assert.equal(ui.nodes.get('adminInviteBtn').disabled, false);
});

test('manual invitation UI does not infer successful delivery from an empty response', async () => {
  const ui = adminUi({ result:{ data:{}, error:null } });
  await ui.inviteUser();
  assert.match(ui.message(), /Invite failed:.*did not confirm/);
  assert.equal(ui.nodes.get('adminInviteEmail').value, 'student@example.mil');
});

test('manual invitation UI shows specific existing-account service guidance', async () => {
  const ui = adminUi({ result:{ data:null, error:{ message:'Function failed', context:new Response(JSON.stringify({ code:'INVITE_EXISTING_ACCOUNT', error:'Use Assign Access to Existing Account.' }), { status:409 }) } } });
  await ui.inviteUser();
  assert.match(ui.message(), /INVITE_EXISTING_ACCOUNT.*Assign Access/);
});

test('invitation UI blocks duplicate clicks while a mail request is pending', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const ui = adminUi({ invoke:() => pending });
  const first = ui.inviteUser();
  await settleAdmin();
  await ui.inviteUser();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.nodes.get('adminInviteBtn').disabled, true);
  release({ data:{ ok:true, email_sent:true, user:{ id:TARGET }, membership:{ id:'membership' } }, error:null });
  await first;
  assert.equal(ui.nodes.get('adminInviteBtn').disabled, false);
});

test('non-admin UI cannot invoke invitation, request approval, or setup email', async () => {
  for (const options of [
    { role:'evaluator' }, { role:'program_manager' }, { role:'majcom_manager' },
    { online:false }, { cloud:{ connected:false } }, { cloud:{ offlineCached:true } },
    { cloud:{ memberships:[] } }, { callerMembership:{ active:false } },
    { callerMembership:{ starts_at:'2999-01-01T00:00:00Z' } }, { callerMembership:{ ends_at:'2000-01-01T00:00:00Z' } },
    { callerMembership:{ starts_at:'invalid' } }, { callerMembership:{ base_id:BASE } }
  ]) {
    const ui = adminUi(options);
    await ui.inviteUser();
    await ui.approveAccessRequest('request-1');
    await ui.denyAccessRequest('request-1');
    await ui.sendSetupEmail(TARGET);
    assert.equal(ui.calls.length, 0, JSON.stringify(options));
    assert.equal(ui.mutations.length, 0, JSON.stringify(options));
  }
});

test('invitation completion cannot update another account or revoked administrator view', async () => {
  for (const revoke of [false, true]) {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const ui = adminUi({ invoke:() => pending });
    const request = ui.inviteUser();
    await settleAdmin();
    assert.equal(ui.calls.length, 1);
    if (revoke) ui.window.RAPS_CLOUD.memberships[0].active = false;
    else ui.window.RAPS_CLOUD = { ...ui.window.RAPS_CLOUD, user:{ id:TARGET }, memberships:[] };
    release({ data:{ ok:true, email_sent:true, user:{ id:TARGET }, membership:{ id:'assigned' } }, error:null });
    await request;
    assert.equal(ui.window.testRefreshes, 0);
    assert.equal(ui.nodes.get('adminInviteEmail').value, 'student@example.mil');
    assert.doesNotMatch(ui.message(), /accepted the invitation/);
    assert.equal(ui.mutations.length, 0);
  }
});

test('an approval lookup started under another account cannot assign access, mail, or approve', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const ui = adminUi({ profileLookup:() => pending });
  const request = ui.approveAccessRequest('request-1');
  await settleAdmin();
  ui.window.RAPS_CLOUD = { ...ui.window.RAPS_CLOUD, user:{ id:TARGET }, memberships:[] };
  release({ data:{ id:TARGET, email:'student@example.mil' }, error:null });
  await request;
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.mutations.length, 0);
  assert.equal(ui.window.testRefreshes, 0);
});

test('setup/reset UI requests only the selected account and confirms provider acceptance', async () => {
  const ui = adminUi({ profiles:[{ id:TARGET, email:'student@example.mil' }] });
  const button = { disabled:false };
  await ui.sendSetupEmail(TARGET, button);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[0].body)), { action:'send_setup_link', user_id:TARGET });
  assert.match(ui.message(), /accepted the setup\/reset email.*newest link/);
  assert.equal(button.disabled, false);
  assert.equal(ui.mutations.length, 0);
});

test('new-account request approval requires a confirmed invitation and matching reviewed row', async () => {
  const ui = adminUi();
  await ui.approveAccessRequest('request-1');
  assert.equal(ui.calls[0].body.email, 'student@example.mil');
  assert.equal(ui.mutations[0].table, 'access_requests');
  assert.equal(ui.mutations[0].values.status, 'approved');
  assert.deepEqual(JSON.parse(JSON.stringify(ui.mutations[0].filters)), [['id','request-1'], ['status','pending']]);
  assert.match(ui.message(), /Approved.*accepted the invitation email/);
});

test('an empty invitation result never marks the access request approved', async () => {
  const ui = adminUi({ result:{ data:{ ok:true }, error:null } });
  await ui.approveAccessRequest('request-1');
  assert.equal(ui.mutations.length, 0);
  assert.match(ui.message(), /Approval incomplete.*did not confirm/);
});

test('request review races are reported without falsely confirming approval', async () => {
  const ui = adminUi({ reviewedRows:[] });
  await ui.approveAccessRequest('request-1');
  assert.match(ui.message(), /Approval incomplete.*already reviewed elsewhere/);
  assert.doesNotMatch(ui.message(), /^Approved/);
});

test('existing-account approval reuses the requested active scope and sends a setup/reset email', async () => {
  const ui = adminUi({ profiles:[{ id:TARGET, email:'STUDENT@example.mil' }], memberships:[{ id:'existing-membership', user_id:TARGET, role:'evaluator', base_id:BASE, majcom_id:null, active:true }] });
  await ui.approveAccessRequest('request-1');
  assert.equal(ui.calls[0].body.action, 'send_setup_link');
  assert.equal(ui.calls[0].body.user_id, TARGET);
  assert.equal(ui.mutations.some(m => m.table === 'memberships'), false);
  assert.match(ui.message(), /Approved.*setup\/reset/);
});

test('existing-account approval assigns the explicitly requested scope before setup email', async () => {
  const ui = adminUi({ profiles:[{ id:TARGET, email:'student@example.mil' }] });
  await ui.approveAccessRequest('request-1');
  const membership = ui.mutations.find(m => m.table === 'memberships');
  assert.equal(membership.values.user_id, TARGET);
  assert.equal(membership.values.role, 'evaluator');
  assert.equal(membership.values.base_id, BASE);
  assert.equal(membership.values.created_by, CALLER);
  assert.equal(ui.calls[0].body.action, 'send_setup_link');
});

test('existing account absent from the loaded catalog is discovered by an exact action-time lookup', async () => {
  const ui = adminUi({ lookupProfiles:[{ id:TARGET, email:'student@example.mil' }] });
  await ui.approveAccessRequest('request-1');
  assert.equal(ui.calls[0].body.action, 'send_setup_link');
  assert.equal(ui.calls[0].body.user_id, TARGET);
  assert.equal(ui.mutations.find(m => m.table === 'memberships').values.user_id, TARGET);
  assert.match(ui.message(), /Approved.*setup\/reset/);
});

test('active scoped membership absent from the loaded catalog is not duplicated', async () => {
  const ui = adminUi({
    lookupProfiles:[{ id:TARGET, email:'student@example.mil' }],
    lookupMemberships:[{ id:'unlisted-membership', user_id:TARGET, role:'evaluator', base_id:BASE, majcom_id:null, active:true }]
  });
  await ui.approveAccessRequest('request-1');
  assert.equal(ui.calls[0].body.action, 'send_setup_link');
  assert.equal(ui.mutations.some(m => m.table === 'memberships'), false);
  assert.match(ui.message(), /Approved.*setup\/reset/);
});

test('action-time account or scope lookup errors block approval before mail or new access', async () => {
  for (const options of [
    { profileLookupError:{ message:'Profiles unavailable' } },
    { lookupProfiles:[{ id:TARGET, email:'student@example.mil' }], scopeReadError:{ message:'Memberships unavailable' } }
  ]) {
    const ui = adminUi(options);
    await ui.approveAccessRequest('request-1');
    assert.equal(ui.calls.length, 0);
    assert.equal(ui.mutations.length, 0);
    assert.match(ui.message(), /Approval incomplete.*Unable to verify/);
  }
});

test('failed setup after assignment states that access exists and leaves the request pending', async () => {
  const ui = adminUi({ profiles:[{ id:TARGET, email:'student@example.mil' }], result:{ data:{ error:'SMTP unavailable' }, error:null } });
  await ui.approveAccessRequest('request-1');
  assert.equal(ui.mutations.some(m => m.table === 'access_requests'), false);
  assert.match(ui.message(), /Approval incomplete: Account access is assigned.*SMTP/);
  assert.equal(ui.window.testRefreshes, 1);
});

test('pending denial blocks approval and duplicate denial and disables both actions', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const ui = adminUi({ review:() => pending });
  const denial = ui.denyAccessRequest('request-1', ui.nodes.get('denyRequest'));
  await settleAdmin();
  assert.equal(ui.nodes.get('approveRequest').disabled, true);
  assert.equal(ui.nodes.get('denyRequest').disabled, true);
  await ui.approveAccessRequest('request-1', ui.nodes.get('approveRequest'));
  await ui.denyAccessRequest('request-1', ui.nodes.get('denyRequest'));
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.mutations.length, 1);
  assert.equal(ui.mutations[0].values.status, 'denied');
  release({ data:[{ id:'request-1' }], error:null });
  await denial;
  assert.equal(ui.nodes.get('approveRequest').disabled, false);
  assert.equal(ui.nodes.get('denyRequest').disabled, false);
  assert.match(ui.message(), /was denied/);
});

test('denial errors release both controls and allow a later approval attempt', async () => {
  const ui = adminUi({ reviewError:{ message:'Review service unavailable' } });
  await ui.denyAccessRequest('request-1', ui.nodes.get('denyRequest'));
  assert.match(ui.message(), /Deny failed: Review service unavailable/);
  assert.equal(ui.nodes.get('approveRequest').disabled, false);
  assert.equal(ui.nodes.get('denyRequest').disabled, false);
  await ui.approveAccessRequest('request-1', ui.nodes.get('approveRequest'));
  assert.equal(ui.calls.length, 1);
});

test('a denial with no affected pending row does not claim success', async () => {
  const ui = adminUi({ reviewedRows:[] });
  await ui.denyAccessRequest('request-1');
  assert.match(ui.message(), /Deny failed:.*already reviewed elsewhere/);
  assert.doesNotMatch(ui.message(), /was denied/);
  assert.equal(ui.nodes.get('approveRequest').disabled, false);
  assert.equal(ui.nodes.get('denyRequest').disabled, false);
});

test('pending approval disables denial and blocks its invocation', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const ui = adminUi({ invoke:() => pending });
  const approval = ui.approveAccessRequest('request-1', ui.nodes.get('approveRequest'));
  assert.equal(ui.nodes.get('approveRequest').disabled, true);
  assert.equal(ui.nodes.get('denyRequest').disabled, true);
  await ui.denyAccessRequest('request-1');
  assert.equal(ui.mutations.length, 0);
  release({ data:{ ok:true, email_sent:true, user:{ id:TARGET }, membership:{ id:'membership' } }, error:null });
  await approval;
  assert.equal(ui.nodes.get('approveRequest').disabled, false);
  assert.equal(ui.nodes.get('denyRequest').disabled, false);
});

test('admin lists include accounts beyond a small backend response cap', async () => {
  const catalogTables = {};
  for (const table of ['profiles','memberships','bases','majcoms','access_requests']) {
    catalogTables[table] = Array.from({ length:3 }, (_, index) => ({
      id:`${table}-${index + 1}`, display_name:`Person ${index + 1}`, email:`person${index + 1}@example.mil`,
      user_id:`profiles-${index + 1}`, role:'evaluator', base_id:BASE, active:true, status:'pending'
    }));
  }
  const ui = adminUi({ catalogTables, pageCap:2 });
  await ui.actualLoadAdminData();
  const catalog = ui.getCatalog();
  for (const [table, key] of Object.entries({ profiles:'profiles', memberships:'memberships', bases:'bases', majcoms:'majcoms', access_requests:'accessRequests' })) {
    assert.equal(catalog[key].length, 3);
    assert.equal(catalog[key][2].id, `${table}-3`);
    const reads = ui.reads.filter(read => read.table === table);
    assert.deepEqual(JSON.parse(JSON.stringify(reads.map(read => read.range[0]))), [0,2,3]);
    assert.ok(reads.every(read => read.orders.includes('id')));
  }
  assert.match(ui.nodes.get('adminExistingUser').innerHTML, /person3@example.mil/);
});

test('admin pagination stops with a useful error if the service repeats a page', async () => {
  const ui = adminUi();
  let pageCalls = 0;
  const result = await ui.readAllAdminRows(() => ({ range:async () => {
    pageCalls++;
    return { data:[{ id:'same-id' }], error:null };
  } }));
  assert.equal(pageCalls, 2);
  assert.equal(result.data, null);
  assert.match(result.error.message, /inconsistent page/);
});
