import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function activeNow(m: any) {
  if (m?.active !== true) return false;
  const starts = m.starts_at == null ? null : typeof m.starts_at === 'string' ? Date.parse(m.starts_at) : NaN;
  const ends = m.ends_at == null ? null : typeof m.ends_at === 'string' ? Date.parse(m.ends_at) : NaN;
  if ((starts !== null && !Number.isFinite(starts)) || (ends !== null && !Number.isFinite(ends))) return false;
  return !(starts !== null && starts > Date.now()) && !(ends !== null && ends <= Date.now());
}

function validScope(m: any) {
  if (m.role === 'enterprise_admin') return m.base_id === null && m.majcom_id === null;
  if (m.role === 'evaluator' || m.role === 'program_manager') return typeof m.base_id === 'string' && uuid.test(m.base_id) && m.majcom_id === null;
  return m.role === 'majcom_manager' && m.base_id === null && typeof m.majcom_id === 'string' && uuid.test(m.majcom_id);
}

async function readBody(req: Request) {
  const maxBytes = 8192;
  if (Number(req.headers.get('Content-Length')) > maxBytes) return { status:413 };
  const reader = req.body?.getReader();
  if (!reader) return { status:400 };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); return { status:413 }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { value:JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes)) };
  } catch {
    return { status:400 };
  } finally {
    reader.releaseLock();
  }
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

