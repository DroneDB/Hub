/**
 * The Members dialog on a phone (D-026, FR-ORG-22, FR-XC-20): the table is stacked cards below `sm` from the shared
 * renderer, every cell carries the label of its card, the role select is full width, and Remove is an icon named
 * for the member (its label hides on a phone, the accessible name stays).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    features: { get: () => true },
    admin: {},
    getUsername: () => 'me',
    orgs: { getOrganizationMembers: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationMembersDialog } = await import('./OrganizationMembersDialog.vue');

let wrapper;
const MEMBERS = [
    { userName: 'me', email: 'me@example.com', permissions: 3, grantedAt: '2026-01-02T00:00:00Z', grantedBy: 'root' },
    { userName: 'bob', email: 'bob@example.com', permissions: 1, grantedAt: null }
];

async function render(canManageMembers = true) {
    reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve(MEMBERS.map(m => ({ ...m }))));
    wrapper = mount(OrganizationMembersDialog, {
        props: { orgSlug: 'acme', canManageMembers },
        attachTo: document.body,
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn() } } }
    });
    await flushPromises();
}
const table = () => document.body.querySelector('table.ui.table');
const cells = row => [...row.querySelectorAll('td')];

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('OrganizationMembersDialog as stacked cards', () => {
    it('is a stacked table', async () => {
        await render();
        expect(table().classList.contains('stacked-table')).toBe(true);
    });

    it('labels the cells of a card: name, e-mail, permissions, granted, and the actions without a label', async () => {
        await render();
        const row = table().querySelector('tbody tr');
        expect(cells(row).map(td => td.getAttribute('data-label'))).toEqual([null, 'Email', 'Permissions', 'Granted', null]);
    });

    it('keeps e-mail and granted for the table from sm up, where the card shows them on every phone too', async () => {
        await render();
        const stack = el => [...el.classList].filter(c => c.startsWith('stack-col')).join(' ');
        const row = table().querySelector('tbody tr');
        expect(cells(row).map(stack)).toEqual(['', 'stack-col', 'stack-col', 'stack-col', '']);
        expect([...table().querySelectorAll('thead th')].map(stack)).toEqual(['', 'stack-col', '', 'stack-col', '']);
        expect(table().querySelector('.d-none')).toBeNull();
    });

    it('has a Remove button per member named for it, which a phone shows as its icon', async () => {
        await render();
        const buttons = [...table().querySelectorAll('tbody button')];
        expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Remove me', 'Remove bob']);
        expect(buttons.every(b => b.classList.contains('member-remove'))).toBe(true);
        expect(buttons[0].textContent.trim()).toBe('Remove');
    });

    it('gives a reader no Actions column', async () => {
        await render(false);
        expect(table().querySelectorAll('thead th').length).toBe(4);
        expect(table().querySelector('tbody button')).toBeNull();
    });
});
