/**
 * Enter in the path field of the folder picker acts when it is pressed. The question "Folder does not exist" is answered
 * with Enter, which gives the focus back to the field: the release of that same Enter must not ask it a second time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import FolderPicker from './FolderPicker.vue';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function open() {
    const dataset = { list: vi.fn().mockResolvedValue([]), createFolder: vi.fn().mockResolvedValue(undefined) };
    wrapper = mount(FolderPicker, {
        props: { dataset, mode: 'folder' },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { DataTable: true, PathBreadcrumb: true } }
    });
    await flushPromises();
    return dataset;
}

const field = () => document.querySelector('.folder-picker-selected-input');
const question = () => document.querySelector('#confirmDialog');
const key = (target, type, init = {}) => target.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', bubbles: true, cancelable: true, ...init }));
const press = async target => { key(target, 'keydown'); await flushPromises(); key(target, 'keyup'); await flushPromises(); };

describe('FolderPicker Enter', () => {
    it('asks once for a folder that does not exist, and the release of the Enter that answers does not ask again', async () => {
        const dataset = await open();
        field().value = 'new-folder';
        field().dispatchEvent(new Event('input'));
        await flushPromises();

        await press(field());
        expect(question().textContent).toContain('new-folder');

        // The answer is an Enter on the focused Create button (the browser clicks it on the key press); the focus goes
        // back to the field and the key is released there
        const create = question().querySelector('[data-confirm]');
        key(create, 'keydown');
        create.click();
        await flushPromises();
        key(field(), 'keyup');
        await flushPromises();

        expect(dataset.createFolder).toHaveBeenCalledTimes(1);
        expect(question()).toBeNull();
        expect(wrapper.emitted('close')).toEqual([[{ path: 'new-folder', entry: null }]]);
    });

    it('does not act on a key that repeats while it is held', async () => {
        const dataset = await open();
        field().value = 'new-folder';
        field().dispatchEvent(new Event('input'));
        await flushPromises();
        key(field(), 'keydown', { repeat: true });
        await flushPromises();
        expect(dataset.list).toHaveBeenCalledTimes(1);
        expect(question()).toBeNull();
    });
});
