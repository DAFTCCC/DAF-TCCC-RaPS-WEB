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

const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function activationRequested() {
  try {
    const url = new URL(window.location.href);
    const type = url.searchParams.get('type') || '';
    const hash = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    const hashType = hash.get('type') || '';
    return url.searchParams.get('raps_activation') === '1'
      || type === 'invite'
      || type === 'recovery'
      || hashType === 'invite'
      || hashType === 'recovery';
  } catch {
    return false;
  }
}

function clearActivationUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('raps_activation');
    url.searchParams.delete('type');
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
    if (!row?.active) return false;
    const starts = row.starts_at ? Date.parse(row.starts_at) : null;
    const ends = row.ends_at ? Date.parse(row.ends_at) : null;
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


  if (!byId('cloudActivationGate')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="cloudActivationGate" class="cloudAuthGate cloudActivationGate" role="dialog" aria-modal="true" aria-labelledby="cloudActivationTitle" aria-hidden="true">
        <div class="cloudAuthCard">
          <div class="cloudAuthBrand">
            <img src="assets/app-icon.png" alt="" class="cloudAuthIcon">
            <div>
              <div class="eyebrow">RaPS ACCOUNT ACTIVATION</div>
              <h1 id="cloudActivationTitle">Set Your RaPS Password</h1>
            </div>
          </div>
          <p class="cloudAuthIntro">Your invitation has been verified. Create a password to finish activating this RaPS account.</p>
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
            <button id="cloudActivationSubmit" class="action primary" type="submit">Activate Account</button>
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

  if (!byId('cloudIdentityBar')) {
    const versionLine = document.querySelector('.hero .versionLine');
    if (versionLine) {
      versionLine.insertAdjacentHTML('afterend', `
        <div id="cloudIdentityBar" class="cloudIdentityBar" aria-live="polite">
          <span id="cloudIdentityDot" class="cloudIdentityDot"></span>
          <span id="cloudIdentityText">Cloud identity checking…</span>
          <button id="cloudLogoutBtn" class="ghost cloudLogoutBtn" type="button">Sign Out</button>
        </div>
      `);
    }
  }

  byId('cloudAuthForm')?.addEventListener('submit', handleSignIn);
  byId('cloudActivationForm')?.addEventListener('submit', handleSetPassword);
  byId('cloudLogoutBtn')?.addEventListener('click', handleSignOut);
}

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
}

function setStatus(mode, text) {
  const bar = byId('cloudIdentityBar');
  const dot = byId('cloudIdentityDot');
  const label = byId('cloudIdentityText');
  if (!bar || !dot || !label) return;

  bar.dataset.mode = mode || 'checking';
  dot.className = `cloudIdentityDot ${mode || 'checking'}`;
  label.textContent = text || 'Cloud identity checking…';
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
  if (!cached.primaryMembership && !primaryMembership(cached.memberships || [])) return false;

  exposeIdentity(cached, 'offline');
  setGate(false);
  return true;
}

async function establishIdentity(user) {
  try {
    const loaded = await loadIdentity(user);

    if (!loaded.primaryMembership) {
      setStatus('denied', `${loaded.profile?.display_name || loaded.user?.email || 'User'} · No active RaPS role`);
      setGate(true, 'Your Supabase account is valid, but no active RaPS role/scope is assigned. Contact an Enterprise Administrator.', 'error');
      return false;
    }

    writeCachedIdentity(loaded);
    exposeIdentity(loaded, 'connected');
    setGate(false);
    return true;
  } catch (error) {
    console.warn('RaPS cloud identity lookup failed', error);

    if (useCachedIdentity(user?.id)) {
      return true;
    }

    setStatus('offline', 'Cloud unavailable · Sign-in required before offline use');
    setGate(true, 'RaPS could not verify your role. Check the network connection and try again. First-time use on a device requires an online sign-in.', 'error');
    return false;
  }
}

async function handleSignIn(event) {
  event.preventDefault();
  if (!client) return;

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

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.user) throw new Error('Supabase did not return an authenticated user.');

    await establishIdentity(data.user);
    if (byId('cloudAuthPassword')) byId('cloudAuthPassword').value = '';
  } catch (error) {
    console.error('RaPS sign-in failed', error);
    setStatus('denied', 'Not signed in');
    setGate(true, error?.message || 'Unable to sign in.', 'error');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Sign In';
    }
  }
}

