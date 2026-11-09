/**
 * ScaleDialog (FR-VWR-18): the real length is read with parseNumber (D-025), so "12.5" and "12,5"
 * are 12.5 in a comma-decimal locale too; Set scale stays enabled while the user types (D-046), and
 * a Set with a value that is not a length shows the rule at the field and keeps the dialog open.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import PrimeVue from 'primevue/config';
import ScaleDialog from './ScaleDialog.vue';

let wrapper;
async function show(unitsApart = 4) {
    wrapper = mount(ScaleDialog, { props: { unitsApart }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    await wrapper.findComponent(Dialog).vm.$emit('show');
    return wrapper;
}
beforeEach(() => {
    Object.defineProperty(navigator, 'language', { value: 'it-IT', configurable: true });
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    delete navigator.language;
});

const field = () => document.getElementById('splat-scale-length');
const setButton = () => document.querySelector('[data-confirm]');
const closes = () => wrapper.emitted('close')?.map(e => e[0]) ?? [];
async function type(value) {
    field().value = value;
    field().dispatchEvent(new Event('input'));
    await flushPromises();
}
async function set() {
    setButton().click();
    await flushPromises();
}

describe('ScaleDialog', () => {
    it.each(['12.5', '12,5'])('reads %s as 12.5 metres with navigator.language it-IT', async text => {
        await show();
        await type(text);
        await set();
        expect(closes()).toEqual([12.5]);
    });

    it('keeps Set scale enabled while the user types, even with no value yet', async () => {
        await show();
        expect(setButton().disabled).toBe(false);
        await type('1');
        expect(setButton().disabled).toBe(false);
        await type('abc');
        expect(setButton().disabled).toBe(false);
    });

    it('shows the rule at the field for a Set with a value that is not a length, and stays open', async () => {
        await show();
        await type('abc');
        await set();
        expect(closes()).toEqual([]);
        const error = document.getElementById('splat-scale-length-error');
        expect(error.textContent).toContain('greater than 0');
        expect(field().getAttribute('aria-invalid')).toBe('true');
        expect(field().getAttribute('aria-describedby')).toBe('splat-scale-length-error');

        await type('0');
        await set();
        expect(closes()).toEqual([]);
        expect(document.getElementById('splat-scale-length-error')).not.toBeNull();
    });

    it('shows the resulting scale through the formatter of the browser locale', async () => {
        await show(4);
        await type('12,5');
        expect(document.getElementById('splat-scale-preview').textContent).toBe('1 unit = 3,125 m');
    });
});
