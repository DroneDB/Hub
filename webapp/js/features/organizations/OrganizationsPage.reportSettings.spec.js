/**
 * The Report settings button of an organization card: every member of the organization has it, a visitor of a public
 * organization does not, and the dialog it opens is editable for an administrator of the organization (or of the
 * instance) and read-only for the other members.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    admin: false,
    isAdmin: () => reg.admin,
    getUsername: () => 'ann',
    features: { get: () => false },
    orgs: { getOrganizations: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsPage } = await import('./OrganizationsPage.vue');

const permissions = (canWrite, canManageMembers) => ({ canRead: true, canWrite, canDelete: false, canManageMembers });
const ORGS = [
    { slug: 'owned', name: 'Owned', owner: 'ann', isPublic: false, datasetCount: 2, permissions: permissions(true, true) },
    { slug: 'admin-member', name: 'Admin member', owner: 'bob', isPublic: false, datasetCount: 1, permissions: permissions(true, true) },
    { slug: 'reader', name: 'Reader', owner: 'bob', isPublic: false, datasetCount: 3, permissions: permissions(false, false) },
    { slug: 'visited', name: 'Visited', owner: 'bob', isPublic: true, permissions: permissions(false, false) }
];

let wrapper;

async function render({ readOnlyOrgs = false } = {}) {
    globalThis.HubOptions = { readOnlyOrgs };
    localStorage.clear();
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve(ORGS.map(org => ({ org }))));
    wrapper = mount(OrganizationsPage, {
        global: {
            plugins: [PrimeVue],
            mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn() } },
            stubs: {
                OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, Paginator: true,
                ReportSettingsDialog: { name: 'ReportSettingsDialog', props: ['orgSlug', 'canEdit'], template: '<div data-test="report-dialog" :data-org="orgSlug" :data-can-edit="String(canEdit)" />' },
                RouterLink: { template: '<a><slot /></a>' }
            }
        }
    });
    await flushPromises();
}
const card = slug => wrapper.findAll('.org-row').find(c => c.text().includes(slug));
const reportButton = slug => card(slug).find('button[aria-label="Report settings"]');
async function open(slug) {
    await reportButton(slug).trigger('click');
    return wrapper.find('[data-test="report-dialog"]');
}

beforeEach(() => { reg.admin = false; });
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    localStorage.clear();
});

describe('OrganizationsPage: Report settings', () => {
    it('is on the card of each organization the user is a member of, and not on a public one they only visit', async () => {
        await render();
        expect(reportButton('Owned').exists()).toBe(true);
        expect(reportButton('Admin member').exists()).toBe(true);
        expect(reportButton('Reader').exists()).toBe(true);
        expect(reportButton('Visited').exists()).toBe(false);
    });

    it('opens editable for an administrator of the organization', async () => {
        await render();
        const dialog = await open('Admin member');
        expect(dialog.attributes('data-org')).toBe('admin-member');
        expect(dialog.attributes('data-can-edit')).toBe('true');
    });

    it('opens read-only for a member who does not administer it', async () => {
        await render();
        const dialog = await open('Reader');
        expect(dialog.attributes('data-can-edit')).toBe('false');
    });

    it('is editable for an administrator of the instance, in any organization they can see', async () => {
        reg.admin = true;
        await render();
        expect(reportButton('Visited').exists()).toBe(true);
        expect((await open('Visited')).attributes('data-can-edit')).toBe('true');
    });

    it('is read-only when the organizations are read-only, and closes with the dialog', async () => {
        await render({ readOnlyOrgs: true });
        const dialog = await open('Owned');
        expect(dialog.attributes('data-can-edit')).toBe('false');
        wrapper.findComponent({ name: 'ReportSettingsDialog' }).vm.$emit('close');
        await flushPromises();
        expect(wrapper.find('[data-test="report-dialog"]').exists()).toBe(false);
    });
});
