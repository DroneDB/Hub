// @ts-check
/**
 * The tooltip of a file tile (FR-EXP-21): its dataset path, its type, its size and, for a file that is built, the state of
 * its build in plain words, never the internal address of the file. For example 'images/a.jpg — Image — 3.2 MB', and
 * 'cloud.laz — Point Cloud — 22 MB — Building…'. The path is the dataset-relative one of the entry; the size is the one
 * formatter of the Hub (libs/format); the build words are the table of libs/build/entryBuild (BUILD_WORDS), the one the
 * badge and the caption of a tile that builds use.
 */
import ddb from 'ddb';
import { getTypeDisplayName } from '@/libs/entryTypes';
import { isBuildableType } from '@/libs/entryTypeCapabilities';
import { formatBytes } from '@/libs/format';
import { buildWord } from '@/libs/build/entryBuild';

/** Between the parts of the tooltip. */
export const TITLE_SEPARATOR = ' — ';

/**
 * @param {{ path?: string, type?: number, size?: number | null, buildStatus?: string, artifacts?: any[] }} entry
 * @param {{ currentState: string } | null} [job]  the build job of the entry, if any
 * @returns {string}
 */
export function tileTitle(entry, job = null) {
    const parts = [entry?.path ?? ''];
    parts.push(getTypeDisplayName(entry?.type));
    if (entry && !ddb.entry.isDirectory(entry) && typeof entry.size === 'number') parts.push(formatBytes(entry.size));
    // Only a file that is built has a build state to tell
    const word = entry && isBuildableType(entry.type) ? buildWord(job, entry) : '';
    if (word) parts.push(word);
    return parts.join(TITLE_SEPARATOR);
}
