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
const { EMPTY_CELL } = await import('@/libs/format');

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

describe('StockpileVolumePanel icon (FR-MAP-24)', () => {
    it('has a heap in front of its title, not the stacked layers nor a mountain', () => {
        render();
        const icon = wrapper.find('.panel-title i');
        expect(icon.classes()).toEqual(['ddb-icon', 'ddb-icon-stockpile']);
    });
});

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

// FR-MAP-27: a custom material with a density the catalog refuses says so at the field, and the rows stay with the reason
describe('StockpileVolumePanel custom density', () => {
    const density = () => wrapper.find('[data-testid="stockpile-custom-density"]');
    const error = () => wrapper.find('[data-testid="stockpile-density-error"]');

    it('shows no error for a density the catalog accepts', () => {
        render({ material: '__custom__', customDensity: 1.5 });
        expect(error().exists()).toBe(false);
        expect(density().attributes('aria-invalid')).toBeUndefined();
    });

    it.each([0, -3])('says "Density must be greater than 0" at the field for %d, marked invalid', value => {
        render({ material: '__custom__', customDensity: value });
        expect(error().text()).toBe('Density must be greater than 0');
        expect(density().attributes('aria-invalid')).toBe('true');
        expect(density().attributes('aria-describedby')).toBe('stockpile-volume-panel-density-error');
    });

    it('reads the typed value in the user unit: 0 and a negative number emit a stored density of 0 or less, which the panel refuses', async () => {
        render({ material: '__custom__', customDensity: 1.5 });
        await density().setValue('-3');
        expect(wrapper.emitted('update:customDensity').at(-1)[0]).toBeLessThan(0);
        await wrapper.setProps({ customDensity: wrapper.emitted('update:customDensity').at(-1)[0] });
        expect(error().text()).toBe('Density must be greater than 0');
    });

    it('says the upper limit in the unit of the user for a density above it', () => {
        render({ material: '__custom__', customDensity: 31 });
        expect(error().text()).toBe('Density must be at most 30 t/m³');
        wrapper.unmount();
        render({ material: '__custom__', customDensity: 31, unitPref: 'imperial' });
        // 30 t/m³ in short tons per cubic yard: 30 x 0.8428 ... the limit the user reads, in their unit
        expect(error().text()).toMatch(/^Density must be at most [\d.,]+ ST\/yd³$/);
        expect(error().text()).not.toContain('t/m³');
    });

    it('keeps the Weight and Est. cost rows with the reason when the custom density is refused', () => {
        render({ material: '__custom__', customDensity: 0, result: { ...RESULT, weightEstimate: undefined, costEstimate: undefined } });
        expect(text('stockpile-weight-error')).toBe('Density must be greater than 0');
        expect(text('stockpile-cost-error')).toBe('Density must be greater than 0');
        expect(wrapper.find('[data-testid="stockpile-weight"]').exists()).toBe(false);
    });

    it('does not say it for another material, nor when the pile has its weight', () => {
        render({ material: 'gravel', customDensity: 0, result: { ...RESULT, weightEstimate: undefined, costEstimate: undefined } });
        expect(error().exists()).toBe(false);
        expect(wrapper.find('[data-testid="stockpile-weight-error"]').exists()).toBe(false);
        wrapper.unmount();
        render({ material: '__custom__', customDensity: 1.5, result: RESULT });
        expect(wrapper.find('[data-testid="stockpile-weight-error"]').exists()).toBe(false);
        expect(text('stockpile-weight')).toBe('150 t');
    });
});

