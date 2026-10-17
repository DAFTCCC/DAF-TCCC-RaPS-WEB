(() => {
'use strict';

const CFG = window.RAPS_CLOUD_CONFIG || {};
const ROLE_ORDER = Object.freeze({
  evaluator: 1,
  program_manager: 2,
  majcom_manager: 3,
  enterprise_admin: 4
});
const ROLE_LABELS = Object.freeze({
  evaluator: 'Evaluator',
  program_manager: 'Program Manager',
  majcom_manager: 'MAJCOM Manager',
  enterprise_admin: 'Enterprise Admin'
});

let client = null;
let identity = null;
let authSubscription = null;
let accessCatalog = { bases: [], majcoms: [] };
const authBackgroundState = new Map();
let focusedAuthGate = null;
let authReturnFocus = null;
let authenticatedUser = null;
let activationUserId = null;
let changePasswordUserId = null;
let identityGeneration = 0;
let identityLookupId = 0;
let authBusy = false;
let initializing = true;
let resetPending = false;
let resetAvailableAt = 0;
let resetCooldownTimer = null;
let sessionBlocked = false;

const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function readActivationLink() {
  try {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    const type = url.searchParams.get('type') || hash.get('type') || '';
    return {
      requested: url.searchParams.get('raps_activation') === '1' || ['invite','recovery'].includes(type),
      type,
      tokenHash: url.searchParams.get('token_hash'),
      code: url.searchParams.get('code'),
      accessToken: hash.get('access_token'),
      refreshToken: hash.get('refresh_token'),
      error: url.searchParams.get('error') || hash.get('error')
    };
  } catch {
    return { requested: false };
  }
}
// Capture before any SDK can consume the URL. A marker is intent, never proof.
const incomingLink = readActivationLink();
const pendingActivationKey = 'RAPS_PENDING_PASSWORD_SETUP_V1';
function pendingActivation() {
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingActivationKey) || 'null');
    return pending?.userId && pending.expiresAt > Date.now() ? pending : null;
  } catch { return null; }
}
function clearPendingActivation() {
  try { sessionStorage.removeItem(pendingActivationKey); } catch {}
}
function rememberActivation(userId) {
  try { sessionStorage.setItem(pendingActivationKey, JSON.stringify({userId, expiresAt:Date.now() + 20 * 60 * 1000})); } catch {}
}

function clearActivationUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('raps_activation');
    url.searchParams.delete('type');
    for (const key of ['token_hash','code','error','error_code','error_description']) url.searchParams.delete(key);
    url.hash = '';
    window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
  } catch {}
}

