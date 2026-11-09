// @ts-check
/**
 * The action registry of the file explorer: each action that more than one surface offers is
 * defined once here (D-017, FR-XC-14). The toolbar (libs/dataset/explorerTools.js), the context
 * menus of the grid, the table and the tree (libs/contextMenuItems.js, also on the background),
 * the keyboard shortcuts (useDatasetShortcuts and the tree), the detail panel and the header's
 * dataset actions (layout/HubHeader.vue: Download, Share/Embed, Settings) render from these
 * definitions, so an action has the same label, icon, accelerator and enabled state on each.
 *
 * A definition says:
 *   - `surfaces`: where it is offered ('toolbar', 'menu' for a selection, 'background' for the menu
 *     of an empty selection, 'shortcut', 'header' for the dataset actions of the page header, which
 *     like a menu shows only what applies);
 *   - `permitted(ctx)`: false hides it on every surface (a reader has no Delete);
 *   - `applies(ctx)`: whether it applies to the selection. The menus show only the actions that
 *     apply; the toolbar keeps a fixed list and disables the others, with `reason(ctx)`;
 *   - `enabled(ctx)`: false disables an action that applies (both surfaces alike);
 *   - `run(ctx)`: what it does, through `ctx.emit(event, ...args)` (the page's handlers).
 *
 * The viewers a file opens in are rows of the viewer table (libs/openItemDefaults.js VIEWERS):
 * the menu offers one "Open ..." item per row, the toolbar has one Open slot labelled by the
 * file's default row.
 */
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { isDroneDB } from '@/libs/entryTypes';
import { VIEWERS, defaultViewerFor } from '@/libs/openItemDefaults';
import { useClipboardStore } from '@/stores/clipboard';
import { useDatasetSessionStore } from '@/stores/datasetSession';

/**
 * @typedef {'toolbar'|'menu'|'background'|'shortcut'|'header'} Surface
 *
 * @typedef {object} ActionContext
 * @property {() => any[]} getSelectedEntries   the explorer items acted on
 * @property {boolean} canWrite
 * @property {any} [dataset]
 * @property {(event: string, ...args: any[]) => void} emit   runs the page's handler of `event`
 * @property {() => any[]} [getFiles]           the items on show (Select all)
 * @property {(on: boolean) => void} [selectAll]  selects all items, or none (else 'selectAll' is emitted)
 * @property {() => boolean} [clipboardEmpty]  whether the Hub clipboard is empty (the store by default)
 * @property {'grid'|'table'} [viewMode]       toolbar only
 * @property {boolean} [expandedGrid]          toolbar only
 * @property {boolean} [signedIn]              the user is signed in (reg.isLoggedIn() by default)
 * @property {boolean} [unavailable]           the dataset did not load: no action on it (the header)
 * @property {() => boolean} [downloadInProgress]  a download is under way (the session's archive by default)
 *
 * @typedef {object} ActionDefinition
 * @property {string} id
 * @property {string} group   'open' | 'edit' | 'share' | 'organize' | 'folder' | 'tools' | 'danger' | 'view'
 * @property {string|((c: ActionContext) => string)} label
 * @property {string|((c: ActionContext) => string)} icon
 * @property {Surface[]} surfaces
 * @property {boolean} [danger]
 * @property {string} [accelerator]   'CmdOrCtrl+C', 'Delete'
 * @property {boolean} [pasteEvent]   the accelerator is the browser's paste event, not a keydown
 * @property {1|2|3} [priority]       toolbar overflow: 1 stays on a phone, 2 on a tablet, 3 on a wide screen
 * @property {boolean} [showLabel]    the toolbar shows the label next to the icon where there is room
 * @property {(c: ActionContext) => boolean} [permitted]
 * @property {(c: ActionContext) => boolean} [applies]
 * @property {(c: ActionContext, surface: Surface) => boolean} [shownIn]  a further per-surface rule
 * @property {(c: ActionContext) => boolean} [enabled]
 * @property {(c: ActionContext) => string} [reason]
 * @property {(c: ActionContext) => boolean} [pressed]   a toggle's state (aria-pressed)
 * @property {(c: ActionContext) => void} run
 *
 * @typedef {object} ResolvedAction
 * @property {string} id
 * @property {string} group
 * @property {string} label
 * @property {string} icon
 * @property {boolean} danger
 * @property {string} [accelerator]
 * @property {boolean} visible
 * @property {boolean} enabled
 * @property {string} disabledReason   empty when enabled
 * @property {boolean} [pressed]
 * @property {number} priority
 * @property {boolean} showLabel
 * @property {() => void} run          does nothing when disabled
 */

