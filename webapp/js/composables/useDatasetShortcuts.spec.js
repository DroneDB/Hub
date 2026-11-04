import { describe, it, expect, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useDatasetShortcuts } from './useDatasetShortcuts';

function setup() {
    const actions = { remove: vi.fn(), upload: vi.fn(), importFromUrl: vi.fn() };
    const scope = effectScope();
    scope.run(() => useDatasetShortcuts({
        blocked: () => false, canWrite: ref(true), selected: () => [{ path: 'a.tif' }], treeFor: () => null,
        actions, clipboard: { copy: vi.fn(), cut: vi.fn(), paste: vi.fn() }
    }));
    return { actions, scope };
}

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
});
