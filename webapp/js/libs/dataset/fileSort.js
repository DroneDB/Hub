/**
 * The order of a file table (the explorer's table view and the folder picker): folders
 * first, then the clicked column, ascending or descending.
 */
import ddb from 'ddb';
import { getTypeDisplayName } from '@/libs/entryTypes';

/**
 * @param {Array<{ label: string, entry: object }>} files
 * @param {'name'|'type'|'size'|'modified'} column
 * @param {'asc'|'desc'} direction
 * @returns {Array} a sorted copy
 */
export function sortFileRows(files, column, direction) {
    return [...files].sort((a, b) => {
        const aDir = ddb.entry.isDirectory(a.entry);
        const bDir = ddb.entry.isDirectory(b.entry);

        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;

        let result = 0;
        switch (column) {
            case 'name':
                result = a.label.toLowerCase().localeCompare(b.label.toLowerCase());
                break;
            case 'type':
                result = getTypeDisplayName(a.entry.type).localeCompare(getTypeDisplayName(b.entry.type));
                break;
            case 'size':
                result = (a.entry.size || 0) - (b.entry.size || 0);
                break;
            case 'modified':
                result = (a.entry.mtime || 0) - (b.entry.mtime || 0);
                break;
        }

        return direction === 'asc' ? result : -result;
    });
}

/**
 * The sort after a click on a column header: the same column flips the direction, another
 * column starts ascending.
 * @param {string} column  the sorted column
 * @param {'asc'|'desc'} direction
 * @param {string} clicked
 * @returns {{ column: string, direction: 'asc'|'desc' }}
 */
export function nextSort(column, direction, clicked) {
    if (column === clicked) return { column, direction: direction === 'asc' ? 'desc' : 'asc' };
    return { column: clicked, direction: 'asc' };
}
