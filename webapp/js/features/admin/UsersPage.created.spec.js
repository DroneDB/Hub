/**
 * The Created column of User Management (FR-ADM-19): the date the Registry stored when the user was
 * created, written with formatDateTime (libs/format.js); a user created before the Registry stored it
 * has no date (null) and shows "Unknown".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ admin: {}, features: { value: () => null } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: UsersPage } = await import('./UsersPage.vue');
const { formatDateTime } = await import('@/libs/format');

const CREATED = '2026-03-04T05:06:07Z';

let wrapper;
beforeEach(() => {
    reg.admin.usersDetailed = vi.fn(() => Promise.resolve([
        { userName: 'admin', roles: ['admin'], createdDate: null },
        { userName: 'alice', roles: [], createdDate: CREATED }
    ]));
    reg.admin.userRoles = () => Promise.resolve(['admin']);
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const rowOf = name => wrapper.findAll('tbody tr').find(r => r.find('strong').text() === name);

describe('UsersPage Created column', () => {
    it('shows the stored creation date, and "Unknown" for a user without one', async () => {
        const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
        wrapper = mount(UsersPage, { attachTo: document.body, global: { plugins: [PrimeVue], mocks: { $notify: notify } } });
        await flushPromises();

        expect(rowOf('alice').text()).toContain(formatDateTime(CREATED));
        expect(rowOf('admin').text()).toContain('Unknown');
        expect(rowOf('admin').text()).not.toContain(formatDateTime(new Date()).slice(0, 10));
    });
});