/** The order of the groups in a menu; a separator goes between two groups. */
export const ACTION_GROUPS = Object.freeze(['open', 'edit', 'share', 'organize', 'folder', 'tools', 'danger', 'view']);

const sel = (/** @type {ActionContext} */ c) => c.getSelectedEntries() || [];
const single = (/** @type {ActionContext} */ c) => { const s = sel(c); return s.length === 1 ? s[0] : null; };
// The dataset itself (the root of the tree) is not a file: no copy, cut or delete
const hasDataset = (/** @type {any[]} */ s) => s.some(f => isDroneDB(f?.entry?.type));
const clipboardEmpty = (/** @type {ActionContext} */ c) => (c.clipboardEmpty ? c.clipboardEmpty() : useClipboardStore().isEmpty);
const writer = (/** @type {ActionContext} */ c) => !!c.canWrite;
const filesOnly = (/** @type {ActionContext} */ c) => sel(c).length > 0 && !hasDataset(sel(c));
// A dataset that did not load (ResourceState) offers no action on it
const available = (/** @type {ActionContext} */ c) => !c.unavailable;
const signedIn = (/** @type {ActionContext} */ c) => (c.signedIn ?? reg.isLoggedIn());

// A download of several files, a folder or the whole dataset (nothing selected) is an archive;
// without the entry of the one selected item, count it as one
const bulkDownload = (/** @type {ActionContext} */ c) => {
    const s = sel(c);
    if (s.length !== 1) return true;
    return s[0]?.entry ? ddb.entry.isDirectory(s[0].entry) : true;
};
const downloadBlocked = (/** @type {ActionContext} */ c) => !signedIn(c)
    && !!reg.features.get(Features.DISABLE_ANONYMOUS_BULK_DOWNLOADS) && bulkDownload(c);
const downloadInProgress = (/** @type {ActionContext} */ c) => (c.downloadInProgress
    ? c.downloadInProgress() : useDatasetSessionStore().activeBulkDownload);

/** The default viewer row of a single selected file, or null. */
const defaultRow = (/** @type {ActionContext} */ c) => {
    const f = single(c);
    return f ? defaultViewerFor(f.entry) : null;
};

/** One menu action per row of the viewer table. */
const viewerActions = VIEWERS.map(row => /** @type {ActionDefinition} */ ({
    id: row.id,
    group: 'open',
    label: row.label,
    icon: row.icon,
    surfaces: ['menu'],
    applies: c => { const f = single(c); return !!f && row.accepts(f.entry); },
    run: c => {
        const f = single(c);
        if (!f) return;
        if (row.view) c.emit('openItem', f, row.view);
        else c.emit('openItem', f);
    }
}));

