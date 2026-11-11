// @ts-check
/**
 * The words of the warning codes of an entry (FR-EXP-18): libddb tags a warning it can name (`properties.warningCode`)
 * besides its free text, which is for logs and for an administrator, not for the people who use the dataset. This table
 * is the one place that turns a code into words for users, and says whether a build can be retried: the Properties of a
 * file and the check before a viewer opens (fileAvailabilityChecker) both read it.
 *
 * A leaf module (no other build/* imports).
 */

/**
 * @typedef {object} BuildWarning
 * @property {string} code       the code libddb sets
 * @property {string} title      the title of the dialog about a file that cannot open
 * @property {string} text       what the user is told, with what to do
 * @property {string} adminHint  what the administrator of the server does about it
 * @property {boolean} retry     processing the file again can help (it cannot: the server lacks something)
 */

/** @type {Readonly<Record<string, Readonly<BuildWarning>>>} */
export const BUILD_WARNINGS = Object.freeze({
    'dwg-converter-missing': Object.freeze({
        code: 'dwg-converter-missing',
        title: 'DWG Not Supported',
        text: 'DWG drawings cannot be read on this server; export the drawing as DXF and upload that.',
        adminHint: 'The server needs the dwg2dxf converter (LibreDWG): install dwg2dxf next to ddb, or set DDB_DWG2DXF_PATH. '
            + 'Then rescan the dataset (Dataset Settings, Rescan Dataset; the Registry endpoint is POST /orgs/{org}/ds/{ds}/rescan): '
            + 'the drawings already in it keep their warning until they are indexed again.',
        retry: false
    })
});

/**
 * The warning of an entry that libddb tagged with a code this table knows, or null (no warning, a warning without a
 * code, a code of a newer libddb).
 * @param {{ properties?: { warningCode?: unknown } } | null | undefined} entry
 * @returns {Readonly<BuildWarning> | null}
 */
export function buildWarningOf(entry) {
    const code = entry?.properties?.warningCode;
    return typeof code === 'string' && Object.hasOwn(BUILD_WARNINGS, code) ? BUILD_WARNINGS[code] : null;
}
