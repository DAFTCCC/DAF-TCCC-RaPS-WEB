'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = '22222222-2222-4222-8222-222222222222';
const BASE = '33333333-3333-4333-8333-333333333333';
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '../supabase/functions/admin-manage-user/index.ts'), 'utf8')
  .replace(/^import .*?;\s*/m, ''));
const deletion = { action:'delete_account', user_id:TARGET };

function harness(options = {}) {
  const events = [];
  const tables = {
    memberships:[{ id:'caller-access', user_id:CALLER, role:'enterprise_admin', active:true, base_id:null, majcom_id:null,
      starts_at:null, ends_at:null, ...options.callerMembership }, ...(options.targetMemberships || [])],
    evaluations:[], classes:[], evaluation_events:[], participants:[], audit_log:[], ...options.tables
  };
  const env = { SUPABASE_URL:'https://supabase.example.test', SUPABASE_ANON_KEY:'anon', SUPABASE_SERVICE_ROLE_KEY:'service', ...options.env };
  let handler;
  class Query {
    constructor(client, table) { this.client = client; this.table = table; this.filters = []; this.operation = 'select'; }
    select(columns) { this.columns = columns.split(',').map(c => c.trim()); return this; }
    eq(column, value) { (this.equalities ||= {})[column] = value; this.filters.push(row => row[column] === value); return this; }
    limit(n) { this.count = n; return this; }
    insert(values) { this.operation = 'insert'; this.values = values; return this; }
    then(resolve, reject) {
      if (!this.result) this.result = Promise.resolve().then(() => this.run());
      return this.result.then(resolve, reject);
    }
    run() {
      events.push({ client:this.client, table:this.table, operation:this.operation, values:this.values });
      options.onQuery?.(this, tables);
      if (options.queryThrows?.(this)) throw new Error('Transport unavailable');
      if (options.queryError?.(this)) return { data:null, error:{ message:'Query unavailable' } };
      if (this.operation === 'insert') {
        if (options.auditError?.(this.values.action)) return { data:null, error:{ message:'Audit unavailable' } };
        tables[this.table].push(this.values);
        return { data:null, error:null };
      }
      return { data:tables[this.table].filter(row => this.filters.every(filter => filter(row))).slice(0, this.count)
        .map(row => Object.fromEntries(this.columns.map(column => [column, row[column]]))), error:null };
    }
  }
  const client = kind => ({
    from:table => new Query(kind, table),
    auth:{
      getUser:async () => {
        events.push({ operation:'verify-caller' });
        if (options.authThrows) throw new Error('Auth unavailable');
        return { data:{ user:options.unauthorized ? null : { id:CALLER } }, error:(typeof options.authError === 'function' ? options.authError() : options.authError) ? { message:'Invalid token' } : null };
      },
      admin:{
        getUserById:async id => { events.push({ operation:'lookup-target', user_id:id }); return { data:{ user:options.targetMissing ? null : { id, email:'target@example.mil' } }, error:null }; },
        deleteUser:async id => {
          events.push({ operation:'delete-auth-user', user_id:id });
          if (options.deleteThrows) throw new Error('Deletion response unavailable');
          return { error:options.deleteError ? { message:'Delete unavailable' } : null };
        }
      }
    }
  });
  vm.runInNewContext(source, {
    URL, Request, Response, Date:class extends Date { static now() { return options.now?.() ?? Date.now(); } }, TextDecoder, console:{ error() {} },
    createClient:(_url, key) => client(key === 'service' ? 'service' : 'caller'),
    Deno:{ env:{ get:key => env[key] }, serve:fn => { handler = fn; } }
  }, { filename:'admin-manage-user/index.ts' });
  return {
    events, tables,
    async invoke(body = deletion, settings = {}) {
      const method = settings.method || 'POST';
      const response = await handler(new Request('https://supabase.example.test/functions/v1/admin-manage-user', {
        method, headers:{ Authorization:'Bearer synthetic-user', 'Content-Type':'application/json', ...settings.headers },
        ...(settings.rawBody?.getReader ? { duplex:'half' } : {}),
        ...(method === 'POST' ? { body:settings.rawBody ?? JSON.stringify(body) } : {})
      }));
      const text = await response.text();
      return { status:response.status, body:text === 'ok' ? text : JSON.parse(text), response };
    }
  };
}

function assertNoDelete(app) {
  assert.equal(app.events.some(event => event.operation === 'delete-auth-user'), false);
}

