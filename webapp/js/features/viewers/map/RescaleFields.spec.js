/**
 * The Rescale fields of the raster panels (FR-RAS-10, FR-RAS-20, D-025): Min and Max, each error at its
 * field, nothing emitted for a range that is not valid, "12,5" read as 12.5.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import RescaleFields from './RescaleFields.vue';

let wrapper;
const render = (modelValue = '') => {
    wrapper = mount(RescaleFields, { props: { modelValue, idPrefix: 'rs' } });
    return wrapper;
};
const min = () => wrapper.find('#rs-min');
const max = () => wrapper.find('#rs-max');
// setValue of Vue Test Utils fires input and then change on a text field, as the user leaving it does
const type = async (field, value) => { await field.setValue(value); };
afterEach(() => wrapper?.unmount());

describe('RescaleFields', () => {
    it('shows the range it is given in two fields, with no error before the user types', () => {
        render('0.371,0.947');
        expect(min().element.value).toBe('0.371');
        expect(max().element.value).toBe('0.947');
        expect(wrapper.find('.rescale-error').exists()).toBe(false);
        expect(min().attributes('aria-invalid')).toBeUndefined();
    });

    it('follows a range the panel sets', async () => {
        render('');
        await wrapper.setProps({ modelValue: '1,2' });
        expect([min().element.value, max().element.value]).toEqual(['1', '2']);
        await wrapper.setProps({ modelValue: '' });
        expect([min().element.value, max().element.value]).toEqual(['', '']);
    });

    it('refuses text that is not a number at its field and emits no range', async () => {
        render('0,10');
        await type(min(), 'abc');
        expect(wrapper.find('[data-testid="rescale-min-error"]').text()).toBe('Min must be a number');
        expect(min().attributes('aria-invalid')).toBe('true');
        expect(min().attributes('aria-describedby')).toBe('rs-min-error');
        expect(max().attributes('aria-invalid')).toBeUndefined();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.emitted('commit')).toBeUndefined();
    });

    it('refuses an empty Max, and a Min that is not less than Max', async () => {
        render('0,10');
        await type(max(), '');
        expect(wrapper.find('[data-testid="rescale-max-error"]').text()).toBe('Enter Max, or empty both fields for an automatic range');
        expect(wrapper.emitted('commit')).toBeUndefined();

        await type(max(), '10');
        expect(wrapper.emitted('commit')).toEqual([['0,10']]);
        await type(min(), '40');
        expect(wrapper.find('[data-testid="rescale-min-error"]').text()).toBe('Min must be less than Max');
        expect(min().attributes('aria-invalid')).toBe('true');
        expect(wrapper.emitted('commit')).toEqual([['0,10']]);
    });

    it('reads "12,5" as 12.5 and emits the machine value', async () => {
        render('0,10');
        await type(max(), '12,5');
        expect(wrapper.emitted('commit').at(-1)).toEqual(['0,12.5']);
        expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['0,12.5']);
        expect(wrapper.find('.rescale-error').exists()).toBe(false);
    });

    it('is the automatic range when both fields are empty', async () => {
        render('0,10');
        await type(min(), '');
        await type(max(), '');
        expect(wrapper.emitted('commit').at(-1)).toEqual(['']);
        expect(wrapper.find('.rescale-error').exists()).toBe(false);
    });

    it('keeps the last valid range when a field becomes invalid, and goes on when it is fixed', async () => {
        render('0,10');
        await type(max(), '20');
        await type(max(), 'x');
        expect(wrapper.emitted('commit')).toEqual([['0,20']]);
        await type(max(), '30');
        expect(wrapper.emitted('commit').at(-1)).toEqual(['0,30']);
        expect(wrapper.find('.rescale-error').exists()).toBe(false);
    });
});
