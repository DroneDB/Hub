/**
 * The table of the warning codes of an entry: the words for users, the hint for the administrator, and whether
 * processing the file again can help.
 */
import { describe, it, expect } from 'vitest';
import { BUILD_WARNINGS, buildWarningOf, isNeededOutput, notGeneratedOutputOf, warningLines, warningWordsOf } from './buildWarnings';

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

    it('tells a file the server cannot read from what a build could not make or left out', () => {
        expect(buildWarningOf({ properties: { warningCode: 'dwg-converter-missing' } }).kind).toBe('unsupported');
        expect(buildWarningOf({ properties: { warningCode: '3dtiles-not-generated' } }).kind).toBe('not-generated');
        expect(buildWarningOf({ properties: { warningCode: 'textures-outside-dataset' } }).kind).toBe('left-out');
    });
});

describe('warningWordsOf', () => {
    const entry = (warning, warningCode) => ({ properties: { warning, warningCode } });
    const lines = '3D Tiles not generated: Obj2Tiles failed on this model\nTextures outside the dataset left out: ../a.png, C:/b.png';

    it('gives the lines a build wrote as they are: they are for users', () => {
        expect(warningWordsOf(entry(lines, '3dtiles-not-generated'))).toBe(lines);
        expect(warningWordsOf(entry('Textures outside the dataset left out: ../a.png', 'textures-outside-dataset')))
            .toBe('Textures outside the dataset left out: ../a.png');
    });

    it('gives the words of the table for a file the server cannot read, and when a build gives no text', () => {
        expect(warningWordsOf(entry('vector parse failed: DWG support needs dwg2dxf', 'dwg-converter-missing')))
            .toBe('DWG drawings cannot be read on this server; export the drawing as DXF and upload that.');
        expect(warningWordsOf(entry('', 'textures-outside-dataset'))).toBe(BUILD_WARNINGS['textures-outside-dataset'].text);
    });

    it('gives the text of a warning without a code or with one it does not know, and nothing without a warning', () => {
        expect(warningWordsOf(entry('footprint unavailable: x'))).toBe('footprint unavailable: x');
        expect(warningWordsOf(entry('new reason', 'from-a-newer-libddb'))).toBe('new reason');
        expect(warningWordsOf({})).toBe('');
        expect(warningWordsOf(null)).toBe('');
    });
});

describe('notGeneratedOutputOf', () => {
    const TILES = '3D Tiles not generated: Vertex color count (40) does not match vertex count (48).';
    const entry = (warning, warningCode = '3dtiles-not-generated') => ({ properties: { warning, warningCode } });

    it('gives the output and the reason of the tiler, from the first line of the warning', () => {
        expect(notGeneratedOutputOf(entry(`${TILES}\nTextures outside the dataset left out: ../a.png`), 'model.3dtiles'))
            .toEqual({ output: '3D Tiles', reason: 'Vertex color count (40) does not match vertex count (48).' });
        expect(notGeneratedOutputOf(entry(TILES), ['model.bm3d', 'model.3dtiles'])).toMatchObject({ output: '3D Tiles' });
    });

    it('keeps a first line that does not start as libddb writes it whole, and gives no reason without text', () => {
        expect(notGeneratedOutputOf(entry('the tiler failed'), 'model.3dtiles')).toEqual({ output: '3D Tiles', reason: 'the tiler failed' });
        expect(notGeneratedOutputOf(entry(undefined), 'model.3dtiles')).toEqual({ output: '3D Tiles', reason: '' });
    });

    it('is null for another output, another warning, or no warning', () => {
        expect(notGeneratedOutputOf(entry(TILES), ['model.bm3d', 'model.nexus'])).toBeNull();
        expect(notGeneratedOutputOf(entry('Textures outside the dataset left out: ../a.png', 'textures-outside-dataset'), 'model.3dtiles')).toBeNull();
        expect(notGeneratedOutputOf(entry('vector parse failed', 'dwg-converter-missing'), 'vector.mvt')).toBeNull();
        expect(notGeneratedOutputOf({}, 'model.3dtiles')).toBeNull();
        expect(notGeneratedOutputOf(null, null)).toBeNull();
    });
});

describe('isNeededOutput: an output a build log names, matched to the roles a viewer needs as a warning code is', () => {
    it('is true for the 3D Tiles and a viewer of 3D Tiles', () => {
        expect(isNeededOutput('3D Tiles', 'model.3dtiles')).toBe(true);
        expect(isNeededOutput('3D Tiles', ['model.bm3d', 'model.3dtiles'])).toBe(true);
    });

    it('is false for the 3D Tiles and the model viewer, and for an output the table does not know', () => {
        expect(isNeededOutput('3D Tiles', ['model.bm3d', 'model.nexus'])).toBe(false);
        expect(isNeededOutput('Point cloud', 'pointcloud.copc')).toBe(false);
        expect(isNeededOutput('', null)).toBe(false);
    });
});

describe('warningLines', () => {
    it('gives one line for each thing a warning says, without blank ones or the spaces around them', () => {
        expect(warningLines('3D Tiles not generated: x\r\n\n  Textures outside the dataset left out: ../a.png \n')).toEqual([
            '3D Tiles not generated: x', 'Textures outside the dataset left out: ../a.png'
        ]);
        expect(warningLines('one')).toEqual(['one']);
        expect(warningLines('  ')).toEqual([]);
        expect(warningLines(undefined)).toEqual([]);
        expect(warningLines({ text: 'x' })).toEqual([]);
    });
});