test('revocation, exact membership expiry, and expired tokens during a streamed body cannot delete an account', async () => {
  for(const change of ['revoked','expired','token']) {
    let clock=Date.parse('2026-10-17T00:00:00Z'), validToken=true, controller;
    const app=harness({now:()=>clock,authError:()=>!validToken,
      callerMembership:{ends_at:'2026-10-17T00:00:01Z'}});
    const stream=new ReadableStream({start(value){controller=value;}});
    const request=app.invoke(deletion,{rawBody:stream});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(app.events.filter(event=>event.table==='memberships').length,1);
    if(change==='revoked')app.tables.memberships[0].active=false;
    if(change==='expired')clock+=1000;
    if(change==='token')validToken=false;
    controller.enqueue(new TextEncoder().encode(JSON.stringify(deletion)));
    controller.close();
    assert.equal((await request).status,403,change);
    assertNoDelete(app);
    assert.equal(app.events.some(event=>event.operation==='lookup-target' || event.operation==='insert'),false);
  }
});

test('access revoked or expired while checking history or auditing is rechecked before permanent deletion', async () => {
  for(const pause of ['history','audit']) {
    for(const change of ['revoked','expired','token']) {
      let clock=Date.parse('2026-10-17T00:00:00Z'), validToken=true;
      const app=harness({now:()=>clock,authError:()=>!validToken,
        callerMembership:{ends_at:'2026-10-17T00:00:01Z'},onQuery(query,tables) {
          const paused=pause==='history' ? query.table==='evaluations' : query.values?.action==='user_account_delete_requested';
          if(!paused)return;
          if(change==='revoked')tables.memberships[0].active=false;
          if(change==='expired')clock+=1000;
          if(change==='token')validToken=false;
        }});
      assert.equal((await app.invoke()).status,403,`${pause}/${change}`);
      assertNoDelete(app);
    }
  }
});

test('account deletion handles preflight, HTTP method, and missing configuration without side effects', async () => {
  const app = harness();
  assert.equal((await app.invoke({}, { method:'OPTIONS' })).status, 200);
  assert.equal((await app.invoke({}, { method:'GET' })).status, 405);
  assert.equal(app.events.length, 0);
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const unavailable = harness({ env:{ [key]:'' } });
    assert.equal((await unavailable.invoke()).status, 503);
    assert.equal(unavailable.events.length, 0);
  }
});

test('account deletion verifies the caller with Auth before administrative reads or writes', async () => {
  for (const options of [{ unauthorized:true }, { authError:true }]) {
    const app = harness(options);
    assert.equal((await app.invoke()).status, 401);
    assert.equal(app.events.length, 1);
    assert.equal(app.events[0].operation, 'verify-caller');
  }
});

for (const [name, membership] of [
  ['evaluator', { role:'evaluator', base_id:BASE }], ['Program Manager', { role:'program_manager', base_id:BASE }],
  ['MAJCOM Manager', { role:'majcom_manager' }], ['inactive', { active:false }],
  ['future', { starts_at:'2999-01-01T00:00:00Z' }], ['expired', { ends_at:'2000-01-01T00:00:00Z' }],
  ['malformed start', { starts_at:'invalid' }], ['malformed end', { ends_at:'invalid' }],
  ['empty start', { starts_at:'' }], ['non-string end', { ends_at:0 }],
  ['scoped Enterprise', { base_id:BASE }], ['missing Enterprise scope', { majcom_id:undefined }]
]) {
  test(`${name} membership cannot authorize account deletion`, async () => {
    const app = harness({ callerMembership:membership });
    assert.equal((await app.invoke()).status, 403);
    assertNoDelete(app);
    assert.equal(app.events.some(event => event.operation === 'lookup-target'), false);
  });
}

test('malformed administrative input fails before target lookup, audit, or deletion', async () => {
  for (const body of [null, [], 'delete_account', {}, { ...deletion, action:['delete_account'] },
    { ...deletion, user_id:[TARGET] }, { ...deletion, user_id:'invalid' }, { ...deletion, role:'enterprise_admin' }]) {
    const app = harness();
    assert.equal((await app.invoke(body)).status, 400, JSON.stringify(body));
    assertNoDelete(app);
    assert.equal(app.events.some(event => event.operation === 'lookup-target' || event.operation === 'insert'), false);
  }
  for (const settings of [{ rawBody:'{' }, { rawBody:' '.repeat(9000) }, { headers:{ 'Content-Length':'9000' } }, { headers:{ 'Content-Type':'text/plain' } }]) {
    const app = harness();
    assert.ok([400, 413, 415].includes((await app.invoke(deletion, settings)).status));
    assertNoDelete(app);
  }
});

