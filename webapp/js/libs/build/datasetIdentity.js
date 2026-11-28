import { datasetKey } from '@/libs/tasks/taskStates';

/**
 * Whether two dataset objects stand for the same dataset. The task monitor hands out the object of whoever acquired
 * the dataset last (the header's background archive replaces the page's), so objects are compared by their key, never by
 * identity.
 * @param {any} a
 * @param {any} b
 */
export function isSameDataset(a, b) {
    return !!a && !!b && (a === b || datasetKey(a) === datasetKey(b));
}
