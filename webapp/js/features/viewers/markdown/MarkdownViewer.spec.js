import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const source = vi.hoisted(() => ({ text: '', path: 'readme.md', canWrite: false, writeObj: null }));
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const guards = vi.hoisted(() => ({ leave: null, update: null }));
vi.mock('vue-router', async importOriginal => ({
    ...(await importOriginal()),
    onBeforeRouteLeave: fn => { guards.leave = fn; },
    onBeforeRouteUpdate: fn => { guards.update = fn; },
    useRouter: () => undefined
}));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/composables/useViewerEntry', async () => {
    const { ref, shallowRef } = await import('vue');
    return {
        useViewerEntry: () => ({
            entry: shallowRef({ path: source.path }),
            dataset: shallowRef({
                getFileContents: () => Promise.resolve(source.text), writeObj: source.writeObj,
                downloadUrl: (path, { inline } = {}) => `/orgs/o/ds/d/download/${path}${inline ? '?inline=1' : ''}`
            }),
            canWrite: ref(source.canWrite),
            loading: ref(true),
            error: ref(''),
            entryLoaded: Promise.resolve(true)
        })
    };
});

const { default: MarkdownViewer } = await import('./MarkdownViewer.vue');

beforeEach(() => {
    notify.success.mockClear();
    source.path = 'readme.md';
    source.canWrite = false;
    source.writeObj = vi.fn(() => Promise.resolve());
});

let wrapper;
async function render(text) {
    source.text = text;
    wrapper = mount(MarkdownViewer, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { ViewerShell: { template: '<div><slot /></div>' } } }
    });
    await flushPromises();
    return wrapper.find('.content');
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

