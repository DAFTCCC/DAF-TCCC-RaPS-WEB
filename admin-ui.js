(() => {
'use strict';

const ROLE_LABELS = Object.freeze({
  evaluator: 'Evaluator',
  program_manager: 'Program Manager',
  majcom_manager: 'MAJCOM Manager',
  enterprise_admin: 'Enterprise Admin'
});

let catalog = {
  profiles: [],
  memberships: [],
  bases: [],
  majcoms: [],
  accessRequests: []
};
let mounted = false;
let adminLoadId = 0;
let adminClientId = 0;
const pendingAdminActions = new Set();
let managedUsers = [];
let managedReady = false;
let temporaryCredentialTimer = null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function isEnterprise() {
  return window.RAPS_PERMISSIONS?.hasRole('enterprise_admin') === true;
}

// Bind every step of an administration action to the identity that started it.
// The server still enforces every mutation; this prevents an old dialog or
// response from continuing with the account another tab has since selected.
function adminRequest() {
  const permissions = window.RAPS_PERMISSIONS;
  const token = permissions?.snapshot();
  const source = window.RAPS_SUPABASE;
  const userId = window.RAPS_CLOUD?.user?.id;
  let boundClient = null;
  let preparation = null;
  const current = () => !!source && permissions?.isCurrent(token) && isEnterprise();
  const assert = () => {
    if (!current()) throw new Error('Your account or access changed. Refresh before continuing.');
  };
  const ready = () => preparation ||= (async () => {
    assert();
    const { data, error } = await source.auth.getSession();
    assert();
    const session = data?.session;
    if (error || !session?.access_token || session.user?.id !== userId) {
      throw new Error('Your sign-in session changed or expired. Sign in again before managing access.');
    }
    const config = window.RAPS_CLOUD_CONFIG;
    if (!config?.projectUrl || !config?.publishableKey || !window.supabase?.createClient) {
      throw new Error('The account service is unavailable. Reload before managing access.');
    }
    // Use a request-specific client with a fixed bearer token. A session change
    // in another tab cannot retarget an already started administrative request.
    boundClient = window.supabase.createClient(config.projectUrl, config.publishableKey, {
      auth: {
        persistSession:false, autoRefreshToken:false, detectSessionInUrl:false,
        storageKey:`raps-admin-request-${++adminClientId}`
      },
      global:{ headers:{ Authorization:`Bearer ${session.access_token}` } }
    });
    assert();
  })();
  const guarded = query => new Proxy(query, {
    get(target, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve()
        .then(() => { assert(); return target; })
        .then(result => { assert(); return result; })
        .then(resolve, reject);
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return (...args) => {
        assert();
        const result = value.apply(target, args);
        return result && typeof result.then === 'function' ? guarded(result) : result;
      };
    }
  });
  return {
    userId, current, assert, ready,
    client: {
      from(...args) {
        assert();
        if (!boundClient) throw new Error('Verify your session before managing access.');
        return guarded(boundClient.from(...args));
      },
      functions: {
        async invoke(...args) {
          await ready();
          assert();
          const result = await boundClient.functions.invoke(...args);
          assert();
          return result;
        }
      }
    }
  };
}

function clearAdminData() {
  adminLoadId++;
  clearTemporaryCredentials();
  managedUsers = [];
  managedReady = false;
  catalog = { profiles:[], memberships:[], bases:[], majcoms:[], accessRequests:[] };
  for (const id of ['adminMembershipTable', 'adminAccessRequestTable', 'adminExistingUser', 'adminInviteScope', 'adminExistingScope']) {
    const element = $(id);
    if (element) element.innerHTML = '';
  }
  for (const id of ['adminInviteEmail', 'adminInviteName', 'adminManagedUsername', 'adminManagedName']) {
    const element = $(id);
    if (element) element.value = '';
  }
  for (const id of ['adminUserCount', 'adminRequestCount', 'adminMessage']) {
    const element = $(id);
    if (element) element.textContent = '';
  }
  renderManagedUsers();
}

function setMessage(text = '', kind = '') {
  const el = $('adminMessage');
  if (!el) return;
  el.textContent = text;
  el.className = `adminMessage ${kind}`.trim();
}

function inject() {
  if (mounted || $('enterpriseAdminCard')) return;
  const area = $('areaProgram');
  if (!area) return;

  area.insertAdjacentHTML('beforeend', `
    <section id="enterpriseAdminCard" class="card managementCard enterpriseAdminCard hidden">
      <div class="cardHead"><span>Enterprise User Administration</span><span>Role + organizational scope</span></div>
      <p class="helper">Create username accounts with a temporary password, invite email accounts, and manage scoped access. Username accounts use administrator-assisted recovery. Temporary passwords are shown once and must be changed before accessing training data.</p>

      <div id="adminMessage" class="adminMessage" aria-live="polite"></div>

      <details class="analyticsDetails" open>
        <summary>Create Username Login</summary>
        <div class="adminFormGrid">
          <label><span>Username</span><input id="adminManagedUsername" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" placeholder="first.last"></label>
          <label><span>Display name</span><input id="adminManagedName" type="text" autocomplete="off" maxlength="120" placeholder="Name"></label>
          <label><span>Role</span><select id="adminManagedRole">
            <option value="evaluator">Evaluator</option><option value="program_manager">Program Manager</option>
            <option value="majcom_manager">MAJCOM Manager</option><option value="enterprise_admin">Enterprise Admin</option>
          </select></label>
          <label id="adminManagedScopeWrap"><span id="adminManagedScopeLabel">Installation</span><select id="adminManagedScope"></select></label>
        </div>
        <div class="adminActions"><button id="adminManagedCreateBtn" class="action primary" type="button">Create User &amp; Temporary Password</button></div>
        <p class="helper">Use 3–32 letters, numbers, periods, underscores, or hyphens. Usernames are case-insensitive. Give the generated password privately to the intended person; it expires after 24 hours.</p>
      </details>

      <details class="analyticsDetails">
        <summary>Username Account Recovery</summary>
        <div class="adminFormGrid"><label><span>Username account</span><select id="adminManagedUser"></select></label></div>
        <div class="adminActions"><button id="adminManagedResetBtn" class="action" type="button">Issue New Temporary Password</button></div>
        <p id="adminManagedStatus" class="helper" aria-live="polite"></p>
        <p class="helper">Verify the person's identity before issuing a replacement. Resetting access invalidates earlier server sessions and requires a new password. You cannot reset your own account here.</p>
      </details>

      <details class="analyticsDetails" open>
        <summary>Pending Access Requests <span id="adminRequestCount"></span></summary>
        <div class="adminToolbar">
          <button id="adminRequestRefreshBtn" class="ghost small" type="button">Refresh</button>
        </div>
        <div id="adminAccessRequestTable"></div>
      </details>

      <details class="analyticsDetails">
        <summary>Invite New User Manually</summary>
        <div class="adminFormGrid">
          <label><span>Email</span><input id="adminInviteEmail" type="email" autocomplete="off" maxlength="254" placeholder="user@example.mil"></label>
          <label><span>Display name</span><input id="adminInviteName" type="text" autocomplete="off" maxlength="120" placeholder="Name"></label>
          <label><span>Role</span>
            <select id="adminInviteRole">
              <option value="evaluator">Evaluator</option>
              <option value="program_manager">Program Manager</option>
              <option value="majcom_manager">MAJCOM Manager</option>
              <option value="enterprise_admin">Enterprise Admin</option>
            </select>
          </label>
          <label id="adminInviteScopeWrap"><span id="adminInviteScopeLabel">Base</span><select id="adminInviteScope"></select></label>
        </div>
        <div class="adminActions">
          <button id="adminInviteBtn" class="action primary" type="button">Send Invite + Assign Access</button>
        </div>
        <p class="helper">New users receive a secure email link to create their own password. For an existing account, assign access below, then select Send Setup / Reset Email in Current Users &amp; Access. Check the recipient's spam folder if needed. Account emails require the authentication mail service to be configured.</p>
      </details>

      <details class="analyticsDetails">
        <summary>Assign Access to Existing Account</summary>
        <div class="adminFormGrid">
          <label><span>User</span><select id="adminExistingUser"></select></label>
          <label><span>Role</span>
            <select id="adminExistingRole">
              <option value="evaluator">Evaluator</option>
              <option value="program_manager">Program Manager</option>
              <option value="majcom_manager">MAJCOM Manager</option>
              <option value="enterprise_admin">Enterprise Admin</option>
            </select>
          </label>
          <label id="adminExistingScopeWrap"><span id="adminExistingScopeLabel">Base</span><select id="adminExistingScope"></select></label>
        </div>
        <div class="adminActions">
          <button id="adminAssignBtn" class="action" type="button">Assign Access</button>
        </div>
      </details>

      <details class="analyticsDetails" open>
        <summary>Current Users &amp; Access</summary>
        <div class="adminToolbar">
          <button id="adminRefreshBtn" class="ghost small" type="button">Refresh</button>
          <span id="adminUserCount"></span>
        </div>
        <div id="adminMembershipTable"></div>
      </details>
    </section>
    <dialog id="adminTemporaryCredentials" class="adminCredentialDialog" aria-labelledby="adminTemporaryCredentialsTitle">
      <h2 id="adminTemporaryCredentialsTitle">Temporary login credentials</h2>
      <p>Give these credentials privately to the intended person. This password is shown once and clears when this dialog closes.</p>
      <label><span>Username</span><input id="adminTemporaryUsername" type="text" readonly autocomplete="off"></label>
      <label><span>Temporary password</span><input id="adminTemporaryPassword" type="text" readonly autocomplete="off" spellcheck="false"></label>
      <p id="adminTemporaryExpiry"></p><p id="adminTemporaryCopyStatus" aria-live="polite"></p>
      <div class="adminActions"><button id="adminTemporaryCopyBtn" class="action" type="button">Copy Credentials</button><button id="adminTemporaryCloseBtn" class="ghost" type="button">Done</button></div>
    </dialog>
  `);

  $('adminManagedRole')?.addEventListener('change', () => renderScope('Managed'));
  $('adminManagedCreateBtn')?.addEventListener('click', createManagedUser);
  $('adminManagedResetBtn')?.addEventListener('click', resetManagedPassword);
  $('adminManagedUser')?.addEventListener('change', renderManagedResetState);
  $('adminTemporaryCloseBtn')?.addEventListener('click', clearTemporaryCredentials);
  $('adminTemporaryCredentials')?.addEventListener('close', clearTemporaryCredentials);
  $('adminTemporaryCredentials')?.addEventListener('cancel', clearTemporaryCredentials);
  $('adminTemporaryCopyBtn')?.addEventListener('click', copyTemporaryCredentials);
  $('adminInviteRole')?.addEventListener('change', () => renderScope('Invite'));
  $('adminExistingRole')?.addEventListener('change', () => renderScope('Existing'));
  $('adminRefreshBtn')?.addEventListener('click', () => loadAdminData());
  $('adminRequestRefreshBtn')?.addEventListener('click', () => loadAdminData());
  $('adminInviteBtn')?.addEventListener('click', inviteUser);
  $('adminAssignBtn')?.addEventListener('click', assignExisting);

  mounted = true;
}

function roleScope(role) {
  if (role === 'evaluator' || role === 'program_manager') return 'base';
  if (role === 'majcom_manager') return 'majcom';
  return 'enterprise';
}

function renderScope(prefix) {
  const role = $(`admin${prefix}Role`)?.value || 'evaluator';
  const wrap = $(`admin${prefix}ScopeWrap`);
  const label = $(`admin${prefix}ScopeLabel`);
  const select = $(`admin${prefix}Scope`);
  if (!wrap || !label || !select) return;

  const type = roleScope(role);
  wrap.classList.toggle('hidden', type === 'enterprise');

  if (type === 'base') {
    label.textContent = 'Base';
    // Retain deployed legacy memberships in the management table, but do not
    // offer the superseded duplicate TEST bases for a new access grant.
    select.innerHTML = catalog.bases.filter(b => !String(b.code || '').toUpperCase().startsWith('TEST-')).map(b =>
      `<option value="${esc(b.id)}">${esc(b.code || b.name)} · ${esc(b.name)}</option>`
    ).join('');
  } else if (type === 'majcom') {
    label.textContent = 'MAJCOM';
    select.innerHTML = catalog.majcoms.map(m =>
      `<option value="${esc(m.id)}">${esc(m.code || m.name)} · ${esc(m.name)}</option>`
    ).join('');
  } else {
    select.innerHTML = '';
  }
}

function membershipScope(m) {
  if (m.role === 'enterprise_admin') return 'Enterprise';
  if (m.role === 'majcom_manager') return m.majcoms?.code || m.majcoms?.name || 'MAJCOM not found';
  return m.bases?.code || m.bases?.name || 'Base not found';
}

function activeNow(m) {
  if (!m?.active) return false;
  const now = Date.now();
  const starts = m.starts_at ? Date.parse(m.starts_at) : null;
  const ends = m.ends_at ? Date.parse(m.ends_at) : null;
  if ((m.starts_at && !Number.isFinite(starts)) || (m.ends_at && !Number.isFinite(ends))) return false;
  return !(Number.isFinite(starts) && starts > now) && !(Number.isFinite(ends) && ends <= now);
}


function accessRequestScope(request) {
  if (request.requested_role === 'majcom_manager') {
    return request.majcoms?.code ||
      request.majcoms?.name ||
      'MAJCOM not found';
  }

  return request.bases?.code ||
    request.bases?.name ||
    'Installation not found';
}

function renderAccessRequests() {
  const wrap = $('adminAccessRequestTable');
  const count = $('adminRequestCount');

  if (!wrap) return;

  const requests = (catalog.accessRequests || [])
    .filter(r => r.status === 'pending')
    .slice()
    .sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || ''))
    );

  if (count) {
    count.textContent =
      `· ${requests.length} pending`;
  }

  if (!requests.length) {
    wrap.innerHTML =
      '<div class="analyticsEmpty">No pending access requests.</div>';
    return;
  }

  wrap.innerHTML = `
    <div class="analyticsTableWrap">
      <table class="analyticsTable adminTable">
        <thead>
          <tr>
            <th>Requester</th>
            <th>Requested Role</th>
            <th>Scope</th>
            <th>Reason / Program</th>
            <th>Requested</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${requests.map(r => `
            <tr>
              <td>
                <b>${esc(r.display_name || r.email)}</b>
                <div><small>${esc(r.email || '')}</small></div>
              </td>
              <td>${esc(ROLE_LABELS[r.requested_role] || r.requested_role)}</td>
              <td>${esc(accessRequestScope(r))}</td>
              <td>${esc(r.justification || '—')}</td>
              <td>${esc(
                r.created_at
                  ? new Date(r.created_at).toLocaleString()
                  : '—'
              )}</td>
              <td>
                <div class="adminRowActions">
                  <button
                    class="action small"
                    data-admin-approve-request="${esc(r.id)}"
                    type="button">
                    Approve
                  </button>

                  <button
                    class="ghost small danger"
                    data-admin-deny-request="${esc(r.id)}"
                    type="button">
                    Deny
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-admin-approve-request]').forEach(btn => {
    btn.addEventListener(
      'click',
      () => approveAccessRequest(btn.dataset.adminApproveRequest, btn)
    );
  });

  wrap.querySelectorAll('[data-admin-deny-request]').forEach(btn => {
    btn.addEventListener(
      'click',
      () => denyAccessRequest(btn.dataset.adminDenyRequest, btn)
    );
  });
}

