/**
 * The organization list of Organization Management (FR-ADM-11, FR-ORG-18, FR-ORG-13, D-026): stacked cards below
 * `sm`, an Actions cell that keeps its buttons on one line, slugs that wrap only after a hyphen, a list that
 * scrolls in its own area, the shared search field and the empty state that names the query.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ orgs: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationManagementDialog } = await import('./OrganizationManagementDialog.vue');

const ORGS = [
    { slug: 'public', name: 'Public', description: 'Everyone' },
    { slug: 'long-organization-name-2', name: 'Long organization', description: '' }
];
let wrapper;

async function render(orgs = ORGS) {
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve(orgs.map(org => ({ org }))));
    wrapper = mount(OrganizationManagementDialog, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() } } }
    });
    await flushPromises();
}
const q = sel => document.body.querySelector(sel);

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('OrganizationManagementDialog list', () => {
    it('is stacked cards below sm, with a label on each field', async () => {
        await render();
        expect(q('table.ui.table').classList.contains('stacked-table')).toBe(true);
        const row = q('tbody tr');
        expect([...row.querySelectorAll('td')].map(td => td.getAttribute('data-label'))).toEqual([null, 'Slug', 'Description', null]);
    });

    it('keeps the label of the Delete button on one line: the actions cell is the one that does not wrap', async () => {
        await render();
        const actions = q('tbody tr td:last-child');
        expect(actions.classList.contains('cell-actions')).toBe(true);
        expect(actions.querySelector('button').textContent.trim()).toBe('Delete');
    });

    it('breaks a slug only after a hyphen, with a <wbr>, and not inside a word', async () => {
        await render();
        const slug = q('tbody tr:nth-child(2) td.cell-slug code');
        expect(slug.textContent).toBe('long-organization-name-2');
        expect([...slug.childNodes].filter(n => n.nodeType !== 8).map(n => n.nodeName === 'WBR' ? '<wbr>' : n.textContent).join(''))
            .toBe('long-<wbr>organization-<wbr>name-<wbr>2');
    });

    it('scrolls the list in an area of its own, under a sticky header', async () => {
        await render();
        expect(q('.org-table-scroll table.ui.table')).not.toBeNull();
    });

    it('has the shared search field, and an empty state that names the query and clears it', async () => {
        await render();
        const field = wrapper.findComponent({ name: 'SearchField' });
        expect(field.props('label')).toBe('Search organizations');
        await field.find('input').setValue('nomatchxyz');
        expect(q('.empty-state h3').textContent).toBe('No organizations match "nomatchxyz"');
        expect(q('table')).toBeNull();
        q('.empty-state button').click();
        await flushPromises();
        expect(q('table')).not.toBeNull();
        expect(field.find('input').element.value).toBe('');
    });
});