async function managedActorUsable(admin: any, user: any, authorization: string) {
  if (user?.app_metadata?.raps_managed_login !== true) return true;
  try {
    const token = authorization.replace(/^Bearer\s+/i, '');
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.sub !== user.id || !Number.isSafeInteger(claims.iat) || claims.iat <= 0) return false;
    const { data, error } = await admin.rpc('raps_managed_status', { p_user_id:user.id, p_iat:claims.iat, p_session_id:uuid.test(claims.session_id || '') ? claims.session_id : null });
    return !error && data?.managed === true && data?.session_usable === true
      && user.app_metadata.raps_managed_credential_version === data.credential_version
      && claims.app_metadata?.raps_managed_login === true
      && claims.app_metadata.raps_managed_credential_version === data.credential_version;
  } catch { return false; }
}


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
    if (!await managedActorUsable(adminClient, caller, req.headers.get('Authorization') || '')) return json({ code:'INVITE_ADMIN', error:'Finish password setup and sign in again before administering accounts.' }, 403);
    const { data:callerMemberships, error:membershipError } = await adminClient.from('memberships')
      .select('id, role, base_id, majcom_id, active, starts_at, ends_at').eq('user_id', caller.id).eq('role', 'enterprise_admin').eq('active', true);
    if (membershipError || !(callerMemberships || []).some((m: any) => m.role === 'enterprise_admin' && activeNow(m) && validScope(m))) return json({ code:'INVITE_ADMIN', error:'Enterprise Admin access required' }, 403);
    const stillEnterprise = async () => {
      const { data, error } = await userClient.auth.getUser();
      if (error || data?.user?.id !== caller.id || !await managedActorUsable(adminClient, data.user, req.headers.get('Authorization') || '')) return false;
      const { data:memberships, error:readError } = await adminClient.from('memberships')
        .select('id, role, base_id, majcom_id, active, starts_at, ends_at').eq('user_id', caller.id).eq('role', 'enterprise_admin').eq('active', true);
      return !readError && (memberships || []).some((m: any) => m.role === 'enterprise_admin' && activeNow(m) && validScope(m));
    };
    const accessChanged = () => json({ code:'INVITE_ADMIN', error:'Your Enterprise Admin session or access changed. Sign in again before continuing.' }, 403);

    if ((req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return json({ code:'INVITE_BODY', error:'Send the account request as JSON.' }, 415);
    const parsed = await readBody(req);
    if (parsed.status) return json({ code:'INVITE_BODY', error:parsed.status === 413 ? 'Account request is too large.' : 'Invalid JSON body' }, parsed.status);
    // Reading a streamed body and earlier service calls may outlast a role or
    // token. Recheck before using the service credential for the next action.
    if (!await stillEnterprise()) return accessChanged();
    const body = parsed.value;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code:'INVITE_BODY', error:'A JSON object is required.' }, 400);
    const action = body.action === undefined ? 'invite' : body.action;
    if (!['invite', 'send_setup_link', 'verify_account_email'].includes(action)) return json({ code:'INVITE_ACTION', error:'Unsupported account action' }, 400);
    const fields = action === 'invite'
      ? new Set(['action', 'email', 'display_name', 'role', 'base_id', 'majcom_id'])
      : action === 'verify_account_email' ? new Set(['action', 'user_id', 'email']) : new Set(['action', 'user_id']);
    if (Object.keys(body).some(key => !fields.has(key))) return json({ code:'INVITE_BODY', error:'Unsupported account request fields.' }, 400);

    // Public profiles are editable display data, not proof of account identity.
    // Verify the proposed assignee against Auth before the UI grants access.
    if (action === 'verify_account_email') {
      const userId = typeof body.user_id === 'string' ? body.user_id.trim().toLowerCase() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!uuid.test(userId) || email.length > 254 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ code:'INVITE_BODY', error:'A valid account ID and email are required.' }, 400);
      const { data:targetData, error:targetError } = await adminClient.auth.admin.getUserById(userId);
      if (!await stillEnterprise()) return accessChanged();
      const target = targetData?.user;
      if (targetError || !target?.email) return json({ code:'INVITE_USER', error:'The account could not be verified.' }, 404);
      if (target.id?.toLowerCase() !== userId || target.email.trim().toLowerCase() !== email) return json({ code:'INVITE_IDENTITY', error:'The account email does not match its authentication record. Refresh the user list and verify the intended recipient before assigning access.' }, 409);
      return json({ ok:true, user:{ id:target.id, email:target.email.trim().toLowerCase() } });
    }
    const redirectTo = activationRedirect();
    if (!redirectTo) return json({ code:'INVITE_SITE_CONFIG', error:'Set RAPS_SITE_URL to the HTTPS RaPS application address before sending account emails.' }, 503);

    const audit = async (actionName: string, entityId: string, values: any, reason: string) => {
      const { error } = await adminClient.from('audit_log').insert({
        actor_user_id:caller.id, action:actionName, entity_type:'user_account', entity_id:entityId,
        new_value:{ ...values, source:'admin-invite-user' }, reason
      });
      return error;
    };

    const availableScope = async (baseId: string | null, majcomId: string | null) => {
      let parent = majcomId;
      if (baseId) {
        const { data:base, error } = await adminClient.from('bases').select('id, active, majcom_id')
          .eq('id', baseId).eq('active', true).maybeSingle();
        if (error) return { error:true, available:false };
        if (!base?.majcom_id) return { error:false, available:false };
        parent = base.majcom_id;
      }
      if (parent) {
        const { data:majcom, error } = await adminClient.from('majcoms').select('id, active')
          .eq('id', parent).eq('active', true).maybeSingle();
        if (error) return { error:true, available:false };
        if (!majcom) return { error:false, available:false };
      }
      return { error:false, available:true };
    };

    if (action === 'send_setup_link') {
      const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
      if (!uuid.test(userId)) return json({ code:'INVITE_USER', error:'A valid account ID is required.' }, 400);
      const { data:targetData, error:targetError } = await adminClient.auth.admin.getUserById(userId);
      const target = targetData?.user;
      if (targetError || !target?.email) return json({ code:'INVITE_USER', error:'The account could not be found.' }, 404);
      const { data:memberships, error:accessError } = await adminClient.from('memberships')
        .select('id, role, base_id, majcom_id, active, starts_at, ends_at').eq('user_id', userId).eq('active', true);
      if (accessError) return json({ code:'INVITE_TARGET_ACCESS', error:'Unable to verify approved account access.' }, 500);
      let approved = false;
      for (const membership of memberships || []) {
        if (!activeNow(membership) || !validScope(membership)) continue;
        const scope = await availableScope(membership.base_id, membership.majcom_id);
        if (scope.error) return json({ code:'INVITE_TARGET_ACCESS', error:'Unable to verify approved organizational access.' }, 500);
        if (scope.available) { approved = true; break; }
      }
      if (!approved) return json({ code:'INVITE_TARGET_ACCESS', error:'Assign active RaPS access before sending an account setup email.' }, 409);
      const beforeError = await audit('user_setup_email_requested', userId, { email:target.email }, 'Enterprise Admin requested a secure account setup/reset email');
      if (beforeError) return json({ code:'INVITE_AUDIT', error:'The required audit record could not be saved. No email was requested.' }, 500);
      if (!await stillEnterprise()) return accessChanged();
      const { error:sendError } = await adminClient.auth.resetPasswordForEmail(target.email, { redirectTo });
      if (sendError) {
        await audit('user_setup_email_failed', userId, { email:target.email }, 'Supabase rejected the account setup/reset email request');
        return json({ code:'INVITE_EMAIL_SEND', error:'The setup/reset email could not be requested. Check the authentication mail service and try again.', detail:sendError.message }, 502);
      }
      const afterError = await audit('user_setup_email_sent', userId, { email:target.email, delivery:'accepted' }, 'Supabase accepted the secure account setup/reset email request');
      if (afterError) return json({ code:'INVITE_AUDIT', email_sent:true, error:'Supabase accepted the setup/reset email, but its completion audit could not be saved. Check the audit service before sending again.' }, 500);
      return json({ ok:true, email_sent:true, delivery:'accepted', user:{ id:userId, email:target.email } });
    }

    if (typeof body.email !== 'string' || typeof body.role !== 'string' || (body.display_name != null && typeof body.display_name !== 'string')) return json({ code:'INVITE_BODY', error:'Account email, name, and role must be text.' }, 400);
    const email = body.email.trim().toLowerCase();
    const displayName = (body.display_name || '').trim();
    const role = body.role.trim();
    const baseId = body?.base_id ?? null;
    const majcomId = body?.majcom_id ?? null;
    const roles = new Set(['evaluator','program_manager','majcom_manager','enterprise_admin']);
    if (email.length > 254 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ code:'INVITE_EMAIL', error:'A valid email address is required.' }, 400);
    if (displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) return json({ code:'INVITE_NAME', error:'Display name must be 120 characters or fewer without control characters.' }, 400);
    if (!roles.has(role)) return json({ code:'INVITE_ROLE', error:'Invalid role' }, 400);
    if ((role === 'evaluator' || role === 'program_manager') && (!baseId || majcomId)) return json({ code:'INVITE_SCOPE', error:'This role requires one base and no MAJCOM scope.' }, 400);
    if (role === 'majcom_manager' && (!majcomId || baseId)) return json({ code:'INVITE_SCOPE', error:'MAJCOM Manager requires one MAJCOM and no base scope.' }, 400);
    if (role === 'enterprise_admin' && (baseId || majcomId)) return json({ code:'INVITE_SCOPE', error:'Enterprise Admin must not have a base or MAJCOM scope.' }, 400);
    if ((baseId !== null && (typeof baseId !== 'string' || !uuid.test(baseId)))
      || (majcomId !== null && (typeof majcomId !== 'string' || !uuid.test(majcomId)))) return json({ code:'INVITE_SCOPE', error:'Invalid organizational scope.' }, 400);
    const scope = await availableScope(baseId, majcomId);
    if (scope.error) return json({ code:'INVITE_SCOPE', error:'Unable to verify the organizational scope.' }, 500);
    if (!scope.available) return json({ code:'INVITE_SCOPE', error:'The selected installation or MAJCOM is unavailable.' }, 400);

    const existingMessage = 'This account already exists. Use Assign Access to Existing Account if needed, then Send Setup / Reset Email. The user can also select Forgot password on Sign In.';
    const { data:existingProfiles, error:profileLookupError } = await adminClient.from('profiles')
      .select('id').ilike('email', email.replace(/[\\%_]/g, '\\$&')).limit(1);
    if (profileLookupError) return json({ code:'INVITE_LOOKUP', error:'Unable to verify whether this account already exists. No email was requested.' }, 500);
    if (existingProfiles?.length) return json({ code:'INVITE_EXISTING_ACCOUNT', error:existingMessage }, 409);

    const requestId = crypto.randomUUID();
    const beforeError = await audit('user_invite_requested', requestId, { email, role, base_id:baseId, majcom_id:majcomId }, 'Enterprise Admin requested an invitation and initial RaPS role assignment');
    if (beforeError) return json({ code:'INVITE_AUDIT', error:'The required audit record could not be saved. No invitation was requested.' }, 500);
    if (!await stillEnterprise()) return accessChanged();
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
