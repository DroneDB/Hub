// @ts-check
/**
 * The toolbar of the dataset explorer: a fixed list of actions of the registry
 * (libs/dataset/explorerActions.js), so the buttons keep their places whatever is selected. An
 * action that does not apply to the selection is disabled with its reason, not hidden; only an
 * action the user may not do at all (a reader's Upload) is left out. A function of the page
 * state, used by a computed.
 */
import { resolveAction } from '@/libs/dataset/explorerActions';

/** The toolbar, in order: 'separator' draws a line, 'spacer' starts the group at the end. */
export const TOOLBAR_IDS = Object.freeze([
    'upload', 'new-folder', 'separator',
    'open', 'share-embed', 'rename', 'delete', 'separator',
    'select-all', 'clear-selection',
    'spacer',
    'refresh', 'view-grid', 'view-list', 'thumbnails', 'tile-size-s', 'tile-size-m', 'tile-size-l'
]);

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
 * @param {import('./explorerActions').ActionContext} ctx
 * @returns {ToolDescriptor[]}
 */
export function explorerTools(ctx) {
    /** @type {ToolDescriptor[]} */
    const tools = [];
    for (const id of TOOLBAR_IDS) {
        if (STRUCTURAL.has(id)) {
            tools.push({ id });
            continue;
        }
        const a = resolveAction(id, ctx, 'toolbar');
        if (!a.visible) continue;
        tools.push({
            id: a.id, title: a.label, icon: a.icon, disabled: !a.enabled, disabledReason: a.disabledReason,
            pressed: a.pressed, priority: a.priority, showLabel: a.showLabel, text: a.text, onClick: a.run
        });
    }
    // HubToolbar drops a separator left with nothing on one side (a reader has no Upload)
    return tools;
}