function renderTable() {
  const wrap = $('adminMembershipTable');
  if (!wrap) return;

  const profileById = new Map(catalog.profiles.map(p => [p.id, p]));
  $('adminUserCount').textContent = `${catalog.profiles.length} account${catalog.profiles.length === 1 ? '' : 's'} · ${catalog.memberships.filter(activeNow).length} active membership${catalog.memberships.filter(activeNow).length === 1 ? '' : 's'}`;

  const rows = catalog.memberships.slice().sort((a,b) => {
    const pa = profileById.get(a.user_id), pb = profileById.get(b.user_id);
    return String(pa?.display_name || pa?.email || '').localeCompare(String(pb?.display_name || pb?.email || ''));
  });

  if (!rows.length) {
    wrap.innerHTML = '<div class="analyticsEmpty">No RaPS memberships found.</div>';
    return;
  }

  const currentUser = window.RAPS_CLOUD?.user?.id;
  const deleteRendered = new Set();
  const setupRendered = new Set();
  wrap.innerHTML = `
    <div class="analyticsTableWrap">
      <table class="analyticsTable adminTable">
        <thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${rows.map(m => {
            const p = profileById.get(m.user_id) || {};
            const selfEnterprise = m.user_id === currentUser && m.role === 'enterprise_admin' && activeNow(m);
            const userHasAnyActive = catalog.memberships.some(x => x.user_id === m.user_id && activeNow(x));
            const showDelete = !userHasAnyActive && m.user_id !== currentUser && !deleteRendered.has(m.user_id);
            if (showDelete) deleteRendered.add(m.user_id);
            const showSetup = activeNow(m) && !isManagedProfile(p) && !setupRendered.has(m.user_id);
            if (showSetup) setupRendered.add(m.user_id);
            return `<tr>
              <td><b>${esc(p.display_name || loginLabel(p) || m.user_id)}</b><div><small>${esc(loginLabel(p))}</small></div></td>
              <td>${esc(ROLE_LABELS[m.role] || m.role)}</td>
              <td>${esc(membershipScope(m))}</td>
              <td><span class="statusPill ${activeNow(m) ? 'pass' : 'trash'}">${activeNow(m) ? 'ACTIVE' : 'INACTIVE'}</span></td>
              <td>${activeNow(m)
                ? `<div class="adminRowActions"><button class="ghost small danger" data-admin-deactivate="${esc(m.id)}" ${selfEnterprise ? 'disabled title="You cannot deactivate your own active Enterprise Admin membership here."' : ''}>Deactivate</button>
                    ${showSetup ? `<button class="ghost small" type="button" data-admin-setup-user="${esc(m.user_id)}">Send Setup / Reset Email</button>` : ''}</div>`
                : `<div class="adminRowActions">
                    <button class="ghost small" data-admin-reactivate="${esc(m.id)}">Reactivate</button>
                    ${showDelete ? `<button class="ghost small danger" data-admin-delete-user="${esc(m.user_id)}" data-admin-delete-label="${esc(p.display_name || p.email || m.user_id)}">Delete Account</button>` : ''}
                   </div>`}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('[data-admin-deactivate]').forEach(btn => {
    btn.addEventListener('click', () => deactivateMembership(btn.dataset.adminDeactivate));
  });
  wrap.querySelectorAll('[data-admin-reactivate]').forEach(btn => {
    btn.addEventListener('click', () => reactivateMembership(btn.dataset.adminReactivate));
  });
  wrap.querySelectorAll('[data-admin-delete-user]').forEach(btn => {
    btn.addEventListener('click', () => deleteAccount(btn.dataset.adminDeleteUser, btn.dataset.adminDeleteLabel || 'this account'));
  });
  wrap.querySelectorAll('[data-admin-setup-user]').forEach(btn => {
    btn.addEventListener('click', () => sendSetupEmail(btn.dataset.adminSetupUser, btn));
  });
}

