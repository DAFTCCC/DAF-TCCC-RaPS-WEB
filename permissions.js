(() => {
'use strict';

// These checks keep the interface and background work consistent. Database RLS
// and the authenticated server handlers remain the authorization boundary.
const roles = Object.freeze(['evaluator', 'program_manager', 'majcom_manager', 'enterprise_admin']);
let catalogIdentity = null;
let bases = [];
const current = () => window.RAPS_CLOUD || null;
const present = value => typeof value === 'string' && value.trim().length > 0;
const same = (left, right) => present(left) && present(right) && left.toLowerCase() === right.toLowerCase();

function validMembership(row, { userId = null, now = Date.now() } = {}) {
  if (!row || row.active !== true || !roles.includes(row.role)) return false;
  if (row.user_id != null && userId != null && !same(row.user_id, userId)) return false;
  const starts = row.starts_at == null ? null : Date.parse(row.starts_at);
  const ends = row.ends_at == null ? null : Date.parse(row.ends_at);
  if ((starts !== null && (!Number.isFinite(starts) || starts > now)) ||
      (ends !== null && (!Number.isFinite(ends) || ends <= now)) ||
      (starts !== null && ends !== null && ends <= starts)) return false;
  if (row.role === 'enterprise_admin') return row.base_id == null && row.majcom_id == null;
  if (row.role === 'majcom_manager') {
    return present(row.majcom_id) && row.base_id == null && row.majcoms?.active !== false &&
      (row.majcoms?.id == null || same(row.majcoms.id, row.majcom_id));
  }
  return present(row.base_id) && row.majcom_id == null && row.bases?.active !== false &&
    row.bases?.majcoms?.active !== false &&
    (row.bases?.id == null || same(row.bases.id, row.base_id));
}

function activeMemberships(identity = current()) {
  if (!present(identity?.user?.id) || !Array.isArray(identity.memberships)) return [];
  return identity.memberships.filter(row => validMembership(row, { userId: identity.user.id }));
}

function available(identity, online) {
  if (!present(identity?.user?.id)) return false;
  if (!online) return identity.connected === true || identity.offlineCached === true;
  return identity.connected === true && identity.offlineCached !== true &&
    typeof navigator !== 'undefined' && navigator.onLine === true;
}

function membership(role, { online = true, identity = current() } = {}) {
  if (!roles.includes(role) || !available(identity, online)) return null;
  return activeMemberships(identity).find(row => row.role === role) || null;
}

function hasRole(role, options) { return !!membership(role, options); }

function registerBases(rows, { identity = current() } = {}) {
  if (identity !== current() || !available(identity, true) || !activeMemberships(identity).length) return false;
  catalogIdentity = identity;
  bases = (Array.isArray(rows) ? rows : []).filter(row => row?.active === true && present(row.id))
    .map(row => Object.freeze({ id: row.id, code: row.code || '', majcom_id: row.majcom_id || '' }));
  return true;
}

function classScope(c, identity) {
  if (!c || typeof c !== 'object') return null;
  // A cloud row's relational base is authoritative; app_data's organizational
  // labels and the freely selected supported MAJCOM never authorize access.
  if (present(c.cloudScope?.baseId)) return c.cloudScope;
  if (present(c.base_id)) return {
    baseId: c.base_id, majcomId: c.bases?.majcom_id || '', baseCode: c.bases?.code || ''
  };
  const code = String(c.homeInstallationId || '');
  const catalogBase = catalogIdentity === identity ? bases.find(row => same(row.code, code)) : null;
  if (catalogBase) return { baseId: catalogBase.id, majcomId: catalogBase.majcom_id, baseCode: catalogBase.code };
  const assignedBase = activeMemberships(identity).map(row => row.bases)
    .find(base => same(base?.code, code));
  return assignedBase ? { baseId: assignedBase.id, majcomId: assignedBase.majcom_id || '', baseCode: assignedBase.code } : null;
}

function matchesScope(row, c, identity = current()) {
  if (!validMembership(row, { userId: identity?.user?.id })) return false;
  if (row.role === 'enterprise_admin') return true;
  const scope = classScope(c, identity);
  if (!scope || scope.available === false) return false;
  return row.role === 'majcom_manager' ? same(row.majcom_id, scope.majcomId) : same(row.base_id, scope.baseId);
}

function canClass(action, c, { online = true, identity = current() } = {}) {
  if (!available(identity, online)) return false;
  const members = activeMemberships(identity);
  if (['deleteClass', 'restoreClass', 'removeLocalCopy'].includes(action)) {
    return members.some(row => row.role === 'enterprise_admin');
  }
  if (!['readClass', 'manageClass', 'manageRoster', 'evaluate', 'closeClass', 'exportClass', 'resolveConflict'].includes(action)) return false;
  const owner = c?.cloudSync?.createdBy || c?.created_by || c?.localCreatedByUserId || '';
  const ownsClass = same(owner, identity.user.id);
  const assigned = classScope(c, identity)?.available !== false &&
    same(c?.cloudAccess?.userId, identity.user.id) && c?.cloudAccess?.assignedEvaluator === true;
  const createCandidate = !!c && !c.id;
  return members.some(row => {
    if (row.role === 'enterprise_admin') return true;
    const scoped = matchesScope(row, c, identity);
    if (action === 'readClass' || action === 'exportClass') {
      return assigned || (scoped && (row.role !== 'evaluator' || ownsClass));
    }
    if (action === 'evaluate') {
      return assigned || (scoped && (row.role === 'program_manager' || (row.role === 'evaluator' && ownsClass)));
    }
    if (action === 'closeClass') return scoped && row.role === 'program_manager';
    // MAJCOM oversight and evaluator assignment do not grant class/roster
    // administration. An evaluator manages the classes that they created.
    return scoped && (row.role === 'program_manager' ||
      (row.role === 'evaluator' && (ownsClass || createCandidate)));
  });
}

function signature(identity) {
  return JSON.stringify(activeMemberships(identity).map(row => [row.id, row.role, row.base_id, row.majcom_id,
    row.starts_at, row.ends_at, row.bases?.id, row.bases?.code, row.bases?.majcom_id]));
}

function snapshot() {
  const identity = current();
  return Object.freeze({ identity, userId: identity?.user?.id || '', signature: signature(identity) });
}

function isCurrent(token, { online = true } = {}) {
  const identity = current();
  return !!token && token.identity === identity && token.userId === identity?.user?.id &&
    available(identity, online) && activeMemberships(identity).length > 0 && token.signature === signature(identity);
}

window.RAPS_PERMISSIONS = Object.freeze({
  validMembership, activeMemberships, membership, hasRole, registerBases, matchesScope, canClass, snapshot, isCurrent
});
window.addEventListener('raps-cloud-identity', () => {
  if (catalogIdentity !== current()) { catalogIdentity = null; bases = []; }
});
})();