function readCachedIdentity() {
  try {
    const raw = localStorage.getItem(CFG.identityCacheKey || 'RAPS_CLOUD_IDENTITY_V1');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedIdentity(value) {
  try {
    localStorage.setItem(CFG.identityCacheKey || 'RAPS_CLOUD_IDENTITY_V1', JSON.stringify(value));
  } catch (error) {
    console.warn('Unable to cache RaPS cloud identity', error);
  }
}

function clearCachedIdentity() {
  try {
    localStorage.removeItem(CFG.identityCacheKey || 'RAPS_CLOUD_IDENTITY_V1');
  } catch {}
}

function activeMemberships(rows = []) {
  const now = Date.now();
  return rows.filter(row => {
    if (!row?.active || !ROLE_ORDER[row.role]) return false;
    const starts = row.starts_at ? Date.parse(row.starts_at) : null;
    const ends = row.ends_at ? Date.parse(row.ends_at) : null;
    if (row.starts_at && !Number.isFinite(starts)) return false;
    if (row.ends_at && !Number.isFinite(ends)) return false;
    if (Number.isFinite(starts) && starts > now) return false;
    if (Number.isFinite(ends) && ends <= now) return false;
    return true;
  });
}

function primaryMembership(rows = []) {
  return activeMemberships(rows)
    .slice()
    .sort((a, b) => (ROLE_ORDER[b.role] || 0) - (ROLE_ORDER[a.role] || 0))[0] || null;
}

function scopeLabel(membership) {
  if (!membership) return 'No active RaPS role';
  if (membership.role === 'enterprise_admin') return 'Enterprise';
  if (membership.role === 'majcom_manager') {
    return membership.majcoms?.code || membership.majcoms?.name || 'Assigned MAJCOM';
  }
  return membership.bases?.code || membership.bases?.name || 'Assigned installation';
}

function injectUi() {
  if (!byId('cloudAuthGate')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="cloudAuthGate" class="cloudAuthGate" role="dialog" aria-modal="true" aria-labelledby="cloudAuthTitle" aria-hidden="false">
        <div class="cloudAuthCard">
          <div class="cloudAuthBrand">
            <img src="assets/app-icon.png" alt="" class="cloudAuthIcon">
            <div>
              <div class="eyebrow">RaPS ENTERPRISE ACCESS</div>
              <h1 id="cloudAuthTitle">Sign in to TCCC Evaluation Suite</h1>
            </div>
          </div>
          <p class="cloudAuthIntro">Sign in with your authorized RaPS account. The first sign-in requires network access. After a successful sign-in, this device can continue the local evaluator workflow during a temporary outage.</p>
          <form id="cloudAuthForm" class="cloudAuthForm">
            <label>
              <span>Email</span>
              <input id="cloudAuthEmail" type="email" autocomplete="username" inputmode="email" required>
            </label>
            <label>
              <span>Password</span>
              <input id="cloudAuthPassword" type="password" autocomplete="current-password" required>
            </label>
            <button id="cloudAuthSubmit" class="action primary" type="submit">Sign In</button>
            <button id="cloudForgotPasswordBtn" class="ghost small" type="button">Forgot password?</button>
            <button id="cloudRequestAccessBtn" class="ghost small" type="button">Request access</button>
            <button id="cloudAuthAccountBtn" class="ghost small" type="button" hidden>Change my password</button>
          </form>
          <div id="cloudAuthMessage" class="cloudAuthMessage" aria-live="polite"></div>
          <div class="cloudAuthFoot">
            <b>No public registration.</b> Accounts and access scopes are managed by RaPS administrators.
            <br>Do not enter PHI, CUI, classified, or operationally sensitive information.
          </div>
        </div>
      </div>
    `);
  }

  if (!byId('cloudRequestAccessGate')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="cloudRequestAccessGate" class="cloudAuthGate cloudRequestAccessGate"
           role="dialog" aria-modal="true"
           aria-labelledby="cloudRequestAccessTitle"
           aria-hidden="true">

        <div class="cloudAuthCard">
          <div class="cloudAuthBrand">
            <img src="assets/app-icon.png" alt="" class="cloudAuthIcon">
            <div>
              <div class="eyebrow">RaPS ACCESS REQUEST</div>
              <h1 id="cloudRequestAccessTitle">Request RaPS Access</h1>
            </div>
          </div>

          <p class="cloudAuthIntro">
            Submit an access request for administrator review.
            Submitting this form does not create an account or grant access.
          </p>

          <form id="cloudRequestAccessForm" class="cloudAuthForm">

            <label>
              <span>Full name</span>
              <input id="cloudRequestAccessName"
                     type="text"
                     autocomplete="name"
                     maxlength="120"
                     required>
            </label>

            <label>
              <span>Email</span>
              <input id="cloudRequestAccessEmail"
                     type="email"
                     autocomplete="email"
                     inputmode="email"
                     maxlength="254"
                     required>
            </label>

            <label>
              <span>Requested role</span>
              <select id="cloudRequestAccessRole" required>
                <option value="evaluator">Evaluator</option>
                <option value="program_manager">Program Manager</option>
                <option value="majcom_manager">MAJCOM Manager</option>
              </select>
            </label>

            <label>
              <span id="cloudRequestAccessScopeLabel">Installation</span>
              <select id="cloudRequestAccessScope" required></select>
            </label>

            <label>
              <span>Reason / program <small>(optional)</small></span>
              <textarea id="cloudRequestAccessJustification"
                        rows="3"
                        maxlength="1000"
                        placeholder="Briefly describe why you need RaPS access."></textarea>
            </label>

            <button id="cloudRequestAccessSubmit"
                    class="action primary"
                    type="submit">
              Submit Request
            </button>

            <button id="cloudRequestAccessBack"
                    class="ghost small"
                    type="button">
              Back to Sign In
            </button>
          </form>

          <div id="cloudRequestAccessMessage"
               class="cloudAuthMessage"
               aria-live="polite"></div>

          <div class="cloudAuthFoot">
            Enterprise Administrator access cannot be requested through this form.
            <br>Do not enter PHI, CUI, classified, or operationally sensitive information.
          </div>
        </div>
      </div>
    `);
  }


  if (!byId('cloudActivationGate')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="cloudActivationGate" class="cloudAuthGate cloudActivationGate" role="dialog" aria-modal="true" aria-labelledby="cloudActivationTitle" aria-hidden="true">
        <div class="cloudAuthCard">
          <div class="cloudAuthBrand">
            <img src="assets/app-icon.png" alt="" class="cloudAuthIcon">
            <div>
              <div class="eyebrow">RaPS SECURE PASSWORD</div>
              <h1 id="cloudActivationTitle">Set Your RaPS Password</h1>
            </div>
          </div>
          <p class="cloudAuthIntro">Your secure RaPS link has been verified. Create a new password to continue.</p>
          <form id="cloudActivationForm" class="cloudAuthForm">
            <label>
              <span>New password</span>
              <input id="cloudActivationPassword" type="password" autocomplete="new-password" minlength="12" required>
            </label>
            <label>
              <span>Confirm password</span>
              <input id="cloudActivationConfirm" type="password" autocomplete="new-password" minlength="12" required>
            </label>
            <div class="cloudPasswordRule">Use at least 12 characters. Do not reuse a password from another system.</div>
            <button id="cloudActivationSubmit" class="action primary" type="submit">Set Password</button>
            <button id="cloudActivationBack" class="ghost small" type="button">Back to Sign In</button>
          </form>
          <div id="cloudActivationMessage" class="cloudAuthMessage" aria-live="polite"></div>
          <div class="cloudAuthFoot">
            Your RaPS role and organizational scope were assigned by an Enterprise Administrator.
            <br>Do not enter PHI, CUI, classified, or operationally sensitive information.
          </div>
        </div>
      </div>
    `);
  }

  if (!byId('cloudChangePasswordGate')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="cloudChangePasswordGate" class="cloudAuthGate" role="dialog" aria-modal="true" aria-labelledby="cloudChangePasswordTitle" aria-hidden="true">
        <div class="cloudAuthCard">
          <div class="eyebrow">RaPS ACCOUNT</div>
          <h1 id="cloudChangePasswordTitle">Change Your Password</h1>
          <p class="cloudAuthIntro">Change the password for <b id="cloudChangePasswordEmail"></b>. Network access is required.</p>
          <form id="cloudChangePasswordForm" class="cloudAuthForm">
            <label><span>Current password</span><input id="cloudChangePasswordCurrent" type="password" autocomplete="current-password" required></label>
            <label><span>New password</span><input id="cloudChangePasswordPassword" type="password" autocomplete="new-password" minlength="12" required></label>
            <label><span>Confirm new password</span><input id="cloudChangePasswordConfirm" type="password" autocomplete="new-password" minlength="12" required></label>
            <div class="cloudPasswordRule">Use at least 12 characters and a different password from your current password.</div>
            <div id="cloudChangePasswordVerification" hidden>
              <p>Your server requires an email verification code. Send a code, then enter it below and try again.</p>
              <button id="cloudChangePasswordCodeBtn" class="ghost" type="button">Send Verification Code</button>
              <label><span>Email verification code</span><input id="cloudChangePasswordNonce" type="text" autocomplete="one-time-code" inputmode="numeric"></label>
            </div>
            <button id="cloudChangePasswordSubmit" class="action primary" type="submit">Change Password</button>
            <button id="cloudChangePasswordCancel" class="ghost" type="button">Cancel</button>
          </form>
          <div id="cloudChangePasswordMessage" class="cloudAuthMessage" aria-live="polite"></div>
        </div>
      </div>
    `);
  }

  if (!byId('cloudIdentityBar')) {
    const versionLine = document.querySelector('.hero .versionLine');
    if (versionLine) {
      versionLine.insertAdjacentHTML('afterend', `
        <div id="cloudIdentityBar" class="cloudIdentityBar" aria-live="polite">
          <span id="cloudIdentityDot" class="cloudIdentityDot"></span>
          <span id="cloudIdentityText">Cloud identity checking…</span>
          <button id="cloudChangePasswordBtn" class="ghost cloudAccountBtn" type="button" disabled>Change Password</button>
          <button id="cloudLogoutBtn" class="ghost cloudLogoutBtn" type="button">Sign Out</button>
        </div>
      `);
    }
  }

  byId('cloudAuthForm')?.addEventListener('submit', handleSignIn);
  byId('cloudForgotPasswordBtn')?.addEventListener('click', handleForgotPassword);
  byId('cloudRequestAccessBtn')?.addEventListener('click', openRequestAccess);
  byId('cloudRequestAccessBack')?.addEventListener('click', closeRequestAccess);
  byId('cloudRequestAccessRole')?.addEventListener('change', renderRequestAccessScope);
  byId('cloudRequestAccessForm')?.addEventListener('submit', handleRequestAccessSubmit);
  byId('cloudActivationForm')?.addEventListener('submit', handleSetPassword);
  byId('cloudActivationBack')?.addEventListener('click', leaveActivation);
  byId('cloudChangePasswordBtn')?.addEventListener('click', openChangePassword);
  byId('cloudAuthAccountBtn')?.addEventListener('click', openChangePassword);
  byId('cloudChangePasswordForm')?.addEventListener('submit', handleChangePassword);
  byId('cloudChangePasswordCancel')?.addEventListener('click', closeChangePassword);
  byId('cloudChangePasswordCodeBtn')?.addEventListener('click', handleReauthenticationCode);
  byId('cloudLogoutBtn')?.addEventListener('click', handleSignOut);
}

