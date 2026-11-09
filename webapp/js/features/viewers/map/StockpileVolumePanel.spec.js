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
const { replaceQueryKeys, replaceHash } = await import('@/libs/routeQuery');

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
// As libs/format.js writes numbers: in the browser's locale (navigator.language)
const num = (n, digits = 2) => n.toLocaleString(navigator.language, { maximumFractionDigits: digits });

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
        it('opens the Preferences on the stockpile materials, keeping the query and the hash of the address', async () => {
            window.history.replaceState({}, '', '/r/o/d/view/abc/map?t=map');
            // The map adds its layers and Plant Health its hash without a navigation: the route
            // keeps the query the page opened with
            replaceQueryKeys({ layer: ['a', 'b'] });
            replaceHash('path=f.tif');
            render({}, { query: { t: 'map' } });
            await wrapper.find('[data-testid="stockpile-edit-materials"]').trigger('click');
            expect(router.push).toHaveBeenCalledWith({
                query: { t: 'map', layer: ['a', 'b'], preferences: 'stockpiles' },
                hash: '#path=f.tif'
            });
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

describe('StockpileVolumePanel elevation model', () => {
    const CANDIDATES = [{ path: 'odm_dem/dtm.tif', label: 'dtm.tif' }, { path: 'odm_dem/dsm.tif', label: 'dsm.tif' }];
    const select = () => wrapper.find('[data-testid="analysis-target-select"]');

    it('shows the selector with two rasters to measure on, and the current one', () => {
        render({ targetCandidates: CANDIDATES, targetPath: 'odm_dem/dsm.tif' });
        expect(wrapper.text()).toContain('Elevation model');
        expect(select().findAll('option').map(o => o.text())).toEqual(['dtm.tif', 'dsm.tif']);
        expect(select().element.value).toBe('odm_dem/dsm.tif');
    });

    it('shows none with one raster', () => {
        render({ targetCandidates: [CANDIDATES[0]], targetPath: CANDIDATES[0].path });
        expect(select().exists()).toBe(false);
    });

    it('asks for the raster that was picked', async () => {
        render({ targetCandidates: CANDIDATES, targetPath: 'odm_dem/dsm.tif' });
        await select().setValue('odm_dem/dtm.tif');
        expect(wrapper.emitted('selectTarget')).toEqual([['odm_dem/dtm.tif']]);
    });
});

// FR-MAP-06: the buttons show the tool the map is in; at rest none looks selected
describe('StockpileVolumePanel Click map and Draw state', () => {
    const click = () => wrapper.find('[data-testid="stockpile-click-btn"]');
    const draw = () => wrapper.find('[data-testid="stockpile-draw-btn"]');

    it('with no mode, no action button has the primary or the active class, and none is pressed', () => {
        render({ mode: null });
        [click(), draw()].forEach(btn => {
            expect(btn.classes()).not.toContain('panel-btn--primary');
            expect(btn.classes()).not.toContain('active');
            expect(btn.classes()).not.toContain('is-active');
            expect(btn.attributes('aria-pressed')).toBe('false');
        });
        expect(wrapper.find('[data-testid="stockpile-click-banner"]').exists()).toBe(false);
    });

    it('in click mode the Click map button is pressed and active, Draw is not, and the banner says how to cancel', () => {
        render({ mode: 'click' });
        expect(click().attributes('aria-pressed')).toBe('true');
        expect(click().classes()).toContain('active');
        expect(click().classes()).toContain('is-active');
        expect(draw().attributes('aria-pressed')).toBe('false');
        expect(draw().classes()).not.toContain('active');
        expect(wrapper.find('[data-testid="stockpile-click-banner"]').text()).toContain('Esc cancels');
    });

    it('in draw mode the Draw button is pressed and active, and the banner says how to finish and cancel', () => {
        render({ mode: 'draw' });
        expect(draw().attributes('aria-pressed')).toBe('true');
        expect(draw().classes()).toContain('active');
        expect(click().attributes('aria-pressed')).toBe('false');
        const hint = wrapper.find('[data-testid="stockpile-draw-banner"]').text();
        expect(hint).toContain('Double-click, right-click or Enter finishes');
        expect(hint).toContain('Esc cancels');
    });
});

describe('StockpileVolumePanel on a map narrower than sm (FR-MAP-16)', () => {
    const scrolled = vi.fn();
    beforeEach(() => { Element.prototype.scrollIntoView = scrolled; scrolled.mockClear(); });
    afterEach(() => { delete Element.prototype.scrollIntoView; });

    const renderOn = (mapSize, props = {}) => {
        wrapper = mount(StockpileVolumePanel, {
            props: { visible: true, materials: catalog({}), ...props },
            global: { provide: { embed: false, mapSize }, mocks: { $router: { push: vi.fn() }, $route: { query: {} } }, stubs: { StockpileBaseMethodsDialog: true } }
        });
        return wrapper;
    };
    const settings = () => wrapper.find('[data-testid="stockpile-settings"]');
    const toggle = () => wrapper.find('[data-testid="stockpile-settings-toggle"]');
    const hidden = () => settings().attributes('style')?.includes('display: none');
    const scrolledTo = testId => scrolled.mock.contexts.some(el => el.getAttribute('data-testid') === testId);

    it('shows the settings and no toggle before any mode: the user sets them first', () => {
        renderOn({ narrow: true });
        expect(toggle().exists()).toBe(false);
        expect(hidden()).toBeFalsy();
    });

    it('folds the settings behind a Settings button when a mode is active, so the banner is in view', () => {
        renderOn({ narrow: true }, { mode: 'click' });
        expect(toggle().text()).toBe('Settings');
        expect(toggle().attributes('aria-expanded')).toBe('false');
        expect(hidden()).toBe(true);
        expect(wrapper.find('[data-testid="stockpile-click-banner"]').exists()).toBe(true);
        // What is behind the button is the four settings, and not the banner or the buttons of the modes
        expect(settings().find('[data-testid="stockpile-base-method"]').exists()).toBe(true);
        expect(settings().find('[data-testid="stockpile-sensitivity"]').exists()).toBe(true);
        expect(settings().find('[data-testid="stockpile-radius"]').exists()).toBe(true);
        expect(settings().find('[data-testid="stockpile-material"]').exists()).toBe(true);
        expect(settings().find('[data-testid="stockpile-click-btn"]').exists()).toBe(false);
        expect(settings().find('[data-testid="stockpile-click-banner"]').exists()).toBe(false);
    });

    it('opens and folds the settings from the button', async () => {
        renderOn({ narrow: true }, { mode: 'draw' });
        await toggle().trigger('click');
        expect(hidden()).toBeFalsy();
        expect(toggle().attributes('aria-expanded')).toBe('true');
        await toggle().trigger('click');
        expect(hidden()).toBe(true);
    });

    it('folds them while a result shows, too, so the result is in view', () => {
        renderOn({ narrow: true }, { result: RESULT });
        expect(hidden()).toBe(true);
    });

    it('never folds the settings on a map that is not narrow', () => {
        renderOn({ narrow: false }, { mode: 'click', result: RESULT });
        expect(toggle().exists()).toBe(false);
        expect(hidden()).toBeFalsy();
    });

    it('starts a new mode with the settings folded again', async () => {
        renderOn({ narrow: true }, { mode: 'click' });
        await toggle().trigger('click');
        await wrapper.setProps({ mode: null });
        await wrapper.setProps({ mode: 'draw' });
        expect(hidden()).toBe(true);
    });

    it('scrolls the prompt of the mode into view when the mode starts', async () => {
        renderOn({ narrow: true });
        await wrapper.setProps({ mode: 'click' });
        await wrapper.vm.$nextTick();
        expect(scrolledTo('stockpile-click-banner')).toBe(true);
        expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('scrolls the result into view when it arrives', async () => {
        renderOn({ narrow: true }, { mode: 'click' });
        scrolled.mockClear();
        await wrapper.setProps({ result: RESULT });
        await wrapper.vm.$nextTick();
        expect(scrolledTo('stockpile-result')).toBe(true);
    });

    it('does not fail where the browser cannot scroll an element into view', async () => {
        delete Element.prototype.scrollIntoView;
        renderOn({ narrow: true });
        await wrapper.setProps({ mode: 'click' });
        await wrapper.vm.$nextTick();
        expect(wrapper.find('[data-testid="stockpile-click-banner"]').exists()).toBe(true);
    });
});