async function readAllAdminRows(queryFactory) {
  const rows = [];
  const seen = new Set();
  for (let offset = 0;;) {
    const { data, error } = await queryFactory().range(offset, offset + 499);
    if (error) return { data:null, error };
    if (!Array.isArray(data)) return { data:null, error:{ message:'The account service returned an invalid list response.' } };
    if (!data.length) return { data:rows, error:null };
    for (const row of data) {
      if (!row?.id || seen.has(row.id)) return { data:null, error:{ message:'The account service returned an inconsistent page. Refresh and check service pagination.' } };
      seen.add(row.id);
      rows.push(row);
    }
    // Deployments can impose a smaller response cap than the requested range.
    offset += data.length;
  }
}

async function loadAdminData() {
  inject();
  const card = $('enterpriseAdminCard');
  if (!card) return;
  card.classList.toggle('hidden', !isEnterprise());
  if (!isEnterprise()) { clearAdminData(); return; }

  if (!window.RAPS_SUPABASE) return;
  const access = adminRequest();
  const client = access.client;
  const loadId = ++adminLoadId;
  managedReady = false;
  managedUsers = [];
  renderManagedUsers();
  setMessage('Loading enterprise users…', 'working');

  let results;
  try {
    await access.ready();
    results = await Promise.all([
    readAllAdminRows(() => client.from('profiles').select('id, display_name, email').order('display_name').order('id')),
    readAllAdminRows(() => client.from('memberships').select('id,user_id,role,base_id,majcom_id,active,starts_at,ends_at,created_at,bases(id,code,name),majcoms(id,code,name)').order('created_at',{ascending:false}).order('id')),
    readAllAdminRows(() => client.from('bases').select('id,code,name,majcom_id,active').eq('active',true).order('name').order('id')),
    readAllAdminRows(() => client.from('majcoms').select('id,code,name,active').eq('active',true).order('code').order('id')),
    readAllAdminRows(() => client
      .from('access_requests')
      .select('id,email,display_name,requested_role,base_id,majcom_id,justification,status,created_at,reviewed_at,reviewed_by,review_note,bases(id,code,name),majcoms(id,code,name)')
      .eq('status','pending')
      .order('created_at',{ascending:true}).order('id')),
    readManagedUsers(access).catch(() => ({ unavailable:true, users:[] }))
    ]);
  } catch (error) {
    if (access.current() && loadId === adminLoadId) setMessage(error?.message || 'Unable to load enterprise users.', 'error');
    return;
  }

  if (!access.current() || loadId !== adminLoadId) return;
  const [profiles, memberships, bases, majcoms, accessRequests, managed] = results;

  const firstError =
    profiles.error ||
    memberships.error ||
    bases.error ||
    majcoms.error ||
    accessRequests.error;
  if (firstError) {
    setMessage(firstError.message || 'Unable to load enterprise users.', 'error');
    return;
  }

  catalog = {
    profiles: profiles.data || [],
    memberships: memberships.data || [],
    bases: bases.data || [],
    majcoms: majcoms.data || [],
    accessRequests: accessRequests.data || []
  };
  managedReady = managed?.unavailable !== true;
  managedUsers = managedReady ? managed.users : [];

  const userSelect = $('adminExistingUser');
  if (userSelect) {
    userSelect.innerHTML = catalog.profiles.map(p =>
      `<option value="${esc(p.id)}">${esc(p.display_name || loginLabel(p) || p.id)}${loginLabel(p) ? ` · ${esc(loginLabel(p))}` : ''}</option>`
    ).join('');
  }

  renderScope('Invite');
  renderScope('Existing');
  renderScope('Managed');
  renderManagedUsers();
  renderAccessRequests();
  renderTable();
  setMessage('Enterprise access data loaded.', 'success');
}

