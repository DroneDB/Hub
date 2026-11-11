/**
 * The splat viewer's keyboard map, as a function of the key event and the state of the viewer, so
 * what a key does can be tested without a page: movement and the Shift speed-up, a saved camera
 * by its number (1 to 9 are the cameras labelled 1 to 9), stepping through the cameras, and the
 * tour.
 */
import { MOVE_KEYS } from './flyControls';

// Where a key belongs to the page: typing, or choosing in a control
const EDITABLE = 'input, textarea, select';
// A list the arrow keys scroll or move through
const LIST = 'ul, ol, [role="listbox"], [role="menu"]';
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

const inside = (target, selector) => target instanceof Element && !!target.closest(selector);

/** The saved camera (index from 0) a key calls, or null: Digit1 is the camera labelled 1, index 0. */
export function cameraIndexOfCode(code) {
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    return m ? Number(m[1]) - 1 : null;
}

/**
 * What a key press does.
 * @param {{ code: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, target?: any }} e
 * @param {{ loaded: boolean, dialogOpen: boolean, cameraCount: number }} state
 * @returns {{ type: 'move' | 'speed', code: string }
 *   | { type: 'camera', index: number } | { type: 'step', step: 1 | -1 } | { type: 'tour' } | null}
 *   null when the key is not the viewer's, or belongs to the page (typing, a dialog, a list)
 */
export function keyAction(e, { loaded, dialogOpen, cameraCount }) {
    if (!loaded || dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return null;
    const { code, target } = e;
    // Typing and choosing keep their keys
    if (inside(target, EDITABLE) || (target instanceof Element && target.isContentEditable)) return null;
    // The arrows belong to a list that scrolls
    if (ARROWS.includes(code) && inside(target, LIST)) return null;

    if (MOVE_KEYS.includes(code)) return { type: 'move', code };
    if (code === 'ShiftLeft' || code === 'ShiftRight') return { type: 'speed', code };
    const index = cameraIndexOfCode(code);
    if (index !== null) return index < cameraCount ? { type: 'camera', index } : null;
    // By code, like the other keys: the character of a key changes with the layout and Shift
    if (code === 'Minus' || code === 'NumpadSubtract') return { type: 'step', step: -1 };
    if (code === 'Equal' || code === 'NumpadAdd') return { type: 'step', step: 1 };
    if (code === 'KeyP') return { type: 'tour' };
    return null;
}

/** Whether the page's own handling of a key is to be stopped: every action except the speed key. */
export const consumesKey = action => !!action && action.type !== 'speed';
