/**
 * The reference of an annotation, next to its name in both properties dialogs: it says Auto while empty (the save
 * numbers it), changes only `ref` in the model, and says whether it can be saved.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import AnnotationRefField from './AnnotationRefField.vue';

let wrapper;
async function show(props = {}) {
    wrapper = mount(AnnotationRefField, { props: { idPrefix: 'x', ...props }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return wrapper;
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const field = () => /** @type {HTMLInputElement} */ (document.getElementById('x-ref'));
const valid = () => wrapper.emitted('update:valid').at(-1)[0];
const lastModel = () => wrapper.emitted('update:modelValue').at(-1)[0];

describe('the reference field', () => {
    it('has a label, says Auto while empty, and shows the reference', async () => {
        await show();
        expect(document.querySelector('label[for="x-ref"]').textContent.trim()).toBe('Reference');
        expect(field().value).toBe('');
        expect(field().placeholder).toBe('Auto');
        expect(field().title).toBe('Numbered when saved');
        await wrapper.setProps({ modelValue: { ref: '7' } });
        expect(field().value).toBe('7');
    });

    it('changes only the reference, an empty one being absent', async () => {
        await show({ modelValue: { category: 'defect', ref: '2' } });
        field().value = '9';
        field().dispatchEvent(new Event('input'));
        await flushPromises();
        expect(lastModel()).toEqual({ category: 'defect', ref: '9' });
        field().value = '';
        field().dispatchEvent(new Event('input'));
        await flushPromises();
        expect(lastModel()).toEqual({ category: 'defect', ref: undefined });
    });

    it('is not a reference another annotation has: the message, the field marked and the form not valid', async () => {
        await show({ isRefTaken: ref => ref === '3' });
        expect(valid()).toBe(true);
        await wrapper.setProps({ modelValue: { ref: '3' } });
        expect(document.getElementById('x-ref-error').textContent).toBe('Reference 3 is already used');
        expect(field().getAttribute('aria-invalid')).toBe('true');
        expect(field().getAttribute('aria-describedby')).toBe('x-ref-error');
        expect(valid()).toBe(false);
        await wrapper.setProps({ modelValue: { ref: '4' } });
        expect(document.getElementById('x-ref-error')).toBeNull();
        expect(valid()).toBe(true);
    });

    it('is not a reference of more than 8 characters or with other characters than letters, digits and dashes', async () => {
        await show();
        expect(field().maxLength).toBe(8);
        for (const bad of ['123456789', 'a b', 'a_b']) {
            await wrapper.setProps({ modelValue: { ref: bad } });
            expect(valid()).toBe(false);
            expect(document.getElementById('x-ref-error').textContent).toContain('1 to 8');
        }
        await wrapper.setProps({ modelValue: { ref: 'A-12' } });
        expect(valid()).toBe(true);
    });

    it('takes a numeric reference of a file another tool wrote as its text', async () => {
        await show({ isRefTaken: ref => ref === '3' });
        await wrapper.setProps({ modelValue: { ref: 5 } });
        expect(field().value).toBe('5');
        expect(valid()).toBe(true);
        await wrapper.setProps({ modelValue: { ref: 3 } });
        expect(document.getElementById('x-ref-error').textContent).toBe('Reference 3 is already used');
        expect(valid()).toBe(false);
    });
});