function isManagedProfile(profile) {
  return managedUsers.some(user => user.id === profile?.id) || /@login\.raps\.invalid$/i.test(profile?.email || '');
}

function loginLabel(profile) {
  const managed = managedUsers.find(user => user.id === profile?.id);
  if (managed) return managed.username;
  const email = String(profile?.email || '');
  return /@login\.raps\.invalid$/i.test(email) ? email.split('@')[0] : email;
}

async function readManagedUsers(access) {
  const users = [], seen = new Set();
  let offset = 0;
  for (;;) {
    access.assert();
    const { data, error } = await access.client.functions.invoke('managed-login', { body:{ action:'list_users', offset, limit:500 } });
    access.assert();
    if (error || data?.ok !== true || !Array.isArray(data.users)) throw new Error('Username account service unavailable.');
    for (const user of data.users) {
      if (!user?.id || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(user.username || '') || seen.has(user.id)) throw new Error('Username account list is inconsistent.');
      seen.add(user.id);
      users.push(user);
    }
    if (data.next_offset === null) return { users };
    if (!Number.isSafeInteger(data.next_offset) || data.next_offset !== offset + data.users.length || !data.users.length) throw new Error('Username account pagination is inconsistent.');
    offset = data.next_offset;
  }
}

function renderManagedUsers() {
  const select = $('adminManagedUser');
  if (select) {
    const previous = select.value;
    select.innerHTML = '<option value="">Select a username account…</option>'+managedUsers.map(user =>
      `<option value="${esc(user.id)}">${esc(user.username)}${user.password_change_required ? ' · Password setup required' : ''}</option>`).join('');
    if (managedUsers.some(user => user.id === previous)) select.value = previous;
  }
  const create = $('adminManagedCreateBtn');
  if (create) create.disabled = !managedReady || !isEnterprise() || pendingAdminActions.has('managed-create');
  const status = $('adminManagedStatus');
  if (status) status.textContent = managedReady ? `${managedUsers.length} username account${managedUsers.length === 1 ? '' : 's'}.` : 'Username account service unavailable. Refresh after the server update is installed.';
  renderManagedResetState();
}

