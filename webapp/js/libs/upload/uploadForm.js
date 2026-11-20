// @ts-check
/**
 * The form of the upload page (FR-UPL-02): where the files go (organization), what the dataset is called and who may
 * see it. Pure functions: the page keeps the state.
 */

/**
 * The longest dataset name the Registry accepts (FR-ORG-14; `DatasetDto`): the default name made from a file name is
 * cut to it.
 */
export const DATASET_NAME_MAX_LENGTH = 256;

/**
 * The organizations the user may upload to. `GET /orgs` also lists the Public organizations of other users, which can
 * only be read (D-003, FR-ORG-02): they are not destinations.
 * @param {Array<{ slug: string, name?: string, owner?: string, permissions?: { canWrite?: boolean } }>} organizations
 */
export function writableOrganizations(organizations) {
    return (organizations ?? []).filter(org => org?.permissions?.canWrite === true);
}

/**
 * The organization the form starts with: the personal one (the organization that has the user's name, which the
 * Registry creates for each user), else the first the user may write.
 * @template {{ slug: string, name?: string }} T
 * @param {T[]} writable  writableOrganizations()
 * @param {string|null|undefined} userName
 * @returns {T|null}
 */
export function defaultOrganization(writable, userName) {
    if (!writable || writable.length === 0) return null;
    const own = userName
        ? writable.find(org => org.slug === userName || org.name?.toLowerCase() === userName.toLowerCase())
        : null;
    return own ?? writable[0];
}

/**
 * The name a dataset starts with, from the first dropped or chosen file or folder: the name of the folder when the
 * file is inside one, else the file's name without its extension. Cut to the name limit.
 * @param {Array<{ name: string, fullPath?: string, webkitRelativePath?: string }>} files
 * @returns {string}
 */
export function defaultDatasetName(files) {
    const first = files?.[0];
    if (!first) return '';

    const path = first.fullPath || first.webkitRelativePath || '';
    const folder = path.includes('/') ? path.split('/')[0] : '';
    const name = folder || first.name.replace(/\.[^./\\]+$/, '') || first.name;
    return name.trim().slice(0, DATASET_NAME_MAX_LENGTH).trim();
}

/**
 * The refusal that a failed request names for one field of its form (D-047): the first message of
 * `errors.<field>` of the ValidationProblemDetails the ApiError carries. The member name is read without regard to
 * letter case (the model binder keys by the property name, a handwritten refusal by the camelCase field).
 * @param {unknown} error
 * @param {string} field  'datasetName', 'visibility'
 * @returns {string|null}
 */
export function fieldErrorOf(error, field) {
    const errors = /** @type {any} */ (error)?.errors;
    if (!errors || typeof errors !== 'object') return null;
    const key = Object.keys(errors).find(k => k.toLowerCase() === field.toLowerCase());
    if (!key) return null;
    const value = errors[key];
    const message = Array.isArray(value) ? value[0] : value;
    return typeof message === 'string' && message ? message : null;
}
