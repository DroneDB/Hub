/**
 * The words, the window and the refusal of the export of a styled raster (FR-RAS-16, FR-RAS-26, D-023). The expected
 * numbers are written as literals: the sizes are those of the examples of the SPEC, the window the longitude and latitude
 * of the corners of a Web Mercator extent (x / 6378137 rad; 2 atan(e^(y / 6378137)) - 90 degrees), by hand.
 */
import { describe, it, expect } from 'vitest';
import {
    EXPORT_STYLED_LABEL, EXPORT_BANDS_LABEL, exportsStyledImage, exportLabel, exportNote, EXPORT_EXTENT_LABEL, EXPORT_PHASES, exportRefusal, visibleBbox, exportFileName, exportTaskParams, exportSubmitMessage
} from './rasterExport';

const GIB = 1073741824;

describe('exportRefusal', () => {
    it('says the estimate and the limit in the sizes of the formatter', () => {
        // about 9.3 GiB over the 1 GiB limit
        expect(exportRefusal(9985798963, GIB)).toBe('Too large to export: about 9.3 GB > 1 GB limit');
    });

    it('names the visible extent when the estimate is its own', () => {
        expect(exportRefusal(1503238554, GIB, { extent: true })).toBe('Too large to export the visible extent: about 1.4 GB > 1 GB limit');
    });

    it('says nothing for an estimate within the limit, without a limit or without an estimate', () => {
        expect(exportRefusal(GIB, GIB)).toBe('');
        expect(exportRefusal(10 * GIB, null)).toBe('');
        expect(exportRefusal(10 * GIB, 0)).toBe('');
        expect(exportRefusal(null, GIB)).toBe('');
        expect(exportRefusal(undefined, undefined)).toBe('');
    });
});

describe('visibleBbox', () => {
    it('is the longitude and latitude of the corners of the extent', () => {
        expect(visibleBbox([1670000, 5645600, 1670200, 5645800])).toEqual([15.001865, 45.152744, 15.003662, 45.154011]);
    });

    it('keeps a world extent inside WGS 84', () => {
        expect(visibleBbox([-20037508.342789244, -20048966.1, 20037508.342789244, 20048966.1])).toEqual([-180, -85.06, 180, 85.06]);
        // A map panned past the antimeridian is cut at it
        expect(visibleBbox([-30000000, 0, 30000000, 1000000])?.[0]).toBe(-180);
        expect(visibleBbox([-30000000, 0, 30000000, 1000000])?.[2]).toBe(180);
    });

    it('is null for an extent that is no place', () => {
        expect(visibleBbox(null)).toBeNull();
        expect(visibleBbox([1, 2, 3])).toBeNull();
        expect(visibleBbox([0, 0, Number.NaN, 5])).toBeNull();
        expect(visibleBbox([100, 100, 100, 200])).toBeNull();
    });
});

describe('the task of the export', () => {
    it('keeps the style, leaves the stretch of the panel and adds the window and the file name', () => {
        expect(exportTaskParams({ formula: 'NDVI', colormap: 'rdylgn', rescale: '0.1,0.9', stretch: 'percentile', nodata: 0 },
            { bbox: [15, 45, 15.5, 45.5], fileName: 'ortho_extent_export.tif' })).toEqual({
            formula: 'NDVI', colormap: 'rdylgn', rescale: '0.1,0.9', nodata: 0, bbox: [15, 45, 15.5, 45.5], fileName: 'ortho_extent_export.tif'
        });
    });

    it('has no window for the whole raster, and does not change the style it was given', () => {
        const style = { colormap: 'ironbow', stretch: 'minmax' };
        expect(exportTaskParams(style)).toEqual({ colormap: 'ironbow' });
        expect(style).toEqual({ colormap: 'ironbow', stretch: 'minmax' });
    });

    it('names the file after the raster', () => {
        expect(exportFileName('odm_orthophoto/odm_orthophoto.tif')).toBe('odm_orthophoto_export.tif');
        expect(exportFileName('hatcreek/mosaic.tif', true)).toBe('mosaic_extent_export.tif');
    });
});