function renderManagedResetState() {
  const id = $('adminManagedUser')?.value;
  const button = $('adminManagedResetBtn');
  if (button) button.disabled = !managedReady || !isEnterprise() || !managedUsers.some(user => user.id === id)
    || id === window.RAPS_CLOUD?.user?.id || pendingAdminActions.has(`managed-reset:${id}`);
}

function clearTemporaryCredentials() {
  if (temporaryCredentialTimer !== null) window.clearTimeout?.(temporaryCredentialTimer);
  temporaryCredentialTimer = null;
  for (const id of ['adminTemporaryUsername','adminTemporaryPassword']) if ($(id)) $(id).value = '';
  for (const id of ['adminTemporaryExpiry','adminTemporaryCopyStatus']) if ($(id)) $(id).textContent = '';
  const dialog = $('adminTemporaryCredentials');
  if (dialog?.open) dialog.close();
}

function showTemporaryCredentials(data, username, access) {
  access.assert();
  if (data?.ok !== true || !matchingAccountId(data.user?.id,data.user?.id) || data.user?.username !== username
      || typeof data.temporary_password !== 'string' || data.temporary_password.length < 12
      || data.temporary_password.length > 200 || /[\u0000-\u001f\u007f]/.test(data.temporary_password)
      || !Number.isFinite(Date.parse(data.temporary_expires_at)) || Date.parse(data.temporary_expires_at) <= Date.now()) {
    throw new Error('The account service did not confirm usable credentials. Refresh the account list before issuing a replacement.');
  }
  const dialog = $('adminTemporaryCredentials');
  if (!dialog?.showModal) throw new Error('This browser cannot show the secure credential dialog. Update the browser, then issue a replacement password.');
  clearTemporaryCredentials();
  $('adminTemporaryUsername').value = data.user.username;
  $('adminTemporaryPassword').value = data.temporary_password;
  $('adminTemporaryExpiry').textContent = 'Expires '+new Date(data.temporary_expires_at).toLocaleString()+'. The user must choose a new password before opening training data.';
  try {
    dialog.showModal();
    temporaryCredentialTimer = window.setTimeout?.(clearTemporaryCredentials,5*60*1000) ?? null;
  } catch (error) {
    clearTemporaryCredentials();
    throw error;
  }
}

async function copyTemporaryCredentials() {
  const username = $('adminTemporaryUsername')?.value;
  const password = $('adminTemporaryPassword')?.value;
  if (!isEnterprise() || !$('adminTemporaryCredentials')?.open || !username || !password) return;
  const current = () => isEnterprise() && $('adminTemporaryCredentials')?.open
    && $('adminTemporaryUsername')?.value === username && $('adminTemporaryPassword')?.value === password;
  try {
    await navigator.clipboard.writeText(`RaPS username: ${username}\nTemporary password: ${password}`);
    if (current()) $('adminTemporaryCopyStatus').textContent = 'Copied. Send privately to the intended person.';
  } catch {
    if (current()) $('adminTemporaryCopyStatus').textContent = 'Copy unavailable. Select the fields and copy them manually.';
  }
}

async function createManagedUser() {
  if (!isEnterprise() || !managedReady || pendingAdminActions.has('managed-create')) return;
  const access = adminRequest();
  const username = String($('adminManagedUsername')?.value || '').trim().toLowerCase();
  const display_name = String($('adminManagedName')?.value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || !display_name || display_name.length>120 || /[\u0000-\u001f\u007f]/.test(display_name)) {
    setMessage('Enter a valid username and display name (120 characters or fewer).','error'); return;
  }
  const body = { action:'create_user', username, display_name, ...scopePayload('Managed') };
  pendingAdminActions.add('managed-create');
  renderManagedUsers();
  clearTemporaryCredentials();
  setMessage('Creating username account…','working');
  try {
    await access.ready();
    const { data,error } = await access.client.functions.invoke('managed-login',{ body });
    if (error) throw error;
    showTemporaryCredentials(data,username,access);
    $('adminManagedUsername').value = '';
    $('adminManagedName').value = '';
    setMessage('Username account created. Deliver the temporary credentials privately.','success');
    await loadAdminData();
  } catch (error) {
    const detail = await edgeFunctionError(error);
    if (access.current()) setMessage('Account creation incomplete: '+detail,'error');
  } finally {
    pendingAdminActions.delete('managed-create');
    renderManagedUsers();
  }
}

