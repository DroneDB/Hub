import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { usePageSize, visibleListHeight, heightOfFirst, averageRowHeight, keptBarHeight } from './usePageSize';

let wrapper;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
});

/** Mounts a component that uses the composable, and returns what it gives. */
function use(options) {
    let sizing;
    wrapper = mount(defineComponent({
        setup() {
            sizing = usePageSize(options);
            return () => h('div');
        }
    }));
    return sizing;
}

describe('usePageSize (FR-XC-34)', () => {
    it('calculates the size at mount: a list of 1850 px with rows of 48 px holds 38 rows', () => {
        const sizing = use({ height: () => 1850, rowHeight: 48 });
        expect(sizing.pageFit.value).toBe(38);
        expect(sizing.pageSize.value).toBe(38);
        expect(sizing.pageChoice.value).toBeNull();
    });

    it('holds 10 rows when the list is short: a list of 400 px with rows of 48 px', () => {
        expect(use({ height: () => 400, rowHeight: 48 }).pageSize.value).toBe(10);
    });

    it('stays at 10 while the list is not on the page (its height is 0), and takes the size once it is', async () => {
        let height = 0;
        const sizing = use({ height: () => height, rowHeight: 48 });
        expect(sizing.pageSize.value).toBe(10);
        height = 1850;
        expect(sizing.measurePageSize()).toBe(true);
        expect(sizing.pageSize.value).toBe(38);
        // The list leaves the page (a map): the size stays
        height = 0;
        expect(sizing.measurePageSize()).toBe(false);
        expect(sizing.pageSize.value).toBe(38);
    });

    it('calculates again on a resize, once the resizing paused, when no size is chosen', () => {
        let height = 1850;
        const sizing = use({ height: () => height, rowHeight: 48 });
        height = 960;
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        expect(sizing.pageSize.value).toBe(38);
        vi.advanceTimersByTime(150);
        expect(sizing.pageSize.value).toBe(20);
    });

    it('keeps a size that the user chose, whatever the resize', () => {
        let height = 1850;
        const sizing = use({ height: () => height, rowHeight: 48, initial: 25 });
        expect(sizing.pageChoice.value).toBe(25);
        expect(sizing.pageSize.value).toBe(25);
        height = 960;
        window.dispatchEvent(new Event('resize'));
        vi.advanceTimersByTime(200);
        expect(sizing.pageSize.value).toBe(25);
        // The paginator still lists what fits now
        expect(sizing.pageFit.value).toBe(38);
    });

    it('stops listening to the window with the component', () => {
        const remove = vi.spyOn(window, 'removeEventListener');
        use({ height: () => 1850, rowHeight: 48 });
        wrapper.unmount();
        wrapper = null;
        expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('lists the calculated size as an option of the paginator, with the usual ones', () => {
        const sizing = use({ height: () => 1850, rowHeight: 48, sizes: [10, 25, 50, 100] });
        expect(sizing.pageSizeOptions.value).toEqual([10, 25, 38, 50, 100]);
    });

    it('chooses the size picked in the paginator; the calculated size is no choice but the fit', () => {
        const sizing = use({ height: () => 1850, rowHeight: 48 });
        expect(sizing.choosePageSize(50)).toBe(50);
        expect(sizing.pageSize.value).toBe(50);
        expect(sizing.choosePageSize(38)).toBeNull();
        expect(sizing.pageChoice.value).toBeNull();
        expect(sizing.pageSize.value).toBe(38);
        expect(sizing.choosePageSize(500)).toBeNull();
    });

    it('ignores a stored size that is not a size', () => {
        expect(use({ height: () => 1850, rowHeight: 48, initial: 500 }).pageChoice.value).toBeNull();
    });

    it('fills a card grid with whole grid rows', async () => {
        let columns = 3;
        const sizing = use({ height: () => 1000, rowHeight: 160, columns: () => columns });
        expect(sizing.pageSize.value).toBe(18);
        columns = 4;
        sizing.measurePageSize();
        // 6 grid rows of 4
        expect(sizing.pageSize.value).toBe(24);
        await nextTick();
    });
});

describe('the measuring helpers', () => {
    function boxes() {
        document.body.innerHTML = `
            <div id="area"><div id="list"><table><thead><tr><th>a</th></tr></thead>
            <tbody><tr class="row"></tr><tr class="row"></tr></tbody></table></div><div class="pager"></div></div>`;
        const rect = (top, bottom) => ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top });
        const sizes = { area: rect(0, 1000), list: rect(200, 900), th: rect(200, 240), pager: rect(940, 1000) };
        const rows = [rect(240, 300), rect(300, 380)];
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            if (this.id === 'area') return sizes.area;
            if (this.id === 'list') return sizes.list;
            if (this.tagName === 'THEAD') return sizes.th;
            if (this.className === 'pager') return sizes.pager;
            if (this.className === 'row') return rows[[...this.parentElement.children].indexOf(this)];
            return rect(0, 0);
        });
        return { area: document.getElementById('area'), list: document.getElementById('list') };
    }
    afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

    it('visibleListHeight is the px between the top of the list and the bottom of the area, less what is kept below', () => {
        const { area, list } = boxes();
        expect(visibleListHeight({ area, list })).toBe(800);
        expect(visibleListHeight({ area, list, reserved: 100 })).toBe(700);
        expect(visibleListHeight({ area, list, reserved: () => 60 })).toBe(740);
        expect(visibleListHeight({ area, list: null })).toBe(0);
        expect(visibleListHeight({ area: null, list })).toBe(0);
    });

    it('heightOfFirst is the height of the first match, or the fallback', () => {
        const { area } = boxes();
        expect(heightOfFirst(area, 'thead', 45)).toBe(40);
        expect(heightOfFirst(area, '.pager', 56)).toBe(60);
        expect(heightOfFirst(area, '.missing', 56)).toBe(56);
    });

    it('heightOfFirst counts the vertical margins of the element (a bar with mt-2 takes 8 px more)', () => {
        const { area } = boxes();
        area.querySelector('.pager').style.marginTop = '8px';
        expect(heightOfFirst(area, '.pager', 56)).toBe(68);
    });

    it('keptBarHeight measures the bar while it holds the paginator, and keeps that height while it does not', () => {
        const { area } = boxes();
        const bar = keptBarHeight(area, '.pager', '.pages', 80);
        // No paginator in the bar yet: the fallback
        expect(bar()).toBe(80);
        area.querySelector('.pager').innerHTML = '<nav class="pages"></nav>';
        expect(bar()).toBe(60);
        // A list of one page: the bar is there without its paginator, and lower; the height stays
        area.querySelector('.pager').innerHTML = '';
        expect(bar()).toBe(60);
        area.querySelector('.pager').remove();
        expect(bar()).toBe(60);
    });

    it('averageRowHeight is the mean of the rows, or the fallback for a list without rows', () => {
        const { list } = boxes();
        // (60 + 80) / 2
        expect(averageRowHeight(list, 'tbody tr', 99)).toBe(70);
        expect(averageRowHeight(list, '.nothing', 99)).toBe(99);
        expect(averageRowHeight(null, 'tr', 99)).toBe(99);
    });
});
