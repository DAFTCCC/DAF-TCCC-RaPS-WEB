(() => {
'use strict';

const ROLE_LABELS = Object.freeze({
  evaluator: 'Evaluator',
  program_manager: 'Program Manager',
  majcom_manager: 'MAJCOM Manager',
  enterprise_admin: 'Enterprise Admin'
});

let catalog = { profiles: [], memberships: [], bases: [], majcoms: [] };
let mounted = false;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function isEnterprise() {
  return window.RAPS_CLOUD?.role === 'enterprise_admin';
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
      <p class="helper">Create RaPS accounts by invitation, assign scoped access, and deactivate memberships. Authentication stays in Supabase; RaPS never stores administrator passwords or service-role credentials in the browser.</p>

      <div id="adminMessage" class="adminMessage" aria-live="polite"></div>

      <details class="analyticsDetails" open>
        <summary>Invite New User</summary>
        <div class="adminFormGrid">
          <label><span>Email</span><input id="adminInviteEmail" type="email" autocomplete="off" placeholder="user@example.mil"></label>
          <label><span>Display name</span><input id="adminInviteName" type="text" autocomplete="off" placeholder="Name"></label>
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
        <p class="helper">The invite action uses a Supabase Edge Function. The service-role key remains server-side inside Supabase and is never shipped in the RaPS web app.</p>
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
  `);

  $('adminInviteRole')?.addEventListener('change', () => renderScope('Invite'));
  $('adminExistingRole')?.addEventListener('change', () => renderScope('Existing'));
  $('adminRefreshBtn')?.addEventListener('click', () => loadAdminData());
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
    select.innerHTML = catalog.bases.map(b =>
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
  return !(Number.isFinite(starts) && starts > now) && !(Number.isFinite(ends) && ends <= now);
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
  wrap.innerHTML = `
    <div class="analyticsTableWrap">
      <table class="analyticsTable adminTable">
        <thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${rows.map(m => {
            const p = profileById.get(m.user_id) || {};
            const selfEnterprise = m.user_id === currentUser && m.role === 'enterprise_admin' && activeNow(m);
            return `<tr>
              <td><b>${esc(p.display_name || p.email || m.user_id)}</b><div><small>${esc(p.email || '')}</small></div></td>
              <td>${esc(ROLE_LABELS[m.role] || m.role)}</td>
              <td>${esc(membershipScope(m))}</td>
              <td><span class="statusPill ${activeNow(m) ? 'pass' : 'trash'}">${activeNow(m) ? 'ACTIVE' : 'INACTIVE'}</span></td>
              <td>${activeNow(m)
                ? `<button class="ghost small danger" data-admin-deactivate="${esc(m.id)}" ${selfEnterprise ? 'disabled title="You cannot deactivate your own active Enterprise Admin membership here."' : ''}>Deactivate</button>`
                : '<span class="rowSub">Inactive</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('[data-admin-deactivate]').forEach(btn => {
    btn.addEventListener('click', () => deactivateMembership(btn.dataset.adminDeactivate));
  });
}

async function loadAdminData() {
  inject();
  const card = $('enterpriseAdminCard');
  if (!card) return;
  card.classList.toggle('hidden', !isEnterprise());
  if (!isEnterprise()) return;

  const client = window.RAPS_SUPABASE;
  if (!client) return;
  setMessage('Loading enterprise users…', 'working');

  const [profiles, memberships, bases, majcoms] = await Promise.all([
    client.from('profiles').select('id, display_name, email').order('display_name'),
    client.from('memberships').select('id,user_id,role,base_id,majcom_id,active,starts_at,ends_at,created_at,bases(id,code,name),majcoms(id,code,name)').order('created_at',{ascending:false}),
    client.from('bases').select('id,code,name,majcom_id,active').eq('active',true).order('name'),
    client.from('majcoms').select('id,code,name,active').eq('active',true).order('code')
  ]);

  const firstError = profiles.error || memberships.error || bases.error || majcoms.error;
  if (firstError) {
    setMessage(firstError.message || 'Unable to load enterprise users.', 'error');
    return;
  }

  catalog = {
    profiles: profiles.data || [],
    memberships: memberships.data || [],
    bases: bases.data || [],
    majcoms: majcoms.data || []
  };

  const userSelect = $('adminExistingUser');
  if (userSelect) {
    userSelect.innerHTML = catalog.profiles.map(p =>
      `<option value="${esc(p.id)}">${esc(p.display_name || p.email || p.id)}${p.email ? ` · ${esc(p.email)}` : ''}</option>`
    ).join('');
  }

  renderScope('Invite');
  renderScope('Existing');
  renderTable();
  setMessage('Enterprise access data loaded.', 'success');
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

async function inviteUser() {
  if (!isEnterprise()) return;
  const client = window.RAPS_SUPABASE;
  const email = $('adminInviteEmail')?.value.trim() || '';
  const display_name = $('adminInviteName')?.value.trim() || '';
  if (!email) { setMessage('Enter an email address.', 'error'); return; }

  const button = $('adminInviteBtn');
  button.disabled = true;
  setMessage('Sending Supabase invitation…', 'working');

  try {
    const payload = { email, display_name, ...scopePayload('Invite') };
    const { data, error } = await client.functions.invoke('admin-invite-user', { body: payload });
    if (error) throw error;
    if (data?.error) throw new Error(data.error + (data.detail ? ` · ${data.detail}` : ''));
    setMessage(`Invitation sent to ${email} and RaPS access assigned.`, 'success');
    $('adminInviteEmail').value = '';
    $('adminInviteName').value = '';
    await loadAdminData();
  } catch (error) {
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
    console.error('RaPS admin invite failed', error);
    setMessage(`Invite failed: ${detail}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function assignExisting() {
  if (!isEnterprise()) return;
  const client = window.RAPS_SUPABASE;
  const user_id = $('adminExistingUser')?.value;
  if (!user_id) { setMessage('Select a user.', 'error'); return; }

  const payload = {
    user_id,
    ...scopePayload('Existing'),
    active: true,
    starts_at: new Date().toISOString(),
    ends_at: null,
    created_by: window.RAPS_CLOUD.user.id
  };

  const button = $('adminAssignBtn');
  button.disabled = true;
  setMessage('Assigning RaPS access…', 'working');

  try {
    const { error } = await client.from('memberships').insert(payload);
    if (error) throw error;
    setMessage('Access assigned.', 'success');
    await loadAdminData();
  } catch (error) {
    setMessage(`Assignment failed: ${error?.message || error}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deactivateMembership(id) {
  if (!isEnterprise() || !id) return;
  if (!confirm('Deactivate this RaPS membership? The account will remain in Supabase, but this role/scope will no longer authorize access.')) return;

  const client = window.RAPS_SUPABASE;
  setMessage('Deactivating membership…', 'working');
  const { error } = await client.from('memberships').update({ active:false, ends_at:new Date().toISOString() }).eq('id',id);
  if (error) {
    setMessage(`Deactivate failed: ${error.message}`, 'error');
    return;
  }
  setMessage('Membership deactivated.', 'success');
  await loadAdminData();
}

window.addEventListener('raps-cloud-identity', () => loadAdminData());

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
