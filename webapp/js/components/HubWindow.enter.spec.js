/**
 * HubWindow Enter: an Enter that confirms is used up (its default is prevented). A confirm can open a question at once (a
 * new URL slug, a file to replace); a destructive question puts the focus on its Cancel button, and the rest of the same
 * Enter would press that button and answer the question unasked. An Enter that does not confirm keeps its default.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Window from './HubWindow.vue';
import SearchField from './SearchField.vue';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function show(props, content = '<input class="name">') {
    wrapper = mount(Window, {
        props: { visible: true, title: 'T', confirmLabel: 'Go', ...props },
        slots: { default: content },
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

    describe('an Enter that is not the window\'s', () => {
        const press = (target, init = {}) => {
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
            target.dispatchEvent(event);
            return event;
        };
        const inDialog = html => {
            const holder = document.createElement('div');
            holder.innerHTML = html;
            document.querySelector('.window-dialog [style*="contents"]').appendChild(holder);
            return holder.firstElementChild.querySelector('input') || holder.firstElementChild;
        };

        it('leaves the Enter of a field outside the dialog element, such as the filter of a Select list in the body', async () => {
            await show({});
            const filter = document.createElement('input');
            filter.className = 'p-select-filter';
            document.body.appendChild(filter);
            const event = press(filter);
            expect(wrapper.emitted('confirm')).toBeUndefined();
            expect(event.defaultPrevented).toBe(false);
        });

        it('leaves an Enter that something already handled, such as a Select choosing an option', async () => {
            await show({});
            const field = document.querySelector('.name');
            field.addEventListener('keydown', e => e.preventDefault());
            press(field);
            expect(wrapper.emitted('confirm')).toBeUndefined();
        });

        it('leaves the Enter of a search box, a search form and a field that owns it', async () => {
            await show({});
            press(inDialog('<form role="search"><input></form>'));
            press(inDialog('<div data-owns-enter><input></div>'));
            expect(wrapper.emitted('confirm')).toBeUndefined();
        });

        it('leaves the Enter of a SearchField, which searches', async () => {
            await show({}, { components: { SearchField }, template: '<input class="name"><SearchField label="Search" />' });
            press(document.querySelector('.window-dialog input[aria-label="Search"]'));
            expect(wrapper.emitted('confirm')).toBeUndefined();
        });

        it('still confirms from a field of the dialog, and when nothing has the focus', async () => {
            await show({});
            press(inDialog('<div><input></div>'));
            press(document.body);
            press(document);
            expect(wrapper.emitted('confirm')).toHaveLength(3);
        });
    });
});
