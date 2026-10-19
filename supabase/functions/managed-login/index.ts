import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Username accounts are provisioned by Enterprise. Their internal Auth email is
// never a recovery address or a public username-resolution service.
const headers = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json', 'Cache-Control':'no-store'
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const roles = new Set(['enterprise_admin','majcom_manager','program_manager','evaluator']);
const actions = new Map([
  ['sign_in',['action','username','password']], ['status',['action']], ['list_users',['action','offset','limit']],
  ['create_user',['action','username','display_name','role','base_id','majcom_id']],
  ['reset_password',['action','user_id']], ['complete_password',['action','current_password','new_password']]
]);
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers }); }
function fail(code: string, error: string, status: number) { return json({ code, error }, status); }
function internalEmail(username: string) { return `${username}@login.raps.invalid`; }
function canonical(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function activeEnterprise(m: any) {
  const now = Date.now();
  const start = m.starts_at == null ? null : Date.parse(m.starts_at);
  const end = m.ends_at == null ? null : Date.parse(m.ends_at);
  return m.role === 'enterprise_admin' && m.active === true && m.base_id === null && m.majcom_id === null
    && (start === null || (Number.isFinite(start) && start <= now))
    && (end === null || (Number.isFinite(end) && end > now));
}
async function readBody(req: Request) {
  if (Number(req.headers.get('Content-Length')) > 8192) return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8',{ fatal:true }).decode(bytes));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; } finally { reader.releaseLock(); }
}
function tokenClaims(token: string, id: string) {
  try {
    const part = token.split('.')[1];
    const claims = JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
    return claims.sub === id && Number.isSafeInteger(claims.iat) && claims.iat > 0 ? claims : null;
  } catch { return null; }
}
function matchingCredential(user: any, claims: any, status: any) {
  return status?.managed === true && uuid.test(status.credential_version || '') && uuid.test(claims?.session_id || '')
    && user?.app_metadata?.raps_managed_login === true
    && user.app_metadata.raps_managed_credential_version === status.credential_version
    && claims?.app_metadata?.raps_managed_login === true
    && claims.app_metadata.raps_managed_credential_version === status.credential_version;
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
}
function hex(bytes: Uint8Array) { return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(''); }
async function permanentVerifier(password: string, salt: string) {
  if (!/^[a-f0-9]{32}$/.test(salt)) return null;
  const bytes = Uint8Array.from(salt.match(/../g) || [],n=>parseInt(n,16));
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2',hash:'SHA-256',salt:bytes,iterations:600000 },key,256)));
}
function equalDigest(left: string | null, right: string) {
  if (!left || typeof right !== 'string' || left.length !== right.length) return false;
  let difference=0; for(let i=0;i<left.length;i++) difference|=left.charCodeAt(i)^right.charCodeAt(i);
  return difference===0;
}
async function trustedPassword(password: string, status: any) {
  return status.state === 'active'
    ? equalDigest(await permanentVerifier(password,status.password_salt || ''),status.password_verifier)
    : equalDigest(await digest(password),status.temporary_password_digest);
}
function temporaryPassword() {
  // 192 random bits, plus each common provider-required character category.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'Aa1!' + btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function publicStatus(status: any) {
  return {
    managed:status.managed === true, username:status.username || null,
    password_change_required:status.password_change_required === true,
    temporary_expires_at:status.temporary_expires_at || null,
    session_usable:status.session_usable === true
  };
}
function setupExpired(status: any) {
  return status.password_change_required === true && status.temporary_expires_at
    && Date.parse(status.temporary_expires_at) <= Date.now();
}
const invalidLogin = () => fail('MANAGED_AUTH','The username or password is incorrect.',401);
const expired = () => fail('MANAGED_TEMP_EXPIRED','This temporary password has expired. Ask an Enterprise Administrator for a new temporary password.',403);
const unavailable = () => fail('MANAGED_SERVICE','The account service could not finish. Refresh accounts before retrying; contact an Enterprise Administrator if password setup is blocked.',503);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok',{ headers });
  if (req.method !== 'POST') return fail('MANAGED_METHOD','POST required.',405);
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return unavailable();
  if ((req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return fail('MANAGED_BODY','Send this request as JSON.',415);
  const body = await readBody(req);
  const fields = body && actions.get(body.action);
  if (!fields || Object.keys(body).some(key => !fields.includes(key))) return fail('MANAGED_BODY','Unsupported account request.',400);
  const admin = createClient(url,service,{ auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false } });
  const passwordClient = () => createClient(url,anon,{ auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false } });
  const call = async (name: string, args: any) => {
    const { data, error } = await admin.rpc(name,args);
    if (error) {
      const failure: any = new Error('Managed account operation rejected'); failure.code = error.code; throw failure;
    }
    return data;
  };
  const limit = async (key: string, count = 20) => {
    const result = await call('raps_managed_rate_limit',{ p_key:await digest(key),p_limit:count });
    return result === true || result?.allowed === true;
  };
  try {
    if (body.action === 'sign_in') {
      const username = canonical(body.username);
      if (!usernamePattern.test(username) || typeof body.password !== 'string' || !body.password || body.password.length > 1024) return invalidLogin();
      if (!await limit('managed-login:global',300) || !await limit('managed-login:username:' + username)) return fail('MANAGED_RATE','Too many sign-in attempts. Wait before trying again.',429);
      const record = await call('raps_managed_lookup',{ p_username:username });
      // Always ask Auth to verify a password, including unknown usernames. This
      // avoids turning this endpoint into an unauthenticated email resolver.
      const { data, error } = await passwordClient().auth.signInWithPassword({ email:internalEmail(username),password:body.password });
      if (error || !record?.user_id || data?.user?.id !== record.user_id || !data?.session?.access_token || !data?.session?.refresh_token
        || data.user.app_metadata?.raps_managed_login !== true) return invalidLogin();
      const claims = tokenClaims(data.session.access_token,record.user_id);
      const iat = claims?.iat;
      if (!iat) return invalidLogin();
      let status = await call('raps_managed_status',{ p_user_id:record.user_id,p_iat:iat,p_session_id:uuid.test(claims?.session_id || '') ? claims.session_id : null });
      if (!matchingCredential(data.user,claims,status) || status.username !== username) return invalidLogin();
      if (!await trustedPassword(body.password,status)) return invalidLogin();
      if (setupExpired(status)) return expired();
      if (!['pending','active'].includes(status.state)) return fail('MANAGED_BUSY','Password setup is already in progress. Wait and ask an Enterprise Administrator if it remains blocked.',409);
      if (status.state==='active') {
        await call('raps_managed_register_session',{ p_user_id:record.user_id,p_iat:iat,p_session_id:claims.session_id,p_version:status.credential_version });
        status = await call('raps_managed_status',{ p_user_id:record.user_id,p_iat:iat,p_session_id:claims.session_id });
      }
      if (!status.session_usable && !status.password_change_required) return fail('MANAGED_SETUP_REQUIRED','Sign in again with your new password.',403);
      return json({ ok:true,session:{ access_token:data.session.access_token,refresh_token:data.session.refresh_token },
        user:{ id:record.user_id,username },password_change_required:status.password_change_required === true,temporary_expires_at:status.temporary_expires_at || null });
    }

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i,'');
    if (!token) return fail('MANAGED_AUTH','Sign in to continue.',401);
    const callerClient = createClient(url,anon,{ global:{ headers:{ Authorization:`Bearer ${token}` } },auth:{ persistSession:false,autoRefreshToken:false } });
    const { data:authData,error:authError } = await callerClient.auth.getUser();
    const caller = authData?.user;
    if (authError || !caller?.id) return fail('MANAGED_AUTH','Sign in to continue.',401);
    const claims = tokenClaims(token,caller.id);
    const iat = claims?.iat;
    if (!iat) return fail('MANAGED_AUTH','Sign in to continue.',401);
    const sessionId=uuid.test(claims?.session_id || '') ? claims.session_id : null;
    const status = await call('raps_managed_status',{ p_user_id:caller.id,p_iat:iat,p_session_id:sessionId });
    if ((caller.app_metadata?.raps_managed_login === true || status?.managed === true) && !matchingCredential(caller,claims,status)) return fail('MANAGED_SETUP_REQUIRED','Account setup is incomplete. Contact an Enterprise Administrator.',403);
    if (body.action === 'status') return json({ ok:true,...publicStatus(status) });

    if (body.action === 'complete_password') {
      if (!status?.managed || caller.app_metadata?.raps_managed_login !== true) return fail('MANAGED_ACCOUNT','This action is available for username accounts only.',400);
      if (setupExpired(status)) return expired();
      if (!['pending','active'].includes(status.state) || (!status.password_change_required && !status.session_usable)) return fail('MANAGED_BUSY','Password setup is already in progress or this session has expired. Contact an Enterprise Administrator if it remains blocked.',409);
      if (typeof body.current_password !== 'string' || !body.current_password || body.current_password.length > 1024
        || typeof body.new_password !== 'string' || Array.from(body.new_password).length < 12 || new TextEncoder().encode(body.new_password).length > 72
        || body.new_password === body.current_password || await digest(body.new_password) === status.temporary_password_digest) return fail('MANAGED_PASSWORD','Choose a different password with at least 12 characters and at most 72 UTF-8 bytes. Do not reuse the temporary password.',400);
      if (!await limit('managed-login:change:' + caller.id)) return fail('MANAGED_RATE','Too many password attempts. Wait before trying again.',429);
      const { data:proof,error:proofError } = await passwordClient().auth.signInWithPassword({ email:internalEmail(status.username),password:body.current_password });
      if (proofError || proof?.user?.id !== caller.id || !proof?.session?.access_token || !await trustedPassword(body.current_password,status)) return fail('MANAGED_AUTH','The current password is incorrect.',401);
      // SQL reserves this exact credential version. Concurrent reset/change
      // requests cannot mutate Auth after a competing operation has activated.
      const passwordSalt=hex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordVerifier=await permanentVerifier(body.new_password,passwordSalt);
      await call('raps_managed_begin_complete',{ p_user_id:caller.id,p_iat:iat,p_version:status.credential_version });
      const { error:changeError } = await admin.auth.admin.updateUserById(caller.id,{ password:body.new_password,app_metadata:{ raps_managed_login:true,raps_managed_credential_version:status.credential_version } });
      if (changeError) return unavailable();
      const { data:fresh,error:freshError } = await passwordClient().auth.signInWithPassword({ email:internalEmail(status.username),password:body.new_password });
      if (freshError || fresh?.user?.id !== caller.id || !fresh?.session?.access_token) return unavailable();
      const { error:revokeError } = await admin.auth.admin.signOut(fresh.session.access_token,'global');
      if (revokeError) return unavailable();
      const complete = await call('raps_managed_finish_complete',{ p_user_id:caller.id,p_version:status.credential_version,p_salt:passwordSalt,p_verifier:passwordVerifier });
      if (!Number.isSafeInteger(complete?.not_before)) return unavailable();
      return json({ ok:true,sign_in_required:true,not_before:complete.not_before });
    }

    const enterprise = async () => {
      const { data:current,error } = await callerClient.auth.getUser();
      if (error || current?.user?.id !== caller.id) return false;
      const currentStatus = await call('raps_managed_status',{ p_user_id:caller.id,p_iat:iat,p_session_id:sessionId });
      if (!currentStatus?.session_usable || ((current.user.app_metadata?.raps_managed_login === true || currentStatus.managed) && !matchingCredential(current.user,claims,currentStatus))) return false;
      const { data:memberships,error:membershipError } = await admin.from('memberships').select('role,active,base_id,majcom_id,starts_at,ends_at')
        .eq('user_id',caller.id).eq('role','enterprise_admin').eq('active',true);
      return !membershipError && (memberships || []).some(activeEnterprise);
    };
    if (!await enterprise()) return fail('MANAGED_ADMIN','Current Enterprise Administrator access is required.',403);
    const actor = { p_actor_id:caller.id,p_actor_iat:iat };
    if (body.action === 'list_users') {
      const offset = body.offset ?? 0; const pageSize = body.limit ?? 500;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500) return fail('MANAGED_BODY','Invalid account page.',400);
      const result = await call('raps_managed_list',{ ...actor,p_offset:offset,p_limit:pageSize });
      return json({ ok:true,next_offset:result?.next_offset ?? null,users:(result?.users || []).map((u: any) => ({
        id:u.id,username:u.username,password_change_required:u.password_change_required === true,temporary_expires_at:u.temporary_expires_at || null
      })) });
    }

    const password = temporaryPassword(); const passwordDigest = await digest(password);
    let record: any; let userId: string; let username: string;
    if (body.action === 'create_user') {
      username = canonical(body.username);
      const display = typeof body.display_name === 'string' ? body.display_name.trim() : '';
      const role = body.role; const baseId = body.base_id ?? null; const majcomId = body.majcom_id ?? null;
      if (!usernamePattern.test(username) || !display || display.length > 120 || /[\u0000-\u001f\u007f]/.test(display) || !roles.has(role)
        || (baseId !== null && (typeof baseId !== 'string' || !uuid.test(baseId))) || (majcomId !== null && (typeof majcomId !== 'string' || !uuid.test(majcomId)))
        || (role === 'enterprise_admin' && (baseId || majcomId)) || (role === 'majcom_manager' && (!majcomId || baseId))
        || (['program_manager','evaluator'].includes(role) && (!baseId || majcomId))) return fail('MANAGED_BODY','Enter a valid username, display name, role, and matching organizational scope.',400);
      const existing = await call('raps_managed_lookup',{ p_username:username });
      if (existing?.user_id) return fail('MANAGED_EXISTS','That username is already in use.',409);
      if (!await enterprise()) return fail('MANAGED_ADMIN','Your Enterprise Administrator access changed.',403);
      const { data:created,error:createError } = await admin.auth.admin.createUser({
        email:internalEmail(username),password,email_confirm:true,ban_duration:'876000h',
        app_metadata:{ raps_managed_login:true },user_metadata:{ display_name:display }
      });
      if (createError || !created?.user?.id) return fail('MANAGED_CREATE','The username account could not be created. It may already exist; refresh accounts before retrying.',409);
      userId = created.user.id;
      // Only a new Auth identity is registered. Failures retain its initial ban;
      // existing email users are never overwritten, adopted, or deleted here.
      record = await call('raps_managed_create',{ ...actor,p_user_id:userId,p_username:username,p_email:internalEmail(username),
        p_digest:passwordDigest,p_display_name:display,p_role:role,p_base_id:baseId,p_majcom_id:majcomId });
      if (!await enterprise()) return fail('MANAGED_ADMIN','Your Enterprise Administrator access changed. The new account remains blocked.',403);
      const { error:unbanError } = await admin.auth.admin.updateUserById(userId,{ ban_duration:'none',app_metadata:{ raps_managed_login:true,raps_managed_credential_version:record.credential_version } });
      if (unbanError) return unavailable();
    } else {
      userId = typeof body.user_id === 'string' ? body.user_id.toLowerCase() : '';
      if (!uuid.test(userId) || userId === caller.id) return fail('MANAGED_TARGET','Select another managed username account.',400);
      const target = await call('raps_managed_status',{ p_user_id:userId,p_iat:0 });
      if (!target?.managed || !usernamePattern.test(target.username || '')) return fail('MANAGED_TARGET','Only managed username accounts can receive a temporary password.',400);
      username = target.username;
      const { data:targetAuth,error:targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || targetAuth?.user?.id !== userId || targetAuth.user.email !== internalEmail(username) || targetAuth.user.app_metadata?.raps_managed_login !== true) return fail('MANAGED_TARGET','The account identity could not be verified.',409);
      record = await call('raps_managed_begin_reset',{ ...actor,p_user_id:userId,p_digest:passwordDigest });
      if (!await enterprise()) return fail('MANAGED_ADMIN','Your Enterprise Administrator access changed. The account remains blocked.',403);
      const { error:resetError } = await admin.auth.admin.updateUserById(userId,{ password,ban_duration:'none',app_metadata:{ raps_managed_login:true,raps_managed_credential_version:record.credential_version } });
      if (resetError) return unavailable();
      const { data:resetSession,error:resetSignInError } = await passwordClient().auth.signInWithPassword({ email:internalEmail(username),password });
      if (resetSignInError || resetSession?.user?.id !== userId || !resetSession?.session?.access_token) return unavailable();
      const { error:resetRevokeError } = await admin.auth.admin.signOut(resetSession.session.access_token,'global');
      if (resetRevokeError) return unavailable();
    }
    const ready = await call('raps_managed_finish_reset',{ ...actor,p_user_id:userId,p_version:record?.credential_version });
    if (!ready?.temporary_expires_at) return unavailable();
    return json({ ok:true,user:{ id:userId,username },temporary_password:password,temporary_expires_at:ready.temporary_expires_at });
  } catch (error) {
    // Errors deliberately exclude provider messages, request bodies, and tokens.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === '23505') return fail('MANAGED_EXISTS','That username is already in use.',409);
    if (code === '42501') return fail('MANAGED_ACCESS','Current account access is required for this operation.',403);
    if (code === '55000') return fail('MANAGED_BUSY','Account setup is already in progress. Refresh accounts and contact an Enterprise Administrator if it remains blocked.',409);
    if (code === '22023') return fail('MANAGED_BODY','The account or organizational scope is unavailable.',400);
    return unavailable();
  }
});
