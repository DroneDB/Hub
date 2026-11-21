// @ts-check
/**
 * The bars of fixed buttons of the dataset explorer, from the action registry
 * (libs/dataset/explorerActions.js), so the buttons keep their places whatever is selected. An
 * action that does not apply to the selection is disabled with its reason, not hidden; an action
 * the user may not do at all (a reader's Upload) is left out, and so is an option of the view
 * that is not on show (Thumbnails of the list view, S | M | L of the grid view).
 *
 * The toolbar holds the actions on the files and, at its end, how they are shown: the options of
 * the view, then Grid | List, so the view switch keeps its place at the end in both views. The
 * location bar holds the actions on the folder shown (Refresh), at the end of its path.
 * Functions of the page state, used by computeds.
 */
import { resolveAction } from '@/libs/dataset/explorerActions';

/** The toolbar, in order: 'separator' draws a line, 'spacer' starts the group at the end. */
export const TOOLBAR_IDS = Object.freeze([
    'upload', 'new-folder', 'separator',
    'open', 'share-embed', 'rename', 'delete', 'separator',
    'select-all', 'clear-selection',
    'spacer',
    'thumbnails', 'tile-size-s', 'tile-size-m', 'tile-size-l', 'view-grid', 'view-list'
]);

/** The location bar, after the path of the folder shown. */
export const LOCATION_IDS = Object.freeze(['refresh']);

const STRUCTURAL = new Set(['separator', 'spacer']);

/**
 * @typedef {object} ToolDescriptor
 * @property {string} id
 * @property {string} [title]
 * @property {string} [icon]
 * @property {boolean} [disabled]
 * @property {string} [disabledReason]
 * @property {boolean} [pressed]     a toggle's state
 * @property {number} [priority]     1 stays on a phone, 2 on a tablet, 3 on a wide screen
 * @property {boolean} [showLabel]
 * @property {string} [text]         a short text the button shows instead of its icon (S, M, L)
 * @property {() => void} [onClick]
 */

/**
 * The buttons of `ids` on `surface`, in order.
 * @param {readonly string[]} ids
 * @param {import('./explorerActions').ActionContext} ctx
 * @param {import('./explorerActions').Surface} surface
 * @returns {ToolDescriptor[]}
 */
function toolsOf(ids, ctx, surface) {
    /** @type {ToolDescriptor[]} */
    const tools = [];
    for (const id of ids) {
        if (STRUCTURAL.has(id)) {
            tools.push({ id });
            continue;
        }
        const a = resolveAction(id, ctx, surface);
        if (!a.visible) continue;
        tools.push({
            id: a.id, title: a.label, icon: a.icon, disabled: !a.enabled, disabledReason: a.disabledReason,
            pressed: a.pressed, priority: a.priority, showLabel: a.showLabel, text: a.text, onClick: a.run
        });
    }
    return tools;
}

/**
 * @param {import('./explorerActions').ActionContext} ctx
 * @returns {ToolDescriptor[]}
 */
export function explorerTools(ctx) {
    // HubToolbar drops a separator left with nothing on one side (a reader has no Upload)
    return toolsOf(TOOLBAR_IDS, ctx, 'toolbar');
}

/**
 * @param {import('./explorerActions').ActionContext} ctx
 * @returns {ToolDescriptor[]}
 */
export function locationTools(ctx) {
    return toolsOf(LOCATION_IDS, ctx, 'location');
}
