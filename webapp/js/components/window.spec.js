import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
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
