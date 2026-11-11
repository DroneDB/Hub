/**
 * The organization page on a phone (FR-ORG-20): the private lock is on the line of the name, before it (one
 * `.ds-name-line`), so it never wraps alone; the header tags are a group on their own line under the title below `sm`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ isAdmin: () => false, isLoggedIn: () => true, features: { get: () => false }, Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));
const { default: DatasetsPage } = await import('./DatasetsPage.vue');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

const dataset = (slug, visibility) => ({
    slug, creationDate: '2026-01-01T00:00:00Z', size: 1, permissions: { canRead: true },
    properties: { entries: 2, meta: { name: { data: `Bulk dataset ${slug}` }, ...(visibility === undefined ? {} : { visibility: { data: visibility } }) } }
});

async function render() {
    globalThis.HubOptions = {};
    localStorage.clear();
    reg.Organization = vi.fn(() => ({
        info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: {} }),
        datasetsPage: () => Promise.resolve({ items: [dataset('private-one'), dataset('public-one', 2)], total: 2 })
    }));
    wrapper = mount(DatasetsPage, {
        global: {
            plugins: [PrimeVue],
            components: { RouterLink: RouterLinkStub },
            mocks: { $route: { params: { org: 'org' } }, $router: { push: vi.fn() } },
            stubs: { DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
        }
    });
    await flushPromises();
}

describe('the dataset name and its private lock', () => {
    it('are in one .ds-name-line, the lock first', async () => {
        await render();
        const lines = wrapper.findAll('.ds-name-line');
        expect(lines).toHaveLength(2);
        const children = [...lines[0].element.children];
        expect(children.map(c => c.tagName.toLowerCase() === 'i' ? 'lock' : 'name')).toEqual(['lock', 'name']);
        expect(children[0].getAttribute('aria-label')).toBe('Private');
        expect(children[1].textContent.trim()).toBe('Bulk dataset private-one');
        // a public dataset has no lock
        expect([...lines[1].element.children].map(c => c.tagName.toLowerCase())).not.toContain('i');
    });
});

describe('the styles of the dataset name line and the header tags', () => {
    const sfc = fs.readFileSync(path.resolve(__dirname, 'DatasetsPage.vue'), 'utf8');

    it('lays the lock and the name out on one baseline, with the small gap between them', () => {
        expect(sfc).toMatch(/\.ds-name-line \{\s*display: inline-flex;\s*align-items: baseline;\s*gap: var\(--ddb-spacing-xs\);\s*\}/);
    });

    it('gives the header tags the whole line below sm, so they wrap as a group under the title', () => {
        const phone = sfc.slice(sfc.indexOf('@media screen and (max-width: 575.98px) {\n        /* The tags'));
        expect(phone.slice(0, 400)).toMatch(/\.org-header \.org-tags \{\s*flex-basis: 100%;/);
    });
});