/** Opens the editor of a writer on `text`, and types `typed` when given. */
async function editAndType(text, typed) {
    source.canWrite = true;
    await render(text);
    await wrapper.find('button[aria-label="Edit"]').trigger('click');
    await flushPromises();
    if (typed !== undefined) await wrapper.find('textarea').setValue(typed);
}
const question = () => document.body.querySelector('#confirmDialog');
async function answer(label) {
    [...question().querySelectorAll('button')].find(b => b.textContent.trim() === label).click();
    await flushPromises();
}
async function key(k, init = {}) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    await flushPromises();
}
const away = { path: '/r/o/d', fullPath: '/r/o/d' };
const here = { path: '/r/o/d/view/x/markdown', fullPath: '/r/o/d/view/x/markdown' };

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

    it('loads an image of the dataset from the folder of the file, not from the address of the viewer', async () => {
        const content = await render('![chart](chart.png)');
        expect(content.find('img').attributes('src')).toBe('/orgs/o/ds/d/download/chart.png?inline=1');
    });

    it('resolves the images and links of a file in a folder from that folder', async () => {
        source.path = 'odm/report/README.md';
        const content = await render('![a](../images/a.jpg) [report](report.pdf#page=2) [site](https://example.com)');
        expect(content.find('img').attributes('src')).toBe('/orgs/o/ds/d/download/odm/images/a.jpg?inline=1');
        const links = content.findAll('a').map(a => a.attributes('href'));
        expect(links).toEqual(['/orgs/o/ds/d/download/odm/report/report.pdf?inline=1#page=2', 'https://example.com']);
    });

    it('does not load a file from outside the dataset', async () => {
        const content = await render('![secret](../../other/x.png) [up](../x.md)');
        expect(content.find('img').exists()).toBe(false);
        expect(content.text()).toContain('secret');
        expect(content.find('a').attributes('href')).toBeUndefined();
    });

    describe('editing', () => {
        it('has Cancel and Save, and says when the text is not saved', async () => {
            await editAndType('# Old');
            expect(wrapper.find('button[aria-label="Cancel"]').exists()).toBe(true);
            expect(wrapper.find('button[aria-label="Save"]').element.disabled).toBe(true);
            expect(wrapper.text()).not.toContain('Unsaved changes');

            await wrapper.find('textarea').setValue('# New');
            expect(wrapper.text()).toContain('Unsaved changes');
            expect(wrapper.find('button[aria-label="Save"]').element.disabled).toBe(false);
        });

        it('Esc on edited text asks to discard it; Discard goes back to the file', async () => {
            await editAndType('# Old', '# New');
            await key('Escape');
            expect(question()).not.toBeNull();
            expect(question().textContent).toContain('Discard them?');

            await answer('Discard');
            expect(question()).toBeNull();
            expect(wrapper.find('textarea').exists()).toBe(false);
            expect(wrapper.find('.content h1').text()).toBe('Old');
            expect(source.writeObj).not.toHaveBeenCalled();
        });

        it('Cancel asks too, and cancelling the question keeps the edited text', async () => {
            await editAndType('# Old', '# New');
            await wrapper.find('button[aria-label="Cancel"]').trigger('click');
            await flushPromises();
            await answer('Cancel');
            expect(question()).toBeNull();
            expect(wrapper.find('textarea').element.value).toBe('# New');
        });

        it('Esc on text with no change leaves the editor without asking', async () => {
            await editAndType('# Old');
            await key('Escape');
            expect(question()).toBeNull();
            expect(wrapper.find('textarea').exists()).toBe(false);
        });

        it('Ctrl+S (or Cmd+S) saves the text and confirms with a toast', async () => {
            await editAndType('# Old', '# New');
            await key('s', { ctrlKey: true });
            expect(source.writeObj).toHaveBeenCalledWith('readme.md', '# New');
            expect(notify.success).toHaveBeenCalledWith('Saved "readme.md"', { summary: 'File saved' });
            expect(wrapper.find('textarea').exists()).toBe(false);

            await wrapper.find('button[aria-label="Edit"]').trigger('click');
            await flushPromises();
            await wrapper.find('textarea').setValue('# Newer');
            await key('s', { metaKey: true });
            expect(source.writeObj).toHaveBeenLastCalledWith('readme.md', '# Newer');
        });

        it('leaves Esc and Ctrl+S to another window of the app open over the editor', async () => {
            await editAndType('# Old', '# New');
            // A window of another component (the header's Preferences), teleported to the body
            const other = document.createElement('div');
            other.className = 'p-dialog';
            other.setAttribute('role', 'dialog');
            document.body.append(other);

            await key('Escape');
            await key('s', { ctrlKey: true });
            expect(question()).toBeNull();
            expect(source.writeObj).not.toHaveBeenCalled();
            expect(wrapper.find('textarea').element.value).toBe('# New');

            other.remove();
            await key('Escape');
            expect(question()).not.toBeNull();
        });

        it('keeps the editor and the text when the save fails', async () => {
            source.writeObj = vi.fn(() => Promise.reject(new Error('Disk full')));
            await editAndType('# Old', '# New');
            await key('s', { ctrlKey: true });
            expect(notify.success).not.toHaveBeenCalled();
            expect(wrapper.find('textarea').element.value).toBe('# New');
            expect(wrapper.text()).toContain('Unsaved changes');
        });
    });

    describe('leaving with unsaved text', () => {
        it('a route change asks once (Save, Discard, Cancel); Cancel stays with the text', async () => {
            await editAndType('# Old', '# New');
            const first = guards.leave(away, here);
            const second = guards.update({ path: '/r/o/d/view/y/markdown' }, here);
            await flushPromises();
            expect(document.body.querySelectorAll('#confirmDialog')).toHaveLength(1);
            const labels = [...question().querySelectorAll('button')].map(b => b.textContent.trim());
            expect(labels).toEqual(expect.arrayContaining(['Save', 'Discard', 'Cancel']));

            await answer('Cancel');
            expect(await first).toBe(false);
            expect(await second).toBe(false);
            expect(wrapper.find('textarea').element.value).toBe('# New');
        });

        it('Save in the question writes the file, then leaves', async () => {
            await editAndType('# Old', '# New');
            const leaving = guards.leave(away, here);
            await flushPromises();
            await answer('Save');
            expect(await leaving).toBe(true);
            expect(source.writeObj).toHaveBeenCalledWith('readme.md', '# New');
        });

        it('asks nothing for an editor with no change', async () => {
            await editAndType('# Old');
            expect(await guards.leave(away, here)).toBe(true);
            expect(question()).toBeNull();
        });

        it('a page unload shows the browser question while the text is not saved', async () => {
            await editAndType('# Old', '# New');
            const unload = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(unload);
            expect(unload.defaultPrevented).toBe(true);
        });
    });
});
