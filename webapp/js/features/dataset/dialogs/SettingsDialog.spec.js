/**
 * The Settings window of a dataset (FR-EXP-24): General has the name (saved as the `name` metadata: the URL does not change
 * with it), the URL slug (a new one warns that links stop working, checks the slug rules, and renames the dataset) and, with
 * a README, buttons that open it in its viewer and in the editor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import SettingsDialog from './SettingsDialog.vue';

const WindowStub = { template: '<div><slot /><slot name="footer" /></div>' };
const notify = { success: vi.fn(), error: vi.fn() };

const ROOT = {
    path: 'acme/site',
    properties: {
        readme: 'README.md',
        meta: { name: { id: 'x', data: 'Brighton Beach' }, tagline: { id: 'y', data: 'Shore' }, visibility: { id: 'z', data: 1 }, license: { id: 'w', data: 'CC-BY-4.0' } }
    }
};

let wrapper;
let dataset;
async function render({ canWrite = true, root = ROOT, confirmSlugChange = undefined } = {}) {
    dataset = {
        org: 'acme', ds: 'site', info: vi.fn().mockResolvedValue([root]),
        metaSet: vi.fn().mockResolvedValue({}), metaUnset: vi.fn().mockResolvedValue({}),
        rename: vi.fn().mockResolvedValue({ slug: 'new-site' }), datasetThumbUrl: () => '/thumb'
    };
    wrapper = mount(SettingsDialog, {
        props: { dataset, canWrite, confirmSlugChange },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub }, mocks: { $notify: notify } }
    });
    await flushPromises();
}
const name = () => wrapper.find('#settings-name');
const slug = () => wrapper.find('#settings-slug');
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('SettingsDialog name', () => {
    it('shows the display name of the dataset', async () => {
        await render();
        expect(name().element.value).toBe('Brighton Beach');
    });

    it('saves the name through metaSet("name"), trimmed, and tells the page', async () => {
        await render();
        await name().setValue('  Brighton Pier  ');
        await name().trigger('change');
        await flushPromises();

        expect(dataset.metaSet).toHaveBeenCalledWith('name', 'Brighton Pier');
        expect(dataset.rename).not.toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalledWith('Dataset name updated successfully', { summary: 'Name Updated' });
        expect(wrapper.emitted('changed')).toHaveLength(1);
        expect(name().element.value).toBe('Brighton Pier');
    });

    it('refuses an empty name at the field and sends nothing', async () => {
        await render();
        await name().setValue('   ');
        await name().trigger('change');
        await flushPromises();

        expect(dataset.metaSet).not.toHaveBeenCalled();
        expect(wrapper.find('#settings-name-error').text()).toBe('Enter a name');
        expect(name().attributes('aria-invalid')).toBe('true');
    });

    it('shows the refusal of the Registry at the field', async () => {
        await render();
        dataset.metaSet.mockRejectedValue(new Error('The name is too long: use 1 to 256 characters'));
        await name().setValue('Another');
        await name().trigger('change');
        await flushPromises();

        expect(wrapper.find('#settings-name-error').text()).toBe('The name is too long: use 1 to 256 characters');
    });

    it('does not send a name that did not change', async () => {
        await render();
        await name().trigger('change');
        await flushPromises();
        expect(dataset.metaSet).not.toHaveBeenCalled();
    });

    it('is not offered to a reader', async () => {
        await render({ canWrite: false });
        expect(name().exists()).toBe(false);
    });
});

describe('SettingsDialog URL slug', () => {
    it('starts with the slug of the dataset and no warning', async () => {
        await render();
        expect(slug().element.value).toBe('site');
        expect(wrapper.find('.slug-warning').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('Change URL');
    });

    it('warns that the links will change as soon as the slug differs', async () => {
        await render();
        await slug().setValue('new-site');
        expect(wrapper.find('.slug-warning').text()).toBe('Links to /r/acme/site will stop working');
        expect(wrapper.text()).toContain('/r/acme/new-site');
    });

    it('refuses a slug that breaks the slug rules at the field, with the rule of the Registry, and sends nothing', async () => {
        await render();
        await slug().setValue('New Site');
        await wrapper.findAll('button').find(b => b.text() === 'Change URL').trigger('click');
        await flushPromises();

        expect(dataset.rename).not.toHaveBeenCalled();
        expect(wrapper.find('#settings-slug-error').text()).toBe(
            "Dataset slug is invalid: it has 2 to 128 characters (lowercase letters, digits, '_' and '-'), starts with a letter or digit and has no '--'");
    });

    it('renames the dataset and tells the page the new slug', async () => {
        await render();
        await slug().setValue('new-site');
        await wrapper.findAll('button').find(b => b.text() === 'Change URL').trigger('click');
        await flushPromises();

        expect(dataset.rename).toHaveBeenCalledWith('new-site');
        expect(wrapper.emitted('slugRenamed')).toEqual([['new-site']]);
    });

    it('asks the page before it renames, and keeps the dataset when the page says no', async () => {
        const confirmSlugChange = vi.fn().mockResolvedValue(false);
        await render({ confirmSlugChange });
        await slug().setValue('new-site');
        await wrapper.findAll('button').find(b => b.text() === 'Change URL').trigger('click');
        await flushPromises();

        expect(confirmSlugChange).toHaveBeenCalledTimes(1);
        expect(dataset.rename).not.toHaveBeenCalled();
        expect(wrapper.emitted('slugRenamed')).toBeUndefined();
    });

    it('renames when the page agrees', async () => {
        const confirmSlugChange = vi.fn().mockResolvedValue(true);
        await render({ confirmSlugChange });
        await slug().setValue('new-site');
        await wrapper.findAll('button').find(b => b.text() === 'Change URL').trigger('click');
        await flushPromises();

        expect(dataset.rename).toHaveBeenCalledWith('new-site');
        expect(wrapper.emitted('slugRenamed')).toEqual([['new-site']]);
    });

    it('shows a slug that is taken, as the Registry says it, at the field', async () => {
        await render();
        dataset.rename.mockRejectedValue(new Error('A dataset with this slug already exists'));
        await slug().setValue('taken');
        await wrapper.findAll('button').find(b => b.text() === 'Change URL').trigger('click');
        await flushPromises();

        expect(wrapper.find('#settings-slug-error').text()).toBe('A dataset with this slug already exists');
        expect(wrapper.emitted('slugRenamed')).toBeUndefined();
    });
});

describe('SettingsDialog README', () => {
    it('opens it in its viewer and in the editor from buttons', async () => {
        await render();
        const buttons = wrapper.findAll('button');
        await buttons.find(b => b.text() === 'Open').trigger('click');
        await buttons.find(b => b.text() === 'Edit').trigger('click');

        expect(wrapper.emitted('openReadme')).toEqual([['README.md']]);
        expect(wrapper.emitted('editReadme')).toEqual([['README.md']]);
    });

    it('offers Add Readme to a dataset that has none', async () => {
        await render({ root: { path: 'acme/site', properties: { meta: {} } } });
        expect(wrapper.text()).toContain('Add Readme');
        expect(wrapper.findAll('button').some(b => b.text() === 'Open')).toBe(false);
    });
});
