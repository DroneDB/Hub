/**
 * Admin > Tasks, filters and order (FR-PRC-28): the three filters clear the same way (their x, or Clear
 * filters), the empty state offers Clear filters, the filters, the page and the order stay in the address, and
 * a click on Created, State or Tool asks the server for that order.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';

const reg = vi.hoisted(() => ({
    features: {
        value: key => ({
            taskTools: [{ id: 'build', title: 'Build' }, { id: 'zip', title: 'Download archive (ZIP)' }],
            taskStates: [{ value: 'Processing', terminal: false }, { value: 'Failed', terminal: true }]
        })[key] || []
    },
    admin: {}
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksPage } = await import('./TasksPage.vue');

const ROW = { taskId: 't1', toolId: 'build', version: '1', state: 'Failed', path: 'a.tif', orgSlug: 'o', dsSlug: 'd', createdAt: '2026-10-31T00:58:56Z' };
let wrapper;

async function render(search = '', items = [ROW], total = items.length) {
    window.history.replaceState(null, '', `/admin/tasks${search}`);
    reg.admin.usersDetailed = vi.fn(() => Promise.resolve([{ id: 'u1', userName: 'alice' }]));
    // The server's page: nothing past the end of the list
    reg.admin.adminTasks = vi.fn(({ skip }) => Promise.resolve({ items: skip < total ? items : [], total }));
    wrapper = mount(TasksPage, {
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() }, $router: { push: vi.fn() } } }
    });
    await flushPromises();
    return wrapper;
}
const lastCall = () => reg.admin.adminTasks.mock.calls.at(-1)[0];
const selectedPage = () => wrapper.find('.p-paginator-page-selected').text();

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
});

describe('TasksPage filters', () => {
    it('opens with what the address says: filters, page and order', async () => {
        await render('?toolId=zip&state=Failed&userId=u1&skip=50&take=25&sortField=state&sortOrder=asc', [ROW], 120);
        expect(lastCall()).toEqual({ toolId: 'zip', state: 'Failed', userId: 'u1', skip: 50, take: 25, sortField: 'state', sortOrder: 'asc' });
    });

    it('shows the page of the address in the paginator, and Next goes on from it', async () => {
        await render('?skip=20', [ROW], 45);
        expect(selectedPage()).toBe('3');
        await wrapper.find('.p-paginator-next').trigger('click');
        await flushPromises();
        expect(lastCall()).toMatchObject({ skip: 30, take: 10 });
        expect(window.location.search).toBe('?skip=30');
        expect(selectedPage()).toBe('4');
    });

    it('opens an offset inside a page at the start of that page', async () => {
        await render('?skip=27', [ROW], 45);
        expect(reg.admin.adminTasks.mock.calls.map(c => c[0].skip)).toEqual([20]);
        expect(selectedPage()).toBe('3');
    });

    it('goes back to the last page when the address is past the end of the list', async () => {
        await render('?skip=1000', [ROW], 45);
        expect(reg.admin.adminTasks.mock.calls.map(c => c[0].skip)).toEqual([1000, 40]);
        expect(window.location.search).toBe('?skip=40');
        expect(selectedPage()).toBe('5');
        expect(wrapper.findAll('tbody tr').length).toBe(1);
        expect(wrapper.find('.empty-state').exists()).toBe(false);
    });

    it('asks for the newest first when the address has nothing', async () => {
        await render();
        expect(lastCall()).toEqual({ toolId: undefined, state: undefined, userId: undefined, skip: 0, take: 10, sortField: 'createdAt', sortOrder: 'desc' });
        expect(wrapper.find('.clear-filters').exists()).toBe(false);
    });

    it('has the clear x on all three filters', async () => {
        await render('?state=Failed');
        const selects = wrapper.find('.filters').findAllComponents(Select);
        expect(selects.map(c => c.attributes('aria-label') ?? c.props('ariaLabel'))).toEqual(['Filter by user', 'Filter by tool', 'Filter by state']);
        expect(selects.map(c => c.props('showClear'))).toEqual([true, true, true]);
        // Only a filter that has a value shows its x
        expect(wrapper.findAll('.filters .p-select-clear-icon').length).toBe(1);
    });

    it('keeps a filter in the address and loads from the first page', async () => {
        await render('?skip=20', [ROW], 45);
        expect(selectedPage()).toBe('3');
        wrapper.vm.selectedState = 'Failed';
        wrapper.vm.onFilterChange();
        await flushPromises();
        expect(window.location.search).toBe('?state=Failed');
        expect(lastCall()).toMatchObject({ state: 'Failed', skip: 0 });
        expect(selectedPage()).toBe('1');
    });

    it('clears every filter with Clear filters, in the list and in the address', async () => {
        await render('?toolId=zip&state=Failed&userId=u1&take=25');
        const clear = wrapper.find('.clear-filters');
        expect(clear.text()).toBe('Clear filters');
        await clear.trigger('click');
        await flushPromises();
        expect(lastCall()).toMatchObject({ toolId: undefined, state: undefined, userId: undefined, skip: 0, take: 25 });
        expect(window.location.search).toBe('?take=25');
        expect(wrapper.find('.clear-filters').exists()).toBe(false);
    });

    it('offers Clear filters in the empty state of a filtered list', async () => {
        await render('?state=Failed', []);
        const button = wrapper.find('.empty-state button');
        expect(button.text()).toBe('Clear filters');
        reg.admin.adminTasks.mockResolvedValue({ items: [ROW], total: 1 });
        await button.trigger('click');
        await flushPromises();
        expect(lastCall().state).toBeUndefined();
        expect(wrapper.find('.empty-state').exists()).toBe(false);
    });

    it('asks the server for the order of the header that was clicked, from the first page, and keeps it in the address', async () => {
        await render('?skip=10', [ROW], 45);
        await wrapper.findAll('thead th').find(th => th.text() === 'State').trigger('click');
        await flushPromises();
        expect(lastCall()).toMatchObject({ sortField: 'state', sortOrder: 'asc', skip: 0 });
        expect(window.location.search).toBe('?sortField=state&sortOrder=asc');
        await wrapper.findAll('thead th').find(th => th.text() === 'State').trigger('click');
        await flushPromises();
        expect(lastCall()).toMatchObject({ sortField: 'state', sortOrder: 'desc' });
        expect(window.location.search).toBe('?sortField=state');
    });
});
