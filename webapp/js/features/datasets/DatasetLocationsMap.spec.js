/**
 * The overview map shows a pin per dataset with a location and none for the others, opens a
 * popup for a pin, resets its view, shows the names of the datasets on demand, zooms into a
 * cluster and cleans up with the page. OpenLayers' map is replaced by a stand-in that records
 * what the component asks of it (the pins, layers and styles are real).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const olMap = vi.hoisted(() => ({ current: null }));

vi.mock('ol', async () => {
    const { default: Observable } = await vi.importActual('ol/Observable');
    class FakeView {
        constructor(options) {
            this.options = options; this.fit = vi.fn(); this.animate = vi.fn();
            // Map units per pixel: a world view until a test zooms in
            this.resolution = 10000;
            this.getResolution = () => this.resolution;
        }
    }
    class FakeMap extends Observable {
        constructor(options) {
            super();
            this.options = options;
            this.overlays = [];
            this.target = options.target;
            this.view = options.view;
            this.addOverlay = vi.fn(overlay => this.overlays.push(overlay));
            this.removeOverlay = vi.fn();
            this.setTarget = vi.fn();
            this.dispose = vi.fn();
            this.updateSize = vi.fn();
            this.getView = () => this.view;
            this.getTargetElement = () => ({ style: {} });
            this.hit = null;
            this.forEachFeatureAtPixel = vi.fn((pixel, callback, o) => {
                const layer = options.layers[1];
                return o.layerFilter(layer) ? this.hit : undefined;
            });
            olMap.current = this;
        }
        getLayers() { return { removeAt: vi.fn(), insertAt: vi.fn() }; }
    }
    return { Map: FakeMap, View: FakeView };
});
vi.mock('ol/Overlay', () => ({
    default: class FakeOverlay {
        constructor(options) { this.options = options; this.setPosition = vi.fn(); }
    }
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => router }));

const { default: DatasetLocationsMap } = await import('./DatasetLocationsMap.vue');
const { FIT_OPTIONS } = await import('@/libs/map/mapUtils');
const { bboxExtent } = await import('@/libs/map/datasetLocations');

const group = (org, datasets, orgName) => ({ org, orgName, datasets });
const ds = (slug, bbox, name) => ({ slug, name, bbox });

let wrapper;
let observed;
beforeEach(() => {
    router.push.mockClear();
    localStorage.clear();
    globalThis.ResizeObserver = class {
        constructor(callback) { this.callback = callback; observed = this; this.disconnect = vi.fn(); }
        observe() {}
    };
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

function render(props = {}) {
    wrapper = mount(DatasetLocationsMap, {
        props: { groups: [], loading: false, ...props },
        global: {
            plugins: [PrimeVue],
            stubs: { RouterLink: { props: ['to'], template: '<a class="rl" :data-to="JSON.stringify(to)"><slot /></a>' } }
        }
    });
    return wrapper;
}
const map = () => olMap.current;
const pinSource = () => map().options.layers[1].getSource().getSource();
const slugs = () => pinSource().getFeatures().map(f => f.get('slug')).sort();
/** What the pointer finds on the map: a cluster of the pins with these slugs. */
const pointAt = (...ofSlugs) => {
    const members = pinSource().getFeatures().filter(f => ofSlugs.includes(f.get('slug')));
    map().hit = { get: () => members };
};

