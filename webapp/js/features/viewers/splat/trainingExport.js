// @ts-check
/**
 * The training-data export of a Gaussian splat: what the Hub asks of the user before it submits the
 * task (the options and their ranges), reads back from it (the warnings the task writes in its log)
 * and knows about the folder it is offered for (an ODM project). All of it is pure, so the dialog and
 * the menu share it and the rules are tested without either.
 */
import ddb from 'ddb';

/** The background task that writes the training data of an ODM project. */
export const TRAINING_EXPORT_TOOL = 'splat-training-export';

/** The options of the export, with the defaults the dialog starts from (0 for the image size is the original). */
export const TRAINING_DEFAULTS = Object.freeze({ maxImageSize: 1600, maxPoints: 100000 });

/** The largest values the dialog accepts: far above any use, so a typo does not ask for gigabytes. */
export const TRAINING_LIMITS = Object.freeze({ maxImageSize: 16384, maxPoints: 10000000, fileName: 150 });

/**
 * Whether a folder entry is one the export is offered for: any folder of the dataset or the dataset
 * itself (the root: the entry of type DroneDB, with no path or the dataset's ddb:// address).
 * @param {{ type?: number, path?: string } | null | undefined} entry
 * @returns {boolean}
 */
export function isTrainingExportFolder(entry) {
    if (!entry) return false;
    return entry.type === ddb.entry.type.DIRECTORY || ddb.entry.isDatasetRoot(entry);
}

/**
 * The path the task is submitted with: the folder, or null for the root of the dataset.
 * @param {{ path?: string } | null | undefined} entry
 * @returns {string | null}
 */
export function trainingExportPath(entry) {
    return entry && entry.path && !ddb.entry.isDatasetRoot(entry) ? entry.path : null;
}

/** The file name the export is saved with unless the user chooses another. @param {string | null} path */
export function defaultTrainingFileName(path) {
    const folder = path ? ddb.pathutils.basename(path) : '';
    return `${folder || 'dataset'}-training-data.zip`;
}

/**
 * @typedef {object} TrainingOptions
 * @property {number | null | undefined} maxImageSize  longest side in pixels of the images, 0 for the originals
 * @property {number | null | undefined} maxPoints     most points of the sparse model, 0 for none
 * @property {string | null | undefined} fileName
 */

const isWholeNumber = (/** @type {unknown} */ n) => typeof n === 'number' && Number.isInteger(n);

/**
 * Checks the options. Returns the message of each field that is wrong and, when none is, the
 * `params` the task takes (the file name is left out when it is empty, so the server chooses one).
 * @param {TrainingOptions} options
 * @returns {{ errors: { maxImageSize?: string, maxPoints?: string, fileName?: string }, params: object | null }}
 */
export function validateTrainingOptions({ maxImageSize, maxPoints, fileName }) {
    /** @type {{ maxImageSize?: string, maxPoints?: string, fileName?: string }} */
    const errors = {};
    const { maxImageSize: sizeMax, maxPoints: pointsMax, fileName: nameMax } = TRAINING_LIMITS;
    if (!isWholeNumber(maxImageSize) || /** @type {number} */ (maxImageSize) < 0 || /** @type {number} */ (maxImageSize) > sizeMax) {
        errors.maxImageSize = `A whole number from 0 (the original size) to ${sizeMax}.`;
    }
    if (!isWholeNumber(maxPoints) || /** @type {number} */ (maxPoints) < 0 || /** @type {number} */ (maxPoints) > pointsMax) {
        errors.maxPoints = `A whole number from 0 (none) to ${pointsMax}.`;
    }
    const name = (fileName ?? '').trim();
    if (name.length > nameMax) errors.fileName = `At most ${nameMax} characters.`;
    else if (/[\\/]/.test(name) || /^\.+$/.test(name)) errors.fileName = 'A file name, without folders.';
    if (Object.keys(errors).length) return { errors, params: null };
    return { errors, params: { maxImageSize, maxPoints, ...(name ? { fileName: name } : {}) } };
}

const WARNING_LINE = /^(?:\[[^\]]*\]\s*)?Warning:\s*(\S.*)$/;

/**
 * The warnings in the log of the task, one per line that reads "Warning: ..." (the log adds a time
 * before a line, which is dropped), in the order they were written and without repeats.
 * @param {ReadonlyArray<unknown> | null | undefined} lines
 * @returns {string[]}
 */
export function trainingWarnings(lines) {
    if (!Array.isArray(lines)) return [];
    /** @type {string[]} */
    const warnings = [];
    for (const line of lines) {
        const match = typeof line === 'string' ? WARNING_LINE.exec(line.trim()) : null;
        if (match && !warnings.includes(match[1].trim())) warnings.push(match[1].trim());
    }
    return warnings;
}

/** What marks the folder of an ODM project. */
export const ODM_CAMERAS_FILE = 'cameras.json';
export const ODM_GEOREFERENCING_FOLDER = 'odm_georeferencing';
export const ODM_COORDS_FILE = 'coords.txt';

/** @param {Array<{ path: string, type?: number }> | null | undefined} entries @param {string} name @param {boolean} folder */
const hasChild = (entries, name, folder) => Array.isArray(entries) && entries.some(e =>
    ddb.pathutils.basename(e.path) === name && ddb.entry.isDirectory(e) === folder);

/**
 * What the listing of a folder says about it being an ODM project: 'yes' when it has cameras.json,
 * 'maybe' when it has odm_georeferencing (whose coords.txt a second listing settles) and 'no'
 * otherwise.
 * @param {Array<{ path: string, type?: number }> | null | undefined} entries  the entries directly in the folder
 * @returns {'yes' | 'maybe' | 'no'}
 */
export function odmProjectEvidence(entries) {
    if (hasChild(entries, ODM_CAMERAS_FILE, false)) return 'yes';
    return hasChild(entries, ODM_GEOREFERENCING_FOLDER, true) ? 'maybe' : 'no';
}

/**
 * Whether the folder looks like an ODM project, by reading it: one listing, and a second of
 * odm_georeferencing only when cameras.json is not there. A listing that fails says nothing against
 * the folder (the task reports what it finds missing).
 * @param {{ list: (path?: string) => Promise<Array<{ path: string, type?: number }>> }} dataset
 * @param {string | null} path  the folder, null for the root of the dataset
 * @returns {Promise<boolean>}
 */
export async function looksLikeOdmProject(dataset, path) {
    try {
        const evidence = odmProjectEvidence(await dataset.list(path ?? undefined));
        if (evidence !== 'maybe') return evidence === 'yes';
        const georeferencing = await dataset.list(path ? `${path}/${ODM_GEOREFERENCING_FOLDER}` : ODM_GEOREFERENCING_FOLDER);
        return hasChild(georeferencing, ODM_COORDS_FILE, false);
    } catch {
        return true;
    }
}
