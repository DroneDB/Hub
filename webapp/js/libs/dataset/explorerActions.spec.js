/**
 * The action registry of the file explorer (FR-XC-14, AC-034): one definition per action, so for
 * one selection an action that two surfaces show has the same label and the same enabled state,
 * the menu leaves out what does not apply, and every accelerator a menu shows works.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import ddb from 'ddb';
import {
    EXPLORER_ACTIONS, resolveAction, actionMenuItem, runShortcut, matchesAccelerator, acceleratorLabel,
    ariaKeyShortcuts, openPresentation, ACTION_GROUPS
} from './explorerActions';
import { explorerTools } from './explorerTools';
import { buildStandardContextMenu } from '@/libs/contextMenuItems';

vi.mock('@/libs/build/buildManager', () => ({ default: { getBuildState: () => null }, BUILD_STATES: {} }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { isLoggedIn: () => true, features: { get: () => false, value: () => null } } }));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, buildFile: vi.fn(), isFileBuilt: vi.fn(), isBuildComplete: () => false
}));

const T = ddb.entry.type;
const file = (type, path) => ({ path: `ddb://h/o/d/${path}`, entry: { type, path, size: 10 } });

function context(selected, { canWrite = true, files = selected, clipboardEmpty = false } = {}) {
    return {
        getSelectedEntries: () => selected, getFiles: () => files, canWrite, dataset: { org: 'o', ds: 'd' },
        viewMode: 'table', expandedGrid: false, selectAll: vi.fn(), emit: vi.fn(), clipboardEmpty: () => clipboardEmpty
    };
}

/** The shown items of the menu (submenus flattened), as ContextMenu.vue filters them. */
function menu(ctx) {
    const shown = i => i.isVisible === undefined || i.isVisible();
    return buildStandardContextMenu(ctx)
        .flatMap(i => (i.items ? [i, ...i.items] : [i]))
        .filter(i => i.type !== 'separator' && shown(i));
}

const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...mods });

const SELECTIONS = {
    none: [],
    image: [file(T.IMAGE, 'a.jpg')],
    raster: [file(T.GEORASTER, 'ortho.tif')],
    cloud: [file(T.POINTCLOUD, 'cloud.laz')],
    pdf: [file(T.GENERIC, 'report.pdf')],
    tiles: [file(T.TILES3D, 'the-limes-test.3tz')],
    folder: [file(T.DIRECTORY, 'images')],
    several: [file(T.IMAGE, 'a.jpg'), file(T.GEOIMAGE, 'b.jpg')],
    dataset: [file(T.DRONEDB, '')]
};

