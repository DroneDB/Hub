import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import HubPanel from './HubPanel.vue';
import { PREF, getPref, setPref, removePref } from '@/libs/preferences';

const screenClass = vi.hoisted(() => ({ mobile: false, tablet: false }));
vi.mock('@/libs/responsive', () => ({
    isMobile: () => screenClass.mobile,
    isTablet: () => screenClass.tablet
}));

const mountPanel = (props = {}) => mount(HubPanel, {
    props: { amount: '23.6%', mobileAmount: '0%', tabletAmount: '30%', ...props },
    slots: { first: '<p>first</p>', second: '<p>second</p>' },
    global: { plugins: [PrimeVue] }
});

const resizeTo = (w, first) => w.findComponent({ name: 'Splitter' }).vm.$emit('resizeend', { sizes: [first, 100 - first] });

describe('HubPanel pane sizes', () => {
    beforeEach(() => {
        screenClass.mobile = false;
        screenClass.tablet = false;
        removePref(PREF.PANEL_SIZES);
    });
    afterEach(() => removePref(PREF.PANEL_SIZES));

    it('starts from the amount when nothing is kept', () => {
        const w = mountPanel({ storageKey: 'dataset' });
        expect(w.vm.size0).toBeCloseTo(23.6);
        w.unmount();
    });

    it('keeps the dragged size and restores it on the next mount', async () => {
        const w = mountPanel({ storageKey: 'dataset' });
        await resizeTo(w, 41.237);
        expect(getPref(PREF.PANEL_SIZES, {})).toEqual({ 'dataset.desktop': 41.24 });
        w.unmount();

        const again = mountPanel({ storageKey: 'dataset' });
        expect(again.vm.size0).toBe(41.24);
        expect(again.vm.size1).toBeCloseTo(58.76);
        again.unmount();
    });

    it('keeps desktop and tablet sizes apart and other panels untouched', async () => {
        setPref(PREF.PANEL_SIZES, { 'dataset.desktop': 40, 'other.desktop': 10 });
        screenClass.tablet = true;
        const w = mountPanel({ storageKey: 'dataset' });
        expect(w.vm.size0).toBe(30); // no tablet size yet: tabletAmount
        await resizeTo(w, 35);
        expect(getPref(PREF.PANEL_SIZES, {})).toEqual({ 'dataset.desktop': 40, 'other.desktop': 10, 'dataset.tablet': 35 });
        w.unmount();
    });

    it('never keeps or restores a size on phones', async () => {
        setPref(PREF.PANEL_SIZES, { 'dataset.desktop': 40 });
        screenClass.mobile = true;
        const w = mountPanel({ storageKey: 'dataset' });
        expect(w.vm.size0).toBe(0);
        await resizeTo(w, 50);
        expect(getPref(PREF.PANEL_SIZES, {})).toEqual({ 'dataset.desktop': 40 });
        w.unmount();
    });

    it('keeps nothing without a storageKey', async () => {
        const w = mountPanel();
        await resizeTo(w, 50);
        expect(getPref(PREF.PANEL_SIZES, null)).toBeNull();
        w.unmount();
    });

    it('ignores a kept size outside the pane limits', () => {
        setPref(PREF.PANEL_SIZES, { 'dataset.desktop': 99.5 });
        const w = mountPanel({ storageKey: 'dataset' });
        expect(w.vm.size0).toBeCloseTo(23.6);
        w.unmount();
    });

    it('still tells the registered children that the panes were resized', async () => {
        const child = { onPanelResized: vi.fn() };
        const w = mountPanel({ storageKey: 'dataset' });
        w.vm.registerChild(child);
        await resizeTo(w, 30);
        expect(child.onPanelResized).toHaveBeenCalledOnce();
        w.unmount();
    });
});

/** A container the panel can measure: jsdom has no layout, so its width is what the test says */
const container = { width: 1800 };
const resizeObservers = [];
let widthDescriptor;

