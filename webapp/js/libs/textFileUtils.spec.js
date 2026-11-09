/**
 * Which files the text editor opens, and in which mode.
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { canOpenAsText, shouldOpenAsText, looksBinary, getLanguageMode, MAX_TEXT_FILE_SIZE } from './textFileUtils';

describe('text files', () => {
    it('edits the XML vector formats (GPX, KML) in XML mode', () => {
        expect(getLanguageMode('tracks/flight.gpx')).toBe('xml');
        expect(getLanguageMode('placemarks.kml')).toBe('xml');
        expect(getLanguageMode('notes.txt')).toBe('text');
    });

    it('never offers a JPEG 2000 to the text editor', () => {
        expect(canOpenAsText({ path: 'ortho.jp2', size: 1024 })).toBe(false);
        expect(canOpenAsText({ path: 'scan.j2k', size: 1024 })).toBe(false);
        expect(canOpenAsText({ path: 'flight.gpx', size: 1024 })).toBe(true);
    });

    it('never offers a binary format, whatever its entry type', () => {
        expect(canOpenAsText({ path: 'a.kmz', type: ddb.entry.type.VECTOR, size: 1024 })).toBe(false);
        expect(canOpenAsText({ path: 'b.3tz', size: 1024 })).toBe(false);
        expect(canOpenAsText({ path: 'c.e57', size: 1024 })).toBe(false);
        expect(canOpenAsText({ path: 'parcels.fgb', type: ddb.entry.type.VECTOR, size: 1024 })).toBe(false);
    });

    it('offers the text vector formats and the text sidecars of drone and GIS files', () => {
        expect(canOpenAsText({ path: 'a.geojson', type: ddb.entry.type.VECTOR, size: 1024 })).toBe(true);
        expect(canOpenAsText({ path: 'a.kml', type: ddb.entry.type.VECTOR, size: 1024 })).toBe(true);
        expect(canOpenAsText({ path: 'DJI_0001.SRT', size: 1024 })).toBe(true);
        expect(canOpenAsText({ path: 'a.tfw', size: 1024 })).toBe(true);
        expect(canOpenAsText({ path: 'model.obj', size: 1024 })).toBe(true);
    });

    it('offers the ASCII point clouds and grids, CZML and TOML', () => {
        for (const path of ['cloud.xyz', 'dem.asc', 'scan.pts', 'flight.czml', 'config.toml']) {
            expect(canOpenAsText({ path, size: 1024 })).toBe(true);
            expect(shouldOpenAsText({ path, size: 1024 })).toBe(false);
        }
    });

    it('offers no file without an extension, nor one over the size limit', () => {
        expect(canOpenAsText({ path: 'LICENSE', size: 1024 })).toBe(false);
        expect(canOpenAsText({ path: 'big.geojson', size: MAX_TEXT_FILE_SIZE + 1 })).toBe(false);
        expect(canOpenAsText({ path: 'big.xyz', size: MAX_TEXT_FILE_SIZE + 1 })).toBe(false);
    });

    it('opens the plain text formats straight in the editor, the others on Edit only', () => {
        expect(shouldOpenAsText({ path: 'README.md', size: 1024 })).toBe(true);
        expect(shouldOpenAsText({ path: 'a.geojson', size: 1024 })).toBe(false);
        expect(shouldOpenAsText({ path: 'a.kmz', size: 1024 })).toBe(false);
    });
});

describe('binary content', () => {
    it('is content with a NUL character in its first 8192 characters, or a ZIP header', () => {
        expect(looksBinary('PK\u0003\u0004rest')).toBe(true);
        expect(looksBinary('abc\u0000def')).toBe(true);
        expect(looksBinary('a'.repeat(9000) + '\u0000')).toBe(false);
        expect(looksBinary('{"type":"FeatureCollection"}')).toBe(false);
        expect(looksBinary('')).toBe(false);
    });
});
