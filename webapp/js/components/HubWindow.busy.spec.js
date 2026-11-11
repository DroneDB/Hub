/**
 * HubWindow busy (FR-XC-11, FR-PRC-13): while a dialog's request or task runs the window cannot be closed (X,
 * Escape, mask, Cancel) and cannot confirm again (button, Enter); when the request ends it works as before.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Window from './HubWindow.vue';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const show = async props => {
    wrapper = mount(Window, {
        props: { visible: true, title: 'T', confirmLabel: 'Go', ...props },
        slots: { default: '<input class="name">' },
        attachTo: document.body, global: { plugins: [PrimeVue] }
    });
    await wrapper.vm.$nextTick();
    return document.querySelector('.window-dialog');
};

const enter = () => document.querySelector('.name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('HubWindow busy', () => {
    it('disables Cancel and the confirm button, and shows the confirm button loading', async () => {
        const dialog = await show({ busy: true });
        expect(dialog.querySelector('[data-cancel]').disabled).toBe(true);
        expect(dialog.querySelector('[data-confirm]').disabled).toBe(true);
        expect(dialog.querySelector('[data-confirm] .p-button-loading-icon, [data-confirm].p-button-loading')).not.toBeNull();
    });

    it('has no close button in the header', async () => {
        expect((await show({ busy: true })).querySelector('.p-dialog-close-button')).toBeNull();
        wrapper.unmount();
        expect((await show({ busy: false })).querySelector('.p-dialog-close-button')).not.toBeNull();
    });

    it('ignores Escape and Enter', async () => {
        await show({ busy: true });
        enter();
        escape();
        expect(wrapper.emitted('confirm')).toBeUndefined();
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('confirms on Enter and closes on Escape when it is not busy', async () => {
        await show({ busy: false });
        enter();
        escape();
        expect(wrapper.emitted('confirm')).toHaveLength(1);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('works again when the request ends', async () => {
        await show({ busy: true });
        await wrapper.setProps({ busy: false });
        enter();
        expect(wrapper.emitted('confirm')).toHaveLength(1);
    });
});
