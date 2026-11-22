/**
 * The blocks that draw a figure: the map snapshot, the profile chart and the 3D capture show the image the renderer gave
 * with the alternative text of the model, say the notes under it, draw only when they come into view, and say what failed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

vi.mock('@/libs/reports/snapshots', async importOriginal => ({
    ...(await importOriginal()),
    renderMapSnapshot: vi.fn(),
    renderProfileChart: vi.fn()
}));

import { renderMapSnapshot, renderProfileChart } from '@/libs/reports/snapshots';
import MapSnapshotBlock from './MapSnapshotBlock.vue';
import ChartBlock from './ChartBlock.vue';
import Capture3dBlock from './Capture3dBlock.vue';
import { provideReportContext } from '../reportContext';

const dataset = { downloadUrl: (path, o) => `/dl/${path}${o?.inline ? '?inline=1' : ''}` };

/** An observer that reports the element in view when `show()` is called. */
let observers;
class FakeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
    show() { this.callback([{ isIntersecting: true }]); }
}

function mountBlock(component, block) {
    const Host = {
        components: { Block: component },
        props: ['block'],
        setup() { provideReportContext({ dataset, photoEntries: { value: null } }); },
        template: '<Block :block="block" />'
    };
    return mount(Host, { props: { block }, global: { plugins: [PrimeVue] } });
}

const mapBlock = (extra = {}) => ({ type: 'mapSnapshot', kind: 'item', itemId: 'a', ref: '1', items: [], layers: [], alt: 'Map of item 1', note: null, ...extra });
const chartBlock = (extra = {}) => ({ type: 'chart', chart: 'profile', itemId: 'p', ref: '2', line: [], elevationLayer: null, note: 'No elevation layer in the cover view', alt: 'Elevation profile of item 2', ...extra });

beforeEach(() => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    URL.createObjectURL = vi.fn(() => 'blob:figure');
    URL.revokeObjectURL = vi.fn();
    renderMapSnapshot.mockReset();
    renderProfileChart.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('the map snapshot block', () => {
    it('draws nothing until it is in view, then shows the image with the alt text of the model', async () => {
        renderMapSnapshot.mockResolvedValue({ image: new Blob(['x']), width: 1600, height: 1000, note: null });
        const wrapper = mountBlock(MapSnapshotBlock, mapBlock());
        await flushPromises();
        expect(renderMapSnapshot).not.toHaveBeenCalled();
        expect(wrapper.find('img').exists()).toBe(false);
        // Until then the figure is its alt text on an icon
        expect(wrapper.find('[role="img"]').attributes('aria-label')).toBe('Map of item 1');

        observers[0].show();
        await flushPromises();
        expect(renderMapSnapshot).toHaveBeenCalledTimes(1);
        expect(renderMapSnapshot.mock.calls[0][1].dataset).toBe(dataset);
        const img = wrapper.find('img');
        expect(img.attributes('src')).toBe('blob:figure');
        expect(img.attributes('alt')).toBe('Map of item 1');
        expect(wrapper.find('figcaption').text()).toBe('Map of item 1');
    });

    it('says the note of the render under the image (the basemap that could not be exported) and that of the model', async () => {
        renderMapSnapshot.mockResolvedValue({ image: new Blob(['x']), width: 1600, height: 1000, note: 'Basemap not shown: provider does not allow export' });
        const wrapper = mountBlock(MapSnapshotBlock, mapBlock({ note: 'The cover view was deleted: the items are drawn on the basemap only' }));
        observers[0].show();
        await flushPromises();
        const caption = wrapper.find('figcaption').text();
        expect(caption).toContain('Basemap not shown: provider does not allow export');
        expect(caption).toContain('The cover view was deleted');
        expect(wrapper.find('img').exists()).toBe(true);
    });

    it('says why it could not be drawn, and draws again on Retry', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderMapSnapshot.mockRejectedValueOnce(new Error('The map did not finish drawing in 30 s')).mockResolvedValue({ image: new Blob(['x']), width: 1, height: 1, note: null });
        const wrapper = mountBlock(MapSnapshotBlock, mapBlock());
        observers[0].show();
        await flushPromises();
        expect(wrapper.find('[role="alert"]').text()).toContain('did not finish drawing');
        await wrapper.find('[role="alert"] button').trigger('click');
        await flushPromises();
        expect(renderMapSnapshot).toHaveBeenCalledTimes(2);
        expect(wrapper.find('img').exists()).toBe(true);
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });
});

describe('the chart block', () => {
    it('shows the note in place of the chart when the cover view has no elevation layer (no image)', async () => {
        renderProfileChart.mockResolvedValue({ image: null, width: 1200, height: 480, note: 'No elevation layer in the cover view' });
        const wrapper = mountBlock(ChartBlock, chartBlock());
        observers[0].show();
        await flushPromises();
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.find('figcaption').text()).toBe('Elevation profile of item 2 - No elevation layer in the cover view');
    });

    it('shows the chart with the alt text of the block', async () => {
        renderProfileChart.mockResolvedValue({ image: new Blob(['x']), width: 1200, height: 480, note: null });
        const block = chartBlock({ elevationLayer: { path: 'dsm.tif', hash: '', vizParams: null }, note: null });
        const wrapper = mountBlock(ChartBlock, block);
        observers[0].show();
        await flushPromises();
        expect(renderProfileChart.mock.calls[0][0]).toEqual(block);
        expect(wrapper.find('img').attributes('alt')).toBe('Elevation profile of item 2');
    });
});

describe('the 3D capture block', () => {
    it('shows the stored capture of the item with the text of the model as its alt text', () => {
        const wrapper = mountBlock(Capture3dBlock, { type: 'capture3d', itemId: 'c', ref: '3', path: 'site/annotations/c-3d.webp', camera: null, text: '3D snapshot of item 3' });
        const img = wrapper.find('img');
        expect(img.attributes('src')).toBe('/dl/site/annotations/c-3d.webp?inline=1');
        expect(img.attributes('alt')).toBe('3D snapshot of item 3');
    });

    it('says "No 3D snapshot" for an item with none', () => {
        const wrapper = mountBlock(Capture3dBlock, { type: 'capture3d', itemId: 'c', ref: '3', path: null, camera: null, text: 'No 3D snapshot' });
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.text()).toContain('No 3D snapshot');
    });

    it('says so when the capture file is no longer in the dataset', async () => {
        const wrapper = mountBlock(Capture3dBlock, { type: 'capture3d', itemId: 'c', ref: '3', path: 'a/annotations/c-3d.webp', camera: null, text: '3D snapshot of item 3' });
        await wrapper.find('img').trigger('error');
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.find('[role="alert"]').text()).toContain('not in the dataset');
    });
});
