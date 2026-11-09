/**
 * The Share window of a file in a Private dataset: its links work only for members, and the
 * window says that sharing them makes the whole dataset Unlisted, and asks before it does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import ddb from 'ddb';

const h = vi.hoisted(() => ({ dataset: null }));
vi.mock('ddb', async importOriginal => {
    const real = (await importOriginal()).default;
    return { default: { ...real, utils: { ...real.utils, datasetPathFromUri: () => [h.dataset, ''] } } };
});

const { default: ShareEmbed } = await import('./ShareEmbed.vue');
const { VIEWER_ONLY_HELP } = await import('@/libs/views/viewLinks');

const WindowStub = { props: ['title', 'sizeClass', 'fixedSize'], template: '<div :data-size-class="sizeClass"><h1 data-title>{{ title }}</h1><slot /><slot name="footer" /></div>' };
const photo = { path: 'ddb://h/org/ds/a.jpg', entry: { path: 'a.jpg', type: ddb.entry.type.GEOIMAGE } };
const ortho = { path: 'ddb://h/org/ds/flights/ortho.tif', entry: { path: 'flights/ortho.tif', type: ddb.entry.type.GEORASTER } };
const folder = { path: 'ddb://h/org/ds/images', entry: { path: 'images', type: ddb.entry.type.DIRECTORY } };

let wrapper;
async function open(file) {
    wrapper = mount(ShareEmbed, {
        props: { file },
        attachTo: document.body,
        global: {
            plugins: [PrimeVue],
            stubs: { Window: WindowStub, OgcUsageHints: true },
            mocks: { $route: { params: { org: 'org', ds: 'ds' } } }
        }
    });
    await flushPromises();
}
const origin = () => window.location.origin;
const orthoPrefix = () => `${origin()}/r/org/ds/view/ZmxpZ2h0cy9vcnRoby50aWY=/map`;
const linkInput = () => document.body.querySelector('input[aria-label="Share link"]');
const viewerOnlyBox = () => document.body.querySelector('[data-testid="share-viewer-only"]');
async function chooseMode(value) {
    wrapper.findComponent(Select).vm.$emit('update:modelValue', value);
    await flushPromises();
}
const button = text => [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === text);

beforeEach(() => {
    h.dataset = {
        getVisibility: vi.fn(() => Promise.resolve(ddb.Visibility.PRIVATE)),
        setVisibility: vi.fn(() => Promise.resolve()),
        Entry: e => ({ ...e, findArtifact: () => null }),
        downloadUrl: p => `/download/${p}`
    };
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('ShareEmbed', () => {
    it('says that sharing a link of a Private dataset makes the whole dataset Unlisted', async () => {
        await open(photo);
        expect(document.body.textContent).toContain('This dataset is Private');
        expect(button('Make the dataset Unlisted...')).toBeTruthy();
        expect(button('Allow access to anyone with the link')).toBeUndefined();
    });

    it('asks before it changes the visibility, and changes nothing on Cancel', async () => {
        await open(photo);
        button('Make the dataset Unlisted...').click();
        await flushPromises();
        expect(document.body.textContent).toContain('This changes the visibility of the whole dataset');
        button('Cancel').click();
        await flushPromises();
        expect(h.dataset.setVisibility).not.toHaveBeenCalled();
    });

    it('makes the dataset Unlisted once confirmed, then shows the link', async () => {
        await open(photo);
        button('Make the dataset Unlisted...').click();
        await flushPromises();
        button('Make Unlisted').click();
        await flushPromises();
        expect(h.dataset.setVisibility).toHaveBeenCalledWith(ddb.Visibility.UNLISTED);
        expect(document.body.textContent).not.toContain('This dataset is Private');
    });

    it('names the item in the title (FR-SHR-06): the file, or the folder', async () => {
        await open(photo);
        expect(wrapper.find('[data-title]').text()).toBe('Share a.jpg');
        wrapper.unmount();
        await open(ortho);
        expect(wrapper.find('[data-title]').text()).toBe('Share ortho.tif');
        wrapper.unmount();
        await open(folder);
        expect(wrapper.find('[data-title]').text()).toBe('Share Folder images');
    });

    it('gives the window the size class dialog-xl, so its width does not change with the share type (FR-SHR-06)', async () => {
        await open(ortho);
        const size = () => wrapper.find('[data-size-class]').attributes('data-size-class');
        expect(size()).toBe('dialog-xl');
        await chooseMode('tms');
        expect(size()).toBe('dialog-xl');
        await chooseMode('link');
        expect(size()).toBe('dialog-xl');
    });

    describe('QGIS', () => {
        const gpkg = { path: 'ddb://h/org/ds/bounds.gpkg', entry: { path: 'bounds.gpkg', type: ddb.entry.type.VECTOR } };
        const steps = id => document.body.querySelector(`[data-testid="${id}"]`);
        const qgisUrlInput = () => document.body.querySelector('input[aria-label="QGIS URL"]');

        beforeEach(() => {
            h.dataset.getVisibility = vi.fn(() => Promise.resolve(ddb.Visibility.UNLISTED));
            h.dataset.Entry = e => ({ ...e, findArtifact: () => `/artifacts/${e.path}` });
        });

        it('shows the steps for a vector layer and the URL', async () => {
            await open(gpkg);
            await chooseMode('qgis');
            expect(steps('qgis-steps-vector').textContent.replace(/\s+/g, ' ').trim()).toBe(
                'Layer → Add Layer → Add Vector Layer → Source Type Protocol: HTTP(S) → paste the URL below (GeoPackage).');
            expect(steps('qgis-steps-generic')).toBeNull();
            expect(qgisUrlInput().value).toBe(`${origin()}/artifacts/bounds.gpkg`);
        });

        it('keeps the steps of a raster and shows no vector steps for it', async () => {
            await open(ortho);
            await chooseMode('qgis');
            expect(document.body.textContent).toContain('Add Raster Layer');
            expect(steps('qgis-steps-vector')).toBeNull();
            expect(steps('qgis-steps-generic')).toBeNull();
        });

        it('shows a generic hint for a type with no steps of its own', async () => {
            await open(photo);
            await wrapper.setData({ buildUrl: '/artifacts/a.jpg' });
            await chooseMode('qgis');
            expect(steps('qgis-steps-generic').textContent).toContain('choose the layer type that matches this file');
            expect(steps('qgis-steps-vector')).toBeNull();
            expect(qgisUrlInput().value).toBe(`${origin()}/artifacts/a.jpg`);
        });
    });

    describe('Viewer only', () => {
        beforeEach(() => {
            // A link of a Private dataset is replaced by the prompt; these tests need the link
            h.dataset.getVisibility = vi.fn(() => Promise.resolve(ddb.Visibility.UNLISTED));
        });

        it('offers an unchecked checkbox and a plain link for a file with a default view', async () => {
            await open(ortho);
            expect(viewerOnlyBox().checked).toBe(false);
            expect(linkInput().value).toBe(orthoPrefix());
            expect(linkInput().value).not.toContain('embed');
            // The explanation sits with the option, checked or not
            expect(document.body.textContent).toContain(VIEWER_ONLY_HELP);
            expect(document.body.textContent).not.toMatch(/restrict|secure|protect/i);
        });

        it('adds embed=1 exactly once and explains the option when checked', async () => {
            await open(ortho);
            viewerOnlyBox().click();
            await flushPromises();
            expect(linkInput().value).toBe(`${orthoPrefix()}?embed=1`);
            expect(linkInput().value.match(/embed=1/g)).toHaveLength(1);
            expect(document.body.textContent).toContain(VIEWER_ONLY_HELP);
            viewerOnlyBox().click();
            await flushPromises();
            expect(linkInput().value).toBe(orthoPrefix());
        });

        it('gives the Embed code the same iframe as ever, whatever the checkbox says', async () => {
            await open(ortho);
            viewerOnlyBox().click();
            await flushPromises();
            await chooseMode('embed');
            const expected = '<iframe frameborder="0" width="600" height="400" allowfullscreen mozallowfullscreen="true" ' +
                `webkitallowfullscreen="true" allow="fullscreen" src="${orthoPrefix()}?embed=1"></iframe>`;
            expect(document.body.querySelector('textarea[aria-label="Embed code"]').value).toBe(expected);
            expect(viewerOnlyBox()).toBeNull();
        });

        it('is off again when the window is opened again', async () => {
            await open(ortho);
            viewerOnlyBox().click();
            await flushPromises();
            expect(viewerOnlyBox().checked).toBe(true);
            wrapper.unmount();
            document.body.innerHTML = '';
            await open(ortho);
            expect(viewerOnlyBox().checked).toBe(false);
            expect(linkInput().value).toBe(orthoPrefix());
        });

        // The links the dialog built before the viewer links moved to one module: origin, org, ds,
        // the path in base64 and the viewer of the route, then embed=1 when asked
        it.each([
            ['markdown', ddb.entry.type.MARKDOWN, undefined, 'markdown'],
            ['georaster', ddb.entry.type.GEORASTER, undefined, 'map'],
            ['point cloud', ddb.entry.type.POINTCLOUD, undefined, 'pointcloud'],
            ['model', ddb.entry.type.MODEL, undefined, 'model'],
            ['panorama', ddb.entry.type.PANORAMA, undefined, 'panorama'],
            ['geo panorama', ddb.entry.type.GEOPANORAMA, undefined, 'panorama'],
            ['vector', ddb.entry.type.VECTOR, undefined, 'map'],
            ['local vector', ddb.entry.type.VECTOR, { georeferenced: false }, 'unified'],
            ['gaussian splat', ddb.entry.type.GAUSSIAN_SPLAT, undefined, 'splat'],
            ['3D tiles', ddb.entry.type.TILES3D, undefined, 'unified']
        ])('gives the same link as ever for a %s, with and without Viewer only', async (_, type, properties, view) => {
            const path = 'sub dir/ünï.file';
            await open({ path: `ddb://h/org/ds/${path}`, entry: { path, type, properties } });
            const plain = `${origin()}/r/org/ds/view/${Buffer.from(path).toString('base64')}/${view}`;
            expect(linkInput().value).toBe(plain);
            viewerOnlyBox().click();
            await flushPromises();
            expect(linkInput().value).toBe(`${plain}?embed=1`);
        });

        it('is not offered for a file with no default view, whose link is the download address', async () => {
            await open(photo);
            expect(viewerOnlyBox()).toBeNull();
            expect(linkInput().value).toBe(`${origin()}/download/a.jpg`);
        });

        it('is not offered while the dataset is Private', async () => {
            h.dataset.getVisibility = vi.fn(() => Promise.resolve(ddb.Visibility.PRIVATE));
            await open(ortho);
            expect(viewerOnlyBox()).toBeNull();
        });
    });
});