function activeAuthGate() {
  return ['cloudChangePasswordGate','cloudActivationGate','cloudRequestAccessGate','cloudAuthGate']
    .map(byId).find(gate=>gate?.classList.contains('open'))||null;
}
function authFocusTargets(gate) {
  return [...gate.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
    .filter(el=>!el.disabled&&el.tabIndex>=0&&!el.closest('[inert]')&&el.getClientRects().length);
}
function syncAuthGateFocus() {
  const gate=activeAuthGate();
  document.body.classList.toggle('cloudAuthLocked', !!gate);
  if(gate){
    if(!focusedAuthGate)authReturnFocus=document.activeElement;
    for(const child of document.body.children){
      if(child===gate||['SCRIPT','STYLE','LINK'].includes(child.tagName))continue;
      if(!authBackgroundState.has(child))authBackgroundState.set(child,child.inert);
      child.inert=true;
    }
    gate.inert=false;
    if(focusedAuthGate!==gate){
      window.requestAnimationFrame(()=>{
        if(activeAuthGate()!==gate||gate.contains(document.activeElement))return;
        const heading=gate.querySelector('h1,h2');
        if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
        else authFocusTargets(gate)[0]?.focus();
      });
    }
    focusedAuthGate=gate;
  }else{
    for(const [child,inert] of authBackgroundState)if(child.isConnected)child.inert=inert;
    authBackgroundState.clear();
    focusedAuthGate=null;
  }
  window.dispatchEvent(new CustomEvent('raps-auth-gate-change'));
  if(!gate&&authReturnFocus){
    const previous=authReturnFocus;authReturnFocus=null;
    if(previous.isConnected&&!previous.closest('[inert]')&&previous.getClientRects().length)previous.focus({preventScroll:true});
  }
}
document.addEventListener('keydown',event=>{
  const gate=activeAuthGate();
  if(!gate)return;
  if(event.key==='Escape'&&gate.id==='cloudRequestAccessGate'){
    event.preventDefault();event.stopPropagation();closeRequestAccess();return;
  }
  if(event.key==='Escape'&&gate.id==='cloudChangePasswordGate'){
    event.preventDefault();event.stopPropagation();closeChangePassword();return;
  }
  if(event.key!=='Tab')return;
  const targets=authFocusTargets(gate),index=targets.indexOf(document.activeElement);
  if(!targets.length){event.preventDefault();return;}
  if(index<0||(event.shiftKey&&index===0)||(!event.shiftKey&&index===targets.length-1)){
    event.preventDefault();event.stopPropagation();
    targets[event.shiftKey?targets.length-1:0].focus();
  }
},true);
document.addEventListener('focusin',event=>{
  const gate=activeAuthGate();
  if(gate&&!gate.contains(event.target))authFocusTargets(gate)[0]?.focus();
});

function setGate(open, message = '', kind = '') {
  const gate = byId('cloudAuthGate');
  if (!gate) return;
  gate.classList.toggle('open', !!open);
  gate.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.body.classList.toggle('cloudAuthLocked', !!open);

  const messageEl = byId('cloudAuthMessage');
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = `cloudAuthMessage ${kind || ''}`.trim();
  }
  syncAuthGateFocus();
}

function setActivationGate(open, message = '', kind = '') {
  const gate = byId('cloudActivationGate');
  if (!gate) return;
  gate.classList.toggle('open', !!open);
  gate.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.body.classList.toggle('cloudActivationLocked', !!open);

  const messageEl = byId('cloudActivationMessage');
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = `cloudAuthMessage ${kind || ''}`.trim();
  }
  syncAuthGateFocus();
}

