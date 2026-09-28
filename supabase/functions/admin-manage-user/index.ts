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
  if (authError || !caller) {
    return json({ code:'ADMIN_AUTH', error:'Unauthorized' }, 401);
  }

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
    return json({ code:'ADMIN_ACCESS', error:'Enterprise Admin access required' }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ code:'ADMIN_BODY', error:'Invalid JSON body' }, 400); }

  const action = String(body?.action || '').trim();
  const userId = String(body?.user_id || '').trim();

  if (action !== 'delete_account') {
    return json({ code:'ADMIN_ACTION', error:'Unsupported administrative action' }, 400);
  }
  if (!userId) {
    return json({ code:'ADMIN_USER', error:'User ID required' }, 400);
  }
  if (userId === caller.id) {
    return json({ code:'ADMIN_SELF_DELETE', error:'You cannot delete the account you are currently signed in with.' }, 400);
  }

  const { data: targetUserData, error: targetUserError } = await adminClient.auth.admin.getUserById(userId);
  if (targetUserError || !targetUserData?.user) {
    return json({ code:'ADMIN_USER_NOT_FOUND', error:'Supabase account not found.' }, 404);
  }

  const { data: activeMemberships, error: activeMembershipError } = await adminClient
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .limit(1);
  if (activeMembershipError) {
    return json({ code:'ADMIN_CHECK', error:'Unable to verify account access state.', detail:activeMembershipError.message }, 500);
  }
  if ((activeMemberships || []).length) {
    return json({
      code:'ADMIN_DELETE_ACTIVE',
      error:'Deactivate all of this user’s RaPS memberships before deleting the account.'
    }, 409);
  }

  const historyChecks = [
    { table:'evaluations', column:'evaluator_id', label:'evaluation records' },
    { table:'classes', column:'created_by', label:'classes' },
    { table:'evaluation_events', column:'created_by', label:'evaluation events' },
    { table:'participants', column:'created_by', label:'participant records' }
  ];

  const historyFound: string[] = [];
  for (const check of historyChecks) {
    const { data, error } = await adminClient
      .from(check.table)
      .select('id')
      .eq(check.column, userId)
      .limit(1);
    if (error) {
      console.error('admin-delete-history-check-failed', check.table, error.message);
      return json({
        code:'ADMIN_HISTORY_CHECK',
        error:'Unable to safely verify whether this account has operational history.',
        detail:`${check.table}: ${error.message}`
      }, 500);
    }
    if ((data || []).length) historyFound.push(check.label);
  }

  if (historyFound.length) {
    return json({
      code:'ADMIN_DELETE_HISTORY',
      error:'This account has RaPS operational history and cannot be permanently deleted. Keep it deactivated so historical attribution is preserved.',
      detail:`History found: ${historyFound.join(', ')}`
    }, 409);
  }

  const { data: membershipHistory, error: membershipHistoryError } = await adminClient
    .from('memberships')
    .select('id, role, base_id, majcom_id, active, starts_at, ends_at')
    .eq('user_id', userId);

  if (membershipHistoryError) {
    return json({
      code:'ADMIN_MEMBERSHIP_HISTORY',
      error:'Unable to capture membership provenance before account deletion.',
      detail:membershipHistoryError.message
    }, 500);
  }

  const auditBase = {
    actor_user_id: caller.id,
    entity_type: 'user_account',
    entity_id: userId,
    old_value: {
      email: targetUserData.user.email || null,
      memberships: membershipHistory || [],
      source: 'admin-manage-user'
    }
  };

  const { error: deleteRequestAuditError } = await adminClient
    .from('audit_log')
    .insert({
      ...auditBase,
      action:'user_account_delete_requested',
      reason:'Enterprise Admin authorized permanent deletion after access and operational-history checks'
    });

  if (deleteRequestAuditError) {
    console.error('admin-delete-audit-request-failed', deleteRequestAuditError.message);
    return json({
      code:'ADMIN_AUDIT_REQUIRED',
      error:'Account deletion was blocked because the required audit record could not be written.',
      detail:deleteRequestAuditError.message
    }, 500);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('admin-delete-user-failed', deleteError.message);

    const { error: failureAuditError } = await adminClient
      .from('audit_log')
      .insert({
        actor_user_id:caller.id,
        action:'user_account_delete_failed',
        entity_type:'user_account',
        entity_id:userId,
        old_value:auditBase.old_value,
        new_value:{ deleted:false, source:'admin-manage-user' },
        reason:deleteError.message
      });

    if (failureAuditError) {
      console.error('admin-delete-failure-audit-failed', failureAuditError.message);
    }

    return json({
      code:'ADMIN_DELETE_FAILED',
      error:'Supabase could not permanently delete this account.',
      detail:deleteError.message
    }, 500);
  }

  const { error: completionAuditError } = await adminClient
    .from('audit_log')
    .insert({
      actor_user_id:caller.id,
      action:'user_account_deleted',
      entity_type:'user_account',
      entity_id:userId,
      old_value:auditBase.old_value,
      new_value:{ deleted:true, source:'admin-manage-user' },
      reason:'Enterprise Admin permanent account deletion completed'
    });

  if (completionAuditError) {
    console.error('admin-delete-completion-audit-failed', completionAuditError.message);
  }

  return json({
    ok:true,
    deleted_user_id:userId,
    email:targetUserData.user.email || null,
    audit_warning:completionAuditError ? 'Account deleted, but the completion audit event could not be written.' : null
  });
});
