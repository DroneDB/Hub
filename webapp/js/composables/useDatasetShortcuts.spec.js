import { describe, it, expect, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import ddb from 'ddb';
import { useDatasetShortcuts } from './useDatasetShortcuts';

function setup({ selected = [{ path: 'a.tif' }], canWrite = true } = {}) {
    const actions = { remove: vi.fn(), upload: vi.fn(), importFromUrl: vi.fn() };
    const clipboard = { copy: vi.fn(), cut: vi.fn(), paste: vi.fn() };
    const scope = effectScope();
    scope.run(() => useDatasetShortcuts({
        blocked: () => false, canWrite: ref(canWrite), selected: () => selected, treeFor: () => null,
        actions, clipboard
    }));
    return { actions, clipboard, scope };
}

const press = (key, mods = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }));

const pressDelete = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

describe('useDatasetShortcuts', () => {
    it('deletes the selection on Delete', () => {
        const { actions, scope } = setup();
        pressDelete(document.body);
        expect(actions.remove).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('leaves keys typed in a list of things that are not files', () => {
        const { actions, scope } = setup();
        const list = document.createElement('div');
        list.setAttribute('data-no-file-shortcuts', '');
        const item = document.createElement('button');
        list.appendChild(item);
        document.body.appendChild(list);
        pressDelete(item);
        expect(actions.remove).not.toHaveBeenCalled();
        list.remove();
        scope.stop();
    });

    it('copies and cuts on Ctrl/Cmd+C and +X, the accelerators the menu shows', () => {
        const { clipboard, scope } = setup();
        press('c', { ctrlKey: true });
        press('x', { metaKey: true });
        expect(clipboard.copy).toHaveBeenCalledTimes(1);
        expect(clipboard.cut).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('pastes the Hub clipboard on the paste event (Ctrl/Cmd+V)', () => {
        const { clipboard, scope } = setup();
        const paste = new Event('paste', { bubbles: true });
        Object.defineProperty(paste, 'clipboardData', { value: { files: [], items: [], getData: () => '' } });
        document.body.dispatchEvent(paste);
        expect(clipboard.paste).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('never deletes or copies the dataset itself, and a reader cannot delete or cut', () => {
        const root = setup({ selected: [{ path: '', entry: { path: '', type: ddb.entry.type.DRONEDB } }] });
        press('Delete');
        press('c', { ctrlKey: true });
        expect(root.actions.remove).not.toHaveBeenCalled();
        expect(root.clipboard.copy).not.toHaveBeenCalled();
        root.scope.stop();

        const reader = setup({ canWrite: false });
        press('Delete');
        press('x', { ctrlKey: true });
        expect(reader.actions.remove).not.toHaveBeenCalled();
        expect(reader.clipboard.cut).not.toHaveBeenCalled();
        reader.scope.stop();
    });
});
