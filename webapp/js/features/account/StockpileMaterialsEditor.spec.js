/**
 * The stockpile materials in the Preferences: each change is stored as the user's materials
 * preference (only what differs from the built-in values), an invalid value is shown and not
 * stored, and imperial values are stored metric without drifting.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import StockpileMaterialsEditor from './StockpileMaterialsEditor.vue';
import { PREF, getPref, setPref, _resetPrefListenersForTests } from '@/libs/preferences';

let wrapper;
async function render() {
    wrapper = mount(StockpileMaterialsEditor, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
}
const stored = () => getPref(PREF.STOCKPILE_MATERIALS, null);
const row = slug => wrapper.find(`[data-testid="material-${slug}"]`);
/** The InputNumber of a row: 0 density, 1 price */
const numberIn = (slug, index) => row(slug).findAllComponents({ name: 'InputNumber' })[index];
async function type(slug, index, value) {
    numberIn(slug, index).vm.$emit('update:modelValue', value);
    await flushPromises();
}

beforeEach(() => {
    _resetPrefListenersForTests();
    setPref(PREF.STOCKPILE_MATERIALS, null);
    setPref(PREF.MEASURE_UNIT, null);
    setPref(PREF.CURRENCY, null);
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    _resetPrefListenersForTests();
});

describe('StockpileMaterialsEditor', () => {
    it('lists every built-in material with its values, in metric units by default', async () => {
        await render();
        expect(wrapper.findAll('[data-testid^="material-"]')).toHaveLength(15);
        expect(numberIn('gravel', 0).props('modelValue')).toBe(1.68);
        expect(numberIn('gravel', 1).props('modelValue')).toBe(15);
        expect(wrapper.find('.materials-head').text()).toContain('Density (t/m³)');
        expect(wrapper.find('.materials-head').text()).toContain('Price (USD/t)');
    });

    it('stores a changed value as an override, marks the material edited, and a reset removes it', async () => {
        await render();
        await type('gravel', 1, 14);
        expect(stored().overrides).toEqual({ gravel: { costPerTon: 14 } });
        expect(row('gravel').text()).toContain('edited');
        await row('gravel').findAll('button').at(-1).trigger('click');
        expect(stored().overrides).toEqual({});
        expect(row('gravel').text()).not.toContain('edited');
    });

    it('does not store an invalid value, and says why', async () => {
        await render();
        await type('sand', 0, 0);
        await type('sand', 1, null);
        expect(stored()?.overrides ?? {}).toEqual({});
        expect(row('sand').find('[role="alert"]').text()).toMatch(/density must be more than 0/);
        await type('sand', 0, 1.7);
        expect(stored().overrides.sand).toEqual({ densityTonPerM3: 1.7 });
        expect(row('sand').find('[role="alert"]').text()).toMatch(/price/);
    });

    it('hides and shows a material in the panel', async () => {
        await render();
        row('snow').findComponent({ name: 'ToggleSwitch' }).vm.$emit('update:modelValue', false);
        await flushPromises();
        expect(stored().overrides.snow).toEqual({ hidden: true });
        expect(row('snow').classes()).toContain('hidden');
        row('snow').findComponent({ name: 'ToggleSwitch' }).vm.$emit('update:modelValue', true);
        await flushPromises();
        expect(stored().overrides).toEqual({});
    });

    it('adds, renames and removes a material of the user', async () => {
        await render();
        await wrapper.findAll('button').find(b => b.text().includes('Add material')).trigger('click');
        await flushPromises();
        const [mine] = stored().custom;
        expect(mine).toMatchObject({ name: 'Material', densityTonPerM3: 1.5, costPerTon: 0 });

        const name = row(mine.id).find('input[type="text"]');
        await name.setValue('Gravel');
        await name.trigger('change');
        expect(stored().custom[0].name).toBe('Material');
        expect(row(mine.id).find('[role="alert"]').text()).toMatch(/Another material/);
        await name.setValue('Rail ballast');
        await name.trigger('change');
        expect(stored().custom[0].name).toBe('Rail ballast');
        expect(row(mine.id).find('[role="alert"]').exists()).toBe(false);

        await row(mine.id).find('button').trigger('click');
        expect(stored().custom).toEqual([]);
    });

    it('in imperial units: shows converted values, stores metric, and a shown value given back changes nothing', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await render();
        expect(wrapper.find('.materials-head').text()).toContain('Density (ST/yd³)');
        expect(numberIn('gravel', 0).props('modelValue')).toBe(1.416);
        expect(numberIn('gravel', 1).props('modelValue')).toBe(13.61);
        await type('gravel', 0, 1.416);
        expect(stored()?.overrides ?? {}).toEqual({});
        await type('gravel', 1, 10);
        expect(stored().overrides.gravel.costPerTon).toBeCloseTo(11.0231, 4);
    });

    it('follows a change made elsewhere (the account, another tab)', async () => {
        await render();
        setPref(PREF.STOCKPILE_MATERIALS, { overrides: { coal: { costPerTon: 99 } } });
        setPref(PREF.CURRENCY, 'EUR');
        await flushPromises();
        expect(numberIn('coal', 1).props('modelValue')).toBe(99);
        expect(wrapper.find('.materials-head').text()).toContain('Price (EUR/t)');
    });
});
