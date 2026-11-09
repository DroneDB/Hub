/**
 * The datasets of an organization: the page size follows the height (FR-XC-34, FR-ORG-25). A page holds the rows
 * that fit until the user chooses a size; a size that the user chose is kept; when the size changes the list shows
 * the page that holds the first dataset shown.
 *
 * jsdom has no layout: the boxes come from a stub of getBoundingClientRect. The table starts at 200 px, a header is
 * 45 px, the paginator 56 px, a row 65 px (what the page expects before its rows are there). A page 2781 px high
 * holds floor((2781 - 200 - 45 - 56) / 65) = 38 rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    isLoggedIn: () => true,
    features: { get: () => false },
    Organization: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: DatasetsPage } = await import('./DatasetsPage.vue');
const { PREF, _resetPrefListenersForTests } = await import('@/libs/preferences');

const TOTAL = 200;
const dataset = i => ({
    slug: `ds${i}`, creationDate: '2026-01-01T00:00:00Z', size: 1, properties: { entries: 2, meta: {} },
    permissions: { canRead: true }, lastModified: null
});
const box = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top });

let wrapper;
let pageHeight;
let datasetsPage;

async function render() {
    datasetsPage = vi.fn(({ skip, take }) => Promise.resolve({
        items: Array.from({ length: Math.max(0, Math.min(take, TOTAL - skip)) }, (_, i) => dataset(skip + i)), total: TOTAL
    }));
    reg.Organization = vi.fn(() => ({
        info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: {} }),
        datasetsPage,
        datasetLocations: () => new Promise(() => {}),
        datasets: () => Promise.resolve([])
    }));
    wrapper = mount(DatasetsPage, {
        attachTo: document.body,
        global: {
            plugins: [PrimeVue],
            components: { RouterLink: RouterLinkStub },
            mocks: { $route: { params: { org: 'org' } }, $router: { push: vi.fn() }, $notify: { success: vi.fn(), error: vi.fn() } },
            stubs: { DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
        }
    });
    await flushPromises();
}
const calls = () => datasetsPage.mock.calls.map(([query]) => ({ skip: query.skip, take: query.take }));
const stored = () => JSON.parse(localStorage.getItem(PREF.DATASET_TABLE) ?? 'null');
const paginator = () => wrapper.findComponent({ name: 'Paginator' });

beforeEach(() => {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pageHeight = 2781;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.id === 'datasets') return box(0, pageHeight);
        if (this.classList.contains('ds-table')) return box(200, 0);
        if (this.tagName === 'THEAD') return box(0, 45);
        if (this.classList.contains('ds-pagination')) return box(0, 56);
        if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') return box(0, 65);
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

describe('DatasetsPage page size', () => {
    it('asks for the rows that fit the height, and offers that size in the paginator', async () => {
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 38 }]);
        expect(paginator().exists()).toBe(true);
        expect(wrapper.vm.pageSize).toBe(38);
        expect(wrapper.vm.pageSizeOptions).toEqual([5, 10, 25, 38, 50, 100]);
        // Fitting is no choice: nothing stored
        expect(stored()).toBeNull();
    });

    it('follows a resize, while the user chose no size: the page that holds the first dataset shown', async () => {
        await render();
        wrapper.vm.currentPage = 3;
        await flushPromises();
        expect(calls().at(-1)).toEqual({ skip: 76, take: 38 });
        // The window is as high as 20 rows more: (4081 - 301) / 65 = 58.15
        pageHeight = 4081;
        window.dispatchEvent(new Event('resize'));
        await vi.advanceTimersByTimeAsync(150);
        await flushPromises();
        // The dataset at 76 is on the page 2 of 58, which starts at 58
        expect(calls().at(-1)).toEqual({ skip: 58, take: 58 });
        expect(wrapper.vm.currentPage).toBe(2);
        expect(stored()).toBeNull();
    });

    it('reads the 10 that an older Hub stored with the other settings (no mark) as no choice: the rows that fit', async () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 10, sortColumn: 'x' }));
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 38 }]);
        expect(wrapper.vm.pageChoice).toBeNull();
    });

    it('keeps a 10 that the user chose (stored with the mark)', async () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 10, pageSizeChosen: true }));
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 10 }]);
        expect(wrapper.vm.pageSize).toBe(10);
    });

    it('keeps a size that the user chose, whatever the resize, and stores it', async () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 25 }]);
        pageHeight = 4081;
        window.dispatchEvent(new Event('resize'));
        await vi.advanceTimersByTimeAsync(300);
        await flushPromises();
        expect(calls()).toEqual([{ skip: 0, take: 25 }]);
        // Nothing is calculated again on a resize: the paginator still offers the size that fitted at mount
        expect(wrapper.vm.pageSizeOptions).toEqual([5, 10, 25, 38, 50, 100]);
    });

    it('shows the page that holds the first dataset when the user picks another size, and stores the pick', async () => {
        await render();
        wrapper.vm.currentPage = 3;
        await flushPromises();
        // The paginator says page 4 for the dataset at 76 with rows of 25 (page 3 of 25 holds 50 to 74)
        await wrapper.vm.onPageChange({ page: 3, rows: 25, first: 75, pageCount: 8 });
        await flushPromises();
        expect(calls().at(-1)).toEqual({ skip: 75, take: 25 });
        expect(wrapper.vm.currentPage).toBe(4);
        expect(stored()).toMatchObject({ itemsPerPage: 25, pageSizeChosen: true });
    });

    it('goes to another page of the same size without storing a size', async () => {
        await render();
        await wrapper.vm.onPageChange({ page: 1, rows: 38, first: 38, pageCount: 6 });
        await flushPromises();
        expect(calls().at(-1)).toEqual({ skip: 38, take: 38 });
        expect(stored()).toBeNull();
    });

    it('reads the pick of the size that fits as no choice: the stored size is forgotten', async () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        await wrapper.vm.onPageChange({ page: 0, rows: 38, first: 0, pageCount: 6 });
        await flushPromises();
        expect(calls().at(-1)).toEqual({ skip: 0, take: 38 });
        expect(stored()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false });
    });

    it('asks once on mount: the page size is measured on the frame of the page (header, toolbar, paginator bar) before the first request', async () => {
        // The table starts lower once the organization header is there (200 px) than without it (50 px): a size
        // measured without the header would be floor((2781 - 50 - 101) / 65) = 40, and asked again at 38
        Element.prototype.getBoundingClientRect.mockRestore();
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            if (this.id === 'datasets') return box(0, pageHeight);
            if (this.classList.contains('ds-table')) return box(document.querySelector('#datasets .org-header h1') ? 200 : 50, 0);
            if (this.tagName === 'THEAD') return box(0, 45);
            if (this.classList.contains('ds-pagination')) return box(0, 56);
            if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') return box(0, 65);
            return box(0, 0);
        });
        await render();
        expect(calls()).toEqual([{ skip: 0, take: 38 }]);
    });

    it('counts the paginator bar while the first page loads, and keeps its height when the list has one page', async () => {
        // The bar holds the paginator: 72 px with it, 40 px without it (a list of one page)
        Element.prototype.getBoundingClientRect.mockRestore();
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            if (this.id === 'datasets') return box(0, pageHeight);
            if (this.classList.contains('ds-table')) return box(200, 0);
            if (this.tagName === 'THEAD') return box(0, 45);
            if (this.classList.contains('ds-pagination')) return box(0, this.querySelector('.ds-paginator') ? 72 : 40);
            if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') return box(0, 65);
            return box(0, 0);
        });
        datasetsPage = null;
        const few = vi.fn(() => Promise.resolve({ items: [dataset(0), dataset(1)], total: 2 }));
        reg.Organization = vi.fn(() => ({
            info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: {} }),
            datasetsPage: few, datasetLocations: () => new Promise(() => {}), datasets: () => Promise.resolve([])
        }));
        wrapper = mount(DatasetsPage, {
            attachTo: document.body,
            global: {
                plugins: [PrimeVue], components: { RouterLink: RouterLinkStub },
                mocks: { $route: { params: { org: 'org' } }, $router: { push: vi.fn() }, $notify: { success: vi.fn(), error: vi.fn() } },
                stubs: { DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
            }
        });
        await flushPromises();
        // floor((2781 - 200 - 45 - 72) / 65) = 37, once: the bar without its paginator does not change the size
        expect(few.mock.calls.map(([q]) => q.take)).toEqual([37]);
        expect(wrapper.find('.ds-paginator').exists()).toBe(false);
    });

    it('labels the size that fits "N (fit)" in the paginator, and reads its pick as no choice; another size is stored', async () => {
        localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        expect(wrapper.vm.pageSizeChoices).toEqual([
            { value: 5, label: '5' }, { value: 10, label: '10' }, { value: 25, label: '25' }, { value: 38, label: '38 (fit)' },
            { value: 50, label: '50' }, { value: 100, label: '100' }
        ]);
        await wrapper.vm.onPageChange({ page: 0, rows: 38 });
        await flushPromises();
        expect(stored()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false });
        await wrapper.vm.onPageChange({ page: 0, rows: 50 });
        await flushPromises();
        expect(stored()).toMatchObject({ itemsPerPage: 50, pageSizeChosen: true });
    });

    it('asks again once its rows are there, when their height is not the one expected', async () => {
        pageHeight = 2781;
        Element.prototype.getBoundingClientRect.mockRestore();
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            if (this.id === 'datasets') return box(0, pageHeight);
            if (this.classList.contains('ds-table')) return box(200, 0);
            if (this.tagName === 'THEAD') return box(0, 45);
            if (this.classList.contains('ds-pagination')) return box(0, 56);
            if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') return box(0, 80);
            return box(0, 0);
        });
        await render();
        // Rows of 80 px: floor(2480 / 80) = 31
        expect(calls().at(-1)).toEqual({ skip: 0, take: 31 });
        expect(wrapper.vm.pageSize).toBe(31);
    });
});