/** @type {ReadonlyArray<ActionDefinition>} */
export const EXPLORER_ACTIONS = Object.freeze([
    {
        // The toolbar's one Open slot, labelled by the default viewer of the file; in the menu
        // only where no viewer row opens the file by default (that row is the menu's Open)
        id: 'open',
        group: 'open',
        label: c => defaultRow(c)?.label ?? 'Open',
        icon: c => defaultRow(c)?.icon ?? 'fa-regular fa-folder-open',
        surfaces: ['toolbar', 'menu'],
        priority: 2,
        applies: c => sel(c).length > 0,
        shownIn: (c, surface) => surface === 'toolbar' || !defaultRow(c),
        reason: () => 'Select a file to open',
        run: c => sel(c).forEach(f => c.emit('openItem', f))
    },
    ...viewerActions,
    {
        id: 'rename',
        group: 'edit',
        label: 'Rename',
        icon: 'fa-solid fa-pencil',
        surfaces: ['toolbar', 'menu'],
        priority: 2,
        permitted: writer,
        applies: c => !!single(c),
        reason: () => 'Select one file to rename',
        run: c => c.emit('moveSelectedItems')
    },
    {
        id: 'share-embed',
        group: 'share',
        label: 'Share/Embed',
        icon: 'fa-solid fa-share-nodes',
        surfaces: ['toolbar', 'menu', 'header'],
        priority: 2,
        permitted: available,
        applies: c => !!single(c),
        reason: () => 'Select one file to share',
        run: c => { const f = single(c); if (f) c.emit('shareEmbed', f); }
    },
    {
        // The selection, or in the header with nothing selected the whole dataset (the menu of an
        // empty selection is the background menu, which has no Download)
        id: 'download',
        group: 'share',
        label: 'Download',
        icon: 'fa-solid fa-download',
        surfaces: ['menu', 'header'],
        permitted: available,
        enabled: c => !downloadInProgress(c) && !downloadBlocked(c),
        reason: c => (downloadInProgress(c)
            ? 'A download archive is being prepared. Please wait for it to complete.'
            : 'Login required to download multiple files or the entire dataset'),
        run: c => c.emit('downloadItems', sel(c))
    },
    {
        // The dataset's settings (read-only for a reader); the header only
        id: 'settings',
        group: 'tools',
        label: 'Settings',
        icon: 'fa-solid fa-wrench',
        surfaces: ['header'],
        permitted: c => available(c) && signedIn(c),
        run: c => c.emit('settings')
    },
    {
        id: 'copy',
        group: 'organize',
        label: 'Copy',
        icon: 'fa-solid fa-copy',
        accelerator: 'CmdOrCtrl+C',
        surfaces: ['menu', 'shortcut'],
        applies: filesOnly,
        run: c => c.emit('copySelectedItems')
    },
    {
        id: 'cut',
        group: 'organize',
        label: 'Cut',
        icon: 'fa-solid fa-scissors',
        accelerator: 'CmdOrCtrl+X',
        surfaces: ['menu', 'shortcut'],
        permitted: writer,
        applies: filesOnly,
        run: c => c.emit('cutSelectedItems')
    },
    {
        // Ctrl/Cmd+V is the browser's paste event (useDatasetShortcuts): OS files and links come first
        id: 'paste',
        group: 'organize',
        label: 'Paste',
        icon: 'fa-solid fa-paste',
        accelerator: 'CmdOrCtrl+V',
        pasteEvent: true,
        surfaces: ['menu', 'background', 'shortcut'],
        permitted: writer,
        applies: c => !clipboardEmpty(c),
        run: c => c.emit('pasteFromClipboard')
    },
    {
        id: 'upload',
        group: 'folder',
        label: 'Upload',
        icon: 'fa-solid fa-upload',
        surfaces: ['toolbar', 'background'],
        priority: 1,
        showLabel: true,
        permitted: writer,
        run: c => c.emit('upload')
    },
    {
        id: 'new-folder',
        group: 'folder',
        label: 'New folder',
        icon: 'fa-solid fa-folder-plus',
        // Also in the menu of a selection: a full list leaves no empty area for the background menu
        surfaces: ['toolbar', 'menu', 'background'],
        priority: 1,
        showLabel: true,
        permitted: writer,
        run: c => c.emit('createFolder')
    },
    {
        id: 'select-all',
        group: 'folder',
        label: 'Select all',
        icon: 'fa-regular fa-square-check',
        surfaces: ['toolbar', 'menu', 'background'],
        priority: 3,
        applies: c => {
            if (!c.getFiles) return true;
            const files = c.getFiles() || [];
            return files.length > 0 && sel(c).length < files.length;
        },
        reason: c => ((c.getFiles?.() || []).length ? 'Every file is selected' : 'This folder is empty'),
        run: c => (c.selectAll ? c.selectAll(true) : c.emit('selectAll'))
    },
    {
        id: 'clear-selection',
        group: 'folder',
        label: 'Clear selection',
        icon: 'fa-regular fa-square',
        surfaces: ['toolbar'],
        priority: 3,
        applies: c => sel(c).length > 0,
        reason: () => 'Nothing is selected',
        run: c => c.selectAll?.(false)
    },
    {
        id: 'refresh',
        group: 'folder',
        label: 'Refresh',
        icon: 'fa-solid fa-rotate-right',
        surfaces: ['toolbar', 'background'],
        priority: 2,
        run: c => c.emit('refresh')
    },
    {
        id: 'delete',
        group: 'danger',
        label: 'Delete',
        icon: 'fa-solid fa-trash',
        danger: true,
        accelerator: 'Delete',
        surfaces: ['toolbar', 'menu', 'shortcut'],
        priority: 2,
        permitted: writer,
        applies: filesOnly,
        reason: c => (sel(c).length ? 'The dataset itself cannot be deleted' : 'Select the files to delete'),
        run: c => c.emit('deleteSelecteditems')
    },
    {
        id: 'view-grid',
        group: 'view',
        label: 'Grid',
        icon: 'fa-solid fa-table-cells-large',
        surfaces: ['toolbar'],
        priority: 1,
        showLabel: true,
        pressed: c => c.viewMode !== 'table',
        run: c => c.emit('setViewMode', 'grid')
    },
    {
        id: 'view-list',
        group: 'view',
        label: 'List',
        icon: 'fa-solid fa-list',
        surfaces: ['toolbar'],
        priority: 1,
        showLabel: true,
        pressed: c => c.viewMode === 'table',
        run: c => c.emit('setViewMode', 'table')
    },
    {
        id: 'thumbnails',
        group: 'view',
        label: 'Thumbnails',
        icon: 'fa-regular fa-image',
        surfaces: ['toolbar'],
        priority: 3,
        applies: c => c.viewMode === 'table',
        pressed: c => c.viewMode === 'table' && !!c.expandedGrid,
        reason: () => 'Thumbnails are an option of the list view',
        run: c => c.emit('toggleExpandedGrid')
    }
]);

