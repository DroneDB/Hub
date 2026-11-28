// @ts-check
/**
 * How many bytes of photos a PDF may hold, decided from the model before any image is made. Every photo is kept as a data
 * URL until the library writes the file, and the tab then needs about 4.5 times the bytes of the images (measured in
 * Chromium: 1.2 GB for 200 photos, 2.5 GB for 600, 4.1 GB for 1,200, which a tab capped at 4 GB did not survive). The
 * heap of the page stays small, so nothing shows it before the tab is gone. A report that would pass the budget has its
 * photos made smaller (the bytes of a JPEG follow its area), and one that would pass it at the smallest size is refused
 * with the reason, instead of ending in a tab that dies with no message and no file.
 */
import { isDatasetPath } from '@/libs/reports/annotationPhotos';
import { PHOTO_MAX_SIDE } from '@/libs/reports/pdf/pdfImages';

/** The bytes of a photo of PHOTO_MAX_SIDE at the quality of the PDF, measured (a photo of 2,400 px made 0.42 MB) */
export const PHOTO_BYTES = 420 * 1000;
/** The most bytes of photos of a PDF: about 600 photos at full size, which the tab holds with room to spare */
export const PHOTO_BYTE_BUDGET = 250 * 1000 * 1000;
/** The smallest side a photo is made at, in pixels: six photos across a landscape page are about 110 points wide */
export const MIN_PHOTO_SIDE = 640;

/** @param {number} side the estimated bytes of a photo made at that long side */
export const photoBytesAt = side => PHOTO_BYTES * (side / PHOTO_MAX_SIDE) ** 2;

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
 * @typedef {object} PhotoPlan
 * @property {number} count  the photos to embed
 * @property {number} maxSide  the long side to make them at, in pixels
 * @property {boolean} reduced  `maxSide` is below the usual one
 * @property {boolean} refused  they do not fit the budget at the smallest side
 */

/**
 * The size the photos of a model are made at.
 * @param {any} model
 * @returns {PhotoPlan}
 */
export function planPhotos(model) {
    const count = countPhotos(model);
    const full = count * PHOTO_BYTES;
    if (full <= PHOTO_BYTE_BUDGET) return { count, maxSide: PHOTO_MAX_SIDE, reduced: false, refused: false };
    const maxSide = Math.floor(PHOTO_MAX_SIDE * Math.sqrt(PHOTO_BYTE_BUDGET / full));
    if (maxSide < MIN_PHOTO_SIDE) return { count, maxSide: MIN_PHOTO_SIDE, reduced: true, refused: true };
    return { count, maxSide, reduced: true, refused: false };
}

/** The most photos a PDF holds, at the smallest side. */
export const MOST_PHOTOS = Math.floor(PHOTO_BYTE_BUDGET / photoBytesAt(MIN_PHOTO_SIDE));

/** What is said when the photos are made smaller. @param {PhotoPlan} plan */
export const reducedText = plan => `This report has ${plan.count} photos. To keep the PDF within what the browser can write, they are made smaller (${plan.maxSide} px on the long side instead of ${PHOTO_MAX_SIDE} px).`;

/** What is said when the photos do not fit. @param {PhotoPlan} plan */
export const refusedText = plan => `This report has ${plan.count} photos, and a PDF holds at most ${MOST_PHOTOS} (the browser would run out of memory writing it). Leave some items out of the report, or split it into several.`;