describe('the action registry', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('defines each action once, with a known group', () => {
        const ids = EXPLORER_ACTIONS.map(a => a.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const a of EXPLORER_ACTIONS) expect(ACTION_GROUPS).toContain(a.group);
    });

    describe.each([true, false])('canWrite %s', canWrite => {
        it.each(Object.keys(SELECTIONS))('an action on the toolbar and in the menu has the same label and enabled state (%s)', name => {
            const ctx = context(SELECTIONS[name], { canWrite, files: [...SELECTIONS[name], file(T.IMAGE, 'other.jpg')] });
            const tools = explorerTools(ctx).filter(t => t.title);
            const items = menu(ctx).filter(i => i.id);
            let shared = 0;
            for (const item of items) {
                const tool = tools.find(t => t.id === item.id);
                if (!tool) continue;
                shared++;
                expect(item.label).toBe(tool.title);
                expect(item.isEnabled()).toBe(!tool.disabled);
            }
            if (name !== 'dataset' && name !== 'none') expect(shared).toBeGreaterThan(0);
        });
    });

    it('every accelerator it names is bound: a keydown runs the action, Ctrl/Cmd+V is the paste event', () => {
        const withKeys = EXPLORER_ACTIONS.filter(a => a.accelerator);
        expect(withKeys.map(a => [a.id, a.accelerator])).toEqual([
            ['copy', 'CmdOrCtrl+C'], ['cut', 'CmdOrCtrl+X'], ['paste', 'CmdOrCtrl+V'], ['delete', 'Delete']
        ]);
        const sel = [file(T.IMAGE, 'a.jpg')];
        const events = { copy: 'copySelectedItems', cut: 'cutSelectedItems', delete: 'deleteSelecteditems' };
        for (const action of withKeys.filter(a => !a.pasteEvent)) {
            const ctx = context(sel);
            const [k, ...mods] = action.accelerator.split('+').reverse();
            const e = key(k.toLowerCase(), mods.length ? { ctrlKey: true } : {});
            expect(runShortcut(e, ctx)).toBe(true);
            expect(e.preventDefault).toHaveBeenCalled();
            expect(ctx.emit).toHaveBeenCalledWith(events[action.id]);
            // Cmd on a Mac
            if (mods.length) {
                const mac = context(sel);
                expect(runShortcut(key(k.toLowerCase(), { metaKey: true }), mac)).toBe(true);
            }
        }
        // The paste accelerator is the browser's paste event (useDatasetShortcuts), never a keydown
        expect(runShortcut(key('v', { ctrlKey: true }), context(sel))).toBe(false);
    });

    it('a shortcut follows the rules of the menu: no Delete or Cut for a reader, nothing on the dataset itself', () => {
        const reader = context([file(T.IMAGE, 'a.jpg')], { canWrite: false });
        expect(runShortcut(key('Delete'), reader)).toBe(false);
        expect(runShortcut(key('x', { ctrlKey: true }), reader)).toBe(false);
        expect(runShortcut(key('c', { ctrlKey: true }), reader)).toBe(true);

        const root = context(SELECTIONS.dataset);
        expect(runShortcut(key('Delete'), root)).toBe(false);
        expect(runShortcut(key('c', { ctrlKey: true }), root)).toBe(false);
        expect(root.emit).not.toHaveBeenCalled();
        expect(runShortcut(key('Delete'), context([]))).toBe(false);
    });

    it('on a Mac, Delete is the delete key (Backspace) or fn+delete, shown as ⌫', () => {
        const sel = [file(T.IMAGE, 'a.jpg')];
        const mac = context(sel);
        expect(runShortcut(key('Backspace'), mac, true)).toBe(true);
        expect(mac.emit).toHaveBeenCalledWith('deleteSelecteditems');
        expect(runShortcut(key('Delete'), context(sel), true)).toBe(true);
        // Elsewhere Backspace is not Delete
        const pc = context(sel);
        expect(runShortcut(key('Backspace'), pc, false)).toBe(false);
        expect(pc.emit).not.toHaveBeenCalled();
        expect(matchesAccelerator('Delete', key('Backspace', { metaKey: true }), true)).toBe(false);
        expect(acceleratorLabel('Delete', true)).toBe('⌫');
        expect(ariaKeyShortcuts('Delete', true)).toBe('Backspace Delete');
        expect(ariaKeyShortcuts('Delete', false)).toBe('Delete');
    });

    it('matches accelerators exactly and writes them for the platform', () => {
        expect(matchesAccelerator('CmdOrCtrl+C', key('C', { ctrlKey: true }))).toBe(true);
        expect(matchesAccelerator('CmdOrCtrl+C', key('c', { ctrlKey: true, shiftKey: true }))).toBe(false);
        expect(matchesAccelerator('CmdOrCtrl+C', key('c'))).toBe(false);
        expect(matchesAccelerator('Delete', key('Delete', { ctrlKey: true }))).toBe(false);
        expect(acceleratorLabel('CmdOrCtrl+C', false)).toBe('Ctrl+C');
        expect(acceleratorLabel('CmdOrCtrl+C', true)).toBe('⌘C');
        expect(acceleratorLabel('Delete', false)).toBe('Delete');
        expect(ariaKeyShortcuts('CmdOrCtrl+X', false)).toBe('Control+X');
        expect(ariaKeyShortcuts('CmdOrCtrl+X', true)).toBe('Meta+X');
    });

    it('resolves a disabled action with its reason, and its run does nothing', () => {
        const ctx = context([]);
        const del = resolveAction('delete', ctx, 'toolbar');
        expect(del).toMatchObject({ visible: true, enabled: false, disabledReason: 'Select the files to delete', danger: true });
        del.run();
        expect(ctx.emit).not.toHaveBeenCalled();
        expect(resolveAction('delete', ctx, 'menu').visible).toBe(false);
        expect(() => resolveAction('nope', ctx, 'menu')).toThrow('Unknown explorer action: nope');
    });

    it('the menu item of an action reads the selection when the menu opens', () => {
        const selected = [];
        const ctx = context(selected);
        const rename = actionMenuItem('rename', ctx);
        expect(rename.isVisible()).toBe(false);
        selected.push(file(T.IMAGE, 'a.jpg'));
        expect(rename.isVisible()).toBe(true);
        rename.click();
        expect(ctx.emit).toHaveBeenCalledWith('moveSelectedItems');
    });

    it('gives the detail panel the Open of the viewer table', () => {
        expect(openPresentation(file(T.GEORASTER, 'o.tif'))).toEqual({ label: 'Open Map', icon: 'fa-solid fa-map' });
        expect(openPresentation(file(T.GENERIC, 'r.pdf'))).toEqual({ label: 'Open', icon: 'fa-regular fa-file-pdf' });
        expect(openPresentation(file(T.IMAGE, 'a.jpg'))).toEqual({ label: 'Open', icon: 'fa-regular fa-folder-open' });
        expect(openPresentation(null).label).toBe('Open');
    });
});