async function resetManagedPassword() {
  const userId = $('adminManagedUser')?.value;
  const target = managedUsers.find(user => user.id === userId);
  if (!isEnterprise() || !managedReady || !target || userId === window.RAPS_CLOUD?.user?.id || pendingAdminActions.has(`managed-reset:${userId}`)) return;
  const access = adminRequest();
  if (!confirm(`Issue a new temporary password for ${target.username}?\n\nVerify the person's identity first. Earlier server sessions will be invalidated and a password change will be required.`)) return;
  pendingAdminActions.add(`managed-reset:${userId}`);
  renderManagedResetState();
  clearTemporaryCredentials();
  setMessage('Issuing replacement credentials…','working');
  try {
    await access.ready();
    const { data,error } = await access.client.functions.invoke('managed-login',{ body:{ action:'reset_password',user_id:userId } });
    if (error) throw error;
    access.assert();
    if (!matchingAccountId(data?.user?.id,userId)) throw new Error('The account service returned a different account. Refresh before continuing.');
    showTemporaryCredentials(data,target.username,access);
    setMessage('Replacement issued. Deliver the temporary credentials privately.','success');
    await loadAdminData();
  } catch (error) {
    const detail = await edgeFunctionError(error);
    if (access.current()) setMessage('Password reset incomplete: '+detail,'error');
  } finally {
    pendingAdminActions.delete(`managed-reset:${userId}`);
    renderManagedResetState();
  }
}

function scopePayload(prefix) {
  const role = $(`admin${prefix}Role`)?.value || 'evaluator';
  const type = roleScope(role);
  const scope = $(`admin${prefix}Scope`)?.value || null;
  return {
    role,
    base_id: type === 'base' ? scope : null,
    majcom_id: type === 'majcom' ? scope : null
  };
}


async function edgeFunctionError(error) {
  let detail = error?.message || String(error);

  try {
    if (error?.context && typeof error.context.clone === 'function') {
      const response = error.context.clone();
      const body = await response.json().catch(() => null);

      if (body?.error) detail = body.error;
      if (body?.detail) detail += ` · ${body.detail}`;
      if (body?.code) detail = `[${body.code}] ${detail}`;
    }
  } catch (parseError) {
    console.warn('Unable to parse Edge Function error body', parseError);
  }

  return detail;
}

function requireAccountEmailResult(data, requireMembership = false) {
  if (data?.error) throw new Error(data.error + (data.detail ? ` · ${data.detail}` : ''));
  if (data?.ok !== true || data?.email_sent !== true || !data?.user?.id || (requireMembership && !data?.membership?.id)) {
    throw new Error('The account service did not confirm the email and access result. Refresh users and check the deployed account service before retrying.');
  }
}

function matchingAccountId(actual, expected) {
  return typeof actual === 'string' && typeof expected === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actual) &&
    actual.toLowerCase() === expected.toLowerCase();
}

async function verifyAccountEmail(client, userId, expectedEmail) {
  const email = String(expectedEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('The selected account has no valid email. Refresh users before assigning access.');
  }
  const { data, error } = await client.functions.invoke('admin-invite-user', {
    body:{ action:'verify_account_email', user_id:userId, email }
  });
  if (error) throw error;
  if (data?.ok !== true || !matchingAccountId(data.user?.id, userId) ||
      String(data.user?.email || '').trim().toLowerCase() !== email) {
    throw new Error('The account service did not verify this email and account. No access was assigned. Refresh users and check the account service.');
  }
}

async function sendSetupEmail(userId, button) {
  if (!isEnterprise() || !userId || pendingAdminActions.has(`setup:${userId}`)) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  const profile = catalog.profiles.find(p => p.id === userId);
  const label = profile?.email || profile?.display_name || 'this account';
  if (!confirm(`Send a secure setup/reset email to ${label}?\n\nThe recipient will choose their own password. Their RaPS access will stay the same.`)) return;
  pendingAdminActions.add(`setup:${userId}`);
  if (button) button.disabled = true;
  message(`Requesting a secure setup/reset email for ${label}…`, 'working');
  try {
    await access.ready();
    const { data, error } = await access.client.functions.invoke('admin-invite-user', {
      body:{ action:'send_setup_link', user_id:userId }
    });
    if (error) throw error;
    requireAccountEmailResult(data);
    message(`Supabase accepted the setup/reset email for ${data.user.email || label}. Ask the recipient to check their inbox and spam folder and open the newest link.`, 'success');
  } catch (error) {
    if (!access.current()) return;
    message(`Setup/reset email failed: ${await edgeFunctionError(error)}`, 'error');
  } finally {
    pendingAdminActions.delete(`setup:${userId}`);
    if (button) button.disabled = false;
  }
}

function setRequestReviewButtons(id, disabled) {
  document.querySelectorAll('[data-admin-approve-request], [data-admin-deny-request]').forEach(button => {
    if (button.dataset.adminApproveRequest === id || button.dataset.adminDenyRequest === id) button.disabled = disabled;
  });
}