// FR-MAP-25: "Find all piles" and the list of what it found
describe('StockpileVolumePanel Find all piles', () => {
    // Each pile of the list: the detection, with its measured volume (`measured`) and the state of that measuring
    const PILES = [
        { id: 0, areaM2: 1234.5, estimatedVolume: 999, confidence: 0.912, measured: { netVolume: 8097.19 }, measureState: 'done' },
        { id: 3, areaM2: 40, estimatedVolume: 999, confidence: 0.5, measured: { netVolume: 12.4 }, measureState: 'done' }
    ];
    const button = () => wrapper.find('[data-testid="stockpile-find-all-btn"]');
    const rows = () => wrapper.findAll('[data-testid="stockpile-pile"]');
    const rowOf = id => wrapper.find(`[data-pile-id="${id}"]`);

    it('has the action, which asks for the search', async () => {
        render();
        expect(button().text()).toBe('Find all piles');
        await button().trigger('click');
        expect(wrapper.emitted('findAll')).toHaveLength(1);
    });

    it('is busy while the search runs', () => {
        render({ pilesLoading: true });
        expect(button().text()).toBe('Finding piles…');
        expect(button().attributes('disabled')).toBeDefined();
    });

    it('lists the area, the measured volume and the confidence of each pile, in the units of the panel, and not the estimate of the detection', () => {
        render({ piles: PILES, unitPref: 'metric' });
        expect(wrapper.find('[data-testid="stockpile-piles"]').text()).toContain('Piles found (2)');
        const cells = rows().map(r => r.findAll('span').map(s => s.text()));
        expect(cells[0]).toEqual(['1', '1,234.5 m²', '8,097.19 m³', '91%']);
        expect(cells[1]).toEqual(['2', '40 m²', '12.4 m³', '50%']);
        expect(wrapper.find('.pile-head').text()).toContain('Volume');
        expect(wrapper.find('.pile-head').text()).not.toContain('est');
        expect(wrapper.find('[data-testid="stockpile-piles"]').text()).not.toContain('999');
    });

    it('gives a measured pile the 2D area its volume was measured with (the area of the Result), and the found area until then', () => {
        render({
            piles: [
                { ...PILES[0], measured: { netVolume: 44.14, area2d: 25.68 } },
                { ...PILES[1], measured: null, measureState: 'measuring' }
            ],
            unitPref: 'metric'
        });
        const cells = rows().map(r => r.findAll('span').map(s => s.text()));
        expect(cells[0][1]).toBe('25.68 m²');
        expect(cells[1][1]).toBe('40 m²');
    });

    it('says the base the volumes are above', () => {
        render({ piles: PILES, pilesBase: 'best_fit' });
        expect(text('stockpile-piles-base')).toBe('Volumes above the best-fit plane');
        wrapper.unmount();
        render({ piles: PILES, pilesBase: 'lowest_perimeter' });
        expect(text('stockpile-piles-base')).toBe('Volumes above the lowest perimeter');
    });

    it('shows a spinner in place of the volume of a pile that is being measured, and a dash for one that failed', () => {
        render({
            piles: [
                { id: 0, areaM2: 10, confidence: 0.5, measured: null, measureState: 'pending' },
                { id: 1, areaM2: 10, confidence: 0.5, measured: null, measureState: 'measuring' },
                { id: 2, areaM2: 10, confidence: 0.5, measured: null, measureState: 'failed' }
            ]
        });
        const spinners = wrapper.findAll('[data-testid="stockpile-pile-spinner"]');
        expect(spinners).toHaveLength(2);
        expect(rowOf(0).find('[data-testid="stockpile-pile-spinner"]').exists()).toBe(true);
        expect(rowOf(2).find('[data-testid="stockpile-pile-spinner"]').exists()).toBe(false);
        expect(rowOf(2).find('[data-testid="stockpile-pile-volume"]').text()).toBe(EMPTY_CELL);
    });

    it('says "Largest 50 piles" for a list as long as the search asks for (there may be more), and the count below it', () => {
        const many = n => Array.from({ length: n }, (_, i) => ({ id: i, areaM2: 100 - i, confidence: 0.5, measured: { netVolume: 10 }, measureState: 'done' }));
        render({ piles: many(50) });
        expect(wrapper.find('[data-testid="stockpile-piles"] .section-label').text()).toBe('Largest 50 piles');
        wrapper.unmount();
        render({ piles: many(49) });
        expect(wrapper.find('[data-testid="stockpile-piles"] .section-label').text()).toBe('Piles found (49)');
    });

    it('lists them in yd³ and imperial areas for an imperial map', () => {
        render({ piles: [PILES[0]], unitPref: 'imperial' });
        const cells = rows()[0].findAll('span').map(s => s.text());
        // 8097.19 m³ is 10,590.72 yd³ and 1234.5 m² is 13,288.05 ft² (FR-XC-08)
        expect(cells[2]).toBe('10,590.72 yd³');
        expect(cells[1]).toBe('13,288.05 ft²');
    });

    it('chooses the pile of a row that is clicked, and marks the chosen one', async () => {
        render({ piles: PILES, chosenPile: 3 });
        await rows()[0].trigger('click');
        expect(wrapper.emitted('pickPile')).toEqual([[PILES[0]]]);
        expect(rows()[1].attributes('aria-pressed')).toBe('true');
        expect(rowOf(3).classes()).toContain('chosen');
        expect(rows()[0].attributes('aria-pressed')).toBe('false');
    });

    it('tells which row the pointer is on, and that it left', async () => {
        render({ piles: PILES });
        await rows()[1].trigger('mouseenter');
        await rows()[1].trigger('mouseleave');
        expect(wrapper.emitted('hoverPile')).toEqual([[PILES[1]], [null]]);
    });

    it('does the same for the keyboard: the row focused is the one emphasised on the map', async () => {
        render({ piles: PILES });
        await rows()[0].trigger('focus');
        await rows()[0].trigger('blur');
        expect(wrapper.emitted('hoverPile')).toEqual([[PILES[0]], [null]]);
    });

    it('brings the chosen row into view when the chosen pile changes (a click on the map)', async () => {
        render({ piles: PILES });
        const scroll = vi.fn();
        wrapper.find('[data-pile-id="3"]').element.scrollIntoView = scroll;
        await wrapper.setProps({ chosenPile: 3 });
        await wrapper.vm.$nextTick();
        expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('says when there is no pile, and when the search failed', () => {
        render({ piles: [] });
        expect(wrapper.find('[data-testid="stockpile-piles-empty"]').text()).toContain('No piles found');
        wrapper.unmount();
        render({ pilesError: 'Could not find the piles of this raster.' });
        expect(wrapper.find('[data-testid="stockpile-piles-error"]').text()).toContain('Could not find the piles');
        expect(wrapper.find('[data-testid="stockpile-piles"]').exists()).toBe(false);
    });

    it('shows no list before a search', () => {
        render();
        expect(wrapper.find('[data-testid="stockpile-piles"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="stockpile-piles-empty"]').exists()).toBe(false);
    });

    describe('adding piles', () => {
        const checks = () => wrapper.findAll('[data-testid="stockpile-pile-check"]');
        const addSelected = () => wrapper.find('[data-testid="stockpile-add-selected"]');
        const addAll = () => wrapper.find('[data-testid="stockpile-add-all"]');

        it('has a check box for each pile, Add selected with how many, and Add all', async () => {
            render({ piles: PILES });
            expect(checks()).toHaveLength(2);
            expect(addSelected().text()).toBe('Add selected (0)');
            expect(addSelected().attributes('disabled')).toBeDefined();
            expect(addAll().attributes('disabled')).toBeUndefined();

            await checks()[1].setValue(true);
            expect(addSelected().text()).toBe('Add selected (1)');
            await addSelected().trigger('click');
            expect(wrapper.emitted('addPiles')).toEqual([[[PILES[1]]]]);
            // The ticks go once they are added
            expect(addSelected().text()).toBe('Add selected (0)');
        });

        it('Add all gives every pile that can be added', async () => {
            render({ piles: PILES });
            await addAll().trigger('click');
            expect(wrapper.emitted('addPiles')).toEqual([[PILES]]);
        });

        it('has Add for each row, which gives that pile only', async () => {
            render({ piles: PILES });
            const adds = wrapper.findAll('[data-testid="stockpile-pile-add"]');
            expect(adds).toHaveLength(2);
            await adds[0].trigger('click');
            expect(wrapper.emitted('addPiles')).toEqual([[[PILES[0]]]]);
        });

        it('shows a check mark in place of Add for a pile that is added, which cannot be ticked nor added again', async () => {
            render({ piles: PILES, addedPiles: { 3: 'feature-id' } });
            expect(rowOf(3).find('[data-testid="stockpile-pile-added"]').exists()).toBe(true);
            expect(rowOf(3).find('[data-testid="stockpile-pile-add"]').exists()).toBe(false);
            expect(rowOf(0).find('[data-testid="stockpile-pile-added"]').exists()).toBe(false);
            expect(checks()[1].attributes('disabled')).toBeDefined();

            await addAll().trigger('click');
            expect(wrapper.emitted('addPiles')).toEqual([[[PILES[0]]]]);
        });

        it('cannot add a pile that has no volume yet, nor one that failed', async () => {
            const waiting = [
                { id: 0, areaM2: 10, confidence: 0.5, measured: null, measureState: 'measuring' },
                { id: 1, areaM2: 10, confidence: 0.5, measured: null, measureState: 'failed' }
            ];
            render({ piles: waiting });
            expect(checks().every(c => c.attributes('disabled') !== undefined)).toBe(true);
            expect(wrapper.findAll('[data-testid="stockpile-pile-add"]').every(b => b.attributes('disabled') !== undefined)).toBe(true);
            expect(addAll().attributes('disabled')).toBeDefined();
        });

        it('forgets the ticks when the list is replaced', async () => {
            render({ piles: PILES });
            await checks()[0].setValue(true);
            await wrapper.setProps({ piles: [...PILES] });
            expect(addSelected().text()).toBe('Add selected (0)');
        });
    });
});

describe('StockpileVolumePanel Search Radius', () => {
    it('says that it is used by Click map', () => {
        render();
        expect(text('stockpile-radius-hint')).toBe('Used by Click map');
        expect(wrapper.find('[data-testid="stockpile-radius"]').attributes('aria-describedby')).toBe('stockpile-volume-panel-search-radius-hint');
        expect(wrapper.find('#stockpile-volume-panel-search-radius-hint').exists()).toBe(true);
    });
});

describe('StockpileVolumePanel flat elevation', () => {
    const input = () => wrapper.find('[data-testid="stockpile-flat-elevation"]');

    it('is asked for with the flat base only', () => {
        render({ baseMethod: 'best_fit' });
        expect(input().exists()).toBe(false);
        wrapper.unmount();
        render({ baseMethod: 'flat', flatElevation: 12.5 });
        expect(input().element.value).toBe('12.5');
        expect(wrapper.find('.flat-elevation').text()).toContain('Flat elevation (m)');
    });

    it('gives back what was typed once it is entered, in metres', async () => {
        render({ baseMethod: 'flat', flatElevation: 0 });
        await input().setValue('15');
        expect(wrapper.emitted('update:flatElevation')).toEqual([[15]]);
    });

    it('is shown and typed in feet for imperial units, and given back in metres', async () => {
        render({ baseMethod: 'flat', flatElevation: 10, unitPref: 'imperial' });
        expect(Number(input().element.value)).toBeCloseTo(32.808, 3);
        expect(wrapper.find('.flat-elevation').text()).toContain('(ft)');
        await input().setValue('100');
        expect(wrapper.emitted('update:flatElevation')[0][0]).toBeCloseTo(30.48, 3);
    });

    it('is not given back for something that is not a number', async () => {
        render({ baseMethod: 'flat', flatElevation: 3 });
        await input().setValue('');
        expect(wrapper.emitted('update:flatElevation')).toBeUndefined();
    });
});

describe('StockpileVolumePanel chosen pile', () => {
    it('names the pile the Result is of, and where it was measured when that is another elevation model', () => {
        render({ result: RESULT, pileName: 'North pile', measuredOn: 'site/odm_dem/dtm.tif' });
        expect(text('stockpile-pile-name')).toBe('North pile');
        expect(text('stockpile-measured-on')).toBe('Measured on dtm.tif');
    });

    it('says nothing of a model when the pile was measured on the selected one, and names no pile that is not chosen', () => {
        render({ result: RESULT });
        expect(wrapper.find('[data-testid="stockpile-pile-name"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="stockpile-measured-on"]').exists()).toBe(false);
    });
});

// FR-RAS-23: the action grid is the footer of the panel
describe('StockpileVolumePanel footer', () => {
    it('has Click map, Draw and Clear in the footer, not in the body that scrolls', () => {
        render();
        const footer = wrapper.get('[data-testid="panel-actions"]');
        expect(footer.findAll('button').map(b => b.text())).toEqual(['Click map', 'Draw', 'Clear']);
        expect(wrapper.get('.panel-body').find('[data-testid="stockpile-click-btn"]').exists()).toBe(false);
    });

    describe('Edit outline', () => {
        const edit = () => wrapper.find('[data-testid="stockpile-edit-outline-btn"]');

        it('is in the footer when the chosen pile is on the map, and asks for the edit', async () => {
            render({ result: RESULT, canEditOutline: true });
            expect(wrapper.get('[data-testid="panel-actions"]').findAll('button').map(b => b.text())).toEqual(['Click map', 'Draw', 'Clear', 'Edit outline']);
            await edit().trigger('click');
            expect(wrapper.emitted('editOutline')).toHaveLength(1);
            expect(edit().attributes('aria-pressed')).toBe('false');
        });

        it('is not there for a pile that is not on the map', () => {
            render({ result: RESULT, canEditOutline: false });
            expect(edit().exists()).toBe(false);
        });

        it('is pressed while the outline is edited, and says how to leave', () => {
            render({ result: RESULT, canEditOutline: true, editing: true });
            expect(edit().attributes('aria-pressed')).toBe('true');
            expect(edit().classes()).toContain('active');
            expect(edit().text()).toBe('Done editing');
        });
    });

    it('keeps the label "Elevation model" on its selector', () => {
        render({ targetCandidates: [{ path: 'a/dsm.tif', label: 'dsm.tif' }, { path: 'a/dtm.tif', label: 'dtm.tif' }], targetPath: 'a/dsm.tif' });
        expect(wrapper.find('.analysis-target label').text()).toBe('Elevation model');
    });
});

