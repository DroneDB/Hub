/**
 * The organization select of Manage User Organizations (FR-ADM-10, FR-XC-20): it filters, with a placeholder
 * and a name for the filter field, and sets no width of its own list (the one global rule does).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';

const reg = vi.hoisted(() => ({ admin: {}, orgs: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsDialog } = await import('./OrganizationsDialog.vue');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function render() {
    reg.admin.getUserOrganizations = vi.fn(() => Promise.resolve([{ slug: 'acme', name: 'Acme', permissions: 1, grantedAt: '2026-01-02T00:00:00Z' }]));
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([{ org: { slug: 't-admin-long', name: 'x'.repeat(200) } }]));
    wrapper = mount(OrganizationsDialog, { props: { user: { userName: 'alice' } }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
}

describe('OrganizationsDialog organization select', () => {
    it('searches the organizations: filter on, a placeholder and an accessible name for the filter field', async () => {
        await render();
        const select = wrapper.findAllComponents(Select)[0];
        expect(select.props('filter')).toBe(true);
        expect(select.props('filterPlaceholder')).toBe('Search organizations');
        await select.find('.p-select-label').trigger('click');
        await flushPromises();
        const filter = document.querySelector('.p-select-overlay input[role="searchbox"]');
        expect(filter.getAttribute('placeholder')).toBe('Search organizations');
        expect(filter.getAttribute('aria-label')).toBe('Search organizations');
    });

    it('sets no width of its own on the list (the global overlay rule does)', async () => {
        await render();
        const select = wrapper.findAllComponents(Select)[0];
        expect(select.props('overlayStyle')).toBeNull();
        expect(select.props('overlayClass')).toBeNull();
    });

    it('has the stacked cards for its table too', async () => {
        await render();
        const table = document.querySelector('table.ui.table');
        expect(table.classList.contains('stacked-table')).toBe(true);
        expect([...table.querySelectorAll('tbody tr td')].map(td => td.getAttribute('data-label'))).toEqual([null, 'Permissions', 'Granted', null]);
    });
});
