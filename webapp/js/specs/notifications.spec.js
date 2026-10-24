/**
 * One notifier with named durations, typed API errors, a prop-driven Message box.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

describe('libs/notify', () => {
    it('sends toasts with named durations and error formatting', async () => {
        const { notify, setToastService } = await import('@/libs/notify');
        const add = vi.fn();
        setToastService({ add });
        notify.success('Saved');
        notify.error(new Error('Boom'));
        notify.warn({ summary: 'Only a title', life: 'long' });
        expect(add).toHaveBeenNthCalledWith(1, expect.objectContaining({ severity: 'success', detail: 'Saved', life: 3000 }));
        expect(add).toHaveBeenNthCalledWith(2, expect.objectContaining({ severity: 'error', summary: 'Error', detail: 'Boom', life: 5000 }));
        expect(add).toHaveBeenNthCalledWith(3, { severity: 'warn', summary: 'Only a title', detail: undefined, life: 8000 });
    });
});

describe('ApiError', () => {
    it('carries the status and keeps the server message', async () => {
        const { ApiError, isUnauthorized } = await import('@/libs/ddb/apiError');
        const e = new ApiError('Token expired', 401, { error: 'Token expired' });
        expect(e).toBeInstanceOf(Error);
        expect(e.status).toBe(401);
        expect(isUnauthorized(e)).toBe(true);
        expect(isUnauthorized(new Error('Unauthorized'))).toBe(false);
    });
});

describe('HubMessage.vue', () => {
    it('shows v-model text and clears it on dismiss without touching $parent', async () => {
        const Message = (await import('@/components/HubMessage.vue')).default;
        const wrapper = mount(Message, {
            props: { modelValue: 'Something failed', 'onUpdate:modelValue': v => wrapper.setProps({ modelValue: v }) },
            global: { plugins: [PrimeVue] }
        });
        expect(wrapper.text()).toContain('Something failed');
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('update:modelValue')[0]).toEqual(['']);
        expect(wrapper.text()).toBe('');
    });

    it('sanitises the text', async () => {
        const Message = (await import('@/components/HubMessage.vue')).default;
        const wrapper = mount(Message, { props: { modelValue: '<img src=x onerror="alert(1)">Bad' }, global: { plugins: [PrimeVue] } });
        expect(wrapper.html()).not.toContain('onerror');
    });
});