function setStatus(mode, text) {
  const accountButton = byId('cloudChangePasswordBtn');
  if (accountButton) accountButton.disabled = !authenticatedUser || mode === 'offline' || !!activationUserId;
  const gatedAccountButton = byId('cloudAuthAccountBtn');
  if (gatedAccountButton) gatedAccountButton.hidden = !authenticatedUser || !!activationUserId;
  const bar = byId('cloudIdentityBar');
  const dot = byId('cloudIdentityDot');
  const label = byId('cloudIdentityText');
  if (!bar || !dot || !label) return;

  bar.dataset.mode = mode || 'checking';
  dot.className = `cloudIdentityDot ${mode || 'checking'}`;
  label.textContent = text || 'Cloud identity checking…';
}

function clearRuntimeIdentity(clearCache = true) {
  identityGeneration++;
  identity = null;
  if (clearCache) clearCachedIdentity();
  window.RAPS_CLOUD = null;
  document.body.dataset.rapsRole = 'none';
  document.body.dataset.rapsCloudMode = 'signed-out';
  window.dispatchEvent(new CustomEvent('raps-cloud-identity', { detail: null }));
}

function adoptUser(user) {
  if (authenticatedUser?.id !== user?.id) clearRuntimeIdentity(false);
  authenticatedUser = user || null;
}

function exposeIdentity(value, mode) {
  identity = value;
  const membership = value?.primaryMembership || primaryMembership(value?.memberships || []);
  const profile = value?.profile || {};
  const displayName = profile.display_name || value?.user?.email || 'RaPS user';
  const role = membership?.role || '';
  const roleLabel = ROLE_LABELS[role] || 'No active role';
  const scope = scopeLabel(membership);

  window.RAPS_CLOUD = Object.freeze({
    mode,
    connected: mode === 'connected',
    offlineCached: mode === 'offline',
    user: value?.user || null,
    profile,
    memberships: value?.memberships || [],
    primaryMembership: membership,
    role,
    scope,
    client
  });

  document.body.dataset.rapsRole = role || 'none';
  document.body.dataset.rapsCloudMode = mode;

  if (mode === 'offline') {
    setStatus('offline', `${displayName} · ${roleLabel} · ${scope} · Offline cached identity`);
  } else {
    setStatus('connected', `${displayName} · ${roleLabel} · ${scope} · Cloud connected`);
  }

  window.dispatchEvent(new CustomEvent('raps-cloud-identity', { detail: window.RAPS_CLOUD }));
}

async function loadIdentity(user) {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, display_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const { data: memberships, error: membershipError } = await client
    .from('memberships')
    .select(`
      id,
      role,
      active,
      starts_at,
      ends_at,
      base_id,
      majcom_id,
      bases ( id, code, name ),
      majcoms ( id, code, name )
    `)
    .eq('user_id', user.id)
    .eq('active', true);

  if (membershipError) throw membershipError;

  const active = activeMemberships(memberships || []);
  const primary = primaryMembership(active);

  return {
    cachedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email || profile?.email || ''
    },
    profile: profile || {
      id: user.id,
      display_name: user.email || 'RaPS user',
      email: user.email || ''
    },
    memberships: active,
    primaryMembership: primary
  };
}

function useCachedIdentity(expectedUserId = null) {
  const cached = readCachedIdentity();
  if (!cached?.user?.id) return false;
  if (expectedUserId && cached.user.id !== expectedUserId) return false;
  cached.memberships = activeMemberships(cached.memberships || []);
  cached.primaryMembership = primaryMembership(cached.memberships);
  if (!cached.primaryMembership) return false;

  exposeIdentity(cached, 'offline');
  setGate(false);
  return true;
}

async function establishIdentity(user) {
  const generation = identityGeneration;
  const lookupId = ++identityLookupId;
  const isCurrent = () => lookupId === identityLookupId && generation === identityGeneration && authenticatedUser?.id === user?.id && !sessionBlocked;
  try {
    const loaded = await loadIdentity(user);
    if (!isCurrent()) return false;

    if (!loaded.primaryMembership) {
      clearRuntimeIdentity();
      setStatus('denied', `${loaded.profile?.display_name || loaded.user?.email || 'User'} · No active RaPS role`);
      setGate(true, 'Your Supabase account is valid, but no active RaPS role/scope is assigned. Contact an Enterprise Administrator.', 'error');
      return false;
    }

    writeCachedIdentity(loaded);
    exposeIdentity(loaded, 'connected');
    setGate(false);
    return true;
  } catch (error) {
    if (!isCurrent()) return false;
    console.warn('RaPS cloud identity lookup failed', error);

    if (useCachedIdentity(user?.id)) {
      return true;
    }

    clearRuntimeIdentity(false);
    setStatus('offline', 'Cloud unavailable · Sign-in required before offline use');
    setGate(true, 'RaPS could not verify your role. Check the network connection and try again. First-time use on a device requires an online sign-in.', 'error');
    return false;
  }
}

async function handleSignIn(event) {
  event.preventDefault();
  if (!client || authBusy) return;

  const email = byId('cloudAuthEmail')?.value.trim();
  const password = byId('cloudAuthPassword')?.value || '';
  const submit = byId('cloudAuthSubmit');

  if (!email || !password) {
    setGate(true, 'Enter both email and password.', 'error');
    return;
  }

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Signing In…';
  }

  setGate(true, 'Authenticating with RaPS…', 'working');
  authBusy = true;

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.user) throw new Error('Supabase did not return an authenticated user.');

    sessionBlocked = false;
    clearPendingActivation();
    adoptUser(data.user);
    await establishIdentity(data.user);
    if (byId('cloudAuthPassword')) byId('cloudAuthPassword').value = '';
  } catch (error) {
    console.error('RaPS sign-in failed', error);
    setStatus('denied', 'Not signed in');
    setGate(true, error?.message || 'Unable to sign in.', 'error');
  } finally {
    authBusy = false;
    if (byId('cloudAuthPassword')) byId('cloudAuthPassword').value = '';
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Sign In';
    }
  }
}


