/**
 * Window owns dialog behaviour; dialogs are opened through a registry that resolves
 * with a result; selection logic is shared.
 */
import { describe, it, expect } from 'vitest';
import { effectScope } from 'vue';
import { mount } from '@vue/test-utils';

describe('HubWindow.vue contract', () => {
    it('emits close on Escape and confirm on Enter while visible', async () => {
        const Window = (await import('@/components/HubWindow.vue')).default;
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

describe('HubWindow.vue keyboard ownership', () => {
    it('closes on an Escape handled outside the dialog (focus left in a closed menu)', async () => {
        const Window = (await import('@/components/HubWindow.vue')).default;
        const w = mount(Window, { props: { visible: true, title: 'T' }, attachTo: document.body, global: { stubs: { teleport: true } } });
        const outside = document.createElement('a');
        document.body.appendChild(outside);
        outside.addEventListener('keydown', e => e.preventDefault());
        outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(w.emitted('close')).toBeTruthy();
        outside.remove();
        w.unmount();
    });
});

describe('HubWindow.vue in the overlay stack', () => {
    it('closes only the topmost of two open windows on Escape, then the other one', async () => {
        const Window = (await import('@/components/HubWindow.vue')).default;
        const PrimeVue = (await import('primevue/config')).default;
        const options = { attachTo: document.body, global: { plugins: [PrimeVue], stubs: { teleport: true } } };
        const lower = mount(Window, { props: { visible: true, title: 'Lower' }, ...options });
        const upper = mount(Window, { props: { visible: true, title: 'Upper' }, ...options });
        const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        escape();
        expect(upper.emitted('close')).toHaveLength(1);
        expect(lower.emitted('close')).toBeUndefined();
        await upper.setProps({ visible: false });
        escape();
        expect(lower.emitted('close')).toHaveLength(1);
        upper.unmount();
        lower.unmount();
    });
});
