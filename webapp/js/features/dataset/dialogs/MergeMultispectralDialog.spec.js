/**
 * Merging the raw band images of a multi-camera sensor (MicaSense): the window keeps libddb's
 * warnings (raw band images have no geotransform), says whether the approximate shift correction
 * applies, and sends the user to the Hub's own Run Photogrammetry for accurate results.
 */
import { describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import MergeMultispectralDialog from './MergeMultispectralDialog.vue';

const BANDS = ['IMG_0001_1.tif', 'IMG_0001_2.tif', 'IMG_0001_3.tif'];

function validation(correctionApplied) {
    return {
        ok: true,
        errors: [],
        warnings: [
            'Cannot read geotransform from reference file: IMG_0001_1.tif',
            'Band misalignment detected (~14 pixels). Bands from multi-camera sensors (e.g. MicaSense, DJI Multispectral) '
                + 'are captured from slightly different viewpoints. For accurate vegetation indices (NDVI, NDRE, etc.), '
                + 'process raw imagery with a photogrammetry tool (e.g. WebODM, Pix4D) before merging.'
        ],
        summary: { totalBands: 3, dataType: 'UInt16', width: 1280, height: 960, crs: '' },
        alignment: { detected: true, maxShiftPixels: 14.2, correctionApplied, bands: [] }
    };
}

async function mountDialog(correctionApplied = true) {
    const dataset = {
        validateMergeMultispectral: vi.fn().mockResolvedValue(validation(correctionApplied)),
        previewMergeMultispectral: vi.fn().mockResolvedValue(null)
    };
    const w = mount(MergeMultispectralDialog, {
        props: { files: BANDS.map(path => ({ label: path, entry: { path } })), dataset },
        global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /><slot name="footer" /></div>' } } }
    });
    await flushPromises();
    return w;
}

describe('MergeMultispectralDialog band misalignment', () => {
    it('points to Run Photogrammetry, not to another product', async () => {
        const banner = (await mountDialog()).find('.alignment-warning');
        expect(banner.text()).toContain('Run Photogrammetry');
        expect(banner.text()).not.toMatch(/WebODM/i);
        expect(banner.find('a').exists()).toBe(false);
    });

    it('keeps the warning that the band images have no geotransform', async () => {
        const w = await mountDialog();
        expect(w.find('.validation-warnings').text()).toContain('Cannot read geotransform from reference file: IMG_0001_1.tif');
        expect(w.text()).not.toMatch(/WebODM/i);
    });

    it('says whether the approximate correction applies', async () => {
        expect((await mountDialog(true)).find('.alignment-warning').text()).toContain('Approximate correction will be applied.');
        const without = (await mountDialog(false)).find('.alignment-warning').text();
        expect(without).toContain('No approximate correction applies to these images.');
        expect(without).not.toContain('will be applied');
    });
});
