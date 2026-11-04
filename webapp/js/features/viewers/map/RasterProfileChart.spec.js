import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
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
        expect(summary(w)).toContain('Length: 0.25 km');
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
