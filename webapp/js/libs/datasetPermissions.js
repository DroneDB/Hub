// @ts-check
/**
 * Dataset permissions: the server puts them on the dataset's root entry
 * (`ds.info()[0].properties.permissions`); missing means none.
 */

/** @typedef {{ canRead: boolean, canWrite: boolean, canDelete: boolean }} Permissions */

/** @type {Readonly<Permissions>} */
export const NO_PERMISSIONS = Object.freeze({ canRead: false, canWrite: false, canDelete: false });

/**
 * @param {any} rootEntry the dataset's root entry (or null)
 * @returns {Permissions}
 */
export function permissionsOf(rootEntry) {
    const p = rootEntry && rootEntry.properties && rootEntry.properties.permissions;
    return p ? { canRead: !!p.canRead, canWrite: !!p.canWrite, canDelete: !!p.canDelete } : { ...NO_PERMISSIONS };
}