describe('exportSubmitMessage', () => {
    it('words an export over the limit with the estimate and the limit of the Registry', () => {
        const e = Object.assign(new Error('Export output exceeds maximum allowed size (9.3 GB > 1 GB).'),
            { status: 400, estimatedExportBytes: 9985798963, exportLimitBytes: GIB });
        expect(exportSubmitMessage(e)).toBe('Too large to export: about 9.3 GB > 1 GB limit');
        expect(exportSubmitMessage(e, { extent: true })).toBe('Too large to export the visible extent: about 9.3 GB > 1 GB limit');
    });

    it('gives the reason at the window member, else the message of the error', () => {
        const old = Object.assign(new Error('Bad Request'), { status: 400, errors: { bbox: ['Exporting the visible extent needs libddb 2.3 or later'] } });
        expect(exportSubmitMessage(old)).toBe('Exporting the visible extent needs libddb 2.3 or later');
        expect(exportSubmitMessage(new Error('The rescale value is invalid'))).toBe('The rescale value is invalid');
    });
});

describe('the words of the control', () => {
    it('say what the file is, and what the second export is', () => {
        expect(EXPORT_STYLED_LABEL).toBe('Export styled image (RGBA GeoTIFF, in the CRS of the file)');
        expect(EXPORT_BANDS_LABEL).toBe('Export scaled bands (8-bit GeoTIFF, in the CRS of the file)');
        expect(EXPORT_EXTENT_LABEL).toBe('Export visible extent');
        // Every phase of the tool is an export for the status
        expect(Object.values(EXPORT_PHASES)).toEqual(['Exporting', 'Exporting', 'Exporting', 'Exporting']);
    });
});

describe('the label follows the style (FR-RAS-26, the rule of ddb 2.3.1: a formula, or a colormap on exactly one band, makes the RGBA image)', () => {
    it('is the styled image for a formula, with or without a colormap', () => {
        expect(exportsStyledImage({ formula: 'NDVI', colormap: 'rdylgn' })).toBe(true);
        expect(exportsStyledImage({ formula: 'CELSIUS' })).toBe(true);
        expect(exportLabel({ formula: 'NDVI' })).toBe('Export styled image (RGBA GeoTIFF, in the CRS of the file)');
        expect(exportNote({ formula: 'NDVI' })).toBe('Export styled image (RGBA GeoTIFF, in the CRS of the file): the picture of the style, not the values.');
    });

    it('is the styled image for a colormap on a raster of one data band, formula or not', () => {
        expect(exportsStyledImage({ colormap: 'viridis' }, { singleBand: true })).toBe(true);
        expect(exportsStyledImage({ colormap: 'viridis', rescale: '0,50' }, { singleBand: true })).toBe(true);
        expect(exportLabel({ colormap: 'viridis' }, { singleBand: true })).toBe('Export styled image (RGBA GeoTIFF, in the CRS of the file)');
        expect(exportNote({ colormap: 'viridis' }, { singleBand: true })).toBe('Export styled image (RGBA GeoTIFF, in the CRS of the file): the picture of the style, not the values.');
    });

    it('is the styled image for a colormap on one band the style names, the same band three times included', () => {
        expect(exportsStyledImage({ colormap: 'viridis', bands: '2' })).toBe(true);
        expect(exportsStyledImage({ colormap: 'viridis', bands: '4,4,4' })).toBe(true);
        expect(exportsStyledImage({ colormap: 'viridis', bands: ' 3 ' })).toBe(true);
    });

    it('is the scaled bands for a colormap on several bands, a preset or a raster that is not known to have one band', () => {
        expect(exportsStyledImage({ colormap: 'viridis', bands: '1,2' })).toBe(false);
        expect(exportsStyledImage({ colormap: 'viridis', bands: '3,2,1' }, { singleBand: true })).toBe(false);
        expect(exportsStyledImage({ colormap: 'viridis', preset: 'rgb' }, { singleBand: true })).toBe(false);
        expect(exportsStyledImage({ colormap: 'viridis' })).toBe(false);
        expect(exportsStyledImage({ colormap: 'viridis' }, { singleBand: false })).toBe(false);
    });

    it('is the scaled bands without a formula or a colormap, whatever the raster (the bands are scaled, no colour is applied)', () => {
        for (const style of [undefined, null, {}, { rescale: '10,40' }, { preset: 'rgb' }, { bands: '1,2,3' }, { bands: '1' }, { formula: '' }, { formula: null }, { colormap: '' }]) {
            expect(exportsStyledImage(style, { singleBand: true })).toBe(false);
            expect(exportsStyledImage(style)).toBe(false);
            expect(exportLabel(style)).toBe('Export scaled bands (8-bit GeoTIFF, in the CRS of the file)');
        }
        expect(exportNote({ colormap: 'ironbow', bands: '1,2' })).toBe('Export scaled bands (8-bit GeoTIFF, in the CRS of the file): the bands scaled to 8 bits, not the values.');
    });
});
