/**
 * Admin > Tasks, the page size follows the height (FR-XC-34, FR-ADM-29): the page holds the rows that fit, a size
 * the user chose is kept (preferences and address), and the offset of the first task shown stays inside the page
 * (the address and the last page) when the size changes.
 *
 * jsdom has no layout: the boxes are given by a stub of getBoundingClientRect. The list starts at 200 px, a header is
 * 45 px, the paginator 56 px and a row 72 px (what the page expects before its rows are there): a page 1320 px high
 * holds (1320 - 200 - 45 - 56) / 72 = 14 rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    features: { value: () => [] },
    admin: {}
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksPage } = await import('./TasksPage.vue');
const { PREF } = await import('@/libs/preferences');

const ROW = { taskId: 't1', toolId: 'build', version: '1', state: 'Failed', path: 'a.tif', orgSlug: 'o', dsSlug: 'd', createdAt: '2026-10-31T00:58:56Z' };
let wrapper;
let pageHeight;
let rowHeight;

const box = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top });

async function render(search = '', total = 100) {
    window.history.replaceState(null, '', `/admin/tasks${search}`);
    reg.admin.usersDetailed = vi.fn(() => Promise.resolve([]));
    reg.admin.adminTasks = vi.fn(({ skip }) => Promise.resolve({ items: skip < total ? [ROW] : [], total }));
    wrapper = mount(TasksPage, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() }, $router: { push: vi.fn() } } }
    });
    await flushPromises();
    return wrapper;
}
const calls = () => reg.admin.adminTasks.mock.calls.map(([query]) => ({ skip: query.skip, take: query.take }));
const lastCall = () => calls().at(-1);
const storedChoice = () => JSON.parse(localStorage.getItem(PREF.ADMIN_TASKS) ?? 'null');

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    localStorage.clear();
    pageHeight = 1320;
    rowHeight = 72;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.id === 'admin-tasks') return box(0, pageHeight);
        if (this.classList.contains('tasks-list')) return box(200, 0);
        if (this.tagName === 'THEAD') return box(0, 45);
        if (this.classList.contains('p-paginator')) return box(0, 56);
        if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') return box(0, rowHeight);
        return box(0, 0);
    });
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
});

describe('TasksPage page size', () => {
    it('asks for the rows that fit the height, and offers that size in the paginator', async () => {
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 14 }]);
        expect(wrapper.vm.pageSize).toBe(14);
        expect(wrapper.findComponent({ name: 'TasksTable' }).props('rows')).toBe(14);
        // The paginator's own select is replaced by the page's, where the size that fits reads "14 (fit)"
        const select = wrapper.findComponent({ name: 'TasksTable' }).findComponent({ name: 'Select' });
        expect(select.props('options')).toEqual([
            { value: 10, label: '10' }, { value: 14, label: '14 (fit)' }, { value: 25, label: '25' }, { value: 50, label: '50' }, { value: 100, label: '100' }
        ]);
        expect(select.props('modelValue')).toBe(14);
        expect(wrapper.find('.p-paginator-content-end .page-size-select').exists()).toBe(true);
        // Fitting is no choice: nothing in the address, nothing stored
        expect(window.location.search).toBe('');
        expect(storedChoice()).toBeNull();
    });

    it('has no flex: 1 on the table, so the paginator is right below the rows', async () => {
        await render();
        expect(wrapper.find('.tasks-list').attributes('style') ?? '').not.toContain('flex');
    });

    it('asks again once its rows are there, when their height is not the one expected', async () => {
        rowHeight = 50;
        await render();
        // (1320 - 200 - 45 - 56) / 50 = 20 rows
        expect(calls()).toEqual([{ skip: 0, take: 14 }, { skip: 0, take: 20 }]);
        expect(wrapper.vm.pageSize).toBe(20);
    });

    it('rounds the offset of an address without a size to the page of the size that fits', async () => {
        await render('?skip=30');
        // 30 is on the page 3 of 14 rows: it starts at 28
        expect(lastCall()).toEqual({ skip: 28, take: 14 });
        expect(window.location.search).toBe('?skip=28');
    });

    it('keeps the address offset as it is when the address has the size: the page of that size', async () => {
        await render('?skip=30&take=25');
        expect(calls()).toEqual([{ skip: 25, take: 25 }]);
    });

    it('goes to the last page of the size that fits when the address is past the end of the list', async () => {
        await render('?skip=1000', 45);
        // 45 tasks, 14 a page: the last page starts at 42
        expect(calls()).toEqual([{ skip: 994, take: 14 }, { skip: 42, take: 14 }]);
        expect(window.location.search).toBe('?skip=42');
    });

    it('keeps the page that holds the first task shown when the window is resized', async () => {
        await render('?skip=28');
        pageHeight = 1760;
        window.dispatchEvent(new Event('resize'));
        await vi.advanceTimersByTimeAsync(150);
        await flushPromises();
        // (1760 - 200 - 45 - 56) / 72 = 20.2: 20 rows; the task at 28 is on the page that starts at 20
        expect(lastCall()).toEqual({ skip: 20, take: 20 });
        expect(window.location.search).toBe('?skip=20');
        expect(wrapper.find('.p-paginator-page-selected').text()).toBe('2');
    });

    it('keeps the size the user chose: in the address and in the preferences, and after a reload', async () => {
        await render();
        wrapper.vm.onPage({ skip: 0, take: 25 });
        await flushPromises();
        expect(lastCall()).toEqual({ skip: 0, take: 25 });
        expect(window.location.search).toBe('?take=25');
        expect(storedChoice()).toEqual({ itemsPerPage: 25, pageSizeChosen: true });
        wrapper.unmount();
        // The reload: the address has nothing of it any more (a link to /admin/tasks)
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 25 }]);
        expect(wrapper.vm.pageSize).toBe(25);
    });

    it('does not follow a resize when the user chose a size', async () => {
        localStorage.setItem(PREF.ADMIN_TASKS, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        reg.admin.adminTasks.mockClear();
        pageHeight = 1760;
        window.dispatchEvent(new Event('resize'));
        await vi.advanceTimersByTimeAsync(300);
        await flushPromises();
        expect(reg.admin.adminTasks).not.toHaveBeenCalled();
        expect(wrapper.vm.pageSize).toBe(25);
    });

    it('keeps the page that holds the first task shown when another size is picked', async () => {
        await render('?skip=30&take=10');
        // The paginator moves to the page of the new size by itself; the page does it too
        wrapper.vm.onPage({ skip: 0, take: 25 });
        await flushPromises();
        expect(lastCall()).toEqual({ skip: 25, take: 25 });
        expect(window.location.search).toBe('?skip=25&take=25');
    });

    it('reads a pick of the size that fits as no choice: the stored size and the address forget it', async () => {
        localStorage.setItem(PREF.ADMIN_TASKS, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        wrapper.vm.onPage({ skip: 0, take: 14 });
        await flushPromises();
        expect(lastCall()).toEqual({ skip: 0, take: 14 });
        expect(window.location.search).toBe('');
        expect(storedChoice()).toEqual({ itemsPerPage: null, pageSizeChosen: false });
        expect(wrapper.vm.pageChoice).toBeNull();
    });

    it('the select in the paginator stores another size, and reads the size that fits as no choice', async () => {
        await render();
        const select = () => wrapper.findComponent({ name: 'TasksTable' }).findComponent({ name: 'Select' });
        select().vm.$emit('update:modelValue', 25);
        await flushPromises();
        expect(lastCall()).toEqual({ skip: 0, take: 25 });
        expect(storedChoice()).toEqual({ itemsPerPage: 25, pageSizeChosen: true });
        expect(select().props('options').find(o => o.value === 14).label).toBe('14 (fit)');
        select().vm.$emit('update:modelValue', 14);
        await flushPromises();
        expect(lastCall()).toEqual({ skip: 0, take: 14 });
        expect(storedChoice()).toEqual({ itemsPerPage: null, pageSizeChosen: false });
    });

    it('asks once on mount: the table header is on the page before the first request', async () => {
        // A header of 60 px (not the 45 px expected): (1320 - 200 - 60 - 56) / 72 = 13.9, 13 rows. Measured without
        // its header (the empty state) the page would ask for 14 rows first, and 13 once the rows are there
        Element.prototype.getBoundingClientRect.mockRestore();
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            if (this.id === 'admin-tasks') return box(0, pageHeight);
            if (this.classList.contains('tasks-list')) return box(200, 0);
            if (this.tagName === 'THEAD') return box(0, 60);
            if (this.classList.contains('p-paginator')) return box(0, 56);
            // The placeholder rows are lower than the rows of tasks: they are not counted
            if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') return box(0, this.querySelector('.p-skeleton') ? 40 : 72);
            return box(0, 0);
        });
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 13 }]);
    });

    it('shows the answer of the latest request when an older one arrives after it', async () => {
        await render();
        const older = { resolve: null };
        const newer = { resolve: null };
        reg.admin.adminTasks = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => { older.resolve = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { newer.resolve = resolve; }));
        // The auto-refresh asks, then the user turns the page before it is answered
        wrapper.vm.loadTasks();
        wrapper.vm.onPage({ skip: 14, take: 14 });
        newer.resolve({ items: [{ ...ROW, taskId: 'new' }], total: 100 });
        await flushPromises();
        older.resolve({ items: [{ ...ROW, taskId: 'old' }], total: 100 });
        await flushPromises();
        expect(wrapper.vm.items.map(t => t.taskId)).toEqual(['new']);
        expect(wrapper.vm.loading).toBe(false);
        expect(wrapper.vm.skip).toBe(14);
    });

    it('does not store the size of a link as the choice of the user', async () => {
        await render('?take=50');
        expect(wrapper.vm.pageSize).toBe(50);
        expect(storedChoice()).toBeNull();
    });
});
