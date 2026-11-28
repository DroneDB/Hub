// @ts-check
/**
 * How many bytes of images a PDF may hold, decided from the model before any image is made. Every image is kept as a
 * data URL until the library writes the file, and the tab needs several times their bytes then (measured in Chromium:
 * 1.2 GB for 200 photos, 2.5 GB for 600, 4.1 GB for 1,200, which a tab capped at 4 GB did not survive; 1.8 GB for 300
 * items with a map each and no photo). The heap of the page stays small, so nothing shows it before the tab is gone.
 * The figures (map snapshots, charts, 3D captures) are made at their size and count first; a report that would pass
 * the budget has its photos made smaller (the bytes of a JPEG follow its area), and one that would pass it with its
 * photos at the smallest size, or with its figures alone, is refused with the reason, instead of ending in a tab that
 * dies with no message and no file.
 */
import { isDatasetPath } from '@/libs/reports/annotationPhotos';
import { isFigure } from '@/libs/reports/pdf/pdfAssets';
import { PHOTO_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';

/** The bytes of a photo of PHOTO_MAX_SIDE at the quality of the PDF, measured (a photo of 2,400 px made 0.42 MB) */
export const PHOTO_BYTES = 420 * 1000;
/** The bytes of a figure, measured: 300 items with a map snapshot each and no photo made a PDF of 128.7 MB */
export const FIGURE_BYTES = 430 * 1000;
/** The most bytes of images of a PDF: about 600 photos at full size, which the tab holds with room to spare */
export const PHOTO_BYTE_BUDGET = 250 * 1000 * 1000;
/** The smallest side a photo is made at, in pixels: six photos across a landscape page are about 110 points wide */
export const MIN_PHOTO_SIDE = 640;

/** @param {number} side the estimated bytes of a photo made at that long side */
export const photoBytesAt = side => PHOTO_BYTES * (side / PHOTO_MAX_SIDE) ** 2;

/** The most figures a PDF holds (with no photo). */
export const MOST_FIGURES = Math.floor(PHOTO_BYTE_BUDGET / FIGURE_BYTES);

/** The most photos a PDF with `figures` figures holds, at the smallest side. @param {number} figures */
export const mostPhotosWith = figures => Math.max(0, Math.floor((PHOTO_BYTE_BUDGET - figures * FIGURE_BYTES) / photoBytesAt(MIN_PHOTO_SIDE)));

/** The most photos a PDF holds, at the smallest side, when it has no figure. */
export const MOST_PHOTOS = mostPhotosWith(0);

/**
 * The photos of a model that the PDF embeds: the distinct files of the dataset (one photo in two places is made once).
 * @param {any} model
 * @returns {number}
 */
export function countPhotos(model) {
    /** @type {Set<string>} */
    const paths = new Set();
    for (const section of model.sections) {
        for (const block of section.blocks) {
            if (block.type === 'photoGrid') for (const photo of block.photos) if (isDatasetPath(photo.path)) paths.add(photo.path);
        }
    }
    return paths.size;
}

/**
 * The figures of a model that the PDF renders (isFigure).
 * @param {any} model
 * @returns {number}
 */
export function countFigures(model) {
    let count = 0;
    for (const section of model.sections) for (const block of section.blocks) if (isFigure(block)) count++;
    return count;
}

/**
 * @typedef {object} PhotoPlan
 * @property {number} count  the photos to embed
 * @property {number} figures  the figures to render
 * @property {number} maxSide  the long side to make the photos at, in pixels
 * @property {boolean} reduced  `maxSide` is below the usual one
 * @property {boolean} refused  the images do not fit the budget with the photos at the smallest side
 */

/**
 * The size the photos of a model are made at, in the room its figures leave.
 * @param {any} model
 * @returns {PhotoPlan}
 */
export function planPhotos(model) {
    const count = countPhotos(model);
    const figures = countFigures(model);
    const room = PHOTO_BYTE_BUDGET - figures * FIGURE_BYTES;
    const full = count * PHOTO_BYTES;
    if (room >= 0 && full <= room) return { count, figures, maxSide: PHOTO_MAX_SIDE, reduced: false, refused: false };
    const maxSide = room > 0 ? Math.floor(PHOTO_MAX_SIDE * Math.sqrt(room / full)) : 0;
    if (maxSide < MIN_PHOTO_SIDE) return { count, figures, maxSide: MIN_PHOTO_SIDE, reduced: count > 0, refused: true };
    return { count, figures, maxSide, reduced: true, refused: false };
}

/** What is said when the photos are made smaller. @param {PhotoPlan} plan */
export const reducedText = plan => `This report has ${plan.count} photos. To keep the PDF within what the browser can write, they are made smaller (${plan.maxSide} px on the long side instead of ${PHOTO_MAX_SIDE} px).`;

/** What is said when the images do not fit. @param {PhotoPlan} plan */
export function refusedText(plan) {
    const advice = 'Leave some items out of the report, or split it into several.';
    if (plan.figures > MOST_FIGURES) {
        return `This report has ${plan.figures} maps, charts and 3D snapshots, and a PDF holds at most ${MOST_FIGURES} (the browser would run out of memory writing it). ${advice}`;
    }
    const withFigures = plan.figures ? ` with its ${plan.figures} maps, charts and 3D snapshots` : '';
    return `This report has ${plan.count} photos, and a PDF holds at most ${mostPhotosWith(plan.figures)}${withFigures} (the browser would run out of memory writing it). ${advice}`;
}
