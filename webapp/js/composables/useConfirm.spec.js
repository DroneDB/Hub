import { describe, it, expect, afterEach } from 'vitest';
import { defineComponent, effectScope, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import PrimeVue from 'primevue/config';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from './useDialogs';
import { useConfirm, useChoice } from './useConfirm';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('useChoice', () => {
    it('resolves the answer, and anything that is not Save or the secondary button is cancel', async () => {
        const dialogs = effectScope().run(() => useDialogs());
        const choose = useChoice(dialogs);
        const ask = () => choose({ message: 'Save?', confirmText: 'Save', secondaryText: 'Discard', secondaryDanger: true });
        const saved = ask();
        expect(dialogs.stack.value[0].props).toMatchObject({ secondaryText: 'Discard', secondaryButtonClass: 'danger', confirmButtonClass: 'primary' });
        dialogs.close(dialogs.stack.value[0].id, 'confirm');
        await expect(saved).resolves.toBe('confirm');
        const discarded = ask();
        dialogs.close(dialogs.stack.value[0].id, 'secondary');
        await expect(discarded).resolves.toBe('secondary');
        const dismissed = ask();
        dialogs.close(dialogs.stack.value[0].id);
        await expect(dismissed).resolves.toBe('cancel');
    });
});

describe('useConfirm', () => {
    it('resolves true only for confirm', async () => {
        const dialogs = effectScope().run(() => useDialogs());
        const confirm = useConfirm(dialogs);
        const yes = confirm({ message: 'Sure?', danger: true });
        expect(dialogs.stack.value[0].props).toMatchObject({ message: 'Sure?', confirmButtonClass: 'danger' });
        dialogs.close(dialogs.stack.value[0].id, 'confirm');
        await expect(yes).resolves.toBe(true);
        const no = confirm({ message: 'Sure?' });
        dialogs.close(dialogs.stack.value[0].id, 'cancel');
        await expect(no).resolves.toBe(false);
    });

    it('passes requireText to the dialog', () => {
        const dialogs = effectScope().run(() => useDialogs());
        useConfirm(dialogs)({ message: 'Sure?', danger: true, requireText: 'acme' });
        expect(dialogs.stack.value[0].props).toMatchObject({ requireText: 'acme' });
    });

    it('a danger question starts on Cancel, and Enter does not answer yes', async () => {
        let dialogs;
        wrapper = mount(defineComponent({
            setup() {
                dialogs = useDialogs();
                return () => h(DialogHost, { dialogs });
            }
        }), { attachTo: document.body, global: { plugins: [PrimeVue] } });
        let answer = 'pending';
        useConfirm(dialogs)({ message: 'Delete?', confirmText: 'Delete', danger: true }).then(v => { answer = v; });
        await flushPromises();
        await wrapper.findComponent(Dialog).vm.$emit('show');

        expect(document.activeElement.textContent).toContain('Cancel');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await flushPromises();
        expect(answer).toBe('pending');

        document.activeElement.click();
        await flushPromises();
        expect(answer).toBe(false);
    });
});
