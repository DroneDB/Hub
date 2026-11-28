/**
 * How many photos a PDF holds: decided from the model before any image is made, because the tab needs about 4.5 times the
 * bytes of the images when the library writes the file, and dies with no message when it has not got them.
 */
import { describe, it, expect } from 'vitest';
import {
    FIGURE_BYTES, MIN_PHOTO_SIDE, MOST_FIGURES, MOST_PHOTOS, PHOTO_BYTES, PHOTO_BYTE_BUDGET, countFigures, countPhotos, mostPhotosWith, photoBytesAt, planPhotos,
    reducedText, refusedText
} from '@/libs/reports/pdf/pdfBudget';
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

// The room the figures of the three items leave for photos
const room = () => PHOTO_BYTE_BUDGET - countFigures(modelWithPhotos(0)) * FIGURE_BYTES;

describe('the plan of the photos', () => {
    it('is the usual size for a report within the budget, up to the last photo that fits', () => {
        const fits = Math.floor(room() / PHOTO_BYTES);
        const figures = countFigures(modelWithPhotos(0));
        expect(figures).toBeGreaterThan(0);
        expect(planPhotos(modelWithPhotos(0))).toEqual({ count: 0, figures, maxSide: PHOTO_MAX_SIDE, reduced: false, refused: false });
        expect(planPhotos(modelWithPhotos(fits))).toMatchObject({ count: fits, maxSide: PHOTO_MAX_SIDE, reduced: false, refused: false });
        expect(planPhotos(modelWithPhotos(fits + 1)).reduced).toBe(true);
    });

    it('makes the photos smaller above the budget, so that their bytes are within it', () => {
        const count = 2000;
        const plan = planPhotos(modelWithPhotos(count));
        expect(plan).toMatchObject({ count, reduced: true, refused: false });
        expect(plan.maxSide).toBeLessThan(PHOTO_MAX_SIDE);
        expect(plan.maxSide).toBeGreaterThanOrEqual(MIN_PHOTO_SIDE);
        expect(count * photoBytesAt(plan.maxSide)).toBeLessThanOrEqual(room());
        // One more pixel would not fit: the photos are as large as the budget allows
        expect(count * photoBytesAt(plan.maxSide + 2)).toBeGreaterThan(room());
    });

    it('refuses what does not fit even at the smallest size', () => {
        const most = mostPhotosWith(countFigures(modelWithPhotos(0)));
        expect(most).toBeLessThan(MOST_PHOTOS);
        const plan = planPhotos(modelWithPhotos(most + 1));
        expect(plan).toMatchObject({ reduced: true, refused: true, maxSide: MIN_PHOTO_SIDE });
        expect(planPhotos(modelWithPhotos(most)).refused).toBe(false);
    });

    it('says in words what is done and why, with the numbers', () => {
        const reduced = planPhotos(modelWithPhotos(2000));
        expect(reducedText(reduced)).toContain('2000 photos');
        expect(reducedText(reduced)).toContain(`${reduced.maxSide} px`);
        const refused = planPhotos(modelWithPhotos(MOST_PHOTOS + 5));
        expect(refusedText(refused)).toContain(`${MOST_PHOTOS + 5} photos`);
        expect(refusedText(refused)).toContain(`at most ${mostPhotosWith(refused.figures)} with its ${refused.figures} maps, charts and 3D snapshots`);
        expect(refusedText(refused)).not.toMatch(/[\u2013\u2014]/);
    });
});

describe('the figures of a model', () => {
    /** A model of `items` items, each with a map snapshot (a located item), and no photo. */
    function modelWithFigures(items) {
        const [first] = threeItems();
        const features = Array.from({ length: items }, (_, i) => ({ ...first, id: `f${i}`, properties: { ...first.properties, ref: String(i + 1), photos: [] } }));
        return pdfModel({ features });
    }

    it('take their share of the budget: a report of many located items and no photo is refused before any image is made', () => {
        const few = modelWithFigures(10);
        expect(countFigures(few)).toBeGreaterThanOrEqual(10);
        expect(planPhotos(few).refused).toBe(false);

        // About 650 located items with no photo ran a tab out of memory
        const many = modelWithFigures(650);
        expect(countFigures(many)).toBeGreaterThan(MOST_FIGURES);
        const plan = planPhotos(many);
        expect(plan).toMatchObject({ count: 0, refused: true, reduced: false });
        expect(refusedText(plan)).toContain(`${plan.figures} maps, charts and 3D snapshots, and a PDF holds at most ${MOST_FIGURES}`);
    });

    it('leave less room for photos: photos that fit alone are made smaller next to many figures', () => {
        const [first, ...others] = threeItems();
        const photos = Array.from({ length: 500 }, (_, i) => ({ path: `photos/p${i}.jpg`, source: 'dataset' }));
        const alone = pdfModel({ features: [{ ...first, properties: { ...first.properties, photos } }, ...others] });
        expect(planPhotos(alone).reduced).toBe(false);
        const located = Array.from({ length: 200 }, (_, i) => ({ ...first, id: `m${i}`, properties: { ...first.properties, ref: String(i + 10), photos: [] } }));
        const withMaps = pdfModel({ features: [{ ...first, properties: { ...first.properties, photos } }, ...located] });
        expect(planPhotos(withMaps)).toMatchObject({ count: 500, reduced: true });
    });
});
