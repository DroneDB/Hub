/**
 * ConfirmDialog as a destructive confirmation: the focus starts on Cancel and Enter does not
 * confirm; with requireText, Confirm (click or Enter) waits for the typed text.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import PrimeVue from 'primevue/config';
import ConfirmDialog from './ConfirmDialog.vue';

let wrapper;
async function show(props) {
    wrapper = mount(ConfirmDialog, {
        props: { message: 'Sure?', ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    await wrapper.findComponent(Dialog).vm.$emit('show');
    return wrapper;
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const enter = (target = document.activeElement) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const confirmButton = () => document.querySelector('[data-confirm]');
const closes = () => wrapper.emitted('close')?.map(e => e[0]) ?? [];
async function type(value) {
    const input = document.querySelector('.p-dialog input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
}

describe('ConfirmDialog', () => {
    it('a danger dialog starts on Cancel, and Enter does not confirm', async () => {
        await show({ confirmText: 'Delete', confirmButtonClass: 'danger' });
        expect(document.activeElement.hasAttribute('data-cancel')).toBe(true);
        expect(document.activeElement.textContent).toContain('Cancel');
        enter();
        enter(document.body);
        await flushPromises();
        expect(closes()).not.toContain('confirm');
    });

    it('a dialog that is not a danger one starts on Confirm, and Enter confirms', async () => {
        await show({ confirmText: 'Ok' });
        expect(document.activeElement.hasAttribute('data-confirm')).toBe(true);
        enter(document.body);
        expect(closes()).toEqual(['confirm']);
    });

    it('a typed confirmation focuses its labelled input; Delete waits for the text (click and Enter)', async () => {
        await show({ confirmText: 'Delete', confirmButtonClass: 'danger', requireText: 'acme' });
        const input = document.activeElement;
        expect(input.tagName).toBe('INPUT');
        expect(document.querySelector(`label[for="${input.id}"]`).textContent).toBe('Type acme to confirm');

        expect(confirmButton().disabled).toBe(true);
        confirmButton().click();
        enter(input);
        await type('Acme');
        enter(input);
        expect(confirmButton().disabled).toBe(true);
        expect(closes()).toEqual([]);

        await type(' acme ');
        expect(confirmButton().disabled).toBe(false);
        enter(input);
        expect(closes()).toEqual(['confirm']);
    });

    it('the typed text enables the Delete button', async () => {
        await show({ confirmText: 'Delete', confirmButtonClass: 'danger', requireText: 'alice' });
        await type('alice');
        confirmButton().click();
        expect(closes()).toEqual(['confirm']);
    });

    it('Cancel answers cancel', async () => {
        await show({ confirmButtonClass: 'danger', requireText: 'x' });
        document.querySelector('[data-cancel]').click();
        expect(closes()).toEqual(['cancel']);
    });
});
