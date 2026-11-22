// @ts-check
/**
 * Report definitions: the items of the dataset meta list `reports`, readable by everyone who can
 * read the dataset and written by its writers (the server checks). The list logic is the shared
 * meta list store, the same saved views use: identity by `uid`, an update that adds the new item
 * and then removes the old ones, reads that bypass the request cache before a write, and the
 * change check that tells a definition changed or deleted by another session since it was loaded.
 *
 * A stored definition that cannot be read (damaged JSON, or fails validation) is listed apart as
 * unreadable, so the report list can say so and a writer can delete it; the other reports are not
 * affected.
 */
import { createMetaListStore } from '@/libs/metaList/metaListStore';
import { MAX_NAME_LENGTH } from '@/libs/views/viewState';
import { validateDefinition } from './reportDefinition';

export const REPORTS_KEY = 'reports';
export const MAX_REPORTS = 100;
export const MAX_REPORT_BYTES = 32 * 1024;
export const MAX_REPORT_NAME_LENGTH = MAX_NAME_LENGTH;

/**
 * @typedef {import('@/libs/metaList/metaListStore').MetaEntry} ReportEntry  data is the definition
 * @typedef {{ id: string, uid: string|null, name: string|null, error: string }} UnreadableReport
 *   a stored item that cannot be shown as a report: `id` is its meta id; `uid` and `name` are
 *   what could be told of it
 */

const store = createMetaListStore({
    key: REPORTS_KEY,
    uidPrefix: 'r_',
    maxItems: MAX_REPORTS,
    maxBytes: MAX_REPORT_BYTES,
    maxNameLength: MAX_REPORT_NAME_LENGTH,
    label: { one: 'report', many: 'reports' },
    validate: validateDefinition,
    tooLarge: `This report is too large to save: a report definition can take at most ${MAX_REPORT_BYTES / 1024} KB.`,
    // A report records when it was changed, not by whom
    audit: { createdBy: 'createdBy', createdAt: 'createdAt', updatedBy: null, updatedAt: 'modifiedAt' }
});

/** Why a report of a later version is neither shown nor edited: this version does not know all it holds. */
export const NEWER_REPORT_TEXT = 'This report was saved by a newer version of the application.';

/**
 * The reports of the dataset, one per uid, sorted by name, and the items that cannot be shown as
 * a report. A report of a later version stays in `reports` with `newerVersion`.
 * @param {any} dataset
 * @param {{ fresh?: boolean }} [options]  fresh: bypass the request cache
 * @returns {Promise<{ reports: ReportEntry[], unreadable: UnreadableReport[] }>}
 */
export async function listReports(dataset, options) {
    const { entries, invalid } = await store.list(dataset, options);
    /** @type {UnreadableReport[]} */
    const unreadable = [
        ...entries.filter(e => e.error).map(e => ({ id: e.id, uid: e.uid, name: e.name, error: /** @type {string} */ (e.error) })),
        ...invalid.map(i => ({ id: i.id, uid: null, name: null, error: i.error }))
    ];
    return { reports: entries.filter(e => !e.error), unreadable };
}

/**
 * Why a definition cannot be saved under this name, or null: the name, the 32 KB cap, and the
 * rules of a definition (with a uid, which a new definition gets when it is saved).
 * @param {string} name @param {any} data  the item to store
 */
export const reportSaveProblem = store.saveProblem;

/**
 * A report uid: `r_` and 8 base36 characters, not in `taken`.
 * @param {Iterable<string>} taken
 */
export const newReportUid = store.newUid;

/**
 * Saves a new report: refused at 100 reports, over the size cap or when it is not valid.
 * @param {any} dataset @param {import('./reportDefinition').ReportDefinition} definition  named by its `name`
 * @param {{ user: string, now?: Date }} options
 * @returns {Promise<ReportEntry>}
 */
export function saveNewReport(dataset, definition, options) {
    return store.saveNew(dataset, definition, { ...options, name: definition.name });
}

/**
 * Stores a new version of a report: the new item is added first, then every other item of its
 * uid is removed. The creation fields stay and `modifiedAt` is set.
 * @param {any} dataset @param {string} uid
 * @param {{ definition: import('./reportDefinition').ReportDefinition, user: string, now?: Date }} options
 * @returns {Promise<ReportEntry>}
 */
export function updateReport(dataset, uid, { definition, ...options }) {
    return store.update(dataset, uid, { ...options, body: definition, name: definition.name });
}

/** Deletes every item of a report. @param {any} dataset @param {string} uid */
export const deleteReport = store.remove;

/**
 * Deletes an unreadable item: by its uid when it has one (every item of it), else by its meta id.
 * @param {any} dataset @param {UnreadableReport} item
 */
export async function deleteUnreadableReport(dataset, item) {
    if (item.uid) await store.remove(dataset, item.uid);
    else await store.removeItem(dataset, item.id);
}

/**
 * What happened to a report since it was loaded from meta item `loadedId`: 'deleted', 'changed'
 * (another save) or null. Run before every write: on 'changed' ask Overwrite or Cancel, on
 * 'deleted' ask Save as new or Cancel.
 * @param {any} dataset @param {string} uid @param {string} loadedId
 * @returns {Promise<'deleted'|'changed'|null>}
 */
export const reportChange = store.change;
