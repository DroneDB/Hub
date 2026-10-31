/**
 * The stockpile panel shows the weight and the cost the pile is saved with, in the user's units
 * and currency; the materials are grouped, and "Edit materials…" opens the Preferences on them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';

const h = vi.hoisted(() => ({ auth: null }));
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({ isLoggedIn: true });
    return { useAuthStore: () => h.auth };
});

const { default: StockpileVolumePanel } = await import('./StockpileVolumePanel.vue');
const { normalizeStockpileSettings, resolveStockpileCatalog } = await import('@/libs/stockpileMaterials');

const catalog = settings => resolveStockpileCatalog(normalizeStockpileSettings(settings)).filter(m => !m.hidden);
const RESULT = {
    cutVolume: 100, fillVolume: 0, netVolume: 100, area2d: 50,
    weightEstimate: { tons: 150, basedOn: 'cutVolume' },
    costEstimate: { amount: 1500, currency: 'EUR' }
};

let wrapper;
let router;
function render(props = {}, { embed = false, query = {} } = {}) {
    router = { push: vi.fn() };
    wrapper = mount(StockpileVolumePanel, {
        props: { visible: true, materials: catalog({}), ...props },
        global: {
            provide: { embed },
            mocks: { $router: router, $route: { query } },
            stubs: { StockpileBaseMethodsDialog: true }
        }
    });
    return wrapper;
}
const text = id => wrapper.find(`[data-testid="${id}"]`).text();
const materialOptions = () => wrapper.find('[data-testid="stockpile-material"]').findAll('option');
// As the panel writes numbers: the browser locale, at most `digits` decimals
const num = (n, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

beforeEach(() => { h.auth.isLoggedIn = true; });
afterEach(() => wrapper?.unmount());

describe('StockpileVolumePanel', () => {
    it('shows the weight and the cost of the result, not weights of its own', () => {
        // A net volume larger than the cut one: the panel used to weigh the net volume itself
        render({ material: 'gravel', result: { ...RESULT, netVolume: 300 } });
        expect(text('stockpile-weight')).toBe('150 t');
        expect(text('stockpile-cost')).toMatch(/€/);
        expect(text('stockpile-cost')).toMatch(/1.?500/);
    });

    it('shows no weight nor cost for a result without them', () => {
        render({ result: { ...RESULT, weightEstimate: undefined, costEstimate: undefined } });
        expect(wrapper.find('[data-testid="stockpile-weight"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="stockpile-cost"]').exists()).toBe(false);
    });

    it('shows volumes, weights and densities in imperial units', () => {
        render({ result: RESULT, unitPref: 'imperial' });
        expect(text('stockpile-net-volume')).toBe(`${num(130.8)} yd³`);
        expect(text('stockpile-weight')).toBe(`${num(165.35)} ST`);
        const gravel = materialOptions().find(o => o.text().startsWith('Gravel'));
        expect(gravel.text()).toBe(`Gravel (${num(1.416, 3)} ST/yd³)`);
    });

    it('groups the built-in materials by category, and the user ones last', () => {
        render({ materials: catalog({ custom: [{ id: 'u-1', name: 'Ballast', densityTonPerM3: 1.8 }] }) });
        const groups = wrapper.findAll('optgroup').map(g => g.attributes('label'));
        expect(groups[0]).toBe('Aggregate');
        expect(groups.at(-1)).toBe('My materials');
        expect(wrapper.findAll('optgroup').at(-1).text()).toContain('Ballast');
    });

    it('offers a restored pile material first, marked as saved', () => {
        const saved = { slug: '__saved__', name: 'Their ballast', category: '', densityTonPerM3: 1.8, costPerTon: 22, currency: 'GBP', saved: true };
        render({ materials: [saved, ...catalog({})] });
        expect(materialOptions()[1].text()).toBe(`Their ballast (saved, ${num(1.8, 3)} t/m³)`);
        expect(wrapper.findAll('optgroup').some(g => g.text().includes('Their ballast'))).toBe(false);
    });

    it('custom values: shown in the user units and currency, given back metric', async () => {
        render({ material: '__custom__', customDensity: 1.68, customCostPerTon: 15, unitPref: 'imperial', currency: 'EUR' });
        const density = wrapper.find('[data-testid="stockpile-custom-density"]');
        const cost = wrapper.find('[data-testid="stockpile-custom-cost"]');
        expect(density.element.value).toBe('1.416');
        expect(cost.element.value).toBe('13.61');
        expect(wrapper.find('.custom-material-grid').text()).toContain('Cost / ST (EUR)');
        await density.setValue('2');
        await cost.setValue('10');
        expect(wrapper.emitted('update:customDensity').at(-1)[0]).toBeCloseTo(2.3731, 4);
        expect(wrapper.emitted('update:customCostPerTon').at(-1)[0]).toBeCloseTo(11.0231, 4);
    });

    it('shows the base of the pile, gives back the one the user picks, and none while it measures', async () => {
        render({ baseMethod: 'best_fit', result: RESULT });
        const select = wrapper.find('[data-testid="stockpile-base-method"]');
        expect(select.element.value).toBe('best_fit');
        expect(select.findAll('option').map(o => o.text())).toEqual(
            ['Lowest perimeter', 'Average perimeter', 'Best-fit plane', 'Flat (elevation = 0)']);
        await select.setValue('lowest_perimeter');
        expect(wrapper.emitted('update:baseMethod')).toEqual([['lowest_perimeter']]);
        await wrapper.setProps({ loading: true });
        expect(select.attributes('disabled')).toBeDefined();
    });

    describe('Edit materials…', () => {
        it('opens the Preferences on the stockpile materials, keeping the page query', async () => {
            render({}, { query: { t: 'map' } });
            await wrapper.find('[data-testid="stockpile-edit-materials"]').trigger('click');
            expect(router.push).toHaveBeenCalledWith({ query: { t: 'map', preferences: 'stockpiles' } });
        });

        it('is not there for an anonymous user nor on an embedded map', () => {
            h.auth.isLoggedIn = false;
            render();
            expect(wrapper.find('[data-testid="stockpile-edit-materials"]').exists()).toBe(false);
            wrapper.unmount();
            h.auth.isLoggedIn = true;
            render({}, { embed: true });
            expect(wrapper.find('[data-testid="stockpile-edit-materials"]').exists()).toBe(false);
        });
    });
});
