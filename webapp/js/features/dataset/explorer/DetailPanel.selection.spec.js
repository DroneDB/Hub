/**
 * The detail panel with several items selected (FR-EXP-32): the summary of the selection, not the
 * properties of the last-clicked file, and the shared actions of the registry (Download, Delete).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';

vi.mock('@/libs/build/buildManager', () => ({
    default: { getBuildState: () => null, hasActiveBuild: () => false, on: vi.fn(), off: vi.fn() },
    BUILD_STATES: {}
}));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, isFileBuilt: vi.fn(), buildFile: vi.fn(), isBuildComplete: () => false
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { isLoggedIn: () => true, features: { get: () => false, value: () => null } } }));

const DetailPanel = (await import('./DetailPanel.vue')).default;

const MB = 1048576;
const T = ddb.entry.type;
const file = (name, type, size) => ({ label: name, path: `ddb://h/o/d/${name}`, icon: 'fa-solid fa-file', entry: { path: name, type, size, mtime: 1, hash: 'h', meta: {}, properties: {} } });
const four = [file('a.jpg', T.IMAGE, 2 * MB), file('b.jpg', T.IMAGE, 3 * MB), file('c.tif', T.GEORASTER, 4 * MB), file('notes.md', T.MARKDOWN, 0.3 * MB)];

function mountPanel(props) {
    return mount(DetailPanel, { props: { dataset: { org: 'o', ds: 'd' }, canWrite: true, ...props }, global: { plugins: [PrimeVue] } });
}
const button = (w, label) => w.findAll('button').find(b => b.text() === label);

beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('DetailPanel with several items selected', () => {
    it('shows "4 items selected" with the total size, the types and the names, not one file', async () => {
        const w = mountPanel({ file: four[3], selection: four });
        await flushPromises();
        expect(w.find('[aria-label="Selection"]').exists()).toBe(true);
        expect(w.find('.detail-header').text()).toBe('4 items selected — 9.3 MB');
        expect(w.text()).toContain('Image (2), GeoRaster (1), Markdown (1)');
        expect(w.findAll('.selection-names li').map(li => li.text())).toEqual(['a.jpg', 'b.jpg', 'c.tif', 'notes.md']);
        // Not the properties of the last clicked file
        expect(w.find('[aria-label="File details"]').exists()).toBe(false);
        expect(w.find('.properties-section').exists()).toBe(false);
    });

    it('lists the first names and "and N more"', async () => {
        const many = Array.from({ length: 8 }, (_, i) => file(`f${i}.jpg`, T.IMAGE, MB));
        const w = mountPanel({ file: many[0], selection: many });
        expect(w.findAll('.selection-names li').map(li => li.text())).toEqual(['f0.jpg', 'f1.jpg', 'f2.jpg', 'f3.jpg', 'f4.jpg', 'and 3 more']);
        expect(w.find('.detail-header').text()).toBe('8 items selected — 8 MB');
    });

    it('says that the size does not count the content of folders', async () => {
        const folder = file('newdir', T.DIRECTORY, 0);
        const w = mountPanel({ file: folder, selection: [folder, four[0]] });
        expect(w.find('.selection-note').text()).toBe('The size does not count what is inside the folders.');
        expect(mountPanel({ file: four[0], selection: four }).find('.selection-note').exists()).toBe(false);
    });

    it('has the registry\'s Download and Delete, which ask the page', async () => {
        const w = mountPanel({ file: four[0], selection: four });
        expect(button(w, 'Download')).toBeDefined();
        await button(w, 'Download').trigger('click');
        expect(w.emitted('downloadItems')[0][0]).toEqual(four);
        await button(w, 'Delete').trigger('click');
        expect(w.emitted('deleteSelecteditems')).toHaveLength(1);
    });

    it('has no Delete for a reader', async () => {
        const w = mountPanel({ file: four[0], selection: four, canWrite: false });
        expect(button(w, 'Download')).toBeDefined();
        expect(button(w, 'Delete')).toBeUndefined();
    });

    it('closes from its header, and follows the live selection down to one file', async () => {
        const w = mountPanel({ file: four[0], selection: four });
        await w.find('button[aria-label="Close"]').trigger('click');
        expect(w.emitted('close')).toHaveLength(1);
        await w.setProps({ selection: [four[0]] });
        expect(w.find('[aria-label="Selection"]').exists()).toBe(false);
        expect(w.find('[aria-label="File details"]').exists()).toBe(true);
    });

    it('shows the one file as before when one item is selected', async () => {
        const w = mountPanel({ file: four[0], selection: [four[0]] });
        await flushPromises();
        expect(w.find('[aria-label="File details"]').exists()).toBe(true);
        expect(w.find('[aria-label="Selection"]').exists()).toBe(false);
    });
});
