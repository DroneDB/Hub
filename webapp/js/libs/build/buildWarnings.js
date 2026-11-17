// @ts-check
/**
 * The words of the warning codes of an entry (FR-EXP-18): libddb tags a warning it can name (`properties.warningCode`)
 * besides its free text. This table is the one place that turns a code into words for users, and says what the warning
 * means for the file: the Properties of a file and the check before a viewer opens (fileAvailabilityChecker) both read it.
 *
 * Two kinds of warning come from libddb:
 * - the index sets one when it cannot read the file as it should (a DWG on a server without its converter): its free text
 *   is for logs and for an administrator, so the table words it for users;
 * - a build sets one about the output it made (libddb 2.8): one line for each thing the build could not do, with the
 *   code of the first. Those lines are written for users (the reason a tool gave, the files left out, no path of the
 *   server) and are shown as they are.
 *
 * A leaf module (no other build/* imports).
 */
import { ArtifactRole } from '@/libs/ddb/buildArtifacts';

/**
 * @typedef {object} BuildWarning
 * @property {string} code       the code libddb sets
 * @property {'unsupported' | 'not-generated' | 'left-out'} kind  what it means for the file: the server cannot read it
 *   (no build is offered: processing it again cannot help), its build could not make an output (a rebuild fails the
 *   same way; `output` and `role` say which), or its build left a part of the file out (the file opens without it)
 * @property {string} title      the title of the dialog about a file that cannot open
 * @property {string} text       what the user is told: the words of an 'unsupported' warning, the words of the others when
 *   libddb gives no text
 * @property {string} [adminHint]  what the administrator of the server does about it
 * @property {boolean} retry     processing the file again can help
 * @property {string} [output]   the output the build could not make ('not-generated'), as the viewers name it
 * @property {string} [role]     the artifact role of that output
 * @property {string} [prefix]   how libddb starts the line of this warning, before the reason ('not-generated')
 */

/** @type {Readonly<Record<string, Readonly<BuildWarning>>>} */
export const BUILD_WARNINGS = Object.freeze({
    'dwg-converter-missing': Object.freeze({
        code: 'dwg-converter-missing',
        kind: 'unsupported',
        title: 'DWG Not Supported',
        text: 'DWG drawings cannot be read on this server; export the drawing as DXF and upload that.',
        adminHint: 'The server needs the dwg2dxf converter (LibreDWG): install dwg2dxf next to ddb, or set DDB_DWG2DXF_PATH. '
            + 'Then rescan the dataset (Dataset Settings, Rescan Dataset; the Registry endpoint is POST /orgs/{org}/ds/{ds}/rescan): '
            + 'the drawings already in it keep their warning until they are indexed again.',
        retry: false
    }),
    // The model is built (its bm3d output opens in the model viewer); the tiler failed on it
    '3dtiles-not-generated': Object.freeze({
        code: '3dtiles-not-generated',
        kind: 'not-generated',
        title: '3D Tiles not available',
        text: 'The 3D Tiles of this model could not be generated.',
        retry: false,
        output: '3D Tiles',
        role: ArtifactRole.MODEL_3DTILES,
        prefix: '3D Tiles not generated: '
    }),
    // The MTL files of an OBJ name textures that are not in the dataset: the model is built without them
    'textures-outside-dataset': Object.freeze({
        code: 'textures-outside-dataset',
        kind: 'left-out',
        title: 'Textures left out',
        text: 'Some textures this model names are outside the dataset: it was built without them.',
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

/**
 * The text libddb gives with the warning of an entry ('' without).
 * @param {{ properties?: { warning?: unknown } } | null | undefined} entry
 */
function warningTextOf(entry) {
    const text = entry?.properties?.warning;
    return typeof text === 'string' ? text.trim() : '';
}

/**
 * The warning of an entry in words for users, or '' without one: the table's words of a file the server cannot read,
 * the lines of a build as libddb writes them (the table's words when there are none), the text of a warning the table
 * does not know.
 * @param {{ properties?: { warning?: unknown, warningCode?: unknown } } | null | undefined} entry
 */
export function warningWordsOf(entry) {
    const coded = buildWarningOf(entry);
    if (coded?.kind === 'unsupported') return coded.text;
    return warningTextOf(entry) || coded?.text || '';
}

/**
 * The output a viewer needs that the build of an entry could not make, as libddb recorded it: the output and the
 * reason the tool gave (the first line of the warning, without the words that start it), or null when the warning of
 * the entry is not about one of `roles`. An entry built by a libddb before 2.8 has no such warning: its build log
 * says it (skippedOutputs).
 * @param {{ properties?: { warning?: unknown, warningCode?: unknown } } | null | undefined} entry
 * @param {string | readonly string[] | null | undefined} roles  the artifact role (or any of the roles) the viewer needs
 * @returns {{ output: string, reason: string } | null}
 */
export function notGeneratedOutputOf(entry, roles) {
    const coded = buildWarningOf(entry);
    const wanted = Array.isArray(roles) ? roles : [roles];
    if (coded?.kind !== 'not-generated' || !coded.output || !wanted.includes(coded.role)) return null;
    const line = warningTextOf(entry).split('\n')[0].trim();
    const reason = coded.prefix && line.startsWith(coded.prefix) ? line.slice(coded.prefix.length).trim() : line;
    return { output: coded.output, reason };
}
