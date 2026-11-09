/**
 * The create and edit dialogs of a dataset and an organization word their titles and buttons
 * alike: "Create dataset" / "Create organization", "Edit <display name>", Cancel.
 */
import { describe, it, expect, afterEach } from 'vitest';
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
        ['a new dataset', DatasetDialog, { mode: 'new' }, 'Create dataset', ['Cancel', 'Create']],
        ['a dataset', DatasetDialog, { mode: 'edit', model: { slug: 'survey-2026', name: 'Survey 2026' } }, 'Edit Survey 2026', ['Cancel', 'Save']],
        ['a dataset without a name', DatasetDialog, { mode: 'edit', model: { slug: 'survey-2026', name: '' } }, 'Edit survey-2026', ['Cancel', 'Save']],
        ['a new organization', OrganizationDialog, { mode: 'new' }, 'Create organization', ['Cancel', 'Create']],
        ['an organization', OrganizationDialog, { mode: 'edit', model: { slug: 'acme', name: 'Acme Corp', description: '', isPublic: false } }, 'Edit Acme Corp', ['Cancel', 'Save']]
    ])('%s', async (_, component, props, title, buttons) => {
        expect(await render(component, props)).toEqual({ title, buttons });
    });
});
