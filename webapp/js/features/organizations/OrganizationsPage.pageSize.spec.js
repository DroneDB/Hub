/**
 * The organizations list: the page size follows the height (FR-XC-34, FR-ORG-25). A page holds the cards that fit
 * until the user chooses a size; a size that the user chose is kept; when the size changes the list shows the page
 * that holds the first organization shown, and the page the user left is shown again at the size that fits.
 *
 * jsdom has no layout: the boxes come from a stub of getBoundingClientRect. The cards start at 200 px, the
 * paginator is 49 px and a card 100 px (what the page expects before its cards are there): a page 1700 px high
 * holds floor((1700 - 200 - 49) / 100) = 14 cards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    getUsername: () => 'ann',
    features: { get: () => false },
    orgs: { getOrganizations: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsPage } = await import('./OrganizationsPage.vue');
const { PREF, _resetPrefListenersForTests } = await import('@/libs/preferences');

const box = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top });
let wrapper;
let pageHeight;

async function render() {
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve(Array.from({ length: 120 }, (_, i) => ({ org: { slug: `org${String(i).padStart(3, '0')}`, name: `Org ${String(i).padStart(3, '0')}` } }))));
    wrapper = mount(OrganizationsPage, {
        attachTo: document.body,
        global: {
            plugins: [PrimeVue],
            components: { RouterLink: RouterLinkStub },
            mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn() } },
            stubs: { OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
        }
    });
    await flushPromises();
}
const shownNames = () => wrapper.findAll('.org-name').map(a => a.text());
const stored = () => JSON.parse(localStorage.getItem(PREF.ORG_PAGE) ?? 'null');
const resize = async () => {
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
};

beforeEach(() => {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pageHeight = 1700;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.id === 'organizations') return box(0, pageHeight);
        if (this.classList.contains('org-cards-area')) return box(200, 0);
        if (this.classList.contains('org-pagination')) return box(0, 49);
        if (this.classList.contains('org-card') || this.classList.contains('p-card')) return box(0, 100);
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

describe('OrganizationsPage page size', () => {
    it('shows the cards that fit the height, and offers that size in the paginator', async () => {
        await render();
        expect(wrapper.vm.pageSize).toBe(14);
        expect(shownNames()).toHaveLength(14);
        expect(shownNames()[0]).toBe('Org 000');
        expect(shownNames()[13]).toBe('Org 013');
        expect(wrapper.vm.pageSizeOptions).toEqual([5, 10, 14, 25, 50, 100]);
        // Fitting is no choice: nothing stored
        expect(stored()).toBeNull();
    });

    it('labels the size that fits "N (fit)" in the select of the paginator, which stores another size and no size for it', async () => {
        await render();
        expect(wrapper.vm.pageSizeChoices).toEqual([
            { value: 5, label: '5' }, { value: 10, label: '10' }, { value: 14, label: '14 (fit)' }, { value: 25, label: '25' },
            { value: 50, label: '50' }, { value: 100, label: '100' }
        ]);
        wrapper.vm.onPageChange({ page: 0, rows: 25 });
        await flushPromises();
        expect(stored()).toMatchObject({ itemsPerPage: 25, pageSizeChosen: true });
        wrapper.vm.onPageChange({ page: 0, rows: 14 });
        await flushPromises();
        expect(stored()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false });
    });

    it('keeps the page that holds the first organization shown when the window is resized', async () => {
        await render();
        wrapper.vm.currentPage = 3;
        await flushPromises();
        expect(shownNames()[0]).toBe('Org 028');
        // floor((2600 - 249) / 100) = 23 cards: the organization 28 is on the page 2 of 23, which starts at 23
        pageHeight = 2600;
        await resize();
        expect(wrapper.vm.pageSize).toBe(23);
        expect(wrapper.vm.currentPage).toBe(2);
        expect(shownNames()[0]).toBe('Org 023');
        expect(stored()).toBeNull();
    });

    it('reads the 10 that an older Hub stored with the other settings (no mark) as no choice: the cards that fit', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 10, sortColumn: 'x' }));
        await render();
        expect(wrapper.vm.pageChoice).toBeNull();
        expect(wrapper.vm.pageSize).toBe(14);
        expect(shownNames()).toHaveLength(14);
    });

    it('keeps a 10 that the user chose (stored with the mark)', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 10, pageSizeChosen: true }));
        await render();
        expect(wrapper.vm.pageSize).toBe(10);
        expect(shownNames()).toHaveLength(10);
    });

    it('keeps a size that the user chose, whatever the resize', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        expect(shownNames()).toHaveLength(25);
        pageHeight = 2600;
        await resize();
        expect(wrapper.vm.pageSize).toBe(25);
        expect(shownNames()).toHaveLength(25);
    });

    it('shows the page that holds the first organization when the user picks another size, and stores the pick', async () => {
        await render();
        wrapper.vm.currentPage = 3;
        await flushPromises();
        // The organization 28 is on the page 2 of 25
        wrapper.vm.onPageChange({ page: 1, rows: 25, first: 25, pageCount: 5 });
        await flushPromises();
        expect(wrapper.vm.currentPage).toBe(2);
        expect(shownNames()[0]).toBe('Org 025');
        expect(stored()).toMatchObject({ itemsPerPage: 25, pageSizeChosen: true });
    });

    it('turns the page of the same size without storing a size', async () => {
        await render();
        wrapper.vm.onPageChange({ page: 2, rows: 14, first: 28, pageCount: 9 });
        await flushPromises();
        expect(shownNames()[0]).toBe('Org 028');
        expect(stored()).toBeNull();
    });

    it('reads the pick of the size that fits as no choice: the stored size is forgotten', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, pageSizeChosen: true }));
        await render();
        wrapper.vm.onPageChange({ page: 0, rows: 14, first: 0, pageCount: 9 });
        await flushPromises();
        expect(wrapper.vm.pageSize).toBe(14);
        expect(stored()).toMatchObject({ itemsPerPage: null, pageSizeChosen: false });
    });

    it('shows the page the user left once the size that fits is known', async () => {
        localStorage.setItem(PREF.ORG_PAGE_POSITION, JSON.stringify({ currentPage: 3, scrollTop: 0 }));
        await render();
        expect(wrapper.vm.currentPage).toBe(3);
        expect(shownNames()[0]).toBe('Org 028');
    });

    it('shows the last page when the page the user left is past the end at this size', async () => {
        localStorage.setItem(PREF.ORG_PAGE_POSITION, JSON.stringify({ currentPage: 40, scrollTop: 0 }));
        await render();
        // 120 organizations, 14 a page: 9 pages, the last one holds 8
        expect(wrapper.vm.currentPage).toBe(9);
        expect(shownNames()).toHaveLength(8);
    });
});
