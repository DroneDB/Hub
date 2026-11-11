import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Form from '@primevue/forms/form';
import InputText from 'primevue/inputtext';
import { useHubForm } from './useHubForm';
import { createResolver } from '@/libs/forms/resolver';
import { ApiError } from '@/libs/ddb/apiError';

let wrapper;
function mountForm(action, options = {}) {
    const Host = {
        components: { Form, InputText },
        setup() {
            const form = useHubForm({ fields: ['a', 'b'], aliases: { Alpha: 'a' }, ...options });
            const resolver = createResolver({ a: v => (v ? null : 'A is required.'), b: v => (v ? null : 'B is required.') });
            return { ...form, resolver, action };
        },
        template: `<Form ref="formRef" :resolver="resolver" @submit="submit(action, $event)">
            <template #default="$form">
                <InputText name="a" :aria-invalid="errorOf($form, 'a') ? 'true' : undefined" />
                <InputText name="b" :aria-invalid="errorOf($form, 'b') ? 'true' : undefined" />
                <p v-if="errorOf($form, 'a')" class="ea">{{ errorOf($form, 'a') }}</p>
                <p v-if="errorOf($form, 'b')" class="eb">{{ errorOf($form, 'b') }}</p>
                <p v-if="formError" class="ef">{{ formError }}</p>
                <button type="submit">go</button>
            </template>
        </Form>`
    };
    wrapper = mount(Host, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    return wrapper;
}
const type = async (name, value) => { await wrapper.find(`input[name="${name}"]`).setValue(value); await flushPromises(); };
const submit = async () => { await wrapper.find('form').trigger('submit'); await flushPromises(); };
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('useHubForm (FR-XC-11)', () => {
    it('an invalid submit sends nothing, shows every error and focuses the first invalid field', async () => {
        const action = vi.fn();
        mountForm(action);
        await flushPromises();
        await submit();
        expect(action).not.toHaveBeenCalled();
        expect(wrapper.find('.ea').text()).toBe('A is required.');
        expect(wrapper.find('.eb').text()).toBe('B is required.');
        expect(document.activeElement).toBe(wrapper.find('input[name="a"]').element);
        await type('a', 'x');
        await submit();
        expect(document.activeElement).toBe(wrapper.find('input[name="b"]').element);
    });

    it('shows a field error after an edit, before any submit', async () => {
        mountForm(vi.fn());
        await type('a', 'x');
        await type('a', '');
        expect(wrapper.find('.ea').text()).toBe('A is required.');
        expect(wrapper.find('.eb').exists()).toBe(false);
    });

    it('runs the action once with the values while it is pending', async () => {
        let resolve;
        const action = vi.fn(() => new Promise(r => { resolve = r; }));
        mountForm(action);
        await type('a', '1');
        await type('b', '2');
        await submit();
        await submit();
        expect(action).toHaveBeenCalledTimes(1);
        expect(action).toHaveBeenCalledWith({ a: '1', b: '2' });
        expect(wrapper.vm.busy).toBe(true);
        resolve();
        await flushPromises();
        expect(wrapper.vm.busy).toBe(false);
    });

    it('maps the errors of a failed request to the fields by key, and clears one when that field is edited', async () => {
        mountForm(vi.fn().mockRejectedValue(new ApiError('x', 400, { errors: { Alpha: ['Taken.'], b: ['Bad b.'] } })));
        await type('a', '1');
        await type('b', '2');
        await submit();
        expect(wrapper.find('.ea').text()).toBe('Taken.');
        expect(wrapper.find('.eb').text()).toBe('Bad b.');
        expect(wrapper.find('.ef').exists()).toBe(false);
        await type('a', '12');
        expect(wrapper.find('.ea').exists()).toBe(false);
        expect(wrapper.find('.eb').text()).toBe('Bad b.');
    });

    it('puts an error with no field in the form message, and clears it when any field is edited', async () => {
        mountForm(vi.fn().mockRejectedValue(new ApiError('Cannot reach the server', 0)));
        await type('a', '1');
        await type('b', '2');
        await submit();
        expect(wrapper.find('.ef').text()).toBe('Cannot reach the server');
        await type('b', '3');
        expect(wrapper.find('.ef').exists()).toBe(false);
    });

    it('with fieldErrors: false, puts an error with an errors member in the form message, at no field', async () => {
        mountForm(vi.fn().mockRejectedValue(new ApiError('One or more validation errors occurred.', 400, { errors: { a: ['Bad a.'], b: ['Bad b.'] } })),
            { fieldErrors: false });
        await type('a', '1');
        await type('b', '2');
        await submit();
        expect(wrapper.find('.ea').exists()).toBe(false);
        expect(wrapper.find('.eb').exists()).toBe(false);
        expect(wrapper.find('.ef').text()).toBe('One or more validation errors occurred.');
    });

    it('takes the form message from the formMessage option', async () => {
        mountForm(vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401)), { formMessage: () => 'Nope.' });
        await type('a', '1');
        await type('b', '2');
        await submit();
        expect(wrapper.find('.ef').text()).toBe('Nope.');
    });

    // D-040: a name that exists is a 409 without a field member: it belongs to the name field (statusFields)
    it('puts an answer of a mapped status that names no field at the field of that status', async () => {
        mountForm(vi.fn().mockRejectedValue(new ApiError('A file or folder named "x" already exists in this folder', 409, { conflictPath: 'x' })),
            { statusFields: { 409: 'a' } });
        await type('a', '1');
        await type('b', '2');
        await submit();
        expect(wrapper.find('.ea').text()).toBe('A file or folder named "x" already exists in this folder');
        expect(wrapper.find('.ef').exists()).toBe(false);
        await type('a', '12');
        expect(wrapper.find('.ea').exists()).toBe(false);
    });

    it('prefers the field the answer names to the field of its status, and ignores a status that is not mapped', async () => {
        mountForm(vi.fn().mockRejectedValue(new ApiError('x', 409, { errors: { b: ['Bad b.'] } })), { statusFields: { 409: 'a' } });
        await type('a', '1');
        await type('b', '2');
        await submit();
        expect(wrapper.find('.eb').text()).toBe('Bad b.');
        expect(wrapper.find('.ea').exists()).toBe(false);
        wrapper.unmount();

        mountForm(vi.fn().mockRejectedValue(new ApiError('Server error', 500)), { statusFields: { 409: 'a' } });
        await type('a', '1');
        await type('b', '2');
        await submit();
        expect(wrapper.find('.ef').text()).toBe('Server error');
        expect(wrapper.find('.ea').exists()).toBe(false);
    });
});
