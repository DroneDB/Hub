/**
 * The dataset page's Map tab shows the chip for a folder with no geo entries whose subfolder has them, and its Show
 * hands the subfolder to the page (FR-MAP-10).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import ddb from 'ddb';

const MapCoreStub = defineComponent({ name: 'MapCore', props: { files: { type: Array, default: () => [] }, dataset: { type: Object, default: null }, canWrite: Boolean, canDelete: Boolean, deferLoad: Boolean }, setup: (props, { slots }) => () => h('div', { id: 'map' }, [h('div', { class: 'map-container' }, slots.overlay?.())]) });
vi.mock('./MapCore.vue', () => ({ default: MapCoreStub }));

const { default: DatasetMap } = await import('./DatasetMap.vue');

const T = ddb.entry.type;
const photo = path => ({ path, type: T.GEOIMAGE, point_geom: { type: 'Point', coordinates: [10, 45] } });
let wrapper;
const mountMap = (props, search) => {
    wrapper = mount(DatasetMap, { props: { dataset: { search }, currentPath: null, loading: false, active: true, ...props } });
    return wrapper;
};
afterEach(() => wrapper?.unmount());

describe('DatasetMap geo subfolder hint (FR-MAP-10)', () => {
    it('shows "Photos are in images/ - Show" at a root that has only the folder, and Show gives the subfolder', async () => {
        const search = vi.fn(async () => Array.from({ length: 18 }, (_, i) => photo(`images/p${i}.jpg`)));
        mountMap({ files: [{ entry: { path: 'images', type: T.DIRECTORY } }] }, search);
        await flushPromises();

        const chip = wrapper.find('[data-testid="geo-subfolder-chip"]');
        expect(chip.text()).toContain('Photos are in images/');
        // In the map (MapCore's overlay slot), where the reserves of its controls are defined
        expect(chip.element.parentElement.classList.contains('map-container')).toBe(true);
        await wrapper.find('[data-testid="geo-subfolder-show"]').trigger('click');

        expect(wrapper.emitted('showFolder')).toEqual([['images']]);
        expect(search).toHaveBeenCalledTimes(1);
    });

    it('shows no chip at a folder that has geo entries of its own', async () => {
        const search = vi.fn(async () => []);
        mountMap({ files: [{ entry: photo('a.jpg') }, { entry: { path: 'images', type: T.DIRECTORY } }] }, search);
        await flushPromises();

        expect(wrapper.find('[data-testid="geo-subfolder-chip"]').exists()).toBe(false);
        expect(search).not.toHaveBeenCalled();
    });

    it('searches nothing while the tab is hidden (the page keeps the map mounted), and looks when it shows', async () => {
        const search = vi.fn(async () => [photo('images/p.jpg')]);
        mountMap({ files: [{ entry: { path: 'images', type: T.DIRECTORY } }], active: false }, search);
        await flushPromises();
        expect(search).not.toHaveBeenCalled();
        expect(wrapper.find('[data-testid="geo-subfolder-chip"]').exists()).toBe(false);

        await wrapper.setProps({ active: true });
        await flushPromises();
        expect(search).toHaveBeenCalledTimes(1);
        expect(wrapper.find('[data-testid="geo-subfolder-chip"]').exists()).toBe(true);
    });

    it('is hidden by default: a map mounted without `active` searches nothing', async () => {
        const search = vi.fn(async () => [photo('images/p.jpg')]);
        wrapper = mount(DatasetMap, { props: { dataset: { search }, files: [{ entry: { path: 'images', type: T.DIRECTORY } }] } });
        await flushPromises();
        expect(search).not.toHaveBeenCalled();
    });
});
