/**
 * Optional files are asked for only when the listing of their folder holds them (FR-XC-10, OBS-002).
 */
import { describe, it, expect, vi } from 'vitest';
import { isListed, datasetThumbnailUrl } from './optionalFile';

describe('isListed', () => {
    it('is true for a file of the listing of its folder, false for a file that the listing does not hold', async () => {
        const dataset = { list: vi.fn().mockResolvedValue([{ path: 'scenes/a_cameras.json' }, { path: 'scenes/b.spz' }]) };
        expect(await isListed(dataset, 'scenes/a_cameras.json')).toBe(true);
        expect(await isListed(dataset, 'scenes/b_cameras.json')).toBe(false);
        expect(dataset.list).toHaveBeenCalledWith('scenes');
    });

    it('lists the root for a file at the root', async () => {
        const dataset = { list: vi.fn().mockResolvedValue([{ path: 'x_measurements.geojson' }]) };
        expect(await isListed(dataset, 'x_measurements.geojson')).toBe(true);
        expect(dataset.list).toHaveBeenCalledWith(null);
    });

    it('says true when the listing cannot say, so the read decides: a failed listing, an answer that is no list, no list method', async () => {
        expect(await isListed({ list: vi.fn().mockRejectedValue(new Error('offline')) }, 'a/b.json')).toBe(true);
        expect(await isListed({ list: vi.fn().mockResolvedValue(null) }, 'a/b.json')).toBe(true);
        expect(await isListed({}, 'a/b.json')).toBe(true);
    });
});

describe('datasetThumbnailUrl', () => {
    const dataset = { datasetThumbUrl: vi.fn(size => `/thumb?size=${size}`) };

    it('is null, and asks for nothing, when the root entry says the dataset has no thumbnail', () => {
        dataset.datasetThumbUrl.mockClear();
        expect(datasetThumbnailUrl(dataset, { hasThumbnail: false }, 256)).toBeNull();
        expect(dataset.datasetThumbUrl).not.toHaveBeenCalled();
    });

    it('is the address when it has one, and when the Registry does not say', () => {
        expect(datasetThumbnailUrl(dataset, { hasThumbnail: true }, 256)).toBe('/thumb?size=256');
        expect(datasetThumbnailUrl(dataset, {}, 128)).toBe('/thumb?size=128');
        expect(datasetThumbnailUrl(dataset, null, 64)).toBe('/thumb?size=64');
    });
});
