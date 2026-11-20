/**
 * The Rename dialog (FR-EXP-04, D-040, D-046): a name that a sibling has is refused at the field before any request
 * (letter case ignored, as the Registry compares), the character rule is the published entry name rule, a 409 of the
 * Registry shows at the field and the dialog stays open, and a rename that does not change the name is the one
 * disabled submit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import RenameDialog from './RenameDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const T = ddb.entry.type;
const WindowStub = {
    props: ['busy', 'confirmLabel', 'confirmDisabled', 'cancelLabel'],
    emits: ['confirm', 'close', 'show'],
    template: '<div :data-busy="busy"><slot /><button type="button" data-cancel>{{ cancelLabel }}</button><button type="button" data-confirm :disabled="confirmDisabled || busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

const item = (path, type = T.GENERIC) => ({ label: path.split('/').pop(), path: `ddb://org/ds/${path}`, entry: { path, type } });
const readme = item('README.md');
const listing = [readme, item('odm_orthophoto.tif'), item('Photo.JPG'), item('Docs', T.DIRECTORY), item('Docs/guide.md')];
const withSidecar = [...listing, item('README_notes.txt')];

let wrapper;
const renameEntry = vi.fn();
async function render(props = {}) {
    wrapper = mount(RenameDialog, {
        props: { file: readme, allEntries: listing, siblings: listing.map(i => i.entry.path), renameEntry, ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    await flushPromises();
}
const input = () => wrapper.find('input[name="name"]');
const type = async value => { await input().setValue(value); await flushPromises(); };
const confirm = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
const error = () => wrapper.find('#rename-name-error');
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; renameEntry.mockReset(); });

describe('RenameDialog', () => {
    it('starts with the name of the item, and Rename disabled until the name changes', async () => {
        await render();
        expect(input().element.value).toBe('README.md');
        expect(wrapper.find('[data-confirm]').text()).toBe('Rename');
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeDefined();
        await type('README2.md');
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeUndefined();
        await type('README.md');
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeDefined();
    });

    // The finding: a sibling's name came back as "Internal server error" from the Registry
    it('refuses the name of a sibling at the field, before any request, with the message of the Registry', async () => {
        await render();
        await type('odm_orthophoto.tif');
        expect(error().text()).toBe("A file or folder named 'odm_orthophoto.tif' already exists in this folder");
        await confirm();
        expect(renameEntry).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(input().attributes('aria-invalid')).toBe('true');
        expect(input().element.value).toBe('odm_orthophoto.tif');
    });

    it('refuses the name of a sibling that differs only in letter case, naming it as it is stored; a folder counts too', async () => {
        await render();
        await type('photo.jpg');
        await confirm();
        expect(error().text()).toBe("A file or folder named 'Photo.JPG' already exists in this folder");
        await type('docs');
        await confirm();
        expect(error().text()).toBe("A file or folder named 'Docs' already exists in this folder");
        expect(renameEntry).not.toHaveBeenCalled();
    });

    it('does not take the item for its own sibling: a rename that only changes the letter case goes through', async () => {
        renameEntry.mockResolvedValue(undefined);
        await render();
        await type('readme.md');
        expect(error().exists()).toBe(false);
        await confirm();
        expect(renameEntry).toHaveBeenCalledExactlyOnceWith('readme.md', { sidecars: [] });
        expect(wrapper.emitted('close')).toEqual([['rename', 'readme.md', readme.entry]]);
    });

    it("refuses a '/' and the names the Registry refuses, with the rule it publishes", async () => {
        await render();
        await type('a/b');
        await confirm();
        expect(error().text()).toBe('File names cannot contain /');
        await type('..');
        await confirm();
        expect(error().text()).toMatch(/^The name is not valid: use a name that is not empty, not '\.' or '\.\.'/);
        await type('  ');
        await confirm();
        expect(error().text()).toBe('Enter a name');
        expect(renameEntry).not.toHaveBeenCalled();
    });

    it('accepts a name the Registry accepts, which the dialog used to refuse', async () => {
        renameEntry.mockResolvedValue(undefined);
        await render();
        await type('.hidden..md');
        await confirm();
        expect(renameEntry).toHaveBeenCalledWith('.hidden..md', { sidecars: [] });
    });

    it('renames inside the folder of the item, and says Folder for a folder', async () => {
        const guide = item('Docs/guide.md');
        renameEntry.mockResolvedValue(undefined);
        await render({ file: guide });
        await type('Docs/x');
        await confirm();
        expect(error().text()).toBe('File names cannot contain /');
        await type('guide2.md');
        await confirm();
        expect(renameEntry).toHaveBeenCalledWith('Docs/guide2.md', { sidecars: [] });
        wrapper.unmount();

        await render({ file: item('Docs', T.DIRECTORY) });
        await type('a/b');
        await confirm();
        expect(error().text()).toBe('Folder names cannot contain /');
    });

    // FR-EXP-04: a clash that came after the listing was read is the Registry's 409, shown at the field
    it('shows a 409 of the Registry at the field and stays open with the typed name', async () => {
        renameEntry.mockRejectedValue(new ApiError("A file or folder named 'late.tif' already exists in this folder", 409, { conflictPath: 'late.tif' }));
        await render();
        await type('late.tif');
        await confirm();
        expect(renameEntry).toHaveBeenCalledTimes(1);
        expect(error().text()).toBe("A file or folder named 'late.tif' already exists in this folder");
        expect(input().element.value).toBe('late.tif');
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.find('.form-error').exists()).toBe(false);
    });

    it('also renames its sidecars when the box is ticked, and sends their new paths', async () => {
        renameEntry.mockResolvedValue(undefined);
        await render({ allEntries: withSidecar, siblings: withSidecar.map(i => i.entry.path) });
        expect(wrapper.findAll('.sidecar-list li').map(l => l.text())).toEqual(['README_notes.txt']);
        await type('Guide.md');
        await confirm();
        expect(renameEntry).toHaveBeenCalledWith('Guide.md', { sidecars: [{ oldPath: 'README_notes.txt', newPath: 'Guide_notes.txt' }] });

        renameEntry.mockClear();
        await wrapper.find('#renameSidecarsCheckbox').setValue(false);
        await type('Guide2.md');
        await confirm();
        expect(renameEntry).toHaveBeenCalledWith('Guide2.md', { sidecars: [] });
    });

    // D-035: the dataset keeps its slug when the name makes none, so the rename is not refused for the Latin letter rule
    it('renames the dataset root through the page in the dialog, a name in another script included', async () => {
        const root = { label: 'My survey', entry: { path: '', type: T.DRONEDB } };
        const renameDataset = vi.fn().mockResolvedValue({ slug: 'my-survey' });
        await render({ file: root, allEntries: [], siblings: [], renameDataset });
        await type('Москва');
        await confirm();
        expect(error().exists()).toBe(false);
        expect(renameDataset).toHaveBeenCalledExactlyOnceWith('Москва');
        expect(wrapper.emitted('close')).toEqual([['renameddb', 'Москва', root.entry]]);

        renameDataset.mockClear();
        await type('Moskva 2');
        await confirm();
        expect(renameDataset).toHaveBeenCalledExactlyOnceWith('Moskva 2');
        expect(renameEntry).not.toHaveBeenCalled();
    });

    // The slug is made of the name: a slug that is taken shows at the name field, and the dialog keeps the typed name
    it('shows a slug the Registry refuses for the dataset root at the name field, and stays open', async () => {
        const root = { label: 'My survey', entry: { path: '', type: T.DRONEDB } };
        const renameDataset = vi.fn().mockRejectedValueOnce(
            new ApiError("Dataset 'survey-b' already exists", 400, { errors: { slug: ["Dataset 'survey-b' already exists"] } }));
        await render({ file: root, allEntries: [], siblings: [], renameDataset });
        await type('Survey B');
        await confirm();
        expect(error().text()).toBe("Dataset 'survey-b' already exists");
        expect(input().attributes('aria-invalid')).toBe('true');
        expect(input().element.value).toBe('Survey B');
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.find('.form-error').exists()).toBe(false);

        renameDataset.mockRejectedValueOnce(new ApiError('Conflict', 409));
        await type('Survey C');
        await confirm();
        expect(error().text()).toBe('Conflict');
        expect(wrapper.emitted('close')).toBeUndefined();
    });
});
