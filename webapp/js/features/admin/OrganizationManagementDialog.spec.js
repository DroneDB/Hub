/**
 * Admin > Organizations, delete (FR-ORG-03, AC-004): the shared wording, the organization by
 * name and slug with its datasets, Enter on open deletes nothing, and Delete waits for the slug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ orgs: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationManagementDialog } = await import('./OrganizationManagementDialog.vue');

let wrapper;
beforeEach(() => {
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([{ org: { slug: 'acme', name: 'Acme <Corp>', datasetCount: 2 } }]));
    reg.orgs.deleteOrganization = vi.fn(() => Promise.resolve());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function openDelete() {
    wrapper = mount(OrganizationManagementDialog, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() } } }
    });
    await flushPromises();
    [...document.querySelectorAll('button')].find(b => b.title === 'Delete Organization').click();
    await flushPromises();
    await wrapper.findAllComponents(Dialog).at(-1).vm.$emit('show');
}
const dialog = () => document.getElementById('confirmDialog');
const deleteButton = () => dialog().querySelector('[data-confirm]');
const enter = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
async function type(value) {
    const input = dialog().querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
}

describe('OrganizationManagementDialog delete', () => {
    it('names the organization (escaped) with its slug and datasets, with Delete / Cancel', async () => {
        await openDelete();
        expect(dialog().querySelector('.p-dialog-title').textContent).toBe('Delete organization “Acme <Corp>”');
        expect(dialog().textContent).toContain('Acme <Corp> (acme)');
        expect(dialog().textContent).toContain('2 datasets');
        expect(deleteButton().textContent).toContain('Delete');
        expect(dialog().querySelector('[data-cancel]').textContent).toContain('Cancel');
    });

    it('Enter on open deletes nothing, and Delete stays disabled until the slug is typed', async () => {
        await openDelete();
        const input = document.activeElement;
        expect(input.tagName).toBe('INPUT');
        enter(input);
        deleteButton().click();
        await type('Acme <Corp>');
        enter(input);
        await flushPromises();
        expect(deleteButton().disabled).toBe(true);
        expect(reg.orgs.deleteOrganization).not.toHaveBeenCalled();

        await type('acme');
        deleteButton().click();
        await flushPromises();
        expect(reg.orgs.deleteOrganization).toHaveBeenCalledWith('acme');
    });
});
