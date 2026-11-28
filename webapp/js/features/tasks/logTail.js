/**
 * The log of a task reaches the Hub as its last lines only (the Registry keeps a ring of them): once the log is
 * longer than the ring, every refresh drops lines at the head as it adds lines at the end, and the text keeps about
 * the same length. A view that keeps its scroll position then shows other lines at each refresh.
 */

/**
 * How many lines at the head of `oldLines` the refresh dropped: the smallest count whose remaining lines are where
 * `newLines` begins. 0 when nothing was dropped (lines only added, or none), null when the two share no line (a
 * log that started again, another task): there is no line to keep in view then.
 * @param {string[]} oldLines
 * @param {string[]} newLines
 * @returns {number|null}
 */
export function droppedHeadLines(oldLines, newLines) {
    for (let dropped = 0; dropped < oldLines.length; dropped++) {
        const kept = oldLines.length - dropped;
        if (kept > newLines.length) continue;
        let same = true;
        for (let i = 0; i < kept && same; i++) same = oldLines[dropped + i] === newLines[i];
        if (same) return dropped;
    }
    return oldLines.length === 0 ? 0 : null;
}

/**
 * The character offset in `text` where its line `index` begins (lines separated by "\n").
 * @param {string[]} lines the lines of the text
 * @param {number} index
 */
export function lineOffset(lines, index) {
    let offset = 0;
    for (let i = 0; i < index; i++) offset += lines[i].length + 1;
    return offset;
}