async function approveAccessRequest(id, button) {
  if (!isEnterprise() || !id) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  if (pendingAdminActions.has(`request:${id}`)) return;

  const request =
    (catalog.accessRequests || []).find(r => r.id === id);

  if (!request) {
    message('Access request was not found. Refresh and try again.', 'error');
    return;
  }

  const roleLabel =
    ROLE_LABELS[request.requested_role] || request.requested_role;

  const scope =
    accessRequestScope(request);

  if (!confirm(
    `Approve RaPS access for ${request.display_name || request.email}?\n\n` +
    `${roleLabel} · ${scope}\n\n` +
    `RaPS will create/invite the account and assign this access scope.`
  )) return;

  const client = access.client;
  pendingAdminActions.add(`request:${id}`);
  setRequestReviewButtons(id, true);
  if (button) button.disabled = true;
  let accessAssigned = false;

  message(
    `Approving access request for ${request.email}…`,
    'working'
  );

  try {
    await access.ready();
    const invitePayload = {
      email: request.email,
      display_name: request.display_name,
      role: request.requested_role,
      base_id:
        request.requested_role === 'majcom_manager'
          ? null
          : request.base_id,
      majcom_id:
        request.requested_role === 'majcom_manager'
          ? request.majcom_id
          : null
    };

    // A request from an existing account needs access plus a setup/reset link,
    // rather than a second account or another initial invitation.
    const normalizedEmail = String(request.email || '').trim().toLowerCase();
    const { data:existingProfile, error:profileLookupError } = await client.from('profiles')
      .select('id,email').ilike('email', normalizedEmail.replace(/[\\%_]/g, '\\$&')).maybeSingle();
    if (profileLookupError) throw new Error('Unable to verify whether this account already exists. Refresh users and try again.');
    if (existingProfile) {
      // Profile email is display data. Only Auth can prove which login owns the
      // address on this request, including when old profile rows are incorrect.
      await verifyAccountEmail(client, existingProfile.id, normalizedEmail);
      let scopeQuery = client.from('memberships').select('id,active,starts_at,ends_at')
        .eq('user_id', existingProfile.id).eq('role', invitePayload.role).eq('active', true);
      scopeQuery = invitePayload.base_id ? scopeQuery.eq('base_id', invitePayload.base_id) : scopeQuery.is('base_id', null);
      scopeQuery = invitePayload.majcom_id ? scopeQuery.eq('majcom_id', invitePayload.majcom_id) : scopeQuery.is('majcom_id', null);
      const { data:existingMemberships, error:scopeError } = await scopeQuery;
      if (scopeError) throw new Error('Unable to verify existing account access. No new access was assigned.');
      const hasScope = (existingMemberships || []).some(activeNow);
      if (!hasScope) {
        const { data:membership, error:assignmentError } = await client.from('memberships').insert({
          user_id:existingProfile.id, role:invitePayload.role, base_id:invitePayload.base_id,
          majcom_id:invitePayload.majcom_id, active:true, starts_at:new Date().toISOString(),
          ends_at:null, created_by:access.userId
        }).select('id').single();
        if (assignmentError) throw assignmentError;
        if (!membership?.id) throw new Error('The account service did not confirm the access assignment.');
      }
      accessAssigned = true;
    }
    const { data, error } = await client.functions.invoke('admin-invite-user', {
      body:existingProfile ? { action:'send_setup_link', user_id:existingProfile.id } : invitePayload
    });

    if (error) throw error;

    requireAccountEmailResult(data, !existingProfile);
    accessAssigned = true;

    const { data:reviewedRequests, error: updateError } =
      await client
        .from('access_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: access.userId,
          review_note: 'Approved through Enterprise Access Requests'
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');

    if (updateError) {
      throw new Error(
        `Account access was assigned, but the request could not be marked approved: ${updateError.message}`
      );
    }
    if (!(reviewedRequests || []).some(r => r.id === id)) {
      throw new Error('The email and access succeeded, but this request was already reviewed elsewhere. Refresh and check its current status.');
    }

    await loadAdminData();
    if (!access.current()) return;
    message(
      `Approved ${request.email}. Supabase accepted the ${existingProfile ? 'setup/reset' : 'invitation'} email and ${roleLabel} access is assigned for ${scope}. Ask the recipient to open the newest email link.`,
      'success'
    );

  } catch (error) {
    if (!access.current()) return;
    console.error('RaPS access-request approval failed', error);

    const detail =
      await edgeFunctionError(error);
    try { await loadAdminData(); } catch {}

    message(
      `Approval incomplete: ${accessAssigned ? 'Account access is assigned. ' : ''}${detail}`,
      'error'
    );
  } finally {
    pendingAdminActions.delete(`request:${id}`);
    setRequestReviewButtons(id, false);
    if (button) button.disabled = false;
  }
}

async function denyAccessRequest(id, button) {
  if (!isEnterprise() || !id) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  if (pendingAdminActions.has(`request:${id}`)) return;

  const request =
    (catalog.accessRequests || []).find(r => r.id === id);

  if (!request) {
    message('Access request was not found. Refresh and try again.', 'error');
    return;
  }

  if (!confirm(
    `Deny the RaPS access request from ${request.display_name || request.email}?\n\n` +
    `${ROLE_LABELS[request.requested_role] || request.requested_role} · ` +
    `${accessRequestScope(request)}`
  )) return;

  const client = access.client;
  pendingAdminActions.add(`request:${id}`);
  setRequestReviewButtons(id, true);
  if (button) button.disabled = true;

  message(
    `Denying access request for ${request.email}…`,
    'working'
  );

  try {
    await access.ready();
    const { data:reviewedRequests, error } = await client.from('access_requests').update({
      status:'denied', reviewed_at:new Date().toISOString(), reviewed_by:access.userId,
      review_note:'Denied by Enterprise Administrator'
    }).eq('id', id).eq('status', 'pending').select('id');
    if (error) throw error;
    if (!(reviewedRequests || []).some(r => r.id === id)) {
      throw new Error('This request was already reviewed elsewhere. Refresh and check its current status.');
    }
    await loadAdminData();
    if (!access.current()) return;
    message(`Access request from ${request.email} was denied.`, 'success');
  } catch (error) {
    if (!access.current()) return;
    const detail = await edgeFunctionError(error);
    try { await loadAdminData(); } catch {}
    message(`Deny failed: ${detail}`, 'error');
  } finally {
    pendingAdminActions.delete(`request:${id}`);
    setRequestReviewButtons(id, false);
    if (button) button.disabled = false;
  }
}

async function inviteUser() {
  if (!isEnterprise()) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  const client = access.client;
  const email = $('adminInviteEmail')?.value.trim() || '';
  const display_name = $('adminInviteName')?.value.trim() || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    message('Enter a valid email address.', 'error'); return;
  }
  if (pendingAdminActions.has('invite')) return;

  const button = $('adminInviteBtn');
  pendingAdminActions.add('invite');
  button.disabled = true;
  message('Sending Supabase invitation…', 'working');

  try {
    await access.ready();
    const payload = { email, display_name, ...scopePayload('Invite') };
    const { data, error } = await client.functions.invoke('admin-invite-user', { body: payload });
    if (error) throw error;
    requireAccountEmailResult(data, true);
    $('adminInviteEmail').value = '';
    $('adminInviteName').value = '';
    await loadAdminData();
    if (!access.current()) return;
    message(`Supabase accepted the invitation for ${email} and RaPS access is assigned. The recipient can open the newest email link to choose a password. Check the inbox and spam folder.${data.warning ? ` ${data.warning}` : ''}`, 'success');
  } catch (error) {
    if (!access.current()) return;
    const detail = await edgeFunctionError(error);
    console.error('RaPS admin invite failed', error);
    try { await loadAdminData(); } catch {}
    message(`Invite failed: ${detail}`, 'error');
  } finally {
    pendingAdminActions.delete('invite');
    button.disabled = false;
  }
}

