/**
 * ViewerShell, the frame of every viewer (FR-VWR-07, FR-ACC-18, FR-VWR-23): the view bar with the
 * way back to the dataset and the file name (none when embedded), and the page state of a file
 * that did not load, from its `load-error`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import { b64encode } from '@/libs/base64';
import { ApiError, InvalidLinkError } from '@/libs/ddb/apiError';
import ViewerShell from './ViewerShell.vue';

const Page = { render: () => null };
let wrapper;

async function render(props = {}, { path = `/r/acme/site/view/${b64encode('odm/report/README.md')}/markdown`, embed = false, slots } = {}) {
    globalThis.HubOptions = {};
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/r', name: 'Organizations', component: Page },
            { path: '/r/:org/:ds', name: 'ViewDataset', component: Page },
            { path: '/r/:org/:ds/view/:encodedPath/markdown', name: 'Markdown', component: Page },
            { path: '/r/:org/:ds/views/:uid', name: 'SavedView', component: Page },
            { path: '/login', name: 'Login', component: Page }
        ]
    });
    await router.push(path);
    wrapper = mount(ViewerShell, {
        props,
        slots: { default: '<div class="viewer-content" />', ...slots },
        global: { plugins: [router, PrimeVue], provide: { embed } }
    });
    await flushPromises();
}
const bar = () => wrapper.find('.viewer-bar');
const backHref = () => bar().find('a.viewer-back').attributes('href');

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

describe('ViewerShell view bar', () => {
    it('shows the file name and a way back to the dataset', async () => {
        await render();
        expect(bar().find('.viewer-name').text()).toBe('README.md');
        expect(bar().find('a.viewer-back').attributes('aria-label')).toBe('Back to the dataset');
        expect(backHref()).toBe('/r/acme/site');
    });

    it('shows the name it is given, and the viewer content of its bar slot', async () => {
        await render({ name: 'Ortho over DSM' }, { path: '/r/acme/site/views/v_1' });
        expect(bar().find('.viewer-name').text()).toBe('Ortho over DSM');
        wrapper.unmount();
        await render({}, { slots: { bar: '<span class="own">Mine</span>' } });
        expect(bar().find('.own').text()).toBe('Mine');
        expect(bar().find('.viewer-name').exists()).toBe(false);
        expect(backHref()).toBe('/r/acme/site');
    });

    it('has no bar when embedded', async () => {
        await render({}, { embed: true });
        expect(bar().exists()).toBe(false);
    });
});

describe('ViewerShell page states', () => {
    it('a 403 shows the no access state of the dataset, with the way back, in place of the viewer and its spinner', async () => {
        await render({ loadError: new ApiError('Forbidden', 403), error: 'Forbidden', loading: false });
        expect(wrapper.find('h1').text()).toBe('You do not have access to this dataset');
        expect(wrapper.text()).toContain('"site" is private.');
        const first = wrapper.find('.resource-state a');
        expect(first.text()).toBe('Back to the dataset');
        expect(first.attributes('href')).toBe('/r/acme/site');
        expect(wrapper.find('.viewer-content').exists()).toBe(false);
        expect(wrapper.find('.viewer-loading').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('Forbidden');
    });

    it('embedded: no bar, and the way back opens the dataset in a new tab, not in the frame', async () => {
        await render({ loadError: new ApiError('Forbidden', 403) }, { embed: true });
        expect(bar().exists()).toBe(false);
        const back = wrapper.find('.resource-state a');
        expect(back.attributes('href')).toBe('/r/acme/site');
        expect(back.attributes('target')).toBe('_blank');
        wrapper.unmount();
        await render({ loadError: new Error('Broken'), error: 'Broken' }, { embed: true });
        expect(wrapper.find('.viewer-failed a').attributes('target')).toBe('_blank');
    });

    it('a missing file shows the not found state naming its path', async () => {
        await render({ loadError: new ApiError('Cannot find: odm/report/README.md.', 404) });
        expect(wrapper.find('h1').text()).toBe('File not found');
        expect(wrapper.text()).toContain('"odm/report/README.md" does not exist.');
    });

    it('a link whose path cannot be read says the link is not valid (FR-VWR-23)', async () => {
        await render({ loadError: new InvalidLinkError('x') }, { path: '/r/acme/site/view/%25%25%25garbage/markdown' });
        expect(wrapper.find('h1').text()).toBe('This link is not valid');
        expect(wrapper.text()).toContain('The file path in the address cannot be read.');
        expect(wrapper.find('.resource-state a').attributes('href')).toBe('/r/acme/site');
        expect(bar().find('.viewer-name').text()).toBe('');
    });

    it('any other failure to load shows its message and the way back (FR-VWR-05)', async () => {
        await render({ loadError: new Error('cog.tif cannot be opened as markdown'), error: 'cog.tif cannot be opened as markdown' });
        expect(wrapper.find('.resource-state').exists()).toBe(false);
        expect(wrapper.text()).toContain('cog.tif cannot be opened as markdown');
        const back = wrapper.find('.viewer-failed a');
        expect(back.text()).toContain('Back to the dataset');
        expect(back.attributes('href')).toBe('/r/acme/site');
    });

    it('an error of a viewer that loaded shows the message only', async () => {
        await render({ error: 'Save failed' });
        expect(wrapper.text()).toContain('Save failed');
        expect(wrapper.find('.viewer-failed').exists()).toBe(false);
        expect(wrapper.find('.viewer-content').exists()).toBe(true);
    });
});
