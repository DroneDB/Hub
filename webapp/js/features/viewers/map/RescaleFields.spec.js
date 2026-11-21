/**
 * The Rescale fields of the raster panels (FR-RAS-10, FR-RAS-20, D-025): Min and Max, each error at its
 * field, nothing emitted for a range that is not valid, "12,5" read as 12.5.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import RescaleFields from './RescaleFields.vue';

let wrapper;
const render = (modelValue = '', props = {}) => {
    wrapper = mount(RescaleFields, { props: { modelValue, idPrefix: 'rs', ...props } });
    return wrapper;
};
const min = () => wrapper.find('#rs-min');
const max = () => wrapper.find('#rs-max');
// setValue of Vue Test Utils fires input and then change on a text field, as the user leaving it does
const type = async (field, value) => { await field.setValue(value); };
const inLocale = locale => Object.defineProperty(navigator, 'language', { value: locale, configurable: true });
afterEach(() => {
    wrapper?.unmount();
    delete navigator.language;
});

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

    it('has no visible Min and Max labels: the fields are named by aria-label, ids and test ids stay', () => {
        render('1,2');
        expect(wrapper.find('label').exists()).toBe(false);
        expect(min().attributes('aria-label')).toBe('Min');
        expect(max().attributes('aria-label')).toBe('Max');
        expect(wrapper.find('[data-testid="rescale-min"]').element).toBe(min().element);
        expect(wrapper.find('[data-testid="rescale-max"]').element).toBe(max().element);
        expect(wrapper.text()).not.toMatch(/Min|Max/);
    });

    it('names the group by the label of the row when it is given one', () => {
        render('1,2', { labelledby: 'row-label' });
        const group = wrapper.find('[role="group"]');
        expect(group.attributes('aria-labelledby')).toBe('row-label');
        expect(group.attributes('data-testid')).toBe('rs-fields');
        wrapper.unmount();
        render('1,2');
        expect(wrapper.find('[role="group"]').attributes('aria-labelledby')).toBeUndefined();
    });

    it('shows the unit after Max, and none when it has no unit', () => {
        render('1,2', { unit: 'm' });
        expect(wrapper.find('[data-testid="rescale-unit"]').text()).toBe('m');
        wrapper.unmount();
        render('1,2');
        expect(wrapper.find('[data-testid="rescale-unit"]').exists()).toBe(false);
    });

    describe('in the Italian locale', () => {
        it('shows a range the panel sets with the decimal comma, at first and when it changes', async () => {
            inLocale('it-IT');
            render('194.66,227.75');
            expect([min().element.value, max().element.value]).toEqual(['194,66', '227,75']);
            await wrapper.setProps({ modelValue: '-0.5,1e-7' });
            expect([min().element.value, max().element.value]).toEqual(['-0,5', '0,0000001']);
        });

        it('leaves what the user typed as typed, and emits the machine value', async () => {
            inLocale('it-IT');
            render('194.66,227.75');
            await type(max(), '300,5');
            expect(max().element.value).toBe('300,5');
            expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['194.66,300.5']);
            expect(wrapper.emitted('commit').at(-1)).toEqual(['194.66,300.5']);
            // the panel echoes the emitted value: the typed text stays, it is not rewritten
            await wrapper.setProps({ modelValue: '194.66,300.5' });
            expect(max().element.value).toBe('300,5');
        });
    });

    it('shows a range the panel sets with the decimal point in the English locale', () => {
        inLocale('en-US');
        render('194.66,227.75');
        expect([min().element.value, max().element.value]).toEqual(['194.66', '227.75']);
    });

    describe('data range', () => {
        const dataRange = { min: 194.66, max: 227.75 };

        it('shows no caption and no Fit to data without a data range', () => {
            render('1,2');
            expect(wrapper.find('[data-testid="rescale-data-range"]').exists()).toBe(false);
            expect(wrapper.find('[data-testid="rescale-fit"]').exists()).toBe(false);
        });

        it('shows the caption with the unit, written by the formatter it is given', () => {
            inLocale('it-IT');
            render('1,2', { dataRange, unit: 'm', formatValue: v => v.toFixed(1) });
            expect(wrapper.find('.rescale-data').text()).toBe('194.7 \u2013 227.8 m');
            expect(wrapper.find('[data-testid="rescale-data-range"]').text()).toMatch(/^Data /);
            expect(wrapper.find('[data-testid="rescale-fit"]').text()).toBe('Fit to data');
            wrapper.unmount();
            // without a formatter the numbers are written by formatNumber, in the locale, with the precision of a value
            render('1,2', { dataRange });
            expect(wrapper.find('.rescale-data').text()).toBe('194,660 \u2013 227,750');
        });

        it('fits the fields to the data range, in the locale, and emits the machine value', async () => {
            inLocale('it-IT');
            render('1,2', { dataRange });
            const fit = wrapper.find('[data-testid="rescale-fit"]');
            expect(fit.attributes('type')).toBe('button');
            await fit.trigger('click');
            expect([min().element.value, max().element.value]).toEqual(['194,66', '227,75']);
            expect(wrapper.emitted('update:modelValue')).toEqual([['194.66,227.75']]);
            expect(wrapper.emitted('commit')).toEqual([['194.66,227.75']]);
            // and says that the range is the one of the data, for a panel that keeps the unit a range is in
            expect(wrapper.emitted('fit')).toEqual([['194.66,227.75']]);
        });

        it('does not fit when the fields are disabled', () => {
            render('1,2', { dataRange, disabled: true });
            expect(wrapper.find('[data-testid="rescale-fit"]').attributes('disabled')).toBeDefined();
        });

        it('offers no Fit to data for a constant raster, whose range the fields would refuse', () => {
            render('1,2', { dataRange: { min: 5, max: 5 }, formatValue: v => String(v) });
            expect(wrapper.find('.rescale-data').text()).toBe('5 – 5');
            expect(wrapper.find('[data-testid="rescale-fit"]').exists()).toBe(false);
            expect(wrapper.find('.rescale-error').exists()).toBe(false);
            expect(wrapper.emitted('invalid')).toBeUndefined();
        });

        it('shows no caption for a data range that is not two numbers', () => {
            for (const range of [{ min: null, max: 3 }, { min: 1, max: Number.NaN }, { min: 1, max: Infinity }]) {
                render('1,2', { dataRange: range });
                expect(wrapper.find('[data-testid="rescale-data-range"]').exists()).toBe(false);
                expect(wrapper.find('[data-testid="rescale-fit"]').exists()).toBe(false);
                wrapper.unmount();
            }
        });

        it('writes the caption in its own unit when the data is in another unit than the fields', () => {
            render('1,2', { dataRange, unit: '°F', dataUnit: '°C', formatValue: v => v.toFixed(1) });
            expect(wrapper.find('.rescale-data').text()).toBe('194.7 – 227.8 °C');
            expect(wrapper.find('[data-testid="rescale-unit"]').text()).toBe('°F');
        });
    });
});
