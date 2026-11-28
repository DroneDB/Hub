/**
 * How many photos a PDF holds: decided from the model before any image is made, because the tab needs about 4.5 times the
 * bytes of the images when the library writes the file, and dies with no message when it has not got them.
 */
import { describe, it, expect } from 'vitest';
import { MIN_PHOTO_SIDE, MOST_PHOTOS, PHOTO_BYTES, PHOTO_BYTE_BUDGET, countPhotos, photoBytesAt, planPhotos, reducedText, refusedText } from '@/libs/reports/pdf/pdfBudget';
import { PHOTO_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';
import { pdfModel, threeItems } from '@/libs/reports/pdf/pdfDocument.fixtures';

/** A model whose first item has this many distinct photos of the dataset. */
function modelWithPhotos(count, { source = 'dataset' } = {}) {
    const [first, ...others] = threeItems();
    const photos = Array.from({ length: count }, (_, i) => ({ path: `photos/p${i}.jpg`, source }));
    return pdfModel({ features: [{ ...first, properties: { ...first.properties, photos } }, ...others] });
}

describe('the photos of a model', () => {
    it('are counted once for each file, however many places show it', () => {
        const [a, b, c] = threeItems();
        const photo = { path: 'photos/same.jpg', source: 'dataset' };
        const model = pdfModel({ features: [{ ...a, properties: { ...a.properties, photos: [photo] } }, { ...b, properties: { ...b.properties, photos: [photo, { path: 'photos/other.jpg', source: 'dataset' }] } }, c] });
        expect(countPhotos(model)).toBe(2);
    });

    it('do not count a path that is no file of the dataset: the PDF embeds nothing for it', () => {
        const [a, ...rest] = threeItems();
        const model = pdfModel({ features: [{ ...a, properties: { ...a.properties, photos: [{ path: '../secret.jpg', source: 'dataset' }, { path: 'https://x.example/a.jpg', source: 'dataset' }] } }, ...rest] });
        expect(countPhotos(model)).toBe(0);
    });
});

describe('the plan of the photos', () => {
    it('is the usual size for a report within the budget, up to the last photo that fits', () => {
        const fits = Math.floor(PHOTO_BYTE_BUDGET / PHOTO_BYTES);
        expect(planPhotos(modelWithPhotos(0))).toEqual({ count: 0, maxSide: PHOTO_MAX_SIDE, reduced: false, refused: false });
        expect(planPhotos(modelWithPhotos(fits))).toMatchObject({ count: fits, maxSide: PHOTO_MAX_SIDE, reduced: false, refused: false });
    });

    it('makes the photos smaller above the budget, so that their bytes are within it', () => {
        const count = 2000;
        const plan = planPhotos(modelWithPhotos(count));
        expect(plan).toMatchObject({ count, reduced: true, refused: false });
        expect(plan.maxSide).toBeLessThan(PHOTO_MAX_SIDE);
        expect(plan.maxSide).toBeGreaterThanOrEqual(MIN_PHOTO_SIDE);
        expect(count * photoBytesAt(plan.maxSide)).toBeLessThanOrEqual(PHOTO_BYTE_BUDGET);
        // One more pixel would not fit: the photos are as large as the budget allows
        expect(count * photoBytesAt(plan.maxSide + 2)).toBeGreaterThan(PHOTO_BYTE_BUDGET);
    });

    it('refuses what does not fit even at the smallest size', () => {
        const plan = planPhotos(modelWithPhotos(MOST_PHOTOS + 1));
        expect(plan).toMatchObject({ reduced: true, refused: true, maxSide: MIN_PHOTO_SIDE });
        expect(planPhotos(modelWithPhotos(MOST_PHOTOS)).refused).toBe(false);
    });

    it('says in words what is done and why, with the numbers', () => {
        const reduced = planPhotos(modelWithPhotos(2000));
        expect(reducedText(reduced)).toContain('2000 photos');
        expect(reducedText(reduced)).toContain(`${reduced.maxSide} px`);
        const refused = planPhotos(modelWithPhotos(MOST_PHOTOS + 5));
        expect(refusedText(refused)).toContain(`${MOST_PHOTOS + 5} photos`);
        expect(refusedText(refused)).toContain(`at most ${MOST_PHOTOS}`);
    });
});
