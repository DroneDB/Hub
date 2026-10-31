/**
 * The file context menu: what a user who can only read the dataset gets (a copy to another
 * dataset, no Cut) against a writer (a move, Cut).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import ddb from 'ddb';
import { buildStandardContextMenu } from './contextMenuItems';

vi.mock('@/libs/build/buildManager', () => ({ default: { getBuildState: () => null }, BUILD_STATES: {} }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { isLoggedIn: () => true, features: { get: () => false, value: () => null } } }));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, buildFile: vi.fn(), isFileBuilt: vi.fn(), isBuildComplete: () => false
}));

const selection = [{ path: 'a.jpg', entry: { path: 'a.jpg', type: ddb.entry.type.IMAGE } }];

function menu(canWrite) {
    const emit = vi.fn();
    const items = buildStandardContextMenu({ getSelectedEntries: () => selection, canWrite, dataset: null, emit });
    const all = items.flatMap(i => (i.items ? [i, ...i.items] : [i]));
    const byLabel = label => all.find(i => i.label === label);
    return { emit, all, byLabel, tools: items.find(i => i.label === 'Tools') };
}

const visible = item => !!item && (item.isVisible === undefined || item.isVisible());

describe('the context menu of a dataset the user can only read', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('offers a copy to another dataset instead of a transfer, and the same action opens it', () => {
        const { byLabel, emit } = menu(false);
        expect(byLabel('Transfer')).toBeUndefined();
        const copy = byLabel('Copy to another dataset...');
        expect(visible(copy)).toBe(true);
        expect(copy.icon).toBe('fa-solid fa-copy');
        copy.click();
        expect(emit).toHaveBeenCalledWith('transferSelectedItems');
    });

    it('has no Cut, Paste or Delete', () => {
        const { byLabel } = menu(false);
        expect(visible(byLabel('Cut'))).toBe(false);
        expect(visible(byLabel('Paste'))).toBe(false);
        expect(visible(byLabel('Delete'))).toBe(false);
        expect(visible(byLabel('Copy'))).toBe(true);
    });
});

describe('the context menu of a dataset the user can write', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('offers the transfer, which moves the files, and Cut', () => {
        const { byLabel } = menu(true);
        expect(byLabel('Copy to another dataset...')).toBeUndefined();
        expect(visible(byLabel('Transfer'))).toBe(true);
        expect(byLabel('Transfer').icon).toBe('fa-solid fa-right-left');
        expect(visible(byLabel('Cut'))).toBe(true);
    });
});

describe('the shortcuts the menu names', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('are only the keys the dataset page binds: Ctrl/Cmd+C, +X, +V and Delete', () => {
        const { all } = menu(true);
        const named = Object.fromEntries(all.filter(i => i.accelerator).map(i => [i.label, i.accelerator]));
        expect(named).toEqual({ Copy: 'CmdOrCtrl+C', Cut: 'CmdOrCtrl+X', Paste: 'CmdOrCtrl+V', Delete: 'Delete' });
    });
});
