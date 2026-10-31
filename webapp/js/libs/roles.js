// @ts-check
/**
 * The roles the Registry keeps for itself. It names the administrator role "admin" and compares
 * role names without regard to case, so the Hub does the same.
 */

export const ADMIN_ROLE = 'admin';

/** @param {string|null|undefined} role */
export function isAdminRole(role) {
    return typeof role === 'string' && role.toLowerCase() === ADMIN_ROLE;
}

/**
 * A role the Registry creates and does not let anyone delete.
 * @param {string|null|undefined} role
 */
export const isSystemRole = isAdminRole;