function setRequestAccessGate(open, message = '', kind = '') {
  const gate = byId('cloudRequestAccessGate');
  if (!gate) return;

  gate.classList.toggle('open', !!open);
  gate.setAttribute('aria-hidden', open ? 'false' : 'true');

  if (open) {
    document.body.classList.add('cloudAuthLocked');
  } else {
    const authOpen = byId('cloudAuthGate')?.classList.contains('open');
    const activationOpen = byId('cloudActivationGate')?.classList.contains('open');

    if (!authOpen && !activationOpen) {
      document.body.classList.remove('cloudAuthLocked');
    }
  }

  const messageEl = byId('cloudRequestAccessMessage');

  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = `cloudAuthMessage ${kind || ''}`.trim();
  }
  syncAuthGateFocus();
}

function renderRequestAccessScope() {
  const role = byId('cloudRequestAccessRole')?.value || 'evaluator';
  const label = byId('cloudRequestAccessScopeLabel');
  const select = byId('cloudRequestAccessScope');

  if (!label || !select) return;

  if (role === 'majcom_manager') {
    label.textContent = 'MAJCOM';

    select.innerHTML = accessCatalog.majcoms.map(m =>
      `<option value="${esc(m.id)}">${esc(m.code || m.name)} · ${esc(m.name)}</option>`
    ).join('');
  } else {
    label.textContent = 'Installation';

    select.innerHTML = accessCatalog.bases.map(b =>
      `<option value="${esc(b.id)}">${esc(b.code || b.name)} · ${esc(b.name)}</option>`
    ).join('');
  }
}

async function loadRequestAccessCatalog() {
  if (accessCatalog.bases.length && accessCatalog.majcoms.length) {
    renderRequestAccessScope();
    return;
  }

  const endpoint =
    `${String(CFG.projectUrl || '').replace(/\/$/, '')}/functions/v1/request-access`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  let payload = {};

  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load RaPS installations.');
  }

  accessCatalog = {
    bases: Array.isArray(payload?.bases) ? payload.bases : [],
    majcoms: Array.isArray(payload?.majcoms) ? payload.majcoms : []
  };

  if (!accessCatalog.bases.length || !accessCatalog.majcoms.length) {
    throw new Error('RaPS access catalog is unavailable.');
  }

  renderRequestAccessScope();
}

async function openRequestAccess() {
  const signInEmail = byId('cloudAuthEmail')?.value.trim() || '';

  if (byId('cloudRequestAccessEmail') && signInEmail) {
    byId('cloudRequestAccessEmail').value = signInEmail;
  }

  setGate(false);
  setRequestAccessGate(true, 'Loading RaPS access options…', 'working');

  try {
    await loadRequestAccessCatalog();
    setRequestAccessGate(true, '', '');
    byId('cloudRequestAccessName')?.focus();
  } catch (error) {
    console.error('RaPS access-request catalog failed', error);

    setRequestAccessGate(
      true,
      error?.message || 'Unable to load access-request options.',
      'error'
    );
  }
}

function closeRequestAccess() {
  setRequestAccessGate(false);
  setGate(true, 'Sign in with your authorized RaPS account.', '');
}

async function handleRequestAccessSubmit(event) {
  event.preventDefault();

  const displayName =
    byId('cloudRequestAccessName')?.value.trim() || '';

  const email =
    byId('cloudRequestAccessEmail')?.value.trim() || '';

  const requestedRole =
    byId('cloudRequestAccessRole')?.value || 'evaluator';

  const scope =
    byId('cloudRequestAccessScope')?.value || '';

  const justification =
    byId('cloudRequestAccessJustification')?.value.trim() || '';

  const submit = byId('cloudRequestAccessSubmit');

  if (!displayName || !email || !scope) {
    setRequestAccessGate(
      true,
      'Complete your name, email, role, and organizational scope.',
      'error'
    );
    return;
  }

  const payload = {
    email,
    display_name: displayName,
    requested_role: requestedRole,
    base_id: requestedRole === 'majcom_manager' ? null : scope,
    majcom_id: requestedRole === 'majcom_manager' ? scope : null,
    justification: justification || null
  };

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Submitting…';
  }

  setRequestAccessGate(
    true,
    'Submitting your RaPS access request…',
    'working'
  );

  try {
    const endpoint =
      `${String(CFG.projectUrl || '').replace(/\/$/, '')}/functions/v1/request-access`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let result = {};

    try {
      result = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(result?.error || 'Unable to submit access request.');
    }

    setRequestAccessGate(
      true,
      result?.message ||
        'Your RaPS access request was submitted for administrator review.',
      'success'
    );

    if (byId('cloudRequestAccessJustification')) {
      byId('cloudRequestAccessJustification').value = '';
    }
  } catch (error) {
    console.error('RaPS access request failed', error);

    setRequestAccessGate(
      true,
      error?.message || 'Unable to submit access request.',
      'error'
    );
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Submit Request';
    }
  }
}

async function handleForgotPassword() {
  if (!client || resetPending || Date.now() < resetAvailableAt) return;

  const email = byId('cloudAuthEmail')?.value.trim() || '';
  const button = byId('cloudForgotPasswordBtn');

  if (!email || !byId('cloudAuthEmail')?.checkValidity()) {
    setGate(true, 'Enter a valid email address first, then select Forgot password.', 'error');
    byId('cloudAuthEmail')?.focus();
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Sending…';
  }

  setGate(true, 'Requesting a secure password reset link…', 'working');
  resetPending = true;

  try {
    const redirect = new URL(window.location.origin + window.location.pathname);
    redirect.searchParams.set('raps_activation', '1');

    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: redirect.toString()
    });

    if (error) throw error;
    resetAvailableAt = Date.now() + 60000;

    // Keep this intentionally generic so the UI does not disclose
    // whether a particular email address exists in RaPS.
    setGate(
      true,
      'If that email is associated with a RaPS account, a password reset link has been sent. Check your inbox and spam folder.',
      'success'
    );
  } catch (error) {
    if (error?.status === 429) resetAvailableAt = Date.now() + 60000;
    setGate(
      true,
      error?.status === 429
        ? 'Too many reset requests. Wait a minute, then try again.'
        : 'Unable to request a password reset link. Check the network and try again later. Contact your administrator if this continues.',
      'error'
    );
  } finally {
    resetPending = false;
    updateResetCooldown();
  }
}

