/**
 * What an archive extraction says about the entries it skipped (FR-PRC-30). The lines are those the Registry writes to the
 * task log (DatasetArchiveExtractor, ArchiveExtractionResult.LogLines); the expected texts are literals.
 */
import { describe, it, expect } from 'vitest';
import { extractSummary, skippedSentence } from './extractSummary';

describe('extractSummary', () => {
    it('reads the skipped entries with their reason, and the counts of the end of the log', () => {
        const summary = extractSummary([
            '[10:00:01] Extracting 9 file(s) from \'good.zip\'',
            '[10:00:02] Skipped: vectors/tool.exe (file type not allowed)\nSkipped: keep.txt (file already exists)\nExtraction complete: 8 extracted, 2 skipped'
        ]);

        expect(summary).toEqual({
            extracted: 8,
            skipped: 2,
            entries: [
                { path: 'vectors/tool.exe', reason: 'file type not allowed' },
                { path: 'keep.txt', reason: 'file already exists' }
            ],
            more: 0
        });
    });

    it('reads the count of the entries that the log does not name', () => {
        const summary = extractSummary(['Skipped: a.exe (file type not allowed)', 'Skipped: and 12 more', 'Extraction complete: 3 extracted, 13 skipped']);
        expect(summary.more).toBe(12);
        expect(summary.entries).toEqual([{ path: 'a.exe', reason: 'file type not allowed' }]);
    });

    it('does not take an extracted file for a skipped one', () => {
        const summary = extractSummary(['[10:00:01] Skipped is a file name.txt', 'Extraction complete: 1 extracted, 0 skipped']);
        expect(summary.entries).toEqual([]);
        expect(summary.skipped).toBe(0);
        expect(summary.extracted).toBe(1);
    });

    it('is empty without a log', () => {
        expect(extractSummary(undefined)).toEqual({ extracted: null, skipped: 0, entries: [], more: 0 });
        expect(extractSummary([1, null])).toEqual({ extracted: null, skipped: 0, entries: [], more: 0 });
    });
});

describe('skippedSentence', () => {
    it('names the one entry skipped and says why', () => {
        const summary = extractSummary(['Skipped: vectors/tool.exe (file type not allowed)', 'Extraction complete: 8 extracted, 1 skipped']);
        expect(skippedSentence(summary)).toBe('Skipped 1 entry: vectors/tool.exe (file type not allowed)');
    });

    it('names the first three and counts the others', () => {
        const lines = ['a.exe', 'b.exe', 'c.exe', 'd.exe'].map(n => `Skipped: ${n} (file type not allowed)`);
        const summary = extractSummary([...lines, 'Extraction complete: 1 extracted, 5 skipped']);
        expect(skippedSentence(summary)).toBe(
            'Skipped 5 entries: a.exe (file type not allowed), b.exe (file type not allowed), c.exe (file type not allowed) and 2 others');
    });

    it('counts the excluded entries without naming them', () => {
        const summary = extractSummary(['Excluded 300 internal file(s) of the archive', 'Extraction complete: 12 extracted, 300 skipped']);
        expect(skippedSentence(summary)).toBe('Skipped 300 entries');
    });

    it('is empty when nothing was skipped, or without a summary', () => {
        expect(skippedSentence(extractSummary(['Extraction complete: 4 extracted, 0 skipped']))).toBe('');
        expect(skippedSentence(null)).toBe('');
        expect(skippedSentence(undefined)).toBe('');
    });
});
