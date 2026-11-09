import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import RasterProfileChart from './RasterProfileChart.vue';
import { PREF, removePref, setPref } from '@/libs/preferences';
import * as csv from '@/libs/csv';

const profile = {
    totalLength: 250, min: 100, max: 112.5, mean: 105, unit: 'm',
    samples: [{ distance: 0, value: 100, lon: 11, lat: 43 }, { distance: 250, value: null, lon: 11.002, lat: 43 }]
};
const summary = w => w.find('.profile-summary').text();

describe('RasterProfileChart', () => {
    afterEach(() => {
        removePref(PREF.MEASURE_UNIT);
        vi.restoreAllMocks();
    });

    it('writes the distances in the units of the map measurements', async () => {
        const w = mount(RasterProfileChart, { props: { profile, unit: 'm' } });
        expect(summary(w)).toContain('Length: 250 m');
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await w.vm.$nextTick();
        expect(summary(w)).toContain('Length: 820.21 ft');
        // The values stay in the unit of the raster
        expect(summary(w)).toContain('Max: 112.5 m');
    });

    it('exports the samples as CSV, distances in metres and nodata left empty', () => {
        const saved = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
        const w = mount(RasterProfileChart, { props: { profile } });
        w.find('button[aria-label="Export CSV"]').trigger('click');
        expect(saved).toHaveBeenCalledWith(
            'index,distance_m,value,unit,lon,lat\r\n0,0,100,m,11,43\r\n1,250,,m,11.002,43\r\n', 'raster-profile.csv');
    });
});

describe('RasterProfileChart Expand (FR-RAS-35)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    const mountExpandable = () => mount(RasterProfileChart, { props: { profile, unit: 'm' }, attachTo: document.body, global: { plugins: [PrimeVue] } });

    it('has an Expand button, and opens the same chart in a wide window that the Close button ends', async () => {
        const w = mountExpandable();
        expect(document.querySelector('#raster-profile-expanded')).toBeNull();
        await w.find('button[aria-label="Expand the chart"]').trigger('click');
        await flushPromises();
        const dialog = document.querySelector('#raster-profile-expanded');
        expect(dialog.classList.contains('dialog-wide')).toBe(true);
        expect(dialog.querySelector('.raster-profile-chart.expanded .profile-svg')).not.toBeNull();
        // the larger chart has no Expand button of its own, and carries the colours of the panel
        expect(dialog.querySelector('button[aria-label="Expand the chart"]')).toBeNull();
        expect(dialog.querySelector('.analysis-panel.analysis-panel--raster')).not.toBeNull();
        dialog.querySelector('[data-cancel]').click();
        await flushPromises();
        expect(document.querySelector('#raster-profile-expanded')).toBeNull();
        w.unmount();
    });

    it('titles the window as the profile and reports the hovered sample of the larger chart to the map', async () => {
        const w = mountExpandable();
        await w.find('button[aria-label="Expand the chart"]').trigger('click');
        await flushPromises();
        expect(document.querySelector('#raster-profile-expanded .p-dialog-title').textContent).toBe('Value Profile');
        const inner = w.findAllComponents(RasterProfileChart).find(c => c.props('expanded'));
        inner.vm.setHover(0);
        expect(w.emitted('activeSample')).toEqual([[profile.samples[0]]]);
        w.unmount();
    });

    it('removes the map marker when the window closes while the larger chart shows a hover, and when the chart unmounts', async () => {
        const w = mountExpandable();
        await w.find('button[aria-label="Expand the chart"]').trigger('click');
        await flushPromises();
        const inner = w.findAllComponents(RasterProfileChart).find(c => c.props('expanded'));
        inner.vm.setHover(1);
        expect(w.emitted('activeSample')).toEqual([[profile.samples[1]]]);
        document.querySelector('#raster-profile-expanded [data-cancel]').click();
        await flushPromises();
        expect(w.emitted('activeSample')).toEqual([[profile.samples[1]], [null]]);
        w.unmount();

        // The chart itself unmounts while it shows a hover (the listener sees what the unmount says)
        const heard = vi.fn();
        const lone = mount(RasterProfileChart, { props: { profile, onActiveSample: heard } });
        lone.vm.setHover(0);
        lone.unmount();
        expect(heard.mock.calls).toEqual([[profile.samples[0]], [null]]);
        // Not hovered: nothing is said
        const quiet = vi.fn();
        mount(RasterProfileChart, { props: { profile, onActiveSample: quiet } }).unmount();
        expect(quiet).not.toHaveBeenCalled();
    });

    it('follows the height of its box as well as the width, so the text keeps its size', async () => {
        const observers = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(cb) { this.cb = cb; observers.push(this); }
            observe() {}
            disconnect() {}
        });
        const w = mount(RasterProfileChart, { props: { profile, expanded: true, expandable: false } });
        observers.at(-1).cb([{ contentRect: { width: 1500.4, height: 800.2 } }]);
        await w.vm.$nextTick();
        expect(w.find('svg').attributes('viewBox')).toBe('0 0 1500 800');
        w.unmount();
        vi.unstubAllGlobals();
    });
});
