/**
 * The task table below `sm` (D-026, FR-ADM-18, FR-PRC-27, FR-XC-20): one stacked card per row from the shared
 * renderer (the `stacked-table` class and the `data-label` of every cell, read by css/app.scss), the columns that
 * join the table late (Dataset, Owner, Progress, Created, Duration) kept in the card, the whole path as small
 * text, and, for FR-PRC-28, the sort of the admin list and the empty state that clears the filters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ features: { value: () => [] } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksTable } = await import('./TasksTable.vue');

const task = {
    taskId: '1', toolId: 'build', version: '2', state: 'Processing', progressPercent: 40, path: 'flights/2026/north/site/ortho.tif',
    orgSlug: 'acme', dsSlug: 'site', owner: 'alice', createdAt: '2026-10-31T00:58:56Z', actions: ['viewLog', 'cancel']
};

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
});

/** The window is a phone (below sm) or wider, as the media query of the card renderer says */
function screenIsPhone(matches) {
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
        matches: query === '(max-width: 575.98px)' ? matches : false, media: query,
        addEventListener: () => {}, removeEventListener: () => {}
    }));
}

const mountTable = (props = {}) => {
    wrapper = mount(TasksTable, {
        props: { tasks: [task], tools: [{ id: 'build', title: 'Build' }], rows: 10, showOwner: true, showDataset: true, ...props },
        global: { plugins: [PrimeVue] }
    });
    return wrapper;
};

describe('TasksTable below sm', () => {
    it('is a stacked table: the DataTable carries the class of the one card renderer', () => {
        expect(mountTable().find('.p-datatable').classes()).toContain('stacked-table');
    });

    it('labels every cell of a card, so that no column is lost with the header', () => {
        const row = mountTable().find('tbody tr');
        const labels = row.findAll('td').map(td => td.attributes('data-label') ?? null);
        expect(labels).toEqual(['State', null, 'Dataset', 'Owner', 'Progress', 'Created', 'Duration', null]);
    });

    it('keeps the secondary columns in the card and joins them to the table at their widths', () => {
        const classes = mountTable().findAll('tbody tr td').map(td => td.classes().filter(c => c.startsWith('stack-col')).join(' '));
        expect(classes).toEqual([
            'stack-col', 'stack-col', 'stack-col stack-col-md', 'stack-col stack-col-xl', 'stack-col stack-col-md',
            'stack-col stack-col-lg', 'stack-col stack-col-lg', 'stack-col'
        ]);
        // The header cells hide and show with their column
        const headers = wrapper.findAll('thead th').map(th => th.classes().filter(c => c.startsWith('stack-col')).join(' '));
        expect(headers).toEqual(classes);
    });

    it('shows the progress bar and the actions in the card', () => {
        const row = mountTable().find('tbody tr');
        expect(row.find('.p-progressbar').exists()).toBe(true);
        expect(row.find('button[aria-label="View log"]').exists()).toBe(true);
        expect(row.find('button[aria-label="Cancel"]').exists()).toBe(true);
    });

    it('renders the whole path as small text for the card, with the cut one for the table', () => {
        const row = mountTable().find('tbody tr');
        expect(row.find('.path-full').text().replace(/\u200B/g, '')).toBe('flights/2026/north/site/ortho.tif');
        expect(row.find('.path-details').text().replace(/\u200B/g, '')).toBe('.../north/site/ortho.tif');
        // No special case for a task without a path (FR-PRC-43): the tool's label, else nothing
        expect(mountTable({ tasks: [{ ...task, path: '' }] }).find('.path-full').exists()).toBe(false);
        expect(mountTable({ tasks: [{ ...task, path: '', targetLabel: 'Pending builds check' }] }).find('.path-full').text())
            .toBe('Pending builds check');
    });

    it('takes the sortable headers out of the tab order on a phone, where the header is hidden, and not from sm up', () => {
        const tabIndexes = w => w.findAll('thead th').filter(th => th.attributes('data-p-sortable-column') === 'true')
            .map(th => [th.text(), th.attributes('tabindex')]);
        screenIsPhone(true);
        expect(tabIndexes(mountTable({ lazy: true, totalRecords: 1 }))).toEqual([['State', '-1'], ['Tool', '-1'], ['Created', '-1']]);
        wrapper.unmount();
        screenIsPhone(false);
        expect(tabIndexes(mountTable({ lazy: true, totalRecords: 1 }))).toEqual([['State', '0'], ['Tool', '0'], ['Created', '0']]);
    });

    it('labels the skeleton as well, so that loading draws the same cards', () => {
        const w = mountTable({ tasks: [], loading: true });
        expect(w.find('.p-datatable').classes()).toContain('stacked-table');
        expect(w.find('tbody tr').findAll('td').map(td => td.attributes('data-label') ?? null))
            .toEqual(['State', null, 'Dataset', 'Owner', 'Progress', 'Created', 'Duration', null]);
    });
});

describe('TasksTable order and empty state (FR-PRC-28)', () => {
    it('sorts State, Tool and Created, also in the lazy admin table', () => {
        const w = mountTable({ lazy: true, totalRecords: 1 });
        const sortable = w.findAll('thead th').filter(th => th.attributes('data-p-sortable-column') === 'true').map(th => th.text());
        expect(sortable).toEqual(['State', 'Tool', 'Created']);
    });

    it('asks the parent for the order of a click on a header of the lazy table', async () => {
        const w = mountTable({ lazy: true, totalRecords: 1, sortField: 'createdAt', sortOrder: -1 });
        const created = w.findAll('thead th').find(th => th.text() === 'Created');
        await created.trigger('click');
        expect(w.emitted('sort')).toEqual([[{ field: 'createdAt', order: 1 }]]);
    });

    it('does not ask for an order of a table that sorts its own rows', async () => {
        const w = mountTable();
        await w.findAll('thead th').find(th => th.text() === 'Created').trigger('click');
        expect(w.emitted('sort')).toBeUndefined();
    });

    it('has an empty state with Clear filters when filters hide the tasks', async () => {
        const w = mountTable({ tasks: [], filtered: true, emptyMessage: 'No tasks match.' });
        expect(w.find('.empty-state h3').text()).toBe('No tasks found');
        const clear = w.find('.empty-state button');
        expect(clear.text()).toBe('Clear filters');
        await clear.trigger('click');
        expect(w.emitted('clear-filters')).toHaveLength(1);
    });

    it('has its own message and no button when no filter is on', () => {
        const w = mountTable({ tasks: [], emptyMessage: 'No processing tasks have been run yet.' });
        expect(w.find('.empty-state').text()).toContain('No processing tasks have been run yet.');
        expect(w.find('.empty-state button').exists()).toBe(false);
    });
});
