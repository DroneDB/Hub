// @ts-check
/**
 * The roles the Registry keeps for itself (FR-ADM-04, D-043). `GET /sys/features` lists them in
 * `systemRoles`: "admin" grants administration, "deactivated" blocks sign-in. The Registry compares
 * role names without regard to case, so the Hub does the same. Edit User grants and removes
 * "admin"; only the disable and enable endpoints change "deactivated".
 *
 * FALLBACK_SYSTEM_ROLES is what the Registry publishes, for a server that does not (an older
 * Registry): such a server has no disable and enable endpoints (see publishesSystemRoles).
 */

import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';

export const ADMIN_ROLE = 'admin';
export const DEACTIVATED_ROLE = 'deactivated';

const FALLBACK_SYSTEM_ROLES = Object.freeze([ADMIN_ROLE, DEACTIVATED_ROLE]);

/** @param {string|null|undefined} a @param {string} b */
const sameRole = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

/** The system role names the server lists, or null when it lists none. @returns {string[]|null} */
function publishedSystemRoles() {
    const features = /** @type {any} */ (reg)?.features;
    const value = typeof features?.value === 'function' ? features.value(Features.SYSTEM_ROLES) : null;
    return Array.isArray(value) ? value : null;
}

/**
 * Whether the server lists its system roles: such a server has the disable and enable endpoints
 * and keeps "deactivated" out of Edit User. An older one does neither.
 */
export function publishesSystemRoles() {
    return publishedSystemRoles() !== null;
}

/** The system role names. @returns {readonly string[]} */
export function systemRoles() {
    return publishedSystemRoles() ?? FALLBACK_SYSTEM_ROLES;
}

/** @param {string|null|undefined} role */
export function isAdminRole(role) {
    return sameRole(role, ADMIN_ROLE);
}

/** The role that blocks sign-in. @param {string|null|undefined} role */
export function isDeactivatedRole(role) {
    return sameRole(role, DEACTIVATED_ROLE);
}

/**
 * A role the Registry creates and does not let anyone delete.
 * @param {string|null|undefined} role
 */
export function isSystemRole(role) {
    return systemRoles().some(r => sameRole(role, r));
}

/**
 * Whether a user is disabled (they have the role that blocks sign-in).
 * @param {{ roles?: string[]|null }|null|undefined} user
 */
export function isDisabledUser(user) {
    return Array.isArray(user?.roles) && user.roles.some(isDeactivatedRole);
}

/**
 * The roles a role picker offers: every role but "deactivated", which Disable and Enable change.
 * @param {string[]} roles
 */
export function pickableRoles(roles) {
    return (roles || []).filter(r => !isDeactivatedRole(r));
}

/**
 * What a role does, in a word.
 * @param {string|null|undefined} role
 */
export function roleDescription(role) {
    if (isAdminRole(role)) return 'Administrator role with full system access';
    if (isDeactivatedRole(role)) return 'Blocks sign-in';
    if (isSystemRole(role)) return 'System role';
    return 'Custom user role';
}

/**
 * The roles to send when a user's roles change (Edit User, Add role): the wanted ones, without "deactivated". A
 * Registry that lists its system roles keeps "deactivated" itself (and refuses it in the list); an older one replaces
 * every role, so a disabled user gets it back, or the change would enable them.
 * @param {string[]|null|undefined} wanted  the roles the user is to have
 * @param {string[]|null|undefined} current  the roles the user has now
 * @returns {string[]}
 */
export function rolesToSend(wanted, current) {
    const result = [...(wanted ?? [])];
    if (!publishesSystemRoles()) {
        const deactivated = (current || []).find(isDeactivatedRole);
        if (deactivated) result.push(deactivated);
    }
    return result;
}
