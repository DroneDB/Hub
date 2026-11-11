import { describe, it, expect } from 'vitest';
import { defineComponent } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import PrimeVue from 'primevue/config';
import Window from './HubWindow.vue';

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

    it('starts a destructive confirmation on Cancel, before any field or the confirm button', async () => {
        for (const props of [{ danger: true }, { confirmSeverity: 'danger' }]) {
            const w = mount(Window, {
                props: { visible: true, title: 'T', confirmLabel: 'Delete', ...props },
                slots: { default: '<input class="name">' },
                attachTo: document.body, global: { plugins: [PrimeVue] }
            });
            await w.vm.$nextTick();
            await w.findComponent(Dialog).vm.$emit('show');
            expect(document.activeElement.hasAttribute('data-cancel')).toBe(true);
            expect(document.activeElement.textContent).toContain('Cancel');
            w.unmount();
        }
    });

    it('lets [data-autofocus] (a typed confirmation) come before Cancel', async () => {
        const w = mount(Window, {
            props: { visible: true, title: 'T', confirmLabel: 'Delete', danger: true },
            slots: { default: '<input class="typed" data-autofocus>' },
            attachTo: document.body, global: { plugins: [PrimeVue] }
        });
        await w.vm.$nextTick();
        await w.findComponent(Dialog).vm.$emit('show');
        expect(document.activeElement.classList.contains('typed')).toBe(true);
        w.unmount();
    });
});

describe('Window Enter', () => {
    const enter = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const withField = async props => {
        const w = mount(Window, {
            props: { visible: true, title: 'T', confirmLabel: 'Save', ...props },
            slots: { default: '<input class="name">' },
            attachTo: document.body, global: { plugins: [PrimeVue] }
        });
        await w.vm.$nextTick();
        return w;
    };

    it('confirms from a field by default (a form)', async () => {
        const w = await withField({});
        enter(document.querySelector('.name'));
        expect(w.emitted('confirm')).toHaveLength(1);
        w.unmount();
    });

    it('does not confirm with enterConfirms false, nor while confirmDisabled, nor from a button', async () => {
        const cases = [[{ enterConfirms: false }, '.name'], [{ confirmDisabled: true }, '.name'], [{}, '[data-cancel]']];
        for (const [props, from] of cases) {
            const w = await withField(props);
            enter(document.querySelector(from));
            expect(w.emitted('confirm')).toBeUndefined();
            w.unmount();
        }
    });
});

describe('Window in the overlay stack (FR-XC-19)', () => {
    const withSelect = () => defineComponent({
        components: { Window, Select },
        emits: ['close'],
        data: () => ({ value: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }),
        template: `<Window title="T" modal @close="$emit('close')">
                       <Select v-model="value" input-id="pick" :options="options" option-label="label" option-value="value" />
                   </Window>`
    });
    const escapeOn = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));

    it('closes on Escape from a closed Select, which stops the key itself (MAP-03)', async () => {
        const w = mount(withSelect(), { attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();
        const combo = document.getElementById('pick');
        combo.focus();
        expect(combo.getAttribute('aria-expanded')).toBe('false');
        escapeOn(combo);
        expect(w.emitted('close')).toHaveLength(1);
        w.unmount();
    });

    it('lets Escape close only the open Select list', async () => {
        const w = mount(withSelect(), { attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();
        const select = w.findComponent(Select);
        select.vm.show(true);
        await flushPromises();
        const combo = document.getElementById('pick');
        combo.focus();
        expect(combo.getAttribute('aria-expanded')).toBe('true');
        escapeOn(combo);
        // The Select hides on a timeout
        await new Promise(resolve => setTimeout(resolve, 0));
        await flushPromises();
        expect(w.emitted('close')).toBeUndefined();
        expect(combo.getAttribute('aria-expanded')).toBe('false');
        w.unmount();
    });

    it('takes the focus from the opener and gives it back on close (AC-026)', async () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const w = mount(Window, {
            props: { id: 'edit', visible: true, title: 'T', confirmLabel: 'Save' },
            slots: { default: '<input class="name">' },
            attachTo: document.body, global: { plugins: [PrimeVue] }
        });
        await flushPromises();
        // Test utils stub the Dialog's transition, whose enter hook emits show
        await w.findComponent(Dialog).vm.$emit('show');
        expect(document.activeElement.classList.contains('name')).toBe(true);
        expect(document.activeElement.closest('[role="dialog"]').id).toBe('edit');
        w.unmount();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it('skips a field of a hidden tab panel', async () => {
        const w = mount(Window, {
            props: { visible: true, title: 'T' },
            slots: { default: '<div style="display: none"><input class="hidden"></div><div><input class="shown"></div>' },
            attachTo: document.body, global: { plugins: [PrimeVue] }
        });
        await flushPromises();
        await w.findComponent(Dialog).vm.$emit('show');
        expect(document.activeElement.classList.contains('shown')).toBe(true);
        w.unmount();
    });
});
