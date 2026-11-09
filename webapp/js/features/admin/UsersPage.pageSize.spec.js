/**
 * Admin > Users: the page size follows the height, and the rows per page that the user chose stay across a
 * reload (FR-XC-34, FR-ADM-29).
 *
 * jsdom has no layout: the boxes come from a stub of getBoundingClientRect. The table starts at 200 px, a header
 * is 45 px, the paginator 56 px and a row 60 px (what the page expects before its rows are there): a page 1530 px
 * high holds floor((1530 - 200 - 45 - 56) / 60) = 20 rows.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ admin: {}, features: { value: () => null } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: UsersPage } = await import('./UsersPage.vue');
const { PREF, _resetPrefListenersForTests } = await import('@/libs/preferences');

const user = i => ({
    userName: `user${String(i).padStart(3, '0')}`, email: `user${i}@example.com`, roles: [], organizationCount: 0, datasetCount: 0,
    storageUsed: 0, storageQuota: 0, createdDate: '2026-01-02T00:00:00Z'
});
const box = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top });

let wrapper;
let pageHeight;

async function render() {
    reg.admin.usersDetailed = vi.fn(() => Promise.resolve(Array.from({ length: 100 }, (_, i) => user(i))));
    reg.admin.userRoles = () => Promise.resolve([]);
    wrapper = mount(UsersPage, { attachTo: document.body, global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() } } } });
    await flushPromises();
}
const rowNames = () => wrapper.findAll('tbody tr').map(tr => tr.find('strong').text());
const stored = () => JSON.parse(localStorage.getItem(PREF.ADMIN_USERS) ?? 'null');

// Heavy mounts under a parallel run: load the PrimeVue chunks once, with a long hook timeout, and give each test
// (set on the describe below) 30 s instead of the 5 s default
beforeAll(async () => {
    await Promise.all(['primevue/datatable', 'primevue/column', 'primevue/select', 'primevue/tag', 'primevue/chip'].map(m => import(/* @vite-ignore */ m)));
}, 60000);

beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pageHeight = 1530;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.id === 'users') return box(0, pageHeight);
        if (this.classList.contains('p-datatable')) return box(200, 0);
        if (this.tagName === 'THEAD') return box(0, 45);
        if (this.classList.contains('p-paginator')) return box(0, 56);
        if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') return box(0, 60);
        return box(0, 0);
    });
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
    _resetPrefListenersForTests();
});

describe('UsersPage page size', { timeout: 30000 }, () => {
    it('shows the rows that fit the height, and offers that size in the paginator', async () => {
        await render();
        expect(wrapper.vm.pageSize).toBe(20);
        expect(rowNames()).toHaveLength(20);
        expect(wrapper.vm.pageSizeOptions).toEqual([5, 10, 20, 25, 50, 100]);
        expect(stored()).toBeNull();
    });

    it('labels the size that fits "N (fit)" in the select of the paginator, which stores another size and no size for it', async () => {
        await render();
        const select = () => wrapper.find('.p-paginator-content-end').findComponent({ name: 'Select' });
        expect(select().props('options')).toEqual([
            { value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20 (fit)' }, { value: 25, label: '25' },
            { value: 50, label: '50' }, { value: 100, label: '100' }
        ]);
        expect(select().props('modelValue')).toBe(20);
        select().vm.$emit('update:modelValue', 50);
        await flushPromises();
        expect(rowNames()).toHaveLength(50);
        expect(stored()).toEqual({ itemsPerPage: 50, pageSizeChosen: true });
        select().vm.$emit('update:modelValue', 20);
        await flushPromises();
        expect(rowNames()).toHaveLength(20);
        expect(stored()).toEqual({ itemsPerPage: null, pageSizeChosen: false });
    });

    it('keeps the page that holds the first user shown when the window is resized', async () => {
        await render();
        wrapper.vm.first = 40;
        await flushPromises();
        expect(rowNames()[0]).toBe('user040');
        // floor((1830 - 301) / 60) = 25 rows: the user 40 is on the page 2 of 25, which starts at 25
        pageHeight = 1830;
        window.dispatchEvent(new Event('resize'));
        await vi.advanceTimersByTimeAsync(150);
        await flushPromises();
        expect(wrapper.vm.pageSize).toBe(25);
        expect(wrapper.vm.first).toBe(25);
        expect(rowNames()[0]).toBe('user025');
        expect(rowNames()).toHaveLength(25);
    });

    // Two mounts of a table of 50 rows: slow under a parallel run, where the default 5 s test timeout is what failed
    it('keeps the rows per page that the user chose after a reload', { timeout: 30000 }, async () => {
        await render();
        wrapper.vm.onPage({ first: 0, rows: 50, page: 0, pageCount: 2 });
        await flushPromises();
        expect(wrapper.vm.pageSize).toBe(50);
        expect(stored()).toEqual({ itemsPerPage: 50, pageSizeChosen: true });
        wrapper.unmount();
        await render();
        expect(wrapper.vm.pageSize).toBe(50);
        expect(rowNames()).toHaveLength(50);
    });

    it('does not follow a resize when the user chose a size', async () => {
        localStorage.setItem(PREF.ADMIN_USERS, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        pageHeight = 3000;
        window.dispatchEvent(new Event('resize'));
        await vi.advanceTimersByTimeAsync(300);
        await flushPromises();
        expect(wrapper.vm.pageSize).toBe(25);
    });

    it('does not store a size for a page turned or the size that fits', async () => {
        await render();
        wrapper.vm.onPage({ first: 20, rows: 20, page: 1, pageCount: 5 });
        await flushPromises();
        expect(stored()).toBeNull();
    });

    it('reads the pick of the size that fits as no choice: the stored size is forgotten', async () => {
        localStorage.setItem(PREF.ADMIN_USERS, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        wrapper.vm.onPage({ first: 0, rows: 20, page: 0, pageCount: 5 });
        await flushPromises();
        expect(wrapper.vm.pageSize).toBe(20);
        expect(stored()).toEqual({ itemsPerPage: null, pageSizeChosen: false });
    });

    it('goes back to the first page for another search', async () => {
        await render();
        wrapper.vm.first = 40;
        await flushPromises();
        wrapper.vm.searchQuery = 'user05';
        await flushPromises();
        expect(wrapper.vm.first).toBe(0);
        expect(rowNames()[0]).toBe('user050');
    });
});
