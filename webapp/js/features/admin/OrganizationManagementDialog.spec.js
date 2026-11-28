/**
 * Admin > Organizations, delete (FR-ORG-03, AC-004): the shared wording, the organization by
 * name and slug with its datasets, Enter on open deletes nothing, and Delete waits for the slug; no second delete while the
 * first runs. Create: the slug is the one the shared generator makes, and what it cannot accept is said before a request.
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

    it('keeps the question busy while the delete runs: a second click or Enter sends no second delete', async () => {
        let finish;
        reg.orgs.deleteOrganization = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        await openDelete();
        await type('acme');
        deleteButton().click();
        await flushPromises();
        expect(deleteButton().disabled).toBe(true);
        expect(dialog().querySelector('[data-cancel]').disabled).toBe(true);
        deleteButton().click();
        await wrapper.vm.deleteOrganization();
        expect(reg.orgs.deleteOrganization).toHaveBeenCalledTimes(1);
        finish();
        await flushPromises();
        expect(reg.orgs.deleteOrganization).toHaveBeenCalledTimes(1);
    });
});

describe('OrganizationManagementDialog create', () => {
    async function create(name) {
        reg.orgs.createOrganization = vi.fn(data => Promise.resolve(data));
        wrapper = mount(OrganizationManagementDialog, {
            attachTo: document.body,
            global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() } } }
        });
        await flushPromises();
        await wrapper.setData({ newOrgName: name });
        await wrapper.vm.createOrganization();
        await flushPromises();
    }

    it.each([
        ['Q', 'q0'],
        ['Société Générale', 'societe-generale'],
        ['Łódź', 'lodz']
    ])('makes the slug of "%s" with the generator of the other forms: %s', async (name, slug) => {
        await create(name);
        expect(reg.orgs.createOrganization).toHaveBeenCalledWith({ name, slug, description: undefined });
        expect(wrapper.vm.suggestedSlug).toBe('');
    });

    it('says that a slug that exists is taken, and sends nothing', async () => {
        await create('Acme');
        expect(reg.orgs.createOrganization).not.toHaveBeenCalled();
        expect(wrapper.vm.createError).toBe('An organization with this slug already exists');
    });

    it('says a name with no Latin letter or digit cannot make a slug, and sends nothing', async () => {
        await create('東京');
        expect(reg.orgs.createOrganization).not.toHaveBeenCalled();
        expect(wrapper.vm.createError).not.toBe('');
    });
});
