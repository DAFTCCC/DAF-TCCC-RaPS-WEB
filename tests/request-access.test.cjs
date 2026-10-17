'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
// Run the actual Deno handler. Only the remote SDK import and runtime bindings
// are replaced; no server, email, account, or database is contacted.
const source = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'supabase/functions/request-access/index.ts'), 'utf8')
  .replace(/^import .*;\r?\n/, ''));
const ids = { base: '11111111-1111-4111-8111-111111111111', majcom: '22222222-2222-4222-8222-222222222222', inactive: '33333333-3333-4333-8333-333333333333' };
const requestPayload = overrides => ({ email: 'student@example.test', display_name: 'Test Evaluator', requested_role: 'evaluator', base_id: ids.base, majcom_id: null, justification: null, ...overrides });

function setup(options = {}) {
  let handler;
  const queries = [], submissions = [], logs = [], createdClients = [];
  const tables = {
    bases: [
      { id: ids.base, code: 'TEST', name: 'Test Installation', majcom_id: ids.majcom, active: true, private_notes: 'must not be returned' },
      { id: 'inactive-base', name: 'Inactive Installation', majcom_id: ids.majcom, active: false },
      { id: 'inactive-parent-base', name: 'Inactive Parent', majcom_id: ids.inactive, active: true }
    ],
    majcoms: [
      { id: ids.majcom, code: 'TEST', name: 'Test Command', active: true, private_notes: 'must not be returned' },
      { id: ids.inactive, code: 'OLD', name: 'Inactive Command', active: false }
    ]
  };
  const client = {
    from(table) {
      queries.push(table);
      assert.ok(['bases', 'majcoms'].includes(table), 'Public handler must not read requests, profiles, memberships, or accounts');
      let selected = tables[table];
      const query = {
        select() { return query; },
        eq(key, value) { selected = selected.filter(row => row[key] === value); return query; },
        order() { return query; },
        then(resolve, reject) { return Promise.resolve(options.catalogError ? { data: null, error: { code: 'READ_FAILED', message: 'private database detail' } } : { data: selected, error: null }).then(resolve, reject); }
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'submit_access_request');
      submissions.push(JSON.parse(JSON.stringify(args)));
      if (options.throwOnRpc) throw new Error('private database detail');
      return { error: options.rpcError || null };
    }
  };
  const context = {
    Request, Response, TextDecoder, Uint8Array,
    console: { error(...values) { logs.push(values); } },
    createClient(...args) { createdClients.push(args); return client; },
    Deno: {
      serve(value) { handler = value; },
      env: { get(key) { return options.missingConfig ? undefined : ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' })[key]; } }
    }
  };
  vm.runInNewContext(source, context);
  const request = async (body = requestPayload(), config = {}) => {
    const init = { method: 'POST', ...config, headers: { 'Content-Type': 'application/json', ...config.headers } };
    delete init.rawBody;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(init.method)) init.body = config.rawBody ?? JSON.stringify(body);
    const response = await handler(new Request('https://synthetic.invalid/functions/v1/request-access', init));
    return { response, body: await response.json() };
  };
  return { handler, request, queries, submissions, logs, createdClients };
}

test('public catalog exposes only active installations under active commands and public fields', async () => {
  const app = setup();
  const { response, body } = await app.request(null, { method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(body, {
    bases: [{ id: ids.base, code: 'TEST', name: 'Test Installation', majcom_id: ids.majcom }],
    majcoms: [{ id: ids.majcom, code: 'TEST', name: 'Test Command' }]
  });
  assert.deepEqual(app.submissions, []);
});

test('valid submissions normalize data and only call the pending-request RPC', async () => {
  for (const role of ['evaluator', 'program_manager', 'majcom_manager']) {
    const app = setup();
    const { response, body } = await app.request(requestPayload({ email: ' Person@Example.Test ', display_name: ' Person Name ', requested_role: role, base_id: role === 'majcom_manager' ? null : ids.base, majcom_id: role === 'majcom_manager' ? ids.majcom : null, justification: ' Training assignment\nNext month ' }));
    assert.equal(response.status, 202);
    assert.equal(body.ok, true);
    assert.match(body.message, /administrator.*approve/i);
    assert.deepEqual(app.queries, []);
    assert.deepEqual(app.submissions, [{ p_request: { email: 'person@example.test', display_name: 'Person Name', requested_role: role, base_id: role === 'majcom_manager' ? null : ids.base, majcom_id: role === 'majcom_manager' ? ids.majcom : null, justification: 'Training assignment\nNext month' } }]);
    assert.equal(app.createdClients[0][2].auth.persistSession, false);
  }
});

test('repeated submissions receive the same generic response without request or account details', async () => {
  const app = setup();
  const first = await app.request();
  const retry = await app.request();
  assert.equal(first.response.status, retry.response.status);
  assert.deepEqual(first.body, retry.body);
  assert.deepEqual(Object.keys(first.body), ['ok', 'message']);
});

const invalidInputs = [
  null, [], 'request', {},
  requestPayload({ email: 'invalid' }), requestPayload({ email: 'x@y' }), requestPayload({ email: 'x\u0000@example.test' }), requestPayload({ email: 'x'.repeat(250) + '@example.test' }),
  requestPayload({ display_name: '' }), requestPayload({ display_name: 'x'.repeat(121) }), requestPayload({ display_name: 'Bad\nName' }), requestPayload({ display_name: ['Name'] }),
  requestPayload({ requested_role: 'enterprise_admin' }), requestPayload({ requested_role: 'unknown' }),
  requestPayload({ base_id: null }), requestPayload({ base_id: 'not-a-uuid' }), requestPayload({ majcom_id: ids.majcom }),
  requestPayload({ requested_role: 'majcom_manager', base_id: ids.base, majcom_id: ids.majcom }),
  requestPayload({ requested_role: 'majcom_manager', base_id: null, majcom_id: null }),
  requestPayload({ justification: 'x'.repeat(2001) }), requestPayload({ justification: 5 }), requestPayload({ justification: 'Bad\u0000text' }),
  requestPayload({ status: 'approved' }), requestPayload({ user_id: ids.base }), requestPayload({ role: 'enterprise_admin' })
];
for (const [index, body] of invalidInputs.entries()) {
  test(`invalid or privileged access-request payload ${index + 1} is rejected before any write`, async () => {
    const app = setup();
    const result = await app.request(body);
    assert.equal(result.response.status, 400);
    assert.deepEqual(app.submissions, []);
  });
}

test('body reader rejects unsupported content types, malformed JSON and oversized declarations or streams', async () => {
  const app = setup();
  assert.equal((await app.request(undefined, { headers: { 'Content-Type': 'text/plain' } })).response.status, 415);
  assert.equal((await app.request(undefined, { rawBody: '{broken' })).response.status, 400);
  assert.equal((await app.request(undefined, { headers: { 'Content-Length': '8193' } })).response.status, 413);
  assert.equal((await app.request(undefined, { rawBody: ' '.repeat(8193) })).response.status, 413);
  assert.deepEqual(app.submissions, []);
});

test('scope changes, missing RPC and unexpected backend failures never report successful submission', async () => {
  for (const [options, status] of [
    [{ rpcError: { code: '22023', message: 'private database detail' } }, 400],
    [{ rpcError: { code: 'PGRST202', message: 'private database detail' } }, 503],
    [{ throwOnRpc: true }, 503],
    [{ missingConfig: true }, 503]
  ]) {
    const app = setup(options);
    const result = await app.request();
    assert.equal(result.response.status, status);
    assert.ok(!result.body.ok);
    assert.ok(!JSON.stringify(result.body).includes('private database detail'));
    assert.ok(!JSON.stringify(app.logs).includes('private database detail'));
  }
});

test('catalog database failures are generic errors and contain no rows', async () => {
  const result = await setup({ catalogError: true }).request(null, { method: 'GET' });
  assert.equal(result.response.status, 503);
  assert.ok(!result.body.bases);
  assert.ok(!JSON.stringify(result.body).includes('private database detail'));
});

test('preflight and unsupported methods do not initialize privileged SDK', async () => {
  const app = setup();
  const preflight = await app.handler(new Request('https://synthetic.invalid', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 200);
  assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /GET.*POST.*OPTIONS/);
  const result = await app.request(null, { method: 'DELETE' });
  assert.equal(result.response.status, 405);
  assert.equal(app.createdClients.length, 0);
});

test('submission migration keeps browser RPC access and table/role changes closed', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261017_access_request_submission.sql'), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.submit_access_request\(jsonb\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.submit_access_request\(jsonb\) to service_role/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /status::text = 'pending'/);
  assert.match(sql, /interval '60 seconds'/);
  assert.doesNotMatch(sql, /create\s+(?:table|policy)|alter\s+table|insert\s+into\s+(?:public\.)?(?:memberships|profiles)|auth\.users/i);
});
