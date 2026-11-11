/**
 * The guide to the vegetation indices (FR-RAS-33): every formula of ddb lists its bands, from the structured
 * `requiredBands` of the list, and has its own text of what it measures and when to use it.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlantHealthFormulasDialog from './PlantHealthFormulasDialog.vue';

// The algorithm list of DDBGetRasterMetadata: id, name and requiredBands of its 18 formulas
const SAMPLE = [
    ['VARI', 'Visual Atmospheric Resistance Index', ['Red', 'Green', 'Blue']],
    ['EXG', 'Excess Green Index', ['Red', 'Green', 'Blue']],
    ['GLI', 'Green Leaf Index', ['Red', 'Green', 'Blue']],
    ['vNDVI', 'Visible NDVI', ['Red', 'Green', 'Blue']],
    ['NDVI', 'Normalized Difference Vegetation Index', ['Red', 'NIR']],
    ['NDWI', 'Normalized Difference Water Index', ['Green', 'NIR']],
    ['GNDVI', 'Green NDVI', ['Green', 'NIR']],
    ['SAVI', 'Soil Adjusted Vegetation Index', ['Red', 'NIR']],
    ['EVI', 'Enhanced Vegetation Index', ['Red', 'Blue', 'NIR']],
    ['NDRE', 'Normalized Difference Red Edge', ['NIR', 'Red edge']],
    ['NDYI', 'Normalized Difference Yellowness Index', ['Green', 'Blue']],
    ['MPRI', 'Modified Photochemical Reflectance Index', ['Red', 'Green']],
    ['OSAVI', 'Optimized Soil Adjusted Vegetation Index', ['Red', 'NIR']],
    ['GRVI', 'Green Ratio Vegetation Index', ['Green', 'NIR']],
    ['ENDVI', 'Enhanced NDVI', ['Green', 'Blue', 'NIR']],
    ['ARVI', 'Atmospherically Resistant Vegetation Index', ['Red', 'Blue', 'NIR']],
    ['CELSIUS', 'Celsius Temperature', ['Thermal']],
    ['KELVIN', 'Kelvin Temperature', ['Thermal']]
].map(([id, name, requiredBands]) => ({ id, name, expr: 'a / b', help: `Help of ${id}`, requiredBands }));

const mountDialog = formulas => mount(PlantHealthFormulasDialog, {
    props: { visible: true, formulas },
    global: { stubs: { Window: { template: '<div><slot /></div>' } } }
});

describe('PlantHealthFormulasDialog', () => {
    it('lists the bands of every formula, from the list, never "see formula expression above"', () => {
        const wrapper = mountDialog(SAMPLE);
        const entries = wrapper.vm.entries;
        expect(entries).toHaveLength(18);
        for (const entry of entries) {
            expect(entry.bands, entry.id).not.toBe('');
            expect(entry.bands, entry.id).not.toMatch(/see formula/i);
        }
        expect(wrapper.text()).not.toMatch(/see formula expression/i);
        const bandsOf = id => entries.find(e => e.id === id).bands;
        expect(bandsOf('VARI')).toBe('Red, Green, Blue');
        expect(bandsOf('NDRE')).toBe('NIR, Red edge');
        expect(bandsOf('ENDVI')).toBe('Green, Blue, NIR');
        expect(bandsOf('CELSIUS')).toBe('Thermal');
    });

    it('gives every formula its own "what it measures" and "when to use"', () => {
        const entries = mountDialog(SAMPLE).vm.entries;
        for (const field of ['measures', 'when']) {
            const texts = entries.map(e => e[field]);
            expect(texts.every(t => t.length > 0), field).toBe(true);
            // None repeats another, and none repeats the help of the list
            expect(new Set(texts).size, field).toBe(texts.length);
            expect(texts.some(t => t.startsWith('Help of')), field).toBe(false);
        }
    });

    it('has the formulas VARI, EXG and vNDVI, which used to share one text, each with its own', () => {
        const entries = mountDialog(SAMPLE).vm.entries;
        const [vari, exg, vndvi] = ['VARI', 'EXG', 'vNDVI'].map(id => entries.find(e => e.id === id));
        expect(new Set([vari.when, exg.when, vndvi.when]).size).toBe(3);
        expect(new Set([vari.measures, exg.measures, vndvi.measures]).size).toBe(3);
    });

    it('shows no "when to use" for a formula it has no text for, and does not repeat the help as one', () => {
        const wrapper = mountDialog([{ id: 'EVI2', name: 'Two-band EVI', help: 'EVI without blue', requiredBands: ['Red', 'NIR'] }]);
        const [entry] = wrapper.vm.entries;
        expect(entry.when).toBe('');
        expect(entry.measures).toBe('EVI without blue');
        expect(wrapper.text()).not.toContain('When to use');
        expect(wrapper.text()).toContain('Bands required: Red, NIR');
    });

    it('leaves the line of the bands out for a formula the list gives none', () => {
        const none = mountDialog([{ id: 'XYZ', name: 'XYZ' }]);
        expect(none.vm.entries[0].bands).toBe('');
        expect(none.text()).not.toContain('Bands required');
    });

    it('says so when there is no formula', () => {
        expect(mountDialog([]).text()).toContain('No formulas are available for this raster.');
    });
});
