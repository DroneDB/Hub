/**
 * The details panel of a georaster and the saved views: "Used in views" links to the views that
 * show the file, and "Compare to..." opens the map of the file with its file picker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

vi.mock('@/libs/build/buildManager', () => ({
    default: { getBuildState: () => null, hasActiveBuild: () => false, on: vi.fn(), off: vi.fn() },
    BUILD_STATES: {}
}));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, isFileBuilt: vi.fn(), buildFile: vi.fn(), isBuildComplete: () => false
}));

const DetailPanel = (await import('./DetailPanel.vue')).default;

const dataset = { org: 'org', ds: 'ds' };
const ortho = { path: 'ddb://h/org/ds/flights/ortho.tif', entry: { path: 'flights/ortho.tif', type: ddb.entry.type.GEORASTER, size: 1, mtime: 1, hash: 'h', meta: {}, properties: {} } };
const photo = { path: 'ddb://h/org/ds/a.jpg', entry: { path: 'a.jpg', type: ddb.entry.type.IMAGE, size: 1, mtime: 1, hash: 'h', meta: {}, properties: {} } };

const view = (uid, name, ...paths) => ({
    uid, name, newerVersion: false, error: null,
    data: { base: { path: paths[0] }, layers: paths.map(path => ({ path })) }
});
const views = [
    view('v_aaaaaaaa', 'Spring', 'flights/ortho.tif'),
    view('v_bbbbbbbb', '<img src=x onerror=alert(1)>', 'flights/dsm.tif', 'flights/ortho.tif'),
    view('v_cccccccc', 'Other', 'flights/dsm.tif')
];

function mountPanel(props) {
    return mount(DetailPanel, { props: { dataset, ...props }, global: { plugins: [PrimeVue] } });
}
const buttonByLabel = (w, label) => w.findAll('button').find(b => b.text() === label);

describe('the details panel and saved views', () => {
    beforeEach(() => {
        vi.spyOn(window, 'open').mockReturnValue(null);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('lists the views that use the georaster under "Used in views", each a link to the saved view', async () => {
        const w = mountPanel({ file: ortho, views });
        await flushPromises();
        expect(w.find('.views-section h4').text()).toBe('Used in views');
        const links = w.findAll('.views-section a');
        expect(links.map(a => a.attributes('href'))).toEqual(['/r/org/ds/views/v_aaaaaaaa', '/r/org/ds/views/v_bbbbbbbb']);
        expect(links.every(a => a.attributes('target') === '_blank' && a.attributes('rel') === 'noopener')).toBe(true);
    });

    it('shows the name of a view as text', async () => {
        const w = mountPanel({ file: ortho, views });
        await flushPromises();
        expect(w.find('.views-section img').exists()).toBe(false);
        expect(w.findAll('.views-section a')[1].text()).toBe('<img src=x onerror=alert(1)>');
    });

    it('has no section when no view uses the file', async () => {
        const w = mountPanel({ file: ortho, views: [views[2]] });
        await flushPromises();
        expect(w.find('.views-section').exists()).toBe(false);
        expect(w.text()).not.toContain('Used in views');
    });

    it('has no section for a file that is not a georaster', async () => {
        const w = mountPanel({ file: photo, views: [view('v_dddddddd', 'Photo view', 'a.jpg')] });
        await flushPromises();
        expect(w.find('.views-section').exists()).toBe(false);
    });

    it('opens the map of the file with the file picker, in a new tab, on "Compare to..."', async () => {
        const w = mountPanel({ file: ortho, views: [] });
        await flushPromises();
        const compare = buttonByLabel(w, 'Compare to...');
        expect(compare.attributes('title')).toBe('Compare this georaster with others of the dataset');
        await compare.trigger('click');
        expect(window.open).toHaveBeenCalledWith('/r/org/ds/view/ZmxpZ2h0cy9vcnRoby50aWY=/map?pick=1', '_blank', 'noopener');
    });

    it('does not offer "Compare to..." for a file that is not a georaster', async () => {
        const w = mountPanel({ file: photo, views: [] });
        await flushPromises();
        expect(buttonByLabel(w, 'Compare to...')).toBeUndefined();
    });
});
