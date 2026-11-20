// @ts-check
/**
 * Why an entry of an admin list cannot be deleted, one rule per list, written once (FR-ADM-24): the list's Delete
 * action is off while it gives a reason, and says that reason (ActionButton: aria-describedby and tooltip, FR-XC-22).
 * The Registry refuses the same deletions: these rules only tell the user before the click.
 */

/** The user that the Registry creates and keeps (its administrator account) */
export const BUILT_IN_ADMIN = 'admin';

/** The organization that every dataset of a visitor without an account can be in: it always exists */
export const PUBLIC_ORGANIZATION = 'public';

/**
 * @param {{ userName?: string | null } | null | undefined} user
 * @returns {string | null}  the reason the user cannot be deleted, or null when it can
 */
export function userDeleteBlockReason(user) {
    return user?.userName === BUILT_IN_ADMIN ? 'The built-in admin account cannot be deleted' : null;
}

/**
 * @param {{ slug?: string | null } | null | undefined} organization
 * @returns {string | null}  the reason the organization cannot be deleted, or null when it can
 */
export function organizationDeleteBlockReason(organization) {
    return organization?.slug?.toLowerCase() === PUBLIC_ORGANIZATION ? 'The Public organization cannot be deleted' : null;
}
