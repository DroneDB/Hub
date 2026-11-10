/**
 * The Users table on a phone and a tablet (D-026, FR-ADM-18, FR-ORG-18): one stacked card per row from the
 * shared renderer with every field labelled, e-mail, roles and storage kept from `sm` up, the search field
 * that clears (button, Escape), and the empty state that names the query.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ admin: {}, features: { value: () => null, get: () => false } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: UsersPage } = await import('./UsersPage.vue');

const USERS = [
    { userName: 'alice', email: 'alice@example.com', roles: ['editor'], organizationCount: 2, datasetCount: 5, storageUsed: 1024, storageQuota: 0, createdDate: '2026-01-02T00:00:00Z' },
    { userName: 'bob', email: 'bob@example.com', roles: [], organizationCount: 0, datasetCount: 0, storageUsed: 0, storageQuota: 0, createdDate: '2026-01-03T00:00:00Z' }
];

let wrapper;
beforeEach(() => {
    reg.admin.usersDetailed = vi.fn(() => Promise.resolve(USERS.map(u => ({ ...u }))));
    reg.admin.userRoles = () => Promise.resolve(['editor']);
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

/** The window is a phone (below sm) or wider, as the media query of the card renderer says */
function screenIsPhone(matches) {
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
        matches: query === '(max-width: 575.98px)' ? matches : false, media: query,
        addEventListener: () => {}, removeEventListener: () => {}
    }));
}
const sortableTabIndexes = () => wrapper.findAll('thead th').filter(th => th.attributes('data-p-sortable-column') === 'true')
    .map(th => th.attributes('tabindex'));

async function render() {
    wrapper = mount(UsersPage, { attachTo: document.body, global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() } } } });
    await flushPromises();
}
const stackClasses = el => el.classes().filter(c => c.startsWith('stack-col')).join(' ');

describe('UsersPage as stacked cards', () => {
    it('is a stacked table whose cells all have the label that the card prints', async () => {
        await render();
        expect(wrapper.find('.p-datatable').classes()).toContain('stacked-table');
        const labels = wrapper.find('tbody tr').findAll('td').map(td => td.attributes('data-label') ?? null);
        // The first cell is the checkbox of the row (FR-ADM-23)
        expect(labels).toEqual([null, null, 'Email', 'Roles', 'Organizations', 'Datasets', 'Storage', 'Created', null]);
    });

    it('shows e-mail, roles and storage from sm up, in the card and in the row (FR-ADM-18)', async () => {
        await render();
        const classes = wrapper.find('tbody tr').findAll('td').map(stackClasses);
        expect(classes).toEqual(['stack-col', 'stack-col', 'stack-col', 'stack-col', 'stack-col stack-col-md', 'stack-col stack-col-lg', 'stack-col', 'stack-col stack-col-xl', 'stack-col']);
        // The header hides with its column
        expect(wrapper.findAll('thead th').map(stackClasses)).toEqual(classes);
        // Nothing is hidden outright any more
        expect(wrapper.find('.d-none').exists()).toBe(false);
    });

    it('searches with the shared field: its x and Escape clear the query and the list is whole again', async () => {
        await render();
        const field = wrapper.findComponent({ name: 'SearchField' });
        expect(field.props('label')).toBe('Search users');
        await field.find('input').setValue('zzz');
        expect(wrapper.findAll('tbody tr').length).toBe(1);
        expect(wrapper.find('.empty-state h3').text()).toBe('No users match "zzz"');
        await wrapper.find('.empty-state button').trigger('click');
        expect(wrapper.findAll('tbody tr').map(r => r.find('strong').text())).toEqual(['alice', 'bob']);
        await field.find('input').setValue('bob');
        await field.find('input').trigger('keydown', { key: 'Escape' });
        expect(wrapper.findAll('tbody tr').length).toBe(2);
    });

    it('gives the focus back to the search field when Clear search leaves with the empty state', async () => {
        await render();
        const input = wrapper.findComponent({ name: 'SearchField' }).find('input');
        await input.setValue('zzz');
        const clear = wrapper.find('.empty-state button');
        clear.element.focus();
        await clear.trigger('click');
        expect(wrapper.find('.empty-state').exists()).toBe(false);
        expect(document.activeElement).toBe(input.element);
    });

    it('takes the sortable headers out of the tab order on a phone, where the header is hidden', async () => {
        screenIsPhone(true);
        await render();
        expect(sortableTabIndexes()).toEqual(['-1', '-1', '-1', '-1', '-1', '-1']);
    });

    it('keeps the sortable headers in the tab order from sm up', async () => {
        screenIsPhone(false);
        await render();
        expect(sortableTabIndexes()).toEqual(['0', '0', '0', '0', '0', '0']);
    });
});
