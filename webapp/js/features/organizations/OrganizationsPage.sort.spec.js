/**
 * The organisations page sorts the whole list in the browser before it pages it, shows when an
 * organization was last modified and how many datasets it holds (nothing for an organization
 * the server does not tell it for), and adds a created organization from the server's answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    getUsername: () => 'ann',
    features: { get: () => false },
    orgs: { getOrganizations: null, createOrganization: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsPage } = await import('./OrganizationsPage.vue');
const { PREF, _resetPrefListenersForTests } = await import('@/libs/preferences');

const dto = (slug, extra = {}) => ({
    slug, name: slug, description: '', owner: 'zed', isPublic: false, permissions: { canRead: true },
    creationDate: '2026-01-01T00:00:00Z', lastModified: null, datasetCount: null, ...extra
});
const answer = list => Promise.resolve(list.map(org => ({ org })));

let wrapper;
beforeEach(() => {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    reg.orgs.getOrganizations = vi.fn(() => answer([]));
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    _resetPrefListenersForTests();
});

const notify = { error: vi.fn(), success: vi.fn() };
async function render() {
    wrapper = mount(OrganizationsPage, {
        global: {
            plugins: [PrimeVue],
            mocks: { $router: { push: vi.fn() }, $notify: notify },
            stubs: {
                OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true,
                Paginator: true, RouterLink: { props: ['to'], template: '<a><slot /></a>' }
            }
        }
    });
    await flushPromises();
}
const shown = () => wrapper.findAll('.org-name').map(a => a.text());
const stats = () => wrapper.findAll('.org-card-stats').map(s => s.text());

describe('OrganizationsPage sort', () => {
    it('lists by name, ascending, by default', async () => {
        reg.orgs.getOrganizations = vi.fn(() => answer([dto('b', { name: 'Client 10' }), dto('a', { name: 'client 2' }), dto('c', { name: 'Árbol' })]));
        await render();
        expect(shown()).toEqual(['Árbol', 'client 2', 'Client 10']);
    });

    it('sorts the whole list before it pages it', async () => {
        const list = Array.from({ length: 12 }, (_, i) => dto(`o${String(i).padStart(2, '0')}`, { datasetCount: i }));
        reg.orgs.getOrganizations = vi.fn(() => answer(list));
        await render();
        expect(shown()).toHaveLength(10);
        wrapper.vm.sortColumn = 'datasetCount';
        wrapper.vm.sortDirection = 'desc';
        await flushPromises();
        expect(shown()[0]).toBe('o11');
        expect(shown()).toHaveLength(10);
    });

    it('starts from the stored sort and sorts the unknown last in both directions', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ sortColumn: 'lastModified', sortDirection: 'desc' }));
        reg.orgs.getOrganizations = vi.fn(() => answer([
            dto('none'), dto('old', { lastModified: '2026-01-01T00:00:00Z' }), dto('new', { lastModified: '2026-06-01T00:00:00Z' })
        ]));
        await render();
        expect(shown()).toEqual(['new', 'old', 'none']);
        wrapper.vm.sortDirection = 'asc';
        await flushPromises();
        expect(shown()).toEqual(['old', 'new', 'none']);
    });

    it('sorts what the search leaves', async () => {
        reg.orgs.getOrganizations = vi.fn(() => answer([dto('beta'), dto('alpha'), dto('other')]));
        await render();
        wrapper.vm.searchQuery = 'a';
        wrapper.vm.sortDirection = 'desc';
        await flushPromises();
        expect(shown()).toEqual(['beta', 'alpha']);
    });

    it('has the sort controls in the toolbar above the list, not in the header actions', async () => {
        await render();
        expect(wrapper.find('.list-toolbar .sort-select').exists()).toBe(true);
        expect(wrapper.find('.org-actions .sort-select').exists()).toBe(false);
    });
});

describe('OrganizationsPage cards', () => {
    it('shows the dataset count and when the organization was modified, and nothing for an unknown value', async () => {
        reg.orgs.getOrganizations = vi.fn(() => answer([
            dto('a', { datasetCount: 3, lastModified: new Date(Date.now() - 2 * 86400000).toISOString() }),
            dto('b', { datasetCount: 1 }),
            dto('c', { datasetCount: 0 }),
            dto('d')
        ]));
        await render();
        expect(stats()).toEqual(['3 datasets·Modified 2 days ago', '1 dataset', '0 datasets']);
        expect(wrapper.findAll('.org-card')).toHaveLength(4);
    });
});

describe('OrganizationsPage create', () => {
    async function create(created) {
        reg.orgs.createOrganization = vi.fn(() => Promise.resolve(created));
        wrapper.vm.orgDialogMode = 'new';
        await wrapper.vm.saveOrganization({ slug: created.slug, name: created.name, description: '', isPublic: false });
        await flushPromises();
    }

    it('adds the organization the server returned, with its dates, and sorts it by them', async () => {
        reg.orgs.getOrganizations = vi.fn(() => answer([dto('old', { lastModified: '2026-01-01T00:00:00Z' })]));
        await render();
        wrapper.vm.sortColumn = 'lastModified';
        wrapper.vm.sortDirection = 'desc';
        await create(dto('fresh', { creationDate: '2026-06-01T00:00:00Z', lastModified: '2026-06-01T00:00:00Z', datasetCount: 0, permissions: undefined }));
        expect(shown()).toEqual(['fresh', 'old']);
        const added = wrapper.vm.organizations.find(o => o.slug === 'fresh');
        expect(added.creationDate).toBe(Date.parse('2026-06-01T00:00:00Z'));
        expect(added.lastModified).toBe(Date.parse('2026-06-01T00:00:00Z'));
        expect(added.datasetCount).toBe(0);
        expect(added.permissions).toEqual({ canRead: true, canWrite: true, canDelete: true, canManageMembers: true });
        expect(stats()[0]).toContain('0 datasets');
    });

    it('uses the permissions and owner of the answer when it has them', async () => {
        await render();
        await create(dto('fresh', { owner: '', permissions: { canRead: true } }));
        const added = wrapper.vm.organizations[0];
        expect(added.permissions).toEqual({ canRead: true });
        expect(added.owner).toBe('ann');
    });
});

// FR-ORG-04: the dialog closed on a failed create and the typed name was lost; now it stays open at the field
describe('OrganizationsPage create with a failure', () => {
    const WindowStub = {
        props: ['busy', 'confirmLabel'],
        emits: ['confirm', 'close'],
        template: '<div><slot /><button type="button" data-confirm @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
    };
    const mountWithDialog = async list => {
        reg.orgs.getOrganizations = vi.fn(() => answer(list));
        wrapper = mount(OrganizationsPage, {
            attachTo: document.body,
            global: {
                plugins: [PrimeVue],
                mocks: { $router: { push: vi.fn() }, $notify: notify },
                stubs: {
                    OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true,
                    Window: WindowStub, RouterLink: { props: ['to'], template: '<a><slot /></a>' }
                }
            }
        });
        await flushPromises();
        wrapper.vm.handleNew();
        await flushPromises();
    };
    const type = async (name, value) => { await wrapper.find(`[name="${name}"]`).setValue(value); await flushPromises(); };
    const create = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
    afterEach(() => { notify.error.mockClear(); notify.success.mockClear(); });

    it('keeps the dialog open with the typed values and shows the error at the field the Registry names', async () => {
        await mountWithDialog([dto('other')]);
        reg.orgs.createOrganization = vi.fn(() => Promise.reject(Object.assign(new Error('The organization already exists'), {
            status: 409, errors: { slug: ['The organization already exists'] }
        })));
        await type('name', 'Hidden Team');
        await type('description', 'What I typed');
        await create();

        expect(reg.orgs.createOrganization).toHaveBeenCalledExactlyOnceWith({ slug: 'hidden-team', name: 'Hidden Team', description: 'What I typed', isPublic: false });
        expect(wrapper.vm.orgDialogOpen).toBe(true);
        expect(wrapper.find('#organization-dialog-slug-error').text()).toBe('The organization already exists');
        expect(wrapper.find('[name="name"]').element.value).toBe('Hidden Team');
        expect(wrapper.find('[name="description"]').element.value).toBe('What I typed');
        expect(notify.error).not.toHaveBeenCalled();
        expect(wrapper.vm.organizations.map(o => o.slug)).toEqual(['other']);
        expect(wrapper.vm.creatingOrganization).toBe(false);
    });

    it('sends no request for the slug of an organization of the list, and says so at the slug field', async () => {
        await mountWithDialog([dto('survey-team', { name: 'Survey Team' })]);
        reg.orgs.createOrganization = vi.fn();
        await type('name', 'Survey Team');
        await create();

        expect(reg.orgs.createOrganization).not.toHaveBeenCalled();
        expect(wrapper.find('#organization-dialog-slug-error').text()).toBe('An organization with this slug already exists');
        expect(wrapper.vm.orgDialogOpen).toBe(true);
    });

    it('closes the dialog and adds the organization when the create goes through', async () => {
        await mountWithDialog([dto('other')]);
        reg.orgs.createOrganization = vi.fn(() => Promise.resolve(dto('new-team', { name: 'New Team', owner: 'ann' })));
        await type('name', 'New Team');
        await create();

        expect(wrapper.vm.orgDialogOpen).toBe(false);
        expect(wrapper.vm.organizations.map(o => o.slug)).toEqual(['other', 'new-team']);
        expect(notify.success).toHaveBeenCalledWith('Organization created successfully', { summary: 'Organization Created' });
    });
});
