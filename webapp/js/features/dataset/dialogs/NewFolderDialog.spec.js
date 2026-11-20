/**
 * The New folder dialog (FR-EXP-15, FR-EXP-05, D-034, D-040, D-046): the field is neutral when the dialog opens,
 * a blank name, a '/' and a name that an entry of the folder has are refused at the field before any request, a
 * server refusal (409) shows at the field and the dialog stays open with the typed text.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import NewFolderDialog from './NewFolderDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const WindowStub = {
    props: ['busy', 'confirmLabel', 'cancelLabel'],
    emits: ['confirm', 'close'],
    template: '<div :data-busy="busy"><slot /><button type="button" data-cancel>{{ cancelLabel }}</button><button type="button" data-confirm :disabled="busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

let wrapper;
const createFolder = vi.fn();
async function render(props = {}) {
    wrapper = mount(NewFolderDialog, {
        props: { createFolder, siblings: ['sub', 'sub/inner', 'data.csv', 'Photos'], folder: '', ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    await flushPromises();
}
const input = () => wrapper.find('input[name="name"]');
const type = async value => { await input().setValue(value); await flushPromises(); };
const confirm = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
const error = () => wrapper.find('#new-folder-name-error');
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; createFolder.mockReset(); });

describe('NewFolderDialog', () => {
    it('is neutral when it opens: no error before anything is typed, buttons Cancel and Create', async () => {
        await render();
        expect(error().exists()).toBe(false);
        expect(input().attributes('aria-invalid')).toBeUndefined();
        expect(wrapper.find('[data-cancel]').text()).toBe('Cancel');
        expect(wrapper.find('[data-confirm]').text()).toBe('Create');
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeUndefined();
    });

    it.each(['', '   '])('refuses the blank name %j at the field and sends no request', async value => {
        await render();
        await type(value);
        await confirm();
        expect(error().text()).toBe('Enter a name');
        expect(input().attributes('aria-invalid')).toBe('true');
        expect(input().attributes('aria-describedby')).toBe('new-folder-name-error');
        expect(createFolder).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(input().element);
    });

    it('refuses a name that an entry of the folder has, without regard to letter case, with the message of the Registry', async () => {
        await render();
        await type('sub');
        await confirm();
        expect(error().text()).toBe("A file or folder named 'sub' already exists in this folder");
        await type('PHOTOS');
        expect(error().text()).toBe("A file or folder named 'Photos' already exists in this folder");
        await type('data.csv');
        await confirm();
        expect(error().text()).toBe("A file or folder named 'data.csv' already exists in this folder");
        expect(createFolder).not.toHaveBeenCalled();
    });

    it("refuses 'x/y' like Rename does, saying so", async () => {
        await render();
        await type('x/y');
        await confirm();
        expect(error().text()).toBe('Folder names cannot contain /');
        expect(createFolder).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('compares only the entries of its own folder', async () => {
        await render({ folder: 'sub' });
        await type('inner');
        await confirm();
        expect(error().text()).toBe("A file or folder named 'inner' already exists in this folder");
        await type('sub');
        await confirm();
        expect(createFolder).toHaveBeenCalledExactlyOnceWith('sub');
    });

    it('creates the folder with the trimmed name and closes with it', async () => {
        const entry = { path: 'new', type: 3 };
        createFolder.mockResolvedValue(entry);
        await render();
        await type('  new  ');
        await confirm();
        expect(createFolder).toHaveBeenCalledExactlyOnceWith('new');
        expect(wrapper.emitted('close')).toEqual([['createFolder', 'new', entry]]);
    });

    // FR-EXP-15: the server's refusal replaced the dialog with an alert; now it is at the field and the dialog stays
    it('shows a 409 of the Registry at the field and stays open with the typed text', async () => {
        createFolder.mockRejectedValue(new ApiError("A file or folder named 'Fresh' already exists in this folder", 409, { conflictPath: 'Fresh' }));
        await render();
        await type('fresh');
        await confirm();
        expect(createFolder).toHaveBeenCalledExactlyOnceWith('fresh');
        expect(error().text()).toBe("A file or folder named 'Fresh' already exists in this folder");
        expect(input().element.value).toBe('fresh');
        expect(input().attributes('aria-invalid')).toBe('true');
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.find('.form-error').exists()).toBe(false);
    });

    it('keeps the dialog open on any other failure and says it in the dialog', async () => {
        createFolder.mockRejectedValue(new ApiError('Internal server error', 500));
        await render();
        await type('fresh');
        await confirm();
        expect(wrapper.find('.form-error').text()).toBe('Internal server error');
        expect(error().exists()).toBe(false);
        expect(input().element.value).toBe('fresh');
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('closes without a request on the window close, unless a request is running', async () => {
        await render();
        wrapper.findComponent(WindowStub).vm.$emit('close');
        expect(wrapper.emitted('close')).toEqual([['close']]);
    });
});