const BY_ID = new Map(EXPLORER_ACTIONS.map(a => [a.id, a]));

/** @param {string} id @returns {ActionDefinition} */
export function actionById(id) {
    const action = BY_ID.get(id);
    if (!action) throw new Error(`Unknown explorer action: ${id}`);
    return action;
}

const valueOf = (v, c) => (typeof v === 'function' ? v(c) : v);

/**
 * What `action` is on `surface` for the context `ctx`, read now.
 * @param {ActionDefinition|string} action
 * @param {ActionContext} ctx
 * @param {Surface} surface
 * @returns {ResolvedAction}
 */
export function resolveAction(action, ctx, surface) {
    const def = typeof action === 'string' ? actionById(action) : action;
    const permitted = def.permitted ? def.permitted(ctx) : true;
    const applies = def.applies ? def.applies(ctx) : true;
    const enabled = applies && (def.enabled ? def.enabled(ctx) : true);
    const visible = def.surfaces.includes(surface) && permitted
        && (surface === 'toolbar' || applies)
        && (def.shownIn ? def.shownIn(ctx, surface) : true);
    return {
        id: def.id,
        group: def.group,
        label: valueOf(def.label, ctx),
        icon: valueOf(def.icon, ctx),
        danger: !!def.danger,
        accelerator: def.accelerator,
        visible,
        enabled,
        disabledReason: enabled ? '' : (def.reason ? def.reason(ctx) : ''),
        pressed: def.pressed ? def.pressed(ctx) : undefined,
        priority: def.priority ?? 3,
        showLabel: !!def.showLabel,
        run: () => { if (enabled) def.run(ctx); }
    };
}