async function assignExisting() {
  if (!isEnterprise()) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  const client = access.client;
  const user_id = $('adminExistingUser')?.value;
  if (!user_id) { message('Select a user.', 'error'); return; }
  const selectedProfile = catalog.profiles.find(profile => matchingAccountId(profile.id, user_id));
  const expectedEmail = String(selectedProfile?.email || '').trim().toLowerCase();
  if (!expectedEmail) { message('Refresh users and select an account with a verified email.', 'error'); return; }

  const payload = {
    user_id,
    ...scopePayload('Existing'),
    active: true,
    starts_at: new Date().toISOString(),
    ends_at: null,
    created_by: access.userId
  };

  const button = $('adminAssignBtn');
  button.disabled = true;
  message('Assigning RaPS access…', 'working');

  try {
    await access.ready();
    await verifyAccountEmail(client, user_id, expectedEmail);
    const { error } = await client.from('memberships').insert(payload);
    if (error) throw error;
    message('Access assigned.', 'success');
    await loadAdminData();
  } catch (error) {
    if (!access.current()) return;
    message(`Assignment failed: ${error?.message || error}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deactivateMembership(id) {
  if (!isEnterprise() || !id) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  const target = catalog.memberships.find(row => row.id === id);
  if (target?.user_id === access.userId && target.role === 'enterprise_admin' && activeNow(target)) {
    message('You cannot deactivate your own active Enterprise Admin membership here.', 'error');
    return;
  }
  if (!confirm('Deactivate this RaPS membership? The account will remain in Supabase, but this role/scope will no longer authorize access.')) return;

  const client = access.client;
  message('Deactivating membership…', 'working');
  try {
    await access.ready();
    const { error } = await client.from('memberships')
      .update({ active:false, ends_at:new Date().toISOString() }).eq('id',id);
    if (error) throw error;
    message('Membership deactivated.', 'success');
    await loadAdminData();
  } catch (error) {
    message(`Deactivate failed: ${error?.message || error}`, 'error');
  }
}

async function reactivateMembership(id) {
  if (!isEnterprise() || !id) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  if (!confirm('Reactivate this RaPS membership? This role/scope will authorize access again immediately.')) return;

  const client = access.client;
  message('Reactivating membership…', 'working');
  try {
    await access.ready();
    const { error } = await client.from('memberships').update({
      active:true,
      starts_at:new Date().toISOString(),
      ends_at:null
    }).eq('id',id);
    if (error) throw error;
    message('Membership reactivated.', 'success');
    await loadAdminData();
  } catch (error) {
    message(`Reactivate failed: ${error?.message || error}`, 'error');
  }
}

async function deleteAccount(userId, label) {
  if (!isEnterprise() || !userId) return;
  const access = adminRequest();
  const message = (...args) => { if (access.current()) setMessage(...args); };
  if (userId === window.RAPS_CLOUD?.user?.id) {
    message('You cannot delete the account you are currently signed in with.', 'error');
    return;
  }

  const confirmation = prompt(
    `Permanently delete ${label}?\n\nOnly unused accounts with no RaPS operational history can be deleted. This removes the Supabase login and cannot be undone.\n\nType DELETE to continue.`
  );
  if (confirmation !== 'DELETE') {
    if (confirmation !== null) message('Account deletion cancelled. Type DELETE exactly to confirm.', 'error');
    return;
  }

  const client = access.client;
  message(`Checking whether ${label} can be safely deleted…`, 'working');

  try {
    await access.ready();
    const { data, error } = await client.functions.invoke('admin-manage-user', {
      body: { action:'delete_account', user_id:userId }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error + (data.detail ? ` · ${data.detail}` : ''));
    if (data?.ok !== true || !matchingAccountId(data.deleted_user_id, userId)) {
      throw new Error('The account service did not confirm deletion of this account. Refresh users and check its status before taking another action.');
    }
    await loadAdminData();
    message(`${label} was permanently deleted.${data.audit_warning ? ` ${data.audit_warning} Contact the system administrator to reconcile the audit record; the account is already deleted.` : ''}`, data.audit_warning ? 'warning' : 'success');
  } catch (error) {
    if (!access.current()) return;
    let detail = error?.message || String(error);
    let confirmedDeleted = false;
    try {
      if (error?.context && typeof error.context.clone === 'function') {
        const response = error.context.clone();
        const body = await response.json().catch(() => null);
        confirmedDeleted = body?.deleted === true && matchingAccountId(body.deleted_user_id, userId);
        if (body?.error) detail = body.error;
        if (body?.detail) detail += ` · ${body.detail}`;
        if (body?.code) detail = `[${body.code}] ${detail}`;
      }
    } catch (parseError) {
      console.warn('Unable to parse account-management error body', parseError);
    }
    if (confirmedDeleted) {
      await loadAdminData();
      message(`${label} was deleted. The service could not verify the completion audit. Contact the system administrator to reconcile the audit record; the account is already deleted.`, 'warning');
      return;
    }
    console.error('RaPS account deletion failed', error);
    message(`Delete failed: ${detail}`, 'error');
  }
}

window.addEventListener('raps-cloud-identity', () => {
  clearAdminData();
  loadAdminData();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    inject();
    loadAdminData();
  }, {once:true});
} else {
  inject();
  loadAdminData();
}

window.RAPS_ADMIN = Object.freeze({ refresh: loadAdminData });

})();
