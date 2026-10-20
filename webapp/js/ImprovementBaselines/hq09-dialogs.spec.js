/**
 * HQ-09 acceptance: Window owns dialog behaviour; dialogs are opened through a
 * registry that resolves with a result; selection logic is shared.
 * Fails today: Window has no v-model:visible/keyboard; useDialogs/useFileSelection do not exist.
 */
import { describe, it, expect } from 'vitest';
import { effectScope } from 'vue';
import { mount } from '@vue/test-utils';

describe('Window.vue contract', () => {
    it('emits close on Escape and confirm on Enter while visible', async () => {
        const Window = (await import('@/components/Window.vue')).default;
        const w = mount(Window, { props: { visible: true, title: 'T' }, attachTo: document.body, global: { stubs: { teleport: true } } });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(w.emitted('close')).toBeTruthy();
        expect(w.emitted('confirm')).toBeTruthy();
        w.unmount();
    });
});

describe('useDialogs', () => {
    it('opens a dialog and resolves with its result', async () => {
        const { useDialogs } = await import('@/composables/useDialogs');
        const scope = effectScope();
        const dialogs = scope.run(() => useDialogs());
        const p = dialogs.open('rename', { path: 'a.jpg' });
        expect(dialogs.stack.value.map(d => d.name)).toEqual(['rename']);
        dialogs.close('rename', 'b.jpg');
        await expect(p).resolves.toBe('b.jpg');
        scope.stop();
    });
});

describe('useFileSelection', () => {
    it('supports shift ranges without mutating the files', async () => {
        const { useFileSelection } = await import('@/composables/useFileSelection');
        const files = [{ path: 'a' }, { path: 'b' }, { path: 'c' }, { path: 'd' }];
        const sel = useFileSelection(() => files, f => f.path);
        sel.toggle(0);
        sel.toggle(2, { shift: true });
        expect([...sel.selected.value]).toEqual(['a', 'b', 'c']);
        expect(files.some(f => 'selected' in f)).toBe(false);
    });
});
