/**
 * The Share window of a file in a Private dataset: its links work only for members, and the
 * window says that sharing them makes the whole dataset Unlisted, and asks before it does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const h = vi.hoisted(() => ({ dataset: null }));
vi.mock('ddb', async importOriginal => {
    const real = (await importOriginal()).default;
    return { default: { ...real, utils: { ...real.utils, datasetPathFromUri: () => [h.dataset, ''] } } };
});

const { default: ShareEmbed } = await import('./ShareEmbed.vue');

const WindowStub = { props: ['title'], template: '<div><h1 data-title>{{ title }}</h1><slot /><slot name="footer" /></div>' };
const photo = { path: 'ddb://h/org/ds/a.jpg', entry: { path: 'a.jpg', type: ddb.entry.type.GEOIMAGE } };
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

    it('titles the window by what it shares', async () => {
        await open(photo);
        expect(wrapper.find('[data-title]').text()).toBe('Share / Embed');
        wrapper.unmount();
        await open(folder);
        expect(wrapper.find('[data-title]').text()).toBe('Share Folder');
    });
});