function updateResetCooldown() {
  window.clearTimeout(resetCooldownTimer);
  const remaining = Math.max(0, Math.ceil((resetAvailableAt - Date.now()) / 1000));
  const button = byId('cloudForgotPasswordBtn');
  if (button) {
    button.disabled = resetPending || remaining > 0;
    button.textContent = remaining ? `Request another link in ${remaining}s` : 'Forgot password?';
  }
  if (remaining) resetCooldownTimer = window.setTimeout(updateResetCooldown, 1000);
}

function clearPasswordFields(prefix) {
  for (const suffix of ['Current','Password','Confirm','Nonce']) {
    const field = byId(prefix + suffix);
    if (field) field.value = '';
  }
}

function leaveActivation() {
  if (authBusy) return;
  activationUserId = null;
  clearPendingActivation();
  authenticatedUser = null;
  sessionBlocked = true;
  clearRuntimeIdentity();
  clearPasswordFields('cloudActivation');
  clearActivationUrl();
  setActivationGate(false);
  setStatus('denied', 'Sign in to continue');
  setGate(true, 'Sign in with your password, or enter your email and select Forgot password to request a new link. For a new account, contact your administrator for an invitation.', '');
}

async function verifiedUser(expectedId, accessToken) {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error) throw error;
  if (!data?.user?.id || data.user.id !== expectedId) throw new Error('Your sign-in session changed or expired. Sign in again before changing your password.');
  return data.user;
}

async function updateBoundPassword(owner, attributes, isCurrent) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const session = data?.session;
  if (!session?.access_token || session.user?.id !== owner) throw new Error('Your session changed or expired. Sign in again or request a new secure link.');
  const token = session.access_token;
  await verifiedUser(owner, token);
  if (!isCurrent()) return null;
  // Bind the mutation to the verified JWT snapshot. SDK updateUser reads mutable
  // shared storage; an account switch in another tab must never retarget it.
  const response = await fetch(`${String(CFG.projectUrl).replace(/\/$/, '')}/auth/v1/user`, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json', apikey:CFG.publishableKey, Authorization:`Bearer ${token}` },
    body: JSON.stringify(attributes),
    cache: 'no-store'
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = new Error(result?.msg || result?.message || result?.error_description || 'Unable to change your password. Check your connection and try again.');
    failure.code = result?.error_code || result?.code;
    throw failure;
  }
  const user = result?.user || result;
  if (user?.id !== owner) throw new Error('Unable to confirm the password change for this account. Sign in again.');
  return user;
}

async function handleSetPassword(event) {
  event.preventDefault();
  if (!client || authBusy) return;

  const password = byId('cloudActivationPassword')?.value || '';
  const confirmPassword = byId('cloudActivationConfirm')?.value || '';
  const submit = byId('cloudActivationSubmit');
  const owner = activationUserId;
  const generation = identityGeneration;

  if (!owner || authenticatedUser?.id !== owner) {
    leaveActivation();
    setGate(true, 'This secure link is no longer valid. Request a new invitation or password reset link.', 'error');
    return;
  }

  if (password.length < 12) {
    setActivationGate(true, 'Use a password with at least 12 characters.', 'error');
    return;
  }
  if (password !== confirmPassword) {
    setActivationGate(true, 'The passwords do not match.', 'error');
    return;
  }

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Setting Password…';
  }
  setActivationGate(true, 'Setting your RaPS password…', 'working');
  authBusy = true;
  byId('cloudActivationBack').disabled = true;

  try {
    const user = await updateBoundPassword(owner, { password }, () => generation === identityGeneration && activationUserId === owner && authenticatedUser?.id === owner && !sessionBlocked);
    if (!user) return;
    if (generation !== identityGeneration || activationUserId !== owner) return;

    if (byId('cloudActivationPassword')) byId('cloudActivationPassword').value = '';
    if (byId('cloudActivationConfirm')) byId('cloudActivationConfirm').value = '';
    clearActivationUrl();
    activationUserId = null;
    clearPendingActivation();
    setActivationGate(false);
    await establishIdentity(user);
    if (!identity?.primaryMembership && byId('cloudAuthGate')?.classList.contains('open')) {
      const message = byId('cloudAuthMessage');
      if (message) message.textContent = 'Your password was set. ' + message.textContent;
    }
  } catch (error) {
    console.error('RaPS account activation failed', error);
    clearPasswordFields('cloudActivation');
    if (activationUserId === owner) setActivationGate(true, error?.message || 'Unable to set your password. Request a new link if it has expired.', 'error');
  } finally {
    authBusy = false;
    byId('cloudActivationBack').disabled = false;
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Set Password';
    }
  }
}

function setChangePasswordGate(open, message = '', kind = '') {
  const gate = byId('cloudChangePasswordGate');
  gate.classList.toggle('open', !!open);
  gate.setAttribute('aria-hidden', open ? 'false' : 'true');
  const status = byId('cloudChangePasswordMessage');
  status.textContent = message;
  status.className = `cloudAuthMessage ${kind}`.trim();
  syncAuthGateFocus();
}

function openChangePassword() {
  if (!client || !authenticatedUser?.id || authBusy || activationUserId) return;
  if (navigator.onLine === false || window.RAPS_CLOUD?.offlineCached) {
    setStatus('offline', 'Reconnect before changing your password');
    return;
  }
  changePasswordUserId = authenticatedUser.id;
  clearPasswordFields('cloudChangePassword');
  byId('cloudChangePasswordEmail').textContent = authenticatedUser.email || 'your signed-in account';
  byId('cloudChangePasswordVerification').hidden = true;
  byId('cloudChangePasswordCancel').textContent = 'Cancel';
  setGate(false);
  setChangePasswordGate(true);
}

