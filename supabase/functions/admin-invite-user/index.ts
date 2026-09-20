import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') || '';

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } }
  });
  const adminClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const caller = authData?.user;
  if (authError || !caller) return json({ error: 'Unauthorized' }, 401);

  const { data: callerMemberships, error: membershipError } = await adminClient
    .from('memberships')
    .select('id, starts_at, ends_at')
    .eq('user_id', caller.id)
    .eq('role', 'enterprise_admin')
    .eq('active', true);

  const now = Date.now();
  const callerMembership = (callerMemberships || []).find((m: any) => {
    const starts = m.starts_at ? Date.parse(m.starts_at) : null;
    const ends = m.ends_at ? Date.parse(m.ends_at) : null;
    return !(Number.isFinite(starts) && starts > now)
      && !(Number.isFinite(ends) && ends <= now);
  });

  if (membershipError || !callerMembership) {
    return json({ error: 'Enterprise Admin access required' }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const email = String(body?.email || '').trim().toLowerCase();
  const displayName = String(body?.display_name || '').trim();
  const role = String(body?.role || '').trim();
  const baseId = body?.base_id || null;
  const majcomId = body?.majcom_id || null;

  const roles = new Set(['evaluator','program_manager','majcom_manager','enterprise_admin']);
  if (!email || !email.includes('@')) return json({ error: 'Valid email required' }, 400);
  if (!roles.has(role)) return json({ error: 'Invalid role' }, 400);

  if ((role === 'evaluator' || role === 'program_manager') && !baseId) {
    return json({ error: 'A base is required for this role' }, 400);
  }
  if (role === 'majcom_manager' && !majcomId) {
    return json({ error: 'A MAJCOM is required for this role' }, 400);
  }
  if (role === 'enterprise_admin' && (baseId || majcomId)) {
    return json({ error: 'Enterprise Admin must not be scoped to a base or MAJCOM' }, 400);
  }

  if (baseId) {
    const { data: base } = await adminClient.from('bases').select('id').eq('id', baseId).maybeSingle();
    if (!base) return json({ error: 'Base not found' }, 400);
  }
  if (majcomId) {
    const { data: majcom } = await adminClient.from('majcoms').select('id').eq('id', majcomId).maybeSingle();
    if (!majcom) return json({ error: 'MAJCOM not found' }, 400);
  }

  const siteUrl = Deno.env.get('RAPS_SITE_URL') || '';
  const redirectTo = siteUrl
    ? `${siteUrl}${siteUrl.includes('?') ? '&' : '?'}raps_activation=1`
    : undefined;

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName || email.split('@')[0] },
    redirectTo
  });

  if (inviteError || !inviteData?.user) {
    return json({ error: inviteError?.message || 'Unable to invite user' }, 400);
  }

  const userId = inviteData.user.id;

  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      display_name: displayName || email.split('@')[0],
      email
    })
    .eq('id', userId);

  if (profileError) {
    console.warn('Profile update warning', profileError.message);
  }

  const membership = {
    user_id: userId,
    role,
    base_id: (role === 'evaluator' || role === 'program_manager') ? baseId : null,
    majcom_id: role === 'majcom_manager' ? majcomId : null,
    active: true,
    starts_at: null,
    ends_at: null,
    created_by: caller.id
  };

  const { data: membershipData, error: insertError } = await adminClient
    .from('memberships')
    .insert(membership)
    .select('id, user_id, role, base_id, majcom_id, active')
    .single();

  if (insertError) {
    try { await adminClient.auth.admin.deleteUser(userId); } catch {}
    return json({
      error: 'The invitation could not be completed because the RaPS role was not assigned. No active account was retained.',
      detail: insertError.message
    }, 500);
  }

  return json({
    ok: true,
    user: { id: userId, email },
    membership: membershipData
  });
});
