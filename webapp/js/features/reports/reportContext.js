// @ts-check
/**
 * What the blocks of the live page share without being given it block by block: the dataset (for the thumbnails of
 * photos) and the entries of the photos the report shows (their hash and size, read once by the page).
 */
import { inject, provide } from 'vue';

const KEY = Symbol('reportContext');

/**
 * @typedef {object} ReportContext
 * @property {any} dataset
 * @property {import('vue').Ref<Map<string, any> | null>} photoEntries  the entries of the photos by path; null until they are read
 */

/** @param {ReportContext} context */
export const provideReportContext = context => provide(KEY, context);

/** @returns {ReportContext} */
export function useReportContext() {
    const context = inject(KEY, null);
    if (!context) throw new Error('A report block must be inside a report page');
    return /** @type {ReportContext} */ (context);
}
