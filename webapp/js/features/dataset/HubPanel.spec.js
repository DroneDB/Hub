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
