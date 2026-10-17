import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// This endpoint is public. It only returns the active organization catalog and
// submits a pending request; it never creates an account or grants a role.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const maxBodyBytes = 8192;
const acceptedMessage = 'Your request has been received. An administrator must approve access before you can sign in.';
const roles = new Set(['evaluator', 'program_manager', 'majcom_manager']);
const fields = new Set(['email', 'display_name', 'requested_role', 'base_id', 'majcom_id', 'justification']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function readBody(req: Request) {
  const declared = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBodyBytes) return { status: 413 };
  const reader = req.body?.getReader();
  if (!reader) return { status: 400 };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        return { status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function validate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !fields.has(key))) return null;
  if (typeof input.email !== 'string' || typeof input.display_name !== 'string' || typeof input.requested_role !== 'string') return null;
  const email = input.email.trim().toLowerCase();
  const displayName = input.display_name.trim();
  const role = input.requested_role;
  if (email.length > 254 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) return null;
  if (!roles.has(role)) return null;
  const baseId = input.base_id ?? null;
  const majcomId = input.majcom_id ?? null;
  if (role === 'majcom_manager') {
    if (baseId !== null || typeof majcomId !== 'string' || !uuid.test(majcomId)) return null;
  } else if (majcomId !== null || typeof baseId !== 'string' || !uuid.test(baseId)) return null;
  if (input.justification != null && typeof input.justification !== 'string') return null;
  const justification = typeof input.justification === 'string' ? input.justification.trim() : '';
  if (justification.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(justification)) return null;
  return { email, display_name: displayName, requested_role: role, base_id: baseId, majcom_id: majcomId, justification: justification || null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'GET or POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return json({ error: 'Access requests are temporarily unavailable. Contact your RaPS administrator.' }, 503);

  try {
    const client = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    if (req.method === 'GET') {
      const [bases, majcoms] = await Promise.all([
        client.from('bases').select('id,code,name,majcom_id').eq('active', true).order('name'),
        client.from('majcoms').select('id,code,name').eq('active', true).order('code')
      ]);
      if (bases.error || majcoms.error) {
        console.error('access-catalog-failed', bases.error?.code || majcoms.error?.code || 'query-failed');
        return json({ error: 'Unable to load access options. Try again later.' }, 503);
      }
      const activeMajcoms = new Set((majcoms.data || []).map((row: { id: string }) => row.id));
      return json({
        bases: (bases.data || []).filter((row: { majcom_id: string }) => activeMajcoms.has(row.majcom_id))
          .map((row: { id: string; code: string | null; name: string; majcom_id: string }) => ({ id: row.id, code: row.code, name: row.name, majcom_id: row.majcom_id })),
        majcoms: (majcoms.data || []).map((row: { id: string; code: string; name: string }) => ({ id: row.id, code: row.code, name: row.name }))
      });
    }

    if ((req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'Send the access request as JSON.' }, 415);
    }
    const body = await readBody(req);
    if (body.status) return json({ error: body.status === 413 ? 'Access request is too large.' : 'Invalid JSON body.' }, body.status);
    const payload = validate(body.value);
    if (!payload) return json({ error: 'Enter a valid name, email, requested role, and matching organizational scope. Use at most 120 characters for your name and 2000 for your justification.' }, 400);
    const { error } = await client.rpc('submit_access_request', { p_request: payload });
    if (error) {
      if (error.code === '22023') return json({ error: 'The selected installation or MAJCOM is unavailable. Reload access options and try again.' }, 400);
      console.error('access-submit-failed', error.code || 'rpc-failed');
      return json({ error: 'Unable to submit your access request. Try again later or contact your RaPS administrator.' }, 503);
    }
    // The same response covers new requests, pending duplicates, and retries.
    return json({ ok: true, message: acceptedMessage }, 202);
  } catch {
    console.error('access-request-failed');
    return json({ error: 'Access requests are temporarily unavailable. Try again later.' }, 503);
  }
});