function closeChangePassword() {
  if (authBusy) return;
  changePasswordUserId = null;
  clearPasswordFields('cloudChangePassword');
  setChangePasswordGate(false);
  if (!identity?.primaryMembership) setGate(true, 'Sign in with an authorized account. If your account has no active role, contact an Enterprise Administrator.', '');
}

function setPasswordChangeBusy(busy) {
  authBusy = busy;
  for (const id of ['cloudChangePasswordSubmit','cloudChangePasswordCancel','cloudChangePasswordCodeBtn']) byId(id).disabled = busy;
  byId('cloudChangePasswordSubmit').textContent = busy ? 'Changing Password…' : 'Change Password';
}

async function handleChangePassword(event) {
  event.preventDefault();
  if (!client || authBusy) return;
  const owner = changePasswordUserId;
  const generation = identityGeneration;
  const currentPassword = byId('cloudChangePasswordCurrent').value;
  const password = byId('cloudChangePasswordPassword').value;
  const confirmation = byId('cloudChangePasswordConfirm').value;
  if (!owner || authenticatedUser?.id !== owner) return closeChangePassword();
  if (!currentPassword || password.length < 12 || password !== confirmation || password === currentPassword) {
    setChangePasswordGate(true, !currentPassword ? 'Enter your current password.' : password.length < 12 ? 'Use a password with at least 12 characters.' : password !== confirmation ? 'The passwords do not match.' : 'Choose a different password from your current password.', 'error');
    return;
  }
  const isCurrent = () => generation === identityGeneration && changePasswordUserId === owner && authenticatedUser?.id === owner && !sessionBlocked;
  setPasswordChangeBusy(true);
  setChangePasswordGate(true, 'Verifying your current password…', 'working');
  try {
    const user = await verifiedUser(owner);
    if (!isCurrent()) return;
    if (!user.email) throw new Error('This account has no verified email address. Contact your administrator.');
    // Reauthenticate the currently verified account; there is no editable email.
    const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (error) throw error;
    if (!isCurrent() || data?.user?.id !== owner) throw new Error('The authenticated account changed. Sign in again before changing your password.');
    const nonce = byId('cloudChangePasswordNonce').value.trim();
    const updated = await updateBoundPassword(owner, { password, ...(nonce ? {nonce} : {}) }, isCurrent);
    if (!updated || !isCurrent()) return;
    clearPasswordFields('cloudChangePassword');
    byId('cloudChangePasswordCancel').textContent = 'Done';
    byId('cloudChangePasswordVerification').hidden = true;
    setChangePasswordGate(true, 'Your password has been changed. Use your new password the next time you sign in.', 'success');
  } catch (error) {
    if (!isCurrent()) return;
    if (['reauthentication_needed','reauthentication_not_valid'].includes(error?.code)) byId('cloudChangePasswordVerification').hidden = false;
    clearPasswordFields('cloudChangePassword');
    setChangePasswordGate(true, error?.message || 'Unable to change your password. Check your current password and connection, then try again.', 'error');
  } finally {
    setPasswordChangeBusy(false);
  }
}

async function handleReauthenticationCode() {
  if (!client || authBusy || !changePasswordUserId) return;
  const owner = changePasswordUserId;
  const generation = identityGeneration;
  const isCurrent = () => generation === identityGeneration && changePasswordUserId === owner && authenticatedUser?.id === owner;
  setPasswordChangeBusy(true);
  try {
    await verifiedUser(owner);
    if (!isCurrent()) return;
    const { error } = await client.auth.reauthenticate();
    if (error) throw error;
    if (isCurrent()) setChangePasswordGate(true, 'Verification code requested. Check the inbox for your account, enter the code, and try changing your password again.', 'success');
  } catch (error) {
    if (isCurrent()) setChangePasswordGate(true, error?.message || 'Unable to send the verification code.', 'error');
  } finally { setPasswordChangeBusy(false); }
}

async function handleSignOut() {
  if (!client || authBusy) return;
  if (!confirm('Sign out of RaPS on this device? Offline cached identity will also be removed. Local evaluation data will remain on this device.')) return;
  authBusy = true;
  sessionBlocked = true;
  let signOutError = null;
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch (error) {
    signOutError = error;
    // Clear the SDK's persisted local session even if the network sign-out fails.
    try { localStorage.removeItem(CFG.authStorageKey || 'raps-supabase-auth-v1'); } catch {}
  }
  authenticatedUser = null;
  activationUserId = null;
  clearPendingActivation();
  changePasswordUserId = null;
  clearRuntimeIdentity();
  clearPasswordFields('cloudActivation');
  clearPasswordFields('cloudChangePassword');
  setActivationGate(false);
  setChangePasswordGate(false);
  setStatus('denied', 'Not signed in');
  setGate(true, signOutError ? 'Local access cleared. Cloud sign-out could not be confirmed; reconnect and sign in again when needed.' : 'Signed out on this device. Sign in to continue.', signOutError ? 'error' : '');
  authBusy = false;
}

