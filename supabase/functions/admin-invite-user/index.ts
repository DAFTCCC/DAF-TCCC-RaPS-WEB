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

function activeNow(m: any) {
  if (!m?.active) return false;
  const starts = m.starts_at ? Date.parse(m.starts_at) : null;
  const ends = m.ends_at ? Date.parse(m.ends_at) : null;
  if ((m.starts_at && !Number.isFinite(starts)) || (m.ends_at && !Number.isFinite(ends))) return false;
  return !(starts !== null && starts > Date.now()) && !(ends !== null && ends <= Date.now());
}

function activationRedirect() {
  try {
    const site = new URL(Deno.env.get('RAPS_SITE_URL') || '');
    if (site.protocol !== 'https:' || site.username || site.password || !site.hostname) return null;
    site.hash = '';
    site.searchParams.set('raps_activation', '1');
    return site.toString();
  } catch {
    return null;
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers:corsHeaders });
  if (req.method !== 'POST') return json({ error:'POST required' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ code:'INVITE_CONFIG', error:'Account email service is not configured. Contact the application administrator.' }, 503);

  try {
    const userClient = createClient(url, anon, { global:{ headers:{ Authorization:req.headers.get('Authorization') || '' } } });
    const adminClient = createClient(url, service, { auth:{ persistSession:false, autoRefreshToken:false } });
    const { data:authData, error:authError } = await userClient.auth.getUser();
    const caller = authData?.user;
    if (authError || !caller) return json({ code:'INVITE_AUTH', error:'Unauthorized' }, 401);
    const { data:callerMemberships, error:membershipError } = await adminClient.from('memberships')
      .select('id, active, starts_at, ends_at').eq('user_id', caller.id).eq('role', 'enterprise_admin').eq('active', true);
    if (membershipError || !(callerMemberships || []).some(activeNow)) return json({ code:'INVITE_ADMIN', error:'Enterprise Admin access required' }, 403);

    let body: any;
    try { body = await req.json(); } catch { return json({ code:'INVITE_BODY', error:'Invalid JSON body' }, 400); }
    const action = body?.action || 'invite';
    if (!['invite', 'send_setup_link'].includes(action)) return json({ code:'INVITE_ACTION', error:'Unsupported account action' }, 400);
    const redirectTo = activationRedirect();
    if (!redirectTo) return json({ code:'INVITE_SITE_CONFIG', error:'Set RAPS_SITE_URL to the HTTPS RaPS application address before sending account emails.' }, 503);

    const audit = async (actionName: string, entityId: string, values: any, reason: string) => {
      const { error } = await adminClient.from('audit_log').insert({
        actor_user_id:caller.id, action:actionName, entity_type:'user_account', entity_id:entityId,
        new_value:{ ...values, source:'admin-invite-user' }, reason
      });
      return error;
    };

    if (action === 'send_setup_link') {
      const userId = String(body?.user_id || '').trim();
      if (!uuid.test(userId)) return json({ code:'INVITE_USER', error:'A valid account ID is required.' }, 400);
      const { data:targetData, error:targetError } = await adminClient.auth.admin.getUserById(userId);
      const target = targetData?.user;
      if (targetError || !target?.email) return json({ code:'INVITE_USER', error:'The account could not be found.' }, 404);
      const { data:memberships, error:accessError } = await adminClient.from('memberships')
        .select('id, active, starts_at, ends_at').eq('user_id', userId).eq('active', true);
      if (accessError) return json({ code:'INVITE_TARGET_ACCESS', error:'Unable to verify approved account access.' }, 500);
      if (!(memberships || []).some(activeNow)) return json({ code:'INVITE_TARGET_ACCESS', error:'Assign active RaPS access before sending an account setup email.' }, 409);
      const beforeError = await audit('user_setup_email_requested', userId, { email:target.email }, 'Enterprise Admin requested a secure account setup/reset email');
      if (beforeError) return json({ code:'INVITE_AUDIT', error:'The required audit record could not be saved. No email was requested.' }, 500);
      const { error:sendError } = await adminClient.auth.resetPasswordForEmail(target.email, { redirectTo });
      if (sendError) {
        await audit('user_setup_email_failed', userId, { email:target.email }, 'Supabase rejected the account setup/reset email request');
        return json({ code:'INVITE_EMAIL_SEND', error:'The setup/reset email could not be requested. Check the authentication mail service and try again.', detail:sendError.message }, 502);
      }
      const afterError = await audit('user_setup_email_sent', userId, { email:target.email, delivery:'accepted' }, 'Supabase accepted the secure account setup/reset email request');
      if (afterError) return json({ code:'INVITE_AUDIT', email_sent:true, error:'Supabase accepted the setup/reset email, but its completion audit could not be saved. Check the audit service before sending again.' }, 500);
      return json({ ok:true, email_sent:true, delivery:'accepted', user:{ id:userId, email:target.email } });
    }

    const email = String(body?.email || '').trim().toLowerCase();
    const displayName = String(body?.display_name || '').trim();
    const role = String(body?.role || '').trim();
    const baseId = body?.base_id ?? null;
    const majcomId = body?.majcom_id ?? null;
    const roles = new Set(['evaluator','program_manager','majcom_manager','enterprise_admin']);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ code:'INVITE_EMAIL', error:'A valid email address is required.' }, 400);
    if (displayName.length > 120) return json({ code:'INVITE_NAME', error:'Display name must be 120 characters or fewer.' }, 400);
    if (!roles.has(role)) return json({ code:'INVITE_ROLE', error:'Invalid role' }, 400);
    if ((role === 'evaluator' || role === 'program_manager') && (!baseId || majcomId)) return json({ code:'INVITE_SCOPE', error:'This role requires one base and no MAJCOM scope.' }, 400);
    if (role === 'majcom_manager' && (!majcomId || baseId)) return json({ code:'INVITE_SCOPE', error:'MAJCOM Manager requires one MAJCOM and no base scope.' }, 400);
    if (role === 'enterprise_admin' && (baseId || majcomId)) return json({ code:'INVITE_SCOPE', error:'Enterprise Admin must not have a base or MAJCOM scope.' }, 400);
    if ((baseId !== null && (typeof baseId !== 'string' || !uuid.test(baseId)))
      || (majcomId !== null && (typeof majcomId !== 'string' || !uuid.test(majcomId)))) return json({ code:'INVITE_SCOPE', error:'Invalid organizational scope.' }, 400);
    let scopeMajcomId = majcomId;
    if (baseId) {
      const { data:base, error } = await adminClient.from('bases').select('id, active, majcom_id')
        .eq('id', baseId).eq('active', true).maybeSingle();
      if (error) return json({ code:'INVITE_SCOPE', error:'Unable to verify the installation scope.' }, 500);
      if (!base?.majcom_id) return json({ code:'INVITE_SCOPE', error:'The selected installation or its MAJCOM is unavailable.' }, 400);
      scopeMajcomId = base.majcom_id;
    }
    if (scopeMajcomId) {
      const { data:majcom, error } = await adminClient.from('majcoms').select('id, active')
        .eq('id', scopeMajcomId).eq('active', true).maybeSingle();
      if (error) return json({ code:'INVITE_SCOPE', error:'Unable to verify the MAJCOM scope.' }, 500);
      if (!majcom) return json({ code:'INVITE_SCOPE', error:'The selected MAJCOM is unavailable.' }, 400);
    }

    const existingMessage = 'This account already exists. Use Assign Access to Existing Account if needed, then Send Setup / Reset Email. The user can also select Forgot password on Sign In.';
    const { data:existingProfiles, error:profileLookupError } = await adminClient.from('profiles')
      .select('id').ilike('email', email.replace(/[\\%_]/g, '\\$&')).limit(1);
    if (profileLookupError) return json({ code:'INVITE_LOOKUP', error:'Unable to verify whether this account already exists. No email was requested.' }, 500);
    if (existingProfiles?.length) return json({ code:'INVITE_EXISTING_ACCOUNT', error:existingMessage }, 409);

    const requestId = crypto.randomUUID();
    const beforeError = await audit('user_invite_requested', requestId, { email, role, base_id:baseId, majcom_id:majcomId }, 'Enterprise Admin requested an invitation and initial RaPS role assignment');
    if (beforeError) return json({ code:'INVITE_AUDIT', error:'The required audit record could not be saved. No invitation was requested.' }, 500);
    const { data:inviteData, error:inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data:{ display_name:displayName || email.split('@')[0] }, redirectTo
    });
    if (inviteError || !inviteData?.user) {
      await audit('user_invite_failed', requestId, { email }, 'Supabase did not complete the invitation request');
      if (inviteError?.code === 'email_exists' || inviteError?.code === 'user_already_exists' || /already.*(registered|exists)/i.test(inviteError?.message || '')) return json({ code:'INVITE_EXISTING_ACCOUNT', error:existingMessage }, 409);
      return json({ code:'INVITE_EMAIL_SEND', error:'The invitation could not be requested. Check the authentication mail service and try again.', detail:inviteError?.message }, 502);
    }

    const userId = inviteData.user.id;
    const { error:profileError } = await adminClient.from('profiles').update({ display_name:displayName || email.split('@')[0], email }).eq('id', userId);
    const membership = {
      user_id:userId, role, base_id:baseId, majcom_id:majcomId, active:true,
      starts_at:new Date().toISOString(), ends_at:null, created_by:caller.id
    };
    // Preserve the caller's RLS identity and its role-assignment audit provenance.
    const { data:membershipData, error:insertError } = await userClient.from('memberships')
      .insert(membership).select('id, user_id, role, base_id, majcom_id, active').single();
    if (insertError || !membershipData?.id) {
      await audit('user_invite_access_failed', userId, { email, request_id:requestId, email_sent:true }, 'Invitation email accepted, but initial RaPS access was not assigned');
      return json({ code:'INVITE_MEMBERSHIP', email_sent:true, membership_assigned:false,
        error:'Supabase accepted the invitation email, but RaPS access was not assigned. The account was retained. Use Assign Access to Existing Account to complete setup.', detail:insertError?.message }, 500);
    }
    const afterError = await audit('user_invited', userId, {
      email, display_name:displayName || email.split('@')[0], membership:membershipData,
      request_id:requestId, delivery:'accepted'
    }, 'Supabase accepted the invitation and initial RaPS role assignment completed');
    if (afterError) {
      // Never delete an auth user: it may be a prior invitation. Only remove
      // the exact membership created here, and verify that cleanup succeeded.
      const { data:removed, error:cleanupError } = await userClient.from('memberships').delete().eq('id', membershipData.id).select('id');
      const rolledBack = !cleanupError && (removed || []).some((m: any) => m.id === membershipData.id);
      return json({ code:'INVITE_AUDIT', email_sent:true, membership_assigned:!rolledBack,
        error:rolledBack
          ? 'The invitation email was accepted, but its completion audit failed. The new RaPS membership was removed; the account was retained. Repair the audit service before assigning access.'
          : 'The invitation email was accepted, but its completion audit and membership cleanup could not be verified. The account was retained and may still have access. Review this account before retrying.' }, 500);
    }
    return json({ ok:true, email_sent:true, delivery:'accepted', user:{ id:userId, email }, membership:membershipData,
      ...(profileError ? { warning:'The invitation and access succeeded, but the display name could not be updated.' } : {}) });
  } catch (error) {
    console.error('invite-request-failed', error instanceof Error ? error.message : 'Unexpected service error');
    return json({ code:'INVITE_SERVICE', error:'Account service could not complete the request. Refresh the user list and review account access before retrying.' }, 500);
  }
});