describe('DatasetLocationsMap pins', () => {
    it('creates the map with the basemap as layer 0 and a pin for each dataset with a location', async () => {
        render({ groups: [group('acme', [ds('a', [10, 40, 12, 42], 'A'), ds('b', null, 'B'), ds('c', [0, 0, 0, 0], 'C')])] });
        await flushPromises();
        expect(map().options.layers).toHaveLength(4);
        expect(map().options.layers[0].getSource).toBeTypeOf('function'); // the basemap tiles
        expect(slugs()).toEqual(['a']);
        expect(map().options.target).toBe(wrapper.find('.dlm-map').element);
    });

    it('adds the pins of groups as they arrive and starts again from a new set', async () => {
        render({ groups: [group('a', [ds('a1', [10, 40, 12, 42])])] });
        await flushPromises();
        expect(slugs()).toEqual(['a1']);
        await wrapper.setProps({ groups: [group('a', [ds('a1', [10, 40, 12, 42])]), group('b', [ds('b1', [20, 30, 21, 31])])] });
        expect(slugs()).toEqual(['a1', 'b1']);
        await wrapper.setProps({ groups: [group('c', [ds('c1', [1, 1, 2, 2])])] });
        expect(slugs()).toEqual(['c1']);
        await wrapper.setProps({ groups: [] });
        expect(slugs()).toEqual([]);
    });

    it('fits the view to the pins while the user has not moved the map', async () => {
        render({ groups: [group('a', [ds('a1', [10, 40, 12, 42]), ds('a2', [20, 30, 21, 31])])] });
        await flushPromises();
        const [extent, options] = map().view.fit.mock.lastCall;
        expect(extent).toEqual(pinSource().getExtent());
        expect(options).toEqual({ ...FIT_OPTIONS, duration: 0 });

        map().view.fit.mockClear();
        await wrapper.setProps({ groups: [group('a', [ds('a1', [10, 40, 12, 42]), ds('a2', [20, 30, 21, 31])]), group('b', [ds('b1', [50, 50, 51, 51])])] });
        expect(map().view.fit).toHaveBeenCalledTimes(1);

        // The final fit animates once everything has arrived
        await wrapper.setProps({ loading: true });
        map().view.fit.mockClear();
        await wrapper.setProps({ loading: false });
        expect(map().view.fit.mock.lastCall[1]).toEqual(FIT_OPTIONS);
    });

    it('stops following the pins once the user touches the map', async () => {
        render({ groups: [group('a', [ds('a1', [10, 40, 12, 42])]), group('b', [ds('b1', [20, 30, 21, 31])])] });
        await flushPromises();
        await wrapper.find('.dlm-map').trigger('pointerdown');
        map().view.fit.mockClear();
        await wrapper.setProps({ groups: [group('a', [ds('a1', [10, 40, 12, 42])]), group('b', [ds('b1', [20, 30, 21, 31])]), group('c', [ds('c1', [60, 60, 61, 61])])] });
        expect(map().view.fit).not.toHaveBeenCalled();
    });

    it('zooms to a place, not to an extent, for a single pin', async () => {
        render({ groups: [group('a', [ds('a1', [10, 40, 12, 42])])] });
        await flushPromises();
        expect(map().view.fit).not.toHaveBeenCalled();
        expect(map().view.animate).toHaveBeenCalledWith(expect.objectContaining({ zoom: 13, center: pinSource().getFeatures()[0].getGeometry().getCoordinates() }));
    });
});

describe('DatasetLocationsMap without a location', () => {
    it('pins only the datasets that have one and lists none of the others', async () => {
        render({ groups: [group('acme', [ds('a', [1, 1, 2, 2], 'A'), ds('none', null, 'No place')], 'Acme')] });
        await flushPromises();
        expect(pinSource().getFeatures().map(f => f.get('slug'))).toEqual(['a']);
        expect(wrapper.text()).not.toContain('No place');
    });
});

