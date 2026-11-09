// @ts-check
/**
 * What an archive extraction says about the entries it did not extract (FR-PRC-30). The Registry writes one log line
 * per skipped entry, `Skipped: vectors/tool.exe (file type not allowed)` (the first ones; the others are counted:
 * `Skipped: and 12 more`), and ends the extraction with `Extraction complete: 8 extracted, 1 skipped`. The entries that
 * the caller excludes (the internal files of a photogrammetry result) are never named: `Excluded 3 internal file(s)`.
 * Pure functions over the log lines of the finished task (they may carry the `[hh:mm:ss] ` prefix of the task log).
 */
import { countOf } from '@/libs/format';

/** @typedef {{ path: string, reason: string }} SkippedEntry */
/** @typedef {{ extracted: number|null, skipped: number, entries: SkippedEntry[], more: number }} ExtractSummary */

const TIME_PREFIX = /^\[\d{2}:\d{2}:\d{2}\]\s*/;
const SKIPPED_LINE = /^Skipped: (.+) \(([^()]+)\)$/;
const MORE_LINE = /^Skipped: and (\d+) more$/;
const COMPLETE_LINE = /^Extraction complete: (\d+) extracted, (\d+) skipped$/;

/**
 * Reads the skipped entries and the counts from the log of an extraction.
 * @param {unknown} logTail the log lines of the task
 * @returns {ExtractSummary}
 */
export function extractSummary(logTail) {
    /** @type {ExtractSummary} */
    const summary = { extracted: null, skipped: 0, entries: [], more: 0 };
    if (!Array.isArray(logTail)) return summary;

    for (const raw of logTail) {
        if (typeof raw !== 'string') continue;
        // A chunk of the log may hold several lines
        for (const part of raw.split('\n')) {
            const line = part.replace(TIME_PREFIX, '').trim();
            const complete = COMPLETE_LINE.exec(line);
            if (complete) {
                summary.extracted = Number(complete[1]);
                summary.skipped = Number(complete[2]);
                continue;
            }
            const more = MORE_LINE.exec(line);
            if (more) {
                summary.more = Number(more[1]);
                continue;
            }
            const skipped = SKIPPED_LINE.exec(line);
            if (skipped) summary.entries.push({ path: skipped[1], reason: skipped[2] });
        }
    }
    return summary;
}

/**
 * The sentence about the skipped entries, or '' when none was skipped: `Skipped 1 entry: vectors/tool.exe (file type not
 * allowed)`; with several, the first three are named and the others counted.
 * @param {ExtractSummary|null|undefined} summary
 */
export function skippedSentence(summary) {
    if (!summary || !summary.skipped) return '';
    const named = summary.entries.slice(0, 3).map(e => `${e.path} (${e.reason})`);
    const rest = summary.skipped - named.length;
    const names = named.length ? `: ${named.join(', ')}${rest > 0 ? ` and ${countOf(rest, 'other')}` : ''}` : '';
    return `Skipped ${countOf(summary.skipped, 'entry', 'entries')}${names}`;
}
