import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import PrimeVue from 'primevue/config';
import Window from './Window.vue';

const show = async props => {
    const w = mount(Window, { props: { visible: true, title: 'T', ...props }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await w.vm.$nextTick();
    await w.findComponent(Dialog).vm.$emit('show');
    return w;
};

describe('Window focus on show', () => {
    it('moves the keyboard into the dialog: the confirm button when there is no field', async () => {
        const w = await show({ confirmLabel: 'Delete' });
        expect(document.activeElement.hasAttribute('data-confirm')).toBe(true);
        expect(document.activeElement.textContent).toContain('Delete');
        w.unmount();
    });

    it('prefers the first field', async () => {
        const w = mount(Window, {
            props: { visible: true, title: 'T', confirmLabel: 'Rename' },
            slots: { default: '<input class="name">' },
            attachTo: document.body, global: { plugins: [PrimeVue] }
        });
        await w.vm.$nextTick();
        await w.findComponent(Dialog).vm.$emit('show');
        expect(document.activeElement.classList.contains('name')).toBe(true);
        w.unmount();
    });

    it('renders its id, or a generated one', async () => {
        const named = await show({ id: 'rename' });
        expect(document.getElementById('rename')).not.toBeNull();
        named.unmount();
        const anonymous = await show({});
        expect(document.querySelector('.window-dialog').id).not.toBe('');
        anonymous.unmount();
    });
});
