/**
 * HubWindow Enter: an Enter that confirms is used up (its default is prevented). A confirm can open a question at once (a
 * new URL slug, a file to replace); a destructive question puts the focus on its Cancel button, and the rest of the same
 * Enter would press that button and answer the question unasked. An Enter that does not confirm keeps its default.
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

async function show(props) {
    wrapper = mount(Window, {
        props: { visible: true, title: 'T', confirmLabel: 'Go', ...props },
        slots: { default: '<input class="name">' },
        attachTo: document.body, global: { plugins: [PrimeVue] }
    });
    await wrapper.vm.$nextTick();
}

/** Presses Enter in the field: the event, to read whether its default was prevented */
function enter() {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.querySelector('.name').dispatchEvent(event);
    return event;
}

describe('HubWindow Enter', () => {
    it('confirms and uses the key up', async () => {
        await show({});
        const event = enter();
        expect(wrapper.emitted('confirm')).toHaveLength(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it('keeps the key when it does not confirm', async () => {
        await show({ confirmDisabled: true });
        const event = enter();
        expect(wrapper.emitted('confirm')).toBeUndefined();
        expect(event.defaultPrevented).toBe(false);
    });
});