describe('DatasetLocationsMap states', () => {
    it('says so when there is nothing to show, but not while it is still loading', async () => {
        render({ groups: [], loading: true });
        await flushPromises();
        expect(wrapper.find('.dlm-empty').exists()).toBe(false);
        expect(wrapper.find('.dlm-status').exists()).toBe(true);
        await wrapper.setProps({ loading: false });
        expect(wrapper.find('.dlm-empty').exists()).toBe(true);
        expect(wrapper.find('.dlm-status').exists()).toBe(false);
    });

    it('shows a legend of the organizations only when there are several', async () => {
        render({ groups: [group('a', [ds('a1', [1, 1, 2, 2])], 'Org A')] });
        await flushPromises();
        expect(wrapper.find('.dlm-legend').exists()).toBe(false);
        await wrapper.setProps({ groups: [group('a', [ds('a1', [1, 1, 2, 2])], 'Org A'), group('b', [ds('b1', [3, 3, 4, 4])], 'Org B')] });
        expect(wrapper.findAll('.dlm-legend li').map(li => li.text())).toEqual(['Org A', 'Org B']);
    });

    it('keeps the colours of the legend apart after the set was narrowed to one organization and widened again', async () => {
        const groups = [
            group('a', [ds('a1', [1, 1, 2, 2])], 'Org A'),
            group('b', [ds('b1', [3, 3, 4, 4])], 'Org B'),
            group('c', [ds('c1', [5, 5, 6, 6])], 'Org C')
        ];
        render({ groups: [groups[2]] });
        await flushPromises();
        await wrapper.setProps({ groups: [] });
        await wrapper.setProps({ groups });
        const swatches = wrapper.findAll('.dlm-legend .dlm-swatch').map(s => s.element.style.background);
        expect(swatches).toHaveLength(3);
        expect(new Set(swatches).size).toBe(3);
    });

    it('colours each organization the same whatever order the groups arrive in', async () => {
        const a = group('a', [ds('a1', [1, 1, 2, 2])], 'Org A');
        const b = group('b', [ds('b1', [3, 3, 4, 4])], 'Org B');
        const c = group('c', [ds('c1', [5, 5, 6, 6])], 'Org C');
        const swatchesOf = async arrivals => {
            render({ groups: [], organizations: ['c', 'a', 'b'] });
            await flushPromises();
            for (let i = 1; i <= arrivals.length; i++) await wrapper.setProps({ groups: arrivals.slice(0, i) });
            const swatches = Object.fromEntries(wrapper.findAll('.dlm-legend li').map(li =>
                [li.text(), li.find('.dlm-swatch').element.style.background]));
            wrapper.unmount();
            wrapper = null;
            return swatches;
        };
        const first = await swatchesOf([a, b, c]);
        const second = await swatchesOf([c, b, a]);
        expect(Object.keys(first)).toHaveLength(3);
        expect(second).toEqual(first);
        expect(new Set(Object.values(first)).size).toBe(3);
    });
});

describe('DatasetLocationsMap buttons', () => {
    const groups = [group('a', [ds('a1', [10, 40, 12, 42], 'One')]), group('b', [ds('b1', [20, 30, 21, 31], 'Two')])];
    const labelLayer = () => map().options.layers[3];
    const namesButton = () => wrapper.find('button[aria-label="Show the names of the datasets"]');

    it('brings back the view of every pin, closes the popup and follows the pins again', async () => {
        render({ groups });
        await flushPromises();
        pointAt('a1');
        map().dispatchEvent({ type: 'click', pixel: [1, 1] });
        await flushPromises();
        await wrapper.find('.dlm-map').trigger('pointerdown');
        map().view.fit.mockClear();

        await wrapper.find('button[aria-label="Reset view"]').trigger('click');
        expect(map().view.fit).toHaveBeenCalledWith(pinSource().getExtent(), FIT_OPTIONS);
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(false);

        map().view.fit.mockClear();
        await wrapper.setProps({ groups: [...groups, group('c', [ds('c1', [60, 60, 61, 61])])] });
        expect(map().view.fit).toHaveBeenCalledTimes(1);
    });

    it('shows the names of the datasets on demand, decluttered, and remembers the choice', async () => {
        render({ groups });
        await flushPromises();
        expect(labelLayer().getVisible()).toBe(false);
        expect(labelLayer().getDeclutter()).toBeTruthy();
        expect(labelLayer().getSource()).toBe(map().options.layers[1].getSource());
        expect(namesButton().attributes('aria-pressed')).toBe('false');

        await namesButton().trigger('click');
        expect(labelLayer().getVisible()).toBe(true);
        expect(namesButton().attributes('aria-pressed')).toBe('true');
        expect(namesButton().classes()).toContain('active');
        wrapper.unmount();

        render({ groups });
        await flushPromises();
        expect(labelLayer().getVisible()).toBe(true);
        await namesButton().trigger('click');
        expect(labelLayer().getVisible()).toBe(false);
    });
});

