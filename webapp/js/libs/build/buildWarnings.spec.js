/**
 * The table of the warning codes of an entry (FR-EXP-18): the words for users, the hint for the administrator, and whether
 * processing the file again can help.
 */
import { describe, it, expect } from 'vitest';
import { BUILD_WARNINGS, buildWarningOf } from './buildWarnings';

describe('buildWarningOf', () => {
    it('gives the words of a DWG on a server without its converter: for users, and no retry', () => {
        const warning = buildWarningOf({ properties: { warning: 'vector parse failed: ...', warningCode: 'dwg-converter-missing' } });
        expect(warning.title).toBe('DWG Not Supported');
        expect(warning.text).toBe('DWG drawings cannot be read on this server; export the drawing as DXF and upload that.');
        expect(warning.retry).toBe(false);
        // the hint is for the administrator, and is not in the words of the user
        expect(warning.adminHint).toBe('The server needs the dwg2dxf converter (LibreDWG): install dwg2dxf next to ddb, or set DDB_DWG2DXF_PATH. '
            + 'Then rescan the dataset (Dataset Settings, Rescan Dataset; the Registry endpoint is POST /orgs/{org}/ds/{ds}/rescan): '
            + 'the drawings already in it keep their warning until they are indexed again.');
        expect(warning.text).not.toContain('dwg2dxf');
    });

    it('is null for no entry, no warning, a warning without a code and a code that the table does not know', () => {
        expect(buildWarningOf(null)).toBeNull();
        expect(buildWarningOf({})).toBeNull();
        expect(buildWarningOf({ properties: { warning: 'footprint unavailable: x' } })).toBeNull();
        expect(buildWarningOf({ properties: { warningCode: 'from-a-newer-libddb' } })).toBeNull();
        expect(buildWarningOf({ properties: { warningCode: 'toString' } })).toBeNull();
        expect(buildWarningOf({ properties: { warningCode: 7 } })).toBeNull();
    });

    it('has one row per code, with its own code in it', () => {
        for (const [code, row] of Object.entries(BUILD_WARNINGS)) expect(row.code).toBe(code);
    });
});
