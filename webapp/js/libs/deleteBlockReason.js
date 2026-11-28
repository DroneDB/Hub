// @ts-check
/**
 * Why an entry of an admin list cannot be deleted, one rule per list, written once: the list's Delete
 * action is off while it gives a reason, and says that reason (ActionButton: aria-describedby and tooltip).
 * The Registry refuses the same deletions: these rules only tell the user before the click.
 */

/** The user that the Registry creates and keeps (its administrator account) */
export const BUILT_IN_ADMIN = 'admin';

/** The organization that every dataset of a visitor without an account can be in: it always exists */
export const PUBLIC_ORGANIZATION = 'public';

/**
 * Whether the user is the account of the session: user names compare in any letter case, as the Registry does.
 * @param {{ userName?: string | null } | null | undefined} user
 * @param {string | null | undefined} signedInUserName  the user name of the session
 */
const isOwnAccount = (user, signedInUserName) => {
    const name = user?.userName?.toLowerCase();
    return !!name && name === signedInUserName?.toLowerCase();
};

/**
 * Why a user cannot be deleted: the built-in admin never can, and nobody deletes their own account, which would end the
 * session that is doing it and take their organization and datasets with it. The Registry refuses both (403).
 * @param {{ userName?: string | null } | null | undefined} user
 * @param {string | null | undefined} [signedInUserName]  the user name of the session; without it only the built-in admin is refused
 * @returns {string | null}  the reason the user cannot be deleted, or null when it can
 */
export function userDeleteBlockReason(user, signedInUserName) {
    if (user?.userName === BUILT_IN_ADMIN) return 'The built-in admin account cannot be deleted';
    return isOwnAccount(user, signedInUserName) ? 'You cannot delete your own account' : null;
}

/**
 * Why a user cannot be disabled by the one signed in: nobody disables their own account, which would end the session
 * that is doing it. The Registry refuses it as well (400); user names compare in any letter case, as it does.
 * @param {{ userName?: string | null } | null | undefined} user
 * @param {string | null | undefined} signedInUserName  the user name of the session
 * @returns {string | null}  the reason the user cannot be disabled, or null when it can
 */
export function userDisableBlockReason(user, signedInUserName) {
    return isOwnAccount(user, signedInUserName) ? 'You cannot disable your own account' : null;
}

/**
 * @param {{ slug?: string | null } | null | undefined} organization
 * @returns {string | null}  the reason the organization cannot be deleted, or null when it can
 */
export function organizationDeleteBlockReason(organization) {
    return organization?.slug?.toLowerCase() === PUBLIC_ORGANIZATION ? 'The Public organization cannot be deleted' : null;
}
