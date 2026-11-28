// @ts-check
/**
 * What a move, copy or transfer of several entries into one folder sends: the Transfer window and the
 * clipboard's paste put every entry in one folder under its own name, so
 * - an entry inside another selected folder goes with that folder and is not sent on its own (it would be
 *   sent twice, or fail once its folder has moved), and
 * - two entries with one name (a/x.jpg and b/x.jpg) would land on one path: the second would replace the
 *   first, so such a selection is refused before anything is sent.
 */
import ddb from 'ddb';
import { namesClash } from '@/libs/nameRules';

const { pathutils } = ddb;

/**
 * The items that are not inside another item of the list (a folder carries what it holds), in their order.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} pathOf
 * @returns {T[]}
 */
export function outermostItems(items, pathOf) {
    const paths = items.map(pathOf);
    return items.filter((_, i) => !paths.some((other, j) => j !== i && paths[i].startsWith(`${other}/`)));
}

/**
 * The groups of items that get one name in the target folder (names compared as the Registry compares them),
 * each with more than one path; empty when every item has a name of its own.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} pathOf
 * @returns {string[][]}
 */
export function sameNameGroups(items, pathOf) {
    /** @type {string[][]} */
    const groups = [];
    for (const item of items) {
        const path = pathOf(item);
        const name = pathutils.basename(path);
        const group = groups.find(g => namesClash(pathutils.basename(g[0]), name));
        if (group) group.push(path);
        else groups.push([path]);
    }
    return groups.filter(g => g.length > 1);
}

/**
 * What the user is told when `groups` (sameNameGroups) is not empty: the clashing items by their paths.
 * @param {string[][]} groups
 * @returns {string}
 */
export function sameNameMessage(groups) {
    const listed = groups.map(g => g.join(', ')).join('; ');
    return `These items have the same name and would replace each other in one folder: ${listed}. Move or copy them in separate steps, or rename one of them first`;
}
