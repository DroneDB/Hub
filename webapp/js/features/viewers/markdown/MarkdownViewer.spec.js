import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const source = vi.hoisted(() => ({ text: '', canWrite: false, writeObj: null }));
vi.mock('@/composables/useViewerEntry', async () => {
    const { ref, shallowRef } = await import('vue');
    return {
        useViewerEntry: () => ({
            entry: shallowRef({ path: 'readme.md' }),
            dataset: shallowRef({ getFileContents: () => Promise.resolve(source.text), writeObj: source.writeObj }),
            canWrite: ref(source.canWrite),
            loading: ref(true),
            error: ref(''),
            entryLoaded: Promise.resolve(true)
        })
    };
});

const { default: MarkdownViewer } = await import('./MarkdownViewer.vue');

beforeEach(() => {
    source.canWrite = false;
    source.writeObj = vi.fn(() => Promise.resolve());
});

let wrapper;
async function render(text) {
    source.text = text;
    wrapper = mount(MarkdownViewer, {
        global: { plugins: [PrimeVue], stubs: { ViewerShell: { template: '<div><slot /></div>' } } }
    });
    await flushPromises();
    return wrapper.find('.content');
}
afterEach(() => wrapper?.unmount());

describe('MarkdownViewer', () => {
    it('renders the file as sanitised HTML', async () => {
        const content = await render('# Title\n\n**bold** <script>alert(1)</script>');
        expect(content.find('h1').text()).toBe('Title');
        expect(content.find('strong').text()).toBe('bold');
        expect(content.find('script').exists()).toBe(false);
    });

    it('shows no edit button to a user who cannot write', async () => {
        await render('# Title');
        expect(wrapper.find('button[aria-label="Edit"]').exists()).toBe(false);
    });

    it('lets a writer edit the source, saves it and renders the new text', async () => {
        source.canWrite = true;
        await render('# Old');

        await wrapper.find('button[aria-label="Edit"]').trigger('click');
        await flushPromises();
        const editor = wrapper.find('textarea');
        expect(editor.element.value).toBe('# Old');
        await editor.setValue('# New\n\n**bold** <script>alert(1)</script>');
        await wrapper.find('button[aria-label="Save"]').trigger('click');
        await flushPromises();

        expect(source.writeObj).toHaveBeenCalledWith('readme.md', '# New\n\n**bold** <script>alert(1)</script>');
        expect(wrapper.find('textarea').exists()).toBe(false);
        const content = wrapper.find('.content');
        expect(content.find('h1').text()).toBe('New');
        expect(content.find('strong').text()).toBe('bold');
        expect(content.find('script').exists()).toBe(false);
    });

    it('keeps images, which belong to the dataset owner', async () => {
        const content = await render('![chart](chart.png)');
        expect(content.find('img').attributes('src')).toBe('chart.png');
    });
});
