// @ts-check
/**
 * usePageSize - the page size of a paged list (FR-XC-34). Until the user chooses a size, a page holds
 * the rows that the visible height holds (libs/pageSize.js rowsThatFit): measured when the list is
 * mounted, when the list shows its first rows (`measure()`), and again on a resize, but only while the
 * user has not chosen a size. A size the user chose is kept by the caller (libs/preferences.js) and
 * wins over the calculated one.
 *
 *   setup() {
 *       const list = ref(null), area = ref(null);
 *       const sizing = usePageSize({
 *           height: () => visibleListHeight({ area: area.value, list: list.value, reserved: 56 }),
 *           rowHeight: () => averageRowHeight(list.value, 'tbody tr', 57),
 *           initial: getPageSizeChoice(PREF.ADMIN_USERS)
 *       });
 *       return { list, area, ...sizing };
 *   }
 *
 * The page shows `pageSize`, offers `pageSizeChoices` in its paginator (the calculated size reads "N (fit)"), and
 * sends what the user picked there to `choosePageSize`, which reads a pick of the calculated size as "fit the
 * height" (no size chosen).
 */
import { computed, getCurrentScope, onMounted, onScopeDispose, ref, unref } from 'vue';
import { PAGE_SIZE_CHOICES, PAGE_SIZE_MAX, PAGE_SIZE_MIN, isPageSize, pageSizeChoices, pageSizeOptions, rowsThatFit } from '@/libs/pageSize';

/** The wait after the last resize event before the size is calculated again */
const RESIZE_DELAY_MS = 150;

/** @param {unknown} source an element, a component instance or a ref of either @returns {Element|null} */
export function elementOf(source) {
    const value = /** @type {any} */ (unref(source));
    const element = value?.$el ?? value;
    return element instanceof Element ? element : null;
}

/**
 * The px between the top of the first row and the bottom of the content of `area`, less `reserved` (what the list
 * keeps below its rows: the paginator, the header of a table). 0 while either is not on the page.
 * The rows may be few: only the position of the list counts, not its height.
 * @param {object} view
 * @param {unknown} view.area  the element whose bottom ends the list (the page, which fills the screen)
 * @param {unknown} view.list  the element whose content starts with the first row
 * @param {number|(() => number)} [view.reserved]
 * @returns {number}
 */
export function visibleListHeight({ area, list, reserved = 0 }) {
    const bottom = elementOf(area);
    const top = elementOf(list);
    if (!bottom || !top) return 0;
    const paddingTop = Number.parseFloat(getComputedStyle(top).paddingTop) || 0;
    const paddingBottom = Number.parseFloat(getComputedStyle(bottom).paddingBottom) || 0;
    const kept = typeof reserved === 'function' ? reserved() : reserved;
    return Math.max(0, bottom.getBoundingClientRect().bottom - paddingBottom - (top.getBoundingClientRect().top + paddingTop) - kept);
}

/** @param {Element} element @returns {number} the px of `element`, its vertical margins included */
function outerHeight(element) {
    const style = getComputedStyle(element);
    return element.getBoundingClientRect().height + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
}

/**
 * The px of the first element inside `root` that matches `selector`, its margins included; `fallback` when
 * there is none (the paginator is not shown yet, a list without rows).
 * @param {unknown} root @param {string} selector @param {number} fallback
 */
export function heightOfFirst(root, selector, fallback) {
    const element = elementOf(root)?.querySelector(selector);
    const height = element ? outerHeight(element) : 0;
    return height > 0 ? height : fallback;
}

/**
 * The px of the bar below the rows (`selector`, its margins included) as it is with the paginator in it: measured
 * while it holds `holding`, the last one measured while it does not (a list of one page shows no paginator, and its
 * size must not change for that), `fallback` before. A function, kept per list.
 * @param {unknown} root @param {string} selector @param {string} holding @param {number} fallback
 * @returns {() => number}
 */
export function keptBarHeight(root, selector, holding, fallback) {
    let kept = fallback;
    return () => {
        const bar = elementOf(root)?.querySelector(selector);
        if (bar?.querySelector(holding)) {
            const height = outerHeight(bar);
            if (height > 0) kept = height;
        }
        return kept;
    };
}

/**
 * The px that one row takes, its margins included: the average of the rows shown, `fallback` when
 * there are none (or the list is not laid out).
 * @param {unknown} root @param {string} selector @param {number} fallback
 */
export function averageRowHeight(root, selector, fallback) {
    const rows = [...(elementOf(root)?.querySelectorAll(selector) ?? [])];
    if (rows.length === 0) return fallback;
    const total = rows.reduce((sum, row) => {
        const style = getComputedStyle(row);
        return sum + row.getBoundingClientRect().height + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
    }, 0);
    return total > 0 ? total / rows.length : fallback;
}

/**
 * @param {object} options
 * @param {() => number} options.height  px that the rows may fill (0 when unknown: the size stays)
 * @param {number|(() => number)} options.rowHeight  px of a row
 * @param {number|(() => number)} [options.columns]  cards in a row of a card grid (1: a list)
 * @param {number|null} [options.initial]  the size the user chose, stored; null when none
 * @param {readonly number[]} [options.sizes]  the sizes the paginator offers next to the calculated one
 * @param {number} [options.min]
 * @param {number} [options.max]
 */
export function usePageSize({ height, rowHeight, columns = 1, initial = null, sizes = PAGE_SIZE_CHOICES, min = PAGE_SIZE_MIN, max = PAGE_SIZE_MAX }) {
    /** @param {number|(() => number)} value */
    const resolve = value => (typeof value === 'function' ? value() : value);

    /** The size the user chose, or null: the page fits its height */
    const chosen = ref(isPageSize(initial) ? initial : null);
    /** The size that the visible height holds; the minimum until the list has been measured */
    const fit = ref(rowsThatFit({ height: 0, rowHeight: 0, columns: resolve(columns), min, max }));
    /** What a page holds */
    const size = computed(() => chosen.value ?? fit.value);
    const options = computed(() => pageSizeOptions(sizes, fit.value, chosen.value));
    const choices = computed(() => pageSizeChoices(sizes, fit.value, chosen.value));

    /**
     * Calculates the size again from the list as laid out now.
     * @returns {boolean} the calculated size changed
     */
    function measure() {
        const available = height();
        const row = resolve(rowHeight);
        // Not on the page (a map, a loading list) or not laid out: the size stays as it was
        if (!(available > 0) || !(row > 0)) return false;
        const next = rowsThatFit({ height: available, rowHeight: row, columns: resolve(columns), min, max });
        if (next === fit.value) return false;
        fit.value = next;
        return true;
    }

    /**
     * What the user picked in the paginator. The calculated size is no choice: it is the page that fits.
     * @param {number} picked
     * @returns {number|null} the size now chosen
     */
    function choose(picked) {
        chosen.value = picked !== fit.value && isPageSize(picked) ? picked : null;
        return chosen.value;
    }

    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let resizeTimer;
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (chosen.value == null) measure(); }, RESIZE_DELAY_MS);
    };
    onMounted(() => {
        measure();
        window.addEventListener('resize', onResize);
    });
    if (getCurrentScope()) {
        onScopeDispose(() => {
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', onResize);
        });
    }

    return { pageChoice: chosen, pageFit: fit, pageSize: size, pageSizeOptions: options, pageSizeChoices: choices, measurePageSize: measure, choosePageSize: choose };
}
