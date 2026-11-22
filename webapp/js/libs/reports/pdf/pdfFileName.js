// @ts-check
/**
 * Where a PDF of a report goes: its file name and the folder it is published to.
 */
import { slugFromName } from '@/libs/slug';

/** The folder of the dataset (at its root) that "Publish PDF" writes to. */
export const PUBLISH_FOLDER = 'reports';

/**
 * The local date of the browser as yyyy-mm-dd.
 * @param {Date} date
 */
export function localDateStamp(date) {
    const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/**
 * `<report-slug>-<yyyy-mm-dd>.pdf`: the slug of the name of the report, or its uid when the name gives none (a name
 * that is blank), and the local date of the browser at generation. The same name for a download and a published copy.
 * @param {{ name: string, uid: string }} report
 * @param {Date} [now]
 */
export function pdfFileName(report, now = new Date()) {
    const slug = slugFromName(report.name) || report.uid;
    return `${slug}-${localDateStamp(now)}.pdf`;
}

/** The path of the published copy in the dataset. @param {string} fileName */
export const publishedPath = fileName => `${PUBLISH_FOLDER}/${fileName}`;
