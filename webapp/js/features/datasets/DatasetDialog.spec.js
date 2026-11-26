/**
 * The create and edit dialogs of a dataset and an organization word their titles and buttons
 * alike: "Create dataset" / "Create organization", "Edit <display name>", Cancel.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import DatasetDialog from './DatasetDialog.vue';
import OrganizationDialog from '@/features/organizations/OrganizationDialog.vue';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function render(component, props) {
    wrapper = mount(component, { props, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    const dialog = document.querySelector('.p-dialog');
    return {
        title: dialog.querySelector('.p-dialog-title').textContent.trim(),
        buttons: [...dialog.querySelectorAll('.window-footer button')].map(b => b.textContent.trim())
    };
}

describe('Dataset and organization dialogs', () => {
    it.each([
        ['a new dataset', DatasetDialog, { mode: 'new', save: () => {} }, 'Create dataset', ['Cancel', 'Create']],
        ['a dataset', DatasetDialog, { mode: 'edit', save: () => {}, model: { slug: 'survey-2026', name: 'Survey 2026' } }, 'Edit Survey 2026', ['Cancel', 'Save']],
        ['a dataset without a name', DatasetDialog, { mode: 'edit', save: () => {}, model: { slug: 'survey-2026', name: '' } }, 'Edit survey-2026', ['Cancel', 'Save']],
        ['a new organization', OrganizationDialog, { mode: 'new', save: () => {} }, 'Create organization', ['Cancel', 'Create']],
        ['an organization', OrganizationDialog, { mode: 'edit', save: () => {}, model: { slug: 'acme', name: 'Acme Corp', description: '', isPublic: false } }, 'Edit Acme Corp', ['Cancel', 'Save']]
    ])('%s', async (_, component, props, title, buttons) => {
        expect(await render(component, props)).toEqual({ title, buttons });
    });
});

describe('The thumbnail of a dataset in its Edit dialog', () => {
    const editedDataset = { thumbUrl: (path, size) => `/thumb?path=${path}&size=${size}`, search: async () => [] };

    it('shows the cover of the dataset, and is not in the Create dialog', async () => {
        await render(DatasetDialog, { mode: 'edit', save: () => {}, editedDataset, model: { slug: 's', name: 'S', thumbnailUrl: '/cover' } });
        expect(document.querySelector('#dataset-dialog-thumbnail-label').textContent).toBe('Thumbnail');
        expect(document.querySelector('.cover-preview').getAttribute('src')).toBe('/cover');
        wrapper.unmount();
        document.body.innerHTML = '';

        await render(DatasetDialog, { mode: 'new', save: () => {} });
        expect(document.querySelector('#dataset-dialog-thumbnail-label')).toBeNull();
    });

    it('sends the cover the user chose with Save, and none when it stays', async () => {
        const save = vi.fn(async () => {});
        await render(DatasetDialog, { mode: 'edit', save, editedDataset, model: { slug: 's', name: 'S', thumbnailUrl: null } });
        const saveButton = () => [...document.querySelectorAll('.window-footer button')].find(b => b.textContent.trim() === 'Save');

        saveButton().click();
        await flushPromises();
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ cover: null }));

        wrapper.vm.coverChange = { entryPath: 'odm/ortho.tif' };
        saveButton().click();
        await flushPromises();
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'S', cover: { entryPath: 'odm/ortho.tif' } }));
    });
});