describe('HubPanel firstSize (FR-EXP-40): the first pane has a width in px', () => {
    beforeEach(() => {
        screenClass.mobile = false;
        screenClass.tablet = false;
        removePref(PREF.PANEL_SIZES);
        container.width = 1800;
        resizeObservers.length = 0;
        widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => container.width });
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback) { this.callback = callback; this.disconnected = false; resizeObservers.push(this); }
            observe() {}
            disconnect() { this.disconnected = true; }
        });
    });
    afterEach(() => {
        removePref(PREF.PANEL_SIZES);
        if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
        else delete HTMLElement.prototype.clientWidth;
        vi.unstubAllGlobals();
    });

    const mountSized = (props = {}) => mountPanel({ firstSize: '360px', storageKey: 'dataset', ...props });
    const flexBasis = (w, i) => w.findAll('.p-splitterpanel')[i].element.style.flexBasis;
    const resizeContainer = width => { container.width = width; resizeObservers.forEach(o => o.callback([])); };

    it('turns the width into the percent of the container on mount', () => {
        const w = mountSized();
        expect(w.vm.size0).toBe(20); // 360 of 1800
        expect(w.vm.size1).toBe(80);
        expect(flexBasis(w, 0)).toBe('calc(20% - 4px)');
        expect(flexBasis(w, 1)).toBe('calc(80% - 4px)');
        w.unmount();
    });

    it('keeps the same px width when the container changes size', async () => {
        const w = mountSized();
        resizeContainer(3600);
        expect(w.vm.size0).toBe(10); // 360 of 3600
        expect(flexBasis(w, 0)).toBe('calc(10% - 4px)');
        resizeContainer(1200);
        expect(w.vm.size0).toBe(30);
        expect(flexBasis(w, 0)).toBe('calc(30% - 4px)');
        w.unmount();
    });

    it('keeps the dragged width in px (not in percent), and the stored px size gives the same px after a change', async () => {
        const w = mountSized();
        await resizeTo(w, 25); // 25% of 1800 = 450 px
        expect(getPref(PREF.PANEL_SIZES, {})).toEqual({ 'dataset.desktop.px': 450 });
        resizeContainer(3600);
        expect(w.vm.size0).toBe(12.5); // 450 of 3600
        w.unmount();

        // The next visit, in a window of another size: the same 450 px
        container.width = 900;
        const again = mountSized();
        expect(again.vm.size0).toBe(50);
        expect(flexBasis(again, 0)).toBe('calc(50% - 4px)');
        again.unmount();
    });

    it('holds a dragged width for the session when nothing is kept (no storageKey)', async () => {
        const w = mountSized({ storageKey: '' });
        await resizeTo(w, 25);
        resizeContainer(900);
        expect(w.vm.size0).toBe(50);
        expect(getPref(PREF.PANEL_SIZES, null)).toBeNull();
        w.unmount();
    });

    it('does not read the percent that an older Hub stored under the same key', () => {
        setPref(PREF.PANEL_SIZES, { 'dataset.desktop': 40 });
        const w = mountSized();
        expect(w.vm.size0).toBe(20);
        w.unmount();
    });

    it('limits the pane, and tells the registered children when the first pane changed', () => {
        const child = { onPanelResized: vi.fn() };
        const w = mountSized({ firstSize: '50px' });
        w.vm.registerChild(child);
        expect(w.vm.size0).toBeCloseTo(50 / 18, 6); // 2.78%: above the 2% minimum
        resizeContainer(400); // 50 px of 400 is 12.5%
        expect(w.vm.size0).toBe(12.5);
        expect(child.onPanelResized).toHaveBeenCalledOnce();
        resizeContainer(400);
        expect(child.onPanelResized).toHaveBeenCalledOnce(); // nothing changed
        w.unmount();
    });

    it('leaves the other pane 20rem (320px) when a kept width is wider than the container, and keeps the width itself', async () => {
        container.width = 1920;
        setPref(PREF.PANEL_SIZES, { 'dataset.desktop.px': 1000 });
        const w = mountSized();
        expect(w.vm.size0).toBeCloseTo((1000 / 1920) * 100, 6);
        resizeContainer(960); // 1000 px does not fit: 960 - 320 = 640 px
        expect(w.vm.size0).toBeCloseTo((640 / 960) * 100, 6);
        expect(w.vm.size1).toBeCloseTo((320 / 960) * 100, 6);
        expect(parseFloat(flexBasis(w, 1).replace('calc(', ''))).toBeCloseTo((320 / 960) * 100, 6);
        expect(getPref(PREF.PANEL_SIZES, {})).toEqual({ 'dataset.desktop.px': 1000 });
        resizeContainer(1920); // the window grows again: the 1000 px are back
        expect(w.vm.size0).toBeCloseTo((1000 / 1920) * 100, 6);
        // a dragged width is capped the same way
        await resizeTo(w, 50); // 960 px of 1920
        resizeContainer(600); // 600 - 320 = 280 px
        expect(w.vm.size0).toBeCloseTo((280 / 600) * 100, 6);
        resizeContainer(1920);
        expect(w.vm.size0).toBe(50);
        w.unmount();
    });

    it('keeps at least the minimum pane when the container is narrower than 20rem', () => {
        const w = mountSized({ firstSize: '360px' });
        resizeContainer(300);
        expect(w.vm.size0).toBe(2);
        w.unmount();
    });

    it('stops observing when it unmounts', () => {
        const w = mountSized();
        expect(resizeObservers).toHaveLength(1);
        w.unmount();
        expect(resizeObservers[0].disconnected).toBe(true);
    });

    it('is the percent of amount, and no observer, on tablet and phone screens and without firstSize', () => {
        screenClass.tablet = true;
        const tablet = mountSized();
        expect(tablet.vm.size0).toBe(30);
        tablet.unmount();
        screenClass.tablet = false;
        screenClass.mobile = true;
        const phone = mountSized();
        expect(phone.vm.size0).toBe(0);
        phone.unmount();
        screenClass.mobile = false;
        const percent = mountPanel({ storageKey: 'dataset' });
        expect(percent.vm.size0).toBeCloseTo(23.6);
        percent.unmount();
        expect(resizeObservers).toHaveLength(0);
    });
});
