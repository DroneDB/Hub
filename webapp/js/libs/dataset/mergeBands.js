// @ts-check

/**
 * What the Merge Multispectral dialog shows of the band files and of the check libddb ran on them
 * (FR-PRC-14): the file names shortened in the middle, so the suffix that tells the bands apart
 * (`_1` ... `_5`, `_GRE`, `_NIR`) stays, and the warnings of the check, each said once.
 */

/**
 * `name` with its middle replaced by an ellipsis when it is longer than `max` characters; the end
 * of the name (the band suffix and the extension) is kept longer than the start. A name that
 * fits is returned as it is.
 *
 * @param {string} name
 * @param {number} [max] characters of the result, the ellipsis included
 * @returns {string}
 */
export function shortenMiddle(name, max = 24) {
    if (name.length <= max) return name;
    const room = Math.max(max - 1, 2);
    const tail = Math.min(room - 1, Math.max(9, Math.floor(room * 0.4)));
    const head = room - tail;
    return name.slice(0, head) + '…' + name.slice(name.length - tail);
}

/**
 * The warnings of the check with the identical ones joined, in the order of their first
 * appearance: older libddb said "Cannot read geotransform" once for each band.
 *
 * @param {string[]} warnings
 * @returns {{ text: string, count: number }[]}
 */
export function groupWarnings(warnings) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const text of warnings) counts.set(text, (counts.get(text) || 0) + 1);
    return [...counts].map(([text, count]) => ({ text, count }));
}

/**
 * What the camera calls the band at `index` of the order in which the files were checked
 * ("Blue", "Red edge"), or an empty text when the check names no band.
 *
 * @param {{ alignment?: { bands?: { name?: string }[] } | null } | null | undefined} validation
 * @param {number} index
 * @returns {string}
 */
export function cameraBandName(validation, index) {
    return validation?.alignment?.bands?.[index]?.name || '';
}