describe('DatasetLocationsMap interaction', () => {
    const groups = [group('acme', [ds('a', [10, 40, 12, 42], 'Dataset A'), ds('b', [30, 40, 32, 42], 'Dataset B')], 'Acme <b>Inc</b>')];

    it('opens a popup with the dataset and its organization, as text, for a single pin', async () => {
        render({ groups: [group('acme', [ds('a', [10, 40, 12, 42], '<img src=x onerror=alert(1)>')], 'Acme <b>Inc</b>')] });
        await flushPromises();
        pointAt('a');
        map().dispatchEvent({ type: 'click', pixel: [5, 5] });
        await flushPromises();
        const popup = wrapper.find('.dlm-popup');
        expect(popup.find('.dlm-popup-name').text()).toBe('<img src=x onerror=alert(1)>');
        expect(popup.find('.dlm-popup-org').text()).toBe('Acme <b>Inc</b>');
        expect(popup.find('img').exists()).toBe(false);
        expect(map().overlays[0].setPosition).toHaveBeenCalledWith(pinSource().getFeatures()[0].getGeometry().getCoordinates());
    });

    it('opens the dataset from the popup', async () => {
        render({ groups });
        await flushPromises();
        pointAt('b');
        map().dispatchEvent({ type: 'click', pixel: [5, 5] });
        await flushPromises();
        await wrapper.find('.dlm-popup button.p-button').trigger('click');
        expect(router.push).toHaveBeenCalledWith({ name: 'ViewDataset', params: { org: 'acme', ds: 'b' } });
    });

    it('closes the popup on a click elsewhere on the map and on Escape', async () => {
        render({ groups });
        await flushPromises();
        pointAt('a');
        map().dispatchEvent({ type: 'click', pixel: [1, 1] });
        await flushPromises();
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(true);
        map().hit = null;
        map().dispatchEvent({ type: 'click', pixel: [2, 2] });
        await flushPromises();
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(false);
        expect(map().overlays[0].setPosition).toHaveBeenLastCalledWith(undefined);

        pointAt('a');
        map().dispatchEvent({ type: 'click', pixel: [1, 1] });
        await flushPromises();
        await wrapper.find('.dlm-popup-close').trigger('keydown', { key: 'Escape' });
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(false);
    });

    it('zooms into a cluster of pins that zooming can separate', async () => {
        render({ groups });
        await flushPromises();
        map().view.fit.mockClear();
        pointAt('a', 'b');
        map().dispatchEvent({ type: 'click', pixel: [5, 5] });
        await flushPromises();
        expect(map().view.fit).toHaveBeenCalledTimes(1);
        const [extent, options] = map().view.fit.mock.lastCall;
        expect(extent).toEqual(pinSource().getExtent());
        expect(options).toBe(FIT_OPTIONS);
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(false);
    });

    it('lists the datasets of a cluster that zooming cannot separate', async () => {
        render({ groups: [group('acme', [ds('a', [10, 40, 10.00001, 40.00001], 'Dataset A'), ds('b', [10, 40, 10.00001, 40.00001], 'Dataset B')])] });
        await flushPromises();
        map().view.fit.mockClear();
        pointAt('a', 'b');
        map().dispatchEvent({ type: 'click', pixel: [5, 5] });
        await flushPromises();
        expect(map().view.fit).not.toHaveBeenCalled();
        expect(wrapper.findAll('.dlm-popup-name').map(n => n.text())).toEqual(['Dataset A', 'Dataset B']);
    });

    // Two pins on the equator, `metres` apart in Web Mercator units
    const pinsApart = metres => {
        const lon = 10 + metres / 111319.49079327357;
        return [group('acme', [ds('a', [10, 0, 10, 0], 'Dataset A'), ds('b', [lon, 0, lon, 0], 'Dataset B')])];
    };
    const clickCluster = async () => {
        map().view.fit.mockClear();
        pointAt('a', 'b');
        map().dispatchEvent({ type: 'click', pixel: [5, 5] });
        await flushPromises();
    };

    it('lists the datasets of a cluster wider than its distance at the closest zoom, which the fit cannot split', async () => {
        // A cluster gathers pins up to twice its distance (40 px) apart: 30 m is 60 px at 0.5 m per pixel
        render({ groups: pinsApart(30) });
        await flushPromises();
        await clickCluster();
        expect(map().view.fit).not.toHaveBeenCalled();
        expect(wrapper.findAll('.dlm-popup-name').map(n => n.text())).toEqual(['Dataset A', 'Dataset B']);
    });

    it('lists the datasets of any cluster once the view is at the closest zoom', async () => {
        render({ groups: pinsApart(100) });
        await flushPromises();
        await clickCluster();
        expect(map().view.fit).toHaveBeenCalledTimes(1);
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(false);

        map().view.resolution = FIT_OPTIONS.minResolution;
        await clickCluster();
        expect(map().view.fit).not.toHaveBeenCalled();
        expect(wrapper.findAll('.dlm-popup-name').map(n => n.text())).toEqual(['Dataset A', 'Dataset B']);
    });

    it('draws the box of the dataset under the pointer, and takes it away', async () => {
        render({ groups });
        await flushPromises();
        const boxes = () => map().options.layers[2].getSource().getFeatures();
        pointAt('a');
        map().dispatchEvent({ type: 'pointermove', pixel: [5, 5], dragging: false });
        await flushPromises();
        expect(boxes()).toHaveLength(1);
        expect(boxes()[0].getGeometry().getExtent()).toEqual(bboxExtent([10, 40, 12, 42]));
        map().hit = null;
        map().dispatchEvent({ type: 'pointermove', pixel: [50, 50], dragging: false });
        await flushPromises();
        expect(boxes()).toHaveLength(0);
    });

    it('keeps the box of the open popup, and draws none for a cluster', async () => {
        render({ groups });
        await flushPromises();
        const boxes = () => map().options.layers[2].getSource().getFeatures();
        pointAt('b');
        map().dispatchEvent({ type: 'click', pixel: [5, 5] });
        await flushPromises();
        map().hit = null;
        map().dispatchEvent({ type: 'pointermove', pixel: [50, 50], dragging: false });
        await flushPromises();
        expect(boxes()[0].getGeometry().getExtent()).toEqual(bboxExtent([30, 40, 32, 42]));
        pointAt('a', 'b');
        map().dispatchEvent({ type: 'pointermove', pixel: [5, 5], dragging: false });
        await flushPromises();
        expect(boxes()).toHaveLength(1);
    });

    it('keeps the popup open while more groups arrive, if its dataset is still there', async () => {
        render({ groups });
        await flushPromises();
        pointAt('a');
        map().dispatchEvent({ type: 'click', pixel: [5, 5] });
        await flushPromises();
        await wrapper.setProps({ groups: [...groups, group('other', [ds('o', [50, 50, 51, 51])])] });
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(true);
        await wrapper.setProps({ groups: [group('other', [ds('o', [50, 50, 51, 51])])] });
        expect(wrapper.find('.dlm-popup-name').exists()).toBe(false);
    });
});

describe('DatasetLocationsMap cleanup', () => {
    it('removes the overlay and the observer and disposes the map when it goes away', async () => {
        render({ groups: [group('a', [ds('a1', [1, 1, 2, 2])])] });
        await flushPromises();
        const created = map();
        wrapper.unmount();
        wrapper = null;
        expect(observed.disconnect).toHaveBeenCalled();
        expect(created.removeOverlay).toHaveBeenCalledWith(created.overlays[0]);
        expect(created.setTarget).toHaveBeenCalledWith(null);
        expect(created.dispose).toHaveBeenCalled();
        // Its listeners are gone: a click on the disposed map does nothing
        created.hit = null;
        expect(() => created.dispatchEvent({ type: 'click', pixel: [1, 1] })).not.toThrow();
        expect(created.forEachFeatureAtPixel).not.toHaveBeenCalled();
    });
});