/** The menu of an empty selection is the background menu (the folder's actions). */
export const menuSurface = (/** @type {ActionContext} */ ctx) => /** @type {Surface} */ (sel(ctx).length ? 'menu' : 'background');

/**
 * A context-menu item of an action (the shape libs/contextMenuItems.js items have), read when the
 * menu opens: on the background with an empty selection, else for the selection.
 * @param {string} id
 * @param {ActionContext} ctx
 */
export function actionMenuItem(id, ctx) {
    const def = actionById(id);
    const now = () => resolveAction(def, ctx, menuSurface(ctx));
    return {
        id,
        group: def.group,
        danger: !!def.danger,
        accelerator: def.accelerator,
        get label() { return valueOf(def.label, ctx); },
        get icon() { return valueOf(def.icon, ctx); },
        isVisible: () => now().visible,
        isEnabled: () => now().enabled,
        click: () => now().run()
    };
}

// ---- Accelerators ----------------------------------------------------------------------

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

// The key a Mac keyboard labels "delete" is Backspace (fn+delete is Delete): on a Mac, Delete is
// either, and its hint is the key's symbol, ⌫
const MAC_KEYS = { Delete: { keys: ['Delete', 'Backspace'], label: '⌫', aria: 'Backspace Delete' } };

/** Whether the key event `e` is the accelerator `accelerator` ('CmdOrCtrl+C', 'Delete'). */
export function matchesAccelerator(accelerator, e, mac = isMac()) {
    const parts = accelerator.split('+');
    const key = parts.pop() || '';
    const wantsMod = parts.includes('CmdOrCtrl');
    if (wantsMod !== !!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
    const keys = (mac && !parts.length && MAC_KEYS[key]?.keys) || [key];
    return keys.some(k => (e.key || '').toLowerCase() === k.toLowerCase());
}

/** The hint a menu shows for an accelerator: 'Ctrl+C' and 'Delete', or '⌘C' and '⌫' on a Mac. */
export function acceleratorLabel(accelerator, mac = isMac()) {
    const parts = accelerator.split('+');
    const key = parts.pop() || '';
    if (mac && !parts.length && MAC_KEYS[key]) return MAC_KEYS[key].label;
    const mods = parts.map(p => (p === 'CmdOrCtrl' ? (mac ? '⌘' : 'Ctrl') : p));
    return mac ? `${mods.join('')}${key}` : [...mods, key].join('+');
}

/** The aria-keyshortcuts value of an accelerator ('Control+C', 'Meta+C', 'Backspace Delete' on a Mac). */
export function ariaKeyShortcuts(accelerator, mac = isMac()) {
    if (mac && MAC_KEYS[accelerator]) return MAC_KEYS[accelerator].aria;
    return accelerator.split('+').map(p => (p === 'CmdOrCtrl' ? (mac ? 'Meta' : 'Control') : p)).join('+');
}

/**
 * Runs the action whose accelerator is the key event `e` (a keydown), when it applies to the
 * selection of `ctx`; the same rules as the menu that shows its hint.
 * @param {KeyboardEvent|{ key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean, preventDefault: () => void }} e
 * @param {ActionContext} ctx
 * @param {boolean} [mac]  a Mac keyboard (Backspace is its delete key)
 * @returns {boolean} whether an action ran
 */
export function runShortcut(e, ctx, mac = isMac()) {
    const def = EXPLORER_ACTIONS.find(a => a.accelerator && !a.pasteEvent && a.surfaces.includes('shortcut') && matchesAccelerator(a.accelerator, e, mac));
    if (!def) return false;
    const action = resolveAction(def, ctx, 'shortcut');
    if (!action.visible || !action.enabled) return false;
    e.preventDefault();
    action.run();
    return true;
}

/** The label and icon of the Open action for one file (the detail panel's Open button). */
export function openPresentation(file) {
    const { label, icon } = resolveAction('open', { getSelectedEntries: () => (file ? [file] : []), canWrite: false, emit: () => {} }, 'toolbar');
    return { label, icon };
}
