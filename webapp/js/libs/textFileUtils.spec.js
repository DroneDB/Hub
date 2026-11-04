/**
 * Which files the text editor opens, and in which mode.
 */
import { describe, it, expect } from 'vitest';
import { canOpenAsText, getLanguageMode } from './textFileUtils';

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
});
