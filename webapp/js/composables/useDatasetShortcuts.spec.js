import { describe, it, expect, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import ddb from 'ddb';
import { useDatasetShortcuts } from './useDatasetShortcuts';

function setup({ selected = [{ path: 'a.tif' }], canWrite = true, files = [{ path: 'a.tif' }, { path: 'b.tif' }] } = {}) {
    const actions = { remove: vi.fn(), upload: vi.fn(), importFromUrl: vi.fn(), rename: vi.fn() };
    const clipboard = { copy: vi.fn(), cut: vi.fn(), paste: vi.fn() };
    const selectAll = vi.fn();
    const scope = effectScope();
    scope.run(() => useDatasetShortcuts({
        blocked: () => false, canWrite: ref(canWrite), selected: () => selected, files: () => files, selectAll, treeFor: () => null,
        actions, clipboard
    }));
    return { actions, clipboard, selectAll, scope };
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

    // FR-EXP-09: Ctrl/Cmd+A and F2 are accelerators of the registry, bound here
    describe('Select all and Rename', () => {
        const dispatch = (target, key, mods = {}) => {
            const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
            target.dispatchEvent(e);
            return e;
        };

        it('selects every file on Ctrl+A or Cmd+A and keeps the page text unselected', () => {
            const { selectAll, scope } = setup();
            expect(dispatch(document.body, 'a', { ctrlKey: true }).defaultPrevented).toBe(true);
            expect(selectAll).toHaveBeenLastCalledWith(true);
            dispatch(document.body, 'a', { metaKey: true });
            expect(selectAll).toHaveBeenCalledTimes(2);
            scope.stop();
        });

        it('selects from inside the file list, but leaves the text of anything else (a panel)', () => {
            const { selectAll, scope } = setup();
            const list = document.createElement('div');
            list.setAttribute('data-file-list', '');
            list.tabIndex = 0;
            const panel = document.createElement('div');
            panel.tabIndex = 0;
            document.body.append(list, panel);
            expect(dispatch(list, 'a', { ctrlKey: true }).defaultPrevented).toBe(true);
            expect(selectAll).toHaveBeenCalledTimes(1);
            expect(dispatch(panel, 'a', { ctrlKey: true }).defaultPrevented).toBe(false);
            expect(selectAll).toHaveBeenCalledTimes(1);
            list.remove();
            panel.remove();
            scope.stop();
        });

        it('keeps the browser from selecting the page when every file is already selected', () => {
            const all = [{ path: 'a.tif' }, { path: 'b.tif' }];
            const { selectAll, scope } = setup({ selected: all, files: all });
            expect(dispatch(document.body, 'a', { ctrlKey: true }).defaultPrevented).toBe(true);
            expect(selectAll).not.toHaveBeenCalled();
            scope.stop();
        });

        it('does not select all in a text field, and plain A is not a shortcut', () => {
            const { selectAll, scope } = setup();
            const input = document.createElement('input');
            document.body.appendChild(input);
            expect(dispatch(input, 'a', { ctrlKey: true }).defaultPrevented).toBe(false);
            expect(dispatch(document.body, 'a').defaultPrevented).toBe(false);
            expect(selectAll).not.toHaveBeenCalled();
            input.remove();
            scope.stop();
        });

        it('renames the one item selected on F2, and no other selection', () => {
            const one = setup();
            expect(dispatch(document.body, 'F2').defaultPrevented).toBe(true);
            expect(one.actions.rename).toHaveBeenCalledWith({ path: 'a.tif' });
            one.scope.stop();

            const two = setup({ selected: [{ path: 'a.tif' }, { path: 'b.tif' }] });
            dispatch(document.body, 'F2');
            expect(two.actions.rename).not.toHaveBeenCalled();
            two.scope.stop();

            const reader = setup({ canWrite: false });
            dispatch(document.body, 'F2');
            expect(reader.actions.rename).not.toHaveBeenCalled();
            reader.scope.stop();
        });
    });
});
