// @ts-check
/**
 * An undo/redo history (HQ-08: the point-cloud viewer and the map measure control each
 * kept their own). Pushing a new action drops what was undone; each side holds at most
 * `limit` items, the oldest going first.
 *
 *   const history = createUndoStack({ limit: 50, onChange: h => { canUndo = h.canUndo(); } });
 *   history.push(action);  const last = history.undo();  history.redo();
 */

/**
 * @template T
 * @param {{ limit?: number, onChange?: (stack: UndoStack<T>) => void }} [options]
 * @returns {UndoStack<T>}
 */
export function createUndoStack({ limit = 50, onChange = () => {} } = {}) {
    /** @type {T[]} */
    let done = [];
    /** @type {T[]} */
    let undone = [];

    /** @param {T[]} list @param {T} item */
    const add = (list, item) => {
        list.push(item);
        if (list.length > limit) list.shift();
    };

    /** @type {UndoStack<T>} */
    const stack = {
        push(item) {
            add(done, item);
            undone = [];
            onChange(stack);
        },
        undo() {
            if (!done.length) return undefined;
            const item = /** @type {T} */ (done.pop());
            add(undone, item);
            onChange(stack);
            return item;
        },
        redo() {
            if (!undone.length) return undefined;
            const item = /** @type {T} */ (undone.pop());
            add(done, item);
            onChange(stack);
            return item;
        },
        canUndo: () => done.length > 0,
        canRedo: () => undone.length > 0,
        clear() {
            done = [];
            undone = [];
            onChange(stack);
        }
    };
    return stack;
}

/**
 * @template T
 * @typedef {object} UndoStack
 * @property {(item: T) => void} push
 * @property {() => T | undefined} undo   the action to revert
 * @property {() => T | undefined} redo   the action to apply again
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 * @property {() => void} clear
 */