async function verifyActivationLink() {
  setGate(true, 'Verifying your secure link…', 'working');
  try {
    if (incomingLink.error) throw new Error('This secure link has expired or is invalid. Enter your email and request a new password reset link, or ask your administrator for a new invitation.');
    let result;
    if (incomingLink.tokenHash && ['invite','recovery'].includes(incomingLink.type)) {
      result = await client.auth.verifyOtp({ token_hash: incomingLink.tokenHash, type: incomingLink.type });
    } else if (incomingLink.code) {
      result = await client.auth.exchangeCodeForSession(incomingLink.code);
    } else if (incomingLink.accessToken && incomingLink.refreshToken && ['invite','recovery'].includes(incomingLink.type)) {
      result = await client.auth.setSession({ access_token: incomingLink.accessToken, refresh_token: incomingLink.refreshToken });
    } else {
      throw new Error('This secure link is incomplete or has already been used. Enter your email and select Forgot password for a new link, or contact your administrator.');
    }
    if (result.error) throw result.error;
    const session = result.data?.session;
    if (!session?.user?.id || !session.access_token) throw new Error('This secure link could not establish a valid session. Request a new link.');
    const user = await verifiedUser(session.user.id, session.access_token);
    sessionBlocked = false;
    adoptUser(user);
    activationUserId = user.id;
    rememberActivation(user.id);
    clearCachedIdentity();
    setGate(false);
    setStatus('checking', 'Secure link verified · Set your password');
    setActivationGate(true, 'Create a new password for ' + (user.email || 'your RaPS account') + '.', '');
  } catch (error) {
    authenticatedUser = null;
    activationUserId = null;
    clearPendingActivation();
    sessionBlocked = true;
    clearRuntimeIdentity();
    setActivationGate(false);
    setStatus('denied', 'Secure link could not be verified');
    setGate(true, error?.message || 'This secure link is invalid or expired. Request a new link.', 'error');
  } finally {
    clearActivationUrl();
    // Do not retain bearer tokens in this module after the exchange.
    for (const key of ['tokenHash','code','accessToken','refreshToken']) incomingLink[key] = null;
  }
}

function handleAuthStateChange(event, nextSession) {
  if (event === 'SIGNED_OUT') {
    authenticatedUser = null;
    activationUserId = null;
    clearPendingActivation();
    changePasswordUserId = null;
    clearRuntimeIdentity();
    clearPasswordFields('cloudActivation');
    clearPasswordFields('cloudChangePassword');
    setActivationGate(false);
    setChangePasswordGate(false);
    setStatus('denied', 'Not signed in');
    setGate(true, 'Signed out. Sign in to continue.', '');
    return;
  }
  const passwordOwner = activationUserId || changePasswordUserId;
  if (passwordOwner && nextSession?.user && nextSession.user.id !== passwordOwner) {
    // Another tab changed accounts while a password form was open.
    sessionBlocked = true;
    authenticatedUser = null;
    activationUserId = null;
    clearPendingActivation();
    changePasswordUserId = null;
    clearRuntimeIdentity();
    clearPasswordFields('cloudActivation');
    clearPasswordFields('cloudChangePassword');
    setActivationGate(false);
    setChangePasswordGate(false);
    setStatus('denied', 'Your signed-in account changed');
    setGate(true, 'Your signed-in account changed in another tab. Sign in again before changing a password.', 'error');
    return;
  }
  if (initializing || authBusy || sessionBlocked || !nextSession?.user || passwordOwner) return;
  if (['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)) {
    const generation = identityGeneration;
    // Supabase auth callbacks must not await another auth call under its lock.
    window.setTimeout(() => {
      if (authBusy || initializing || sessionBlocked || generation !== identityGeneration || activationUserId || changePasswordUserId) return;
      adoptUser(nextSession.user);
      establishIdentity(nextSession.user);
    }, 0);
  }
}

async function initCloudAuth() {
  injectUi();

  if (!CFG.projectUrl || !CFG.publishableKey) {
    setStatus('denied', 'Cloud configuration missing');
    setGate(true, 'RaPS cloud configuration is missing. Contact the application administrator.', 'error');
    return;
  }

  if (!window.supabase?.createClient) {
    if (!incomingLink.requested && !pendingActivation() && useCachedIdentity()) return;
    setStatus('offline', 'Supabase library unavailable');
    setGate(true, 'RaPS could not load the cloud authentication library. Connect to the network and reload. First-time use requires an online sign-in.', 'error');
    return;
  }

  client = window.supabase.createClient(
    CFG.projectUrl,
    CFG.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: CFG.authStorageKey || 'raps-supabase-auth-v1'
      }
    }
  );

  window.RAPS_SUPABASE = client;
  setStatus('checking', 'Checking RaPS cloud identity…');
  const { data } = client.auth.onAuthStateChange(handleAuthStateChange);
  authSubscription = data?.subscription || null;
  try {
    const { data: sessionData, error } = await client.auth.getSession();
    if (incomingLink.requested) {
      await verifyActivationLink();
    } else if (error) {
      if (pendingActivation() || !useCachedIdentity()) setGate(true, 'Unable to verify a RaPS session. Reconnect to finish password setup or sign in.', 'error');
    } else if (sessionData?.session?.user) {
      const session = sessionData.session;
      const pending = pendingActivation();
      if (pending && pending.userId === session.user.id) {
        if (!session.access_token) throw new Error('Password setup requires a verified session.');
        const user = await verifiedUser(pending.userId, session.access_token);
        adoptUser(user);
        activationUserId = user.id;
        setGate(false);
        setActivationGate(true, 'Finish setting the password for ' + (user.email || 'your RaPS account') + '.', '');
      } else {
        clearPendingActivation();
        adoptUser(session.user);
        await establishIdentity(session.user);
      }
    } else {
      clearPendingActivation();
      setStatus('denied', 'Not signed in');
      setGate(true, 'Sign in with your authorized RaPS account.', '');
    }
  } catch {
    if (incomingLink.requested || pendingActivation()) {
      sessionBlocked = true;
      authenticatedUser = null;
      clearRuntimeIdentity();
      setGate(true, 'Unable to verify your session or secure link. Reconnect and request a new link if needed.', 'error');
    } else if (!useCachedIdentity()) {
      setGate(true, 'Unable to verify your session. Reconnect and sign in again.', 'error');
    }
  } finally { initializing = false; }

  window.addEventListener('online', () => {
    if (identity?.user?.id) establishIdentity(identity.user);
  });

  window.addEventListener('offline', () => {
    if (activationUserId || sessionBlocked) return;
    if (!useCachedIdentity(authenticatedUser?.id)) {
      setStatus('offline', 'Offline · No verified identity cached');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCloudAuth, { once: true });
} else {
  initCloudAuth();
}

window.addEventListener('beforeunload', () => {
  try { authSubscription?.unsubscribe?.(); } catch {}
}, { once: true });

})();