async function handleSetPassword(event) {
  event.preventDefault();
  if (!client) return;

  const password = byId('cloudActivationPassword')?.value || '';
  const confirmPassword = byId('cloudActivationConfirm')?.value || '';
  const submit = byId('cloudActivationSubmit');

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
    submit.textContent = 'Activating…';
  }
  setActivationGate(true, 'Setting your RaPS password…', 'working');

  try {
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    if (!data?.user) throw new Error('Supabase did not return the activated user.');

    if (byId('cloudActivationPassword')) byId('cloudActivationPassword').value = '';
    if (byId('cloudActivationConfirm')) byId('cloudActivationConfirm').value = '';
    clearActivationUrl();
    setActivationGate(false);
    await establishIdentity(data.user);
    setStatus('connected', 'RaPS account activated · Cloud connected');
  } catch (error) {
    console.error('RaPS account activation failed', error);
    setActivationGate(true, error?.message || 'Unable to activate account.', 'error');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Activate Account';
    }
  }
}

async function handleSignOut() {
  if (!client) return;
  if (!confirm('Sign out of RaPS on this device? Offline cached identity will also be removed. Local evaluation data will remain on this device.')) return;

  try {
    await client.auth.signOut();
  } catch (error) {
    console.warn('Supabase sign-out returned an error', error);
  }

  identity = null;
  clearCachedIdentity();
  setActivationGate(false);
  window.RAPS_CLOUD = null;
  document.body.dataset.rapsRole = 'none';
  document.body.dataset.rapsCloudMode = 'signed-out';
  setStatus('denied', 'Not signed in');
  setGate(true, 'Signed out. Sign in to continue.', '');
}

async function initCloudAuth() {
  injectUi();

  if (!CFG.projectUrl || !CFG.publishableKey) {
    setStatus('denied', 'Cloud configuration missing');
    setGate(true, 'RaPS cloud configuration is missing. Contact the application administrator.', 'error');
    return;
  }

  if (!window.supabase?.createClient) {
    if (useCachedIdentity()) return;
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
        detectSessionInUrl: true,
        storageKey: CFG.authStorageKey || 'raps-supabase-auth-v1'
      }
    }
  );

  window.RAPS_SUPABASE = client;
  setStatus('checking', 'Checking RaPS cloud identity…');

  const { data: { session }, error } = await client.auth.getSession();

  if (error) {
    console.warn('Supabase session lookup failed', error);
    if (useCachedIdentity()) return;
    setGate(true, 'Unable to verify a RaPS session. Sign in when network access is available.', 'error');
    return;
  }

  if (session?.user) {
    if (activationRequested()) {
      setGate(false);
      setStatus('checking', 'RaPS invitation verified · Set password to continue');
      setActivationGate(true, 'Create a password to finish activating your RaPS account.', '');
    } else {
      await establishIdentity(session.user);
    }
  } else {
    setStatus('denied', 'Not signed in');
    if (activationRequested()) {
      setGate(true, 'This activation link could not establish a valid session. Request a new invitation from your RaPS administrator.', 'error');
    } else {
      setGate(true, 'Sign in with your authorized RaPS account.', '');
    }
  }

  const { data } = client.auth.onAuthStateChange((event, nextSession) => {
    if (event === 'SIGNED_OUT') {
      identity = null;
      setStatus('denied', 'Not signed in');
      setGate(true, 'Signed out. Sign in to continue.', '');
      return;
    }

    if ((event === 'PASSWORD_RECOVERY' || activationRequested()) && nextSession?.user) {
      window.setTimeout(() => {
        setGate(false);
        setStatus('checking', 'RaPS invitation verified · Set password to continue');
        setActivationGate(true, 'Create a password to finish activating your RaPS account.', '');
      }, 0);
      return;
    }

    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && nextSession?.user) {
      window.setTimeout(() => establishIdentity(nextSession.user), 0);
    }
  });

  authSubscription = data?.subscription || null;

  window.addEventListener('online', () => {
    if (identity?.user?.id) establishIdentity(identity.user);
  });

  window.addEventListener('offline', () => {
    const current = identity || readCachedIdentity();
    if (current?.user?.id) {
      exposeIdentity(current, 'offline');
    } else {
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