test('self-deletion and missing target accounts remain blocked', async () => {
  for (const userId of [CALLER, ` ${CALLER.toUpperCase()} `]) {
    const own = harness();
    assert.equal((await own.invoke({ ...deletion, user_id:userId })).body.code, 'ADMIN_SELF_DELETE');
    assertNoDelete(own);
  }
  const missing = harness({ targetMissing:true });
  assert.equal((await missing.invoke()).status, 404);
  assertNoDelete(missing);
});

test('account IDs are canonicalized before administrative target checks', async () => {
  const app = harness();
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.equal((await app.invoke({ ...deletion, user_id:` ${id.toUpperCase()} ` })).status, 200);
  assert.equal(app.events.find(event => event.operation === 'lookup-target').user_id, id);
  assert.equal(app.events.find(event => event.operation === 'delete-auth-user').user_id, id);
});

test('all enabled target memberships block deletion, including scheduled or expired access', async () => {
  for (const membership of [
    { role:'enterprise_admin' }, { role:'evaluator' }, { role:'program_manager', starts_at:'2999-01-01T00:00:00Z' },
    { role:'majcom_manager', ends_at:'2000-01-01T00:00:00Z' }
  ]) {
    const app = harness({ targetMemberships:[{ id:'target-access', user_id:TARGET, active:true, ...membership }] });
    assert.equal((await app.invoke()).body.code, 'ADMIN_DELETE_ACTIVE');
    assertNoDelete(app);
  }
});

for (const [table, column] of [['evaluations', 'evaluator_id'], ['classes', 'created_by'], ['evaluation_events', 'created_by'], ['participants', 'created_by']]) {
  test(`${table} history preserves the account and attribution`, async () => {
    const app = harness({ tables:{ [table]:[{ id:'history', [column]:TARGET }] } });
    assert.equal((await app.invoke()).body.code, 'ADMIN_DELETE_HISTORY');
    assertNoDelete(app);
  });
}

test('access, history, provenance, and required-audit failures block deletion', async () => {
  for (const options of [
    { queryError:q => q.table === 'memberships' }, { queryError:q => q.table === 'classes' },
    { queryError:q => q.table === 'memberships' && q.equalities.user_id === TARGET && !q.count },
    { auditError:action => action === 'user_account_delete_requested' }
  ]) {
    const app = harness(options);
    assert.ok([403, 500].includes((await app.invoke()).status));
    assertNoDelete(app);
  }
});

test('deletion captures disabled membership provenance before deleting and records completion', async () => {
  const app = harness({ targetMemberships:[{ id:'old-access', user_id:TARGET, role:'evaluator', base_id:BASE, majcom_id:null, active:false, starts_at:null, ends_at:null }] });
  const result = await app.invoke();
  assert.equal(result.status, 200);
  assert.equal(result.body.deleted_user_id, TARGET);
  assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
  const requested = app.events.findIndex(event => event.values?.action === 'user_account_delete_requested');
  const removed = app.events.findIndex(event => event.operation === 'delete-auth-user');
  assert.ok(requested >= 0 && requested < removed);
  assert.equal(app.tables.audit_log[0].old_value.memberships[0].id, 'old-access');
  assert.equal(app.tables.audit_log.at(-1).action, 'user_account_deleted');
});

test('Auth deletion rejection is audited without claiming success', async () => {
  const app = harness({ deleteError:true });
  const result = await app.invoke();
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'ADMIN_DELETE_FAILED');
  assert.equal(app.tables.audit_log.at(-1).action, 'user_account_delete_failed');
});

test('completion audit failure truthfully reports an account already deleted', async () => {
  const app = harness({ auditError:action => action === 'user_account_deleted' });
  const result = await app.invoke();
  assert.equal(result.status, 200);
  assert.equal(result.body.deleted_user_id, TARGET);
  assert.match(result.body.audit_warning, /completion audit/);
  const unexpected = harness({ queryThrows:q => q.values?.action === 'user_account_deleted' });
  const partial = await unexpected.invoke();
  assert.equal(partial.status, 500);
  assert.equal(partial.body.deleted, true);
  assert.equal(partial.body.deleted_user_id, TARGET);
});

test('unexpected Auth and database failures return controlled review guidance', async () => {
  for (const options of [{ authThrows:true }, { queryThrows:q => q.table === 'memberships' }, { deleteThrows:true }]) {
    const app = harness(options);
    const result = await app.invoke();
    assert.equal(result.status, 500);
    assert.equal(result.body.code, 'ADMIN_SERVICE');
    assert.match(result.body.error, /review account access/);
  }
});
