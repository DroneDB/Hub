// @ts-check
/**
 * The photos of an annotation (`photos` in its properties): the rules of the entries the file stores, the names of the
 * images an editor uploads, the geometry that is sent to the coverage query, and where the "approximate location"
 * marker goes on a photo. Pure functions, no request: the dataset's I/O is libs/reports/photoFiles.
 *
 * A photo is `{ path, source, pixel?, caption? }`: `path` is a path of the dataset (never an address, never above the
 * dataset), `source` says how it got there ('coverage': pinned from the coverage query, 'dataset': picked, 'upload':
 * uploaded next to the measurement file), `pixel` the [x, y] in the full image where the annotation is, as the
 * coverage query gave it, and `caption` up to 200 characters. The file holds the path, never the image.
 */
import GeoJSON from 'ol/format/GeoJSON';
import pathutils from '@/libs/ddb/pathutils';
import { EPSG } from '@/libs/constants';
import { FIELD_LIMITS, idOf } from '@/libs/map/annotationIds';
import { LEGACY_GEOMETRY, VIEW, sectionOf } from '@/libs/map/measurementFormat';

/** How a photo came to the annotation. */
export const PHOTO_SOURCE = Object.freeze({ COVERAGE: 'coverage', DATASET: 'dataset', UPLOAD: 'upload' });
const SOURCES = new Set(Object.values(PHOTO_SOURCE));

/** The most photos an annotation has. */
export const MAX_PHOTOS = FIELD_LIMITS.photos;
/** The longest caption of a photo. */
export const MAX_CAPTION = FIELD_LIMITS.caption;
/** The images an editor can upload (what the browser draws and the report can embed). */
export const UPLOAD_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'gif']);
/** The folder next to the measurement file that holds the uploaded photos (and the 3D captures). */
export const ANNOTATIONS_FOLDER = 'annotations';
const MAX_PATH_LENGTH = 1024;

/**
 * Whether a text is a path of the dataset that is safe to use: relative to the dataset root, made of named segments (no
 * empty one, no `.` or `..`), with no backslash or control character, and not an address (`https://...`, `C:...`).
 * @param {any} path
 * @returns {path is string}
 */
export function isDatasetPath(path) {
    if (typeof path !== 'string' || !path || path.length > MAX_PATH_LENGTH) return false;
    if (path.startsWith('/') || path.includes('\\') || [...path].some(c => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path) || /^[a-zA-Z]:/.test(path)) return false;
    return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

/** @param {any} pixel @returns {pixel is [number, number]} */
const isPixel = pixel => Array.isArray(pixel) && pixel.length === 2 && pixel.every(n => typeof n === 'number' && Number.isFinite(n));

/**
 * Why a stored photo cannot be used, or '' when it can: its path is not a dataset path, its source is unknown, its
 * pixel is not a pair of numbers or its caption is too long.
 * @param {any} photo
 * @returns {string}
 */
export function photoIssue(photo) {
    if (!photo || typeof photo !== 'object') return 'Not a photo';
    if (!isDatasetPath(photo.path)) return 'The path is not a path of this dataset';
    if (!SOURCES.has(photo.source)) return 'Unknown source';
    if (photo.pixel !== undefined && photo.pixel !== null && !isPixel(photo.pixel)) return 'The location in the photo is not valid';
    if (photo.caption !== undefined && (typeof photo.caption !== 'string' || photo.caption.length > MAX_CAPTION)) return 'The caption is too long';
    return '';
}

/**
 * The photo as the file stores it: only its known members, a caption trimmed to its limit and absent when empty, a
 * pixel only when it is a pair of numbers.
 * @param {{ path: string, source: string, pixel?: any, caption?: any }} photo
 * @returns {{ path: string, source: string, pixel?: [number, number], caption?: string }}
 */
export function storedPhoto(photo) {
    const caption = typeof photo.caption === 'string' ? photo.caption.trim().slice(0, MAX_CAPTION) : '';
    return {
        path: photo.path,
        source: photo.source,
        ...(isPixel(photo.pixel) ? { pixel: [photo.pixel[0], photo.pixel[1]] } : {}),
        ...(caption ? { caption } : {})
    };
}

/**
 * The photos an annotation stores: none is the key left out (undefined), so that the file has no empty list.
 * @param {any[]} photos
 * @returns {ReturnType<typeof storedPhoto>[] | undefined}
 */
export function storedPhotos(photos) {
    return photos.length ? photos.map(photo => (photoIssue(photo) ? photo : storedPhoto(photo))) : undefined;
}

/**
 * Sets (or removes, for no photos) the `photos` of the object that holds the properties of an annotation.
 * @param {Record<string, any>} target
 * @param {any[] | undefined} photos
 * @returns {Record<string, any>} the target
 */
export function applyPhotos(target, photos) {
    if (photos && photos.length) target.photos = photos;
    else delete target.photos;
    return target;
}

/**
 * Why no photo can be added now, or '' when one can.
 * @param {any[]} photos  the photos the annotation has
 */
export function addBlockReason(photos) {
    return photos.length >= MAX_PHOTOS ? `An annotation has at most ${MAX_PHOTOS} photos` : '';
}

/** @param {any[]} photos @param {string} path */
export const hasPhoto = (photos, path) => photos.some(photo => photo?.path === path);

/**
 * The photos with one more at the end. The same path is never listed twice (pinning a photo that is there leaves it as
 * it is) and the limit is never passed.
 * @param {any[]} photos
 * @param {{ path: string, source: string, pixel?: any, caption?: any }} photo
 * @returns {any[]}
 * @throws {Error} when the photo is not valid, or the annotation has the most it can
 */
export function withPhoto(photos, photo) {
    const issue = photoIssue(photo);
    if (issue) throw new Error(issue);
    if (hasPhoto(photos, photo.path)) return photos;
    const blocked = addBlockReason(photos);
    if (blocked) throw new Error(blocked);
    return [...photos, storedPhoto(photo)];
}

/**
 * The text a screen reader says for a photo: the annotation and the caption, or the file name when it has none.
 * @param {string} itemName
 * @param {{ path?: string, caption?: string }} photo
 */
export function photoAlt(itemName, photo) {
    const label = photo.caption?.trim() || (photo.path ? pathutils.basename(photo.path) : '');
    return [itemName?.trim(), label].filter(Boolean).join(' - ') || 'Photo';
}

/**
 * The extension (lower case, no dot) of an image that can be uploaded, '' for any other file.
 * @param {string} fileName
 */
export function uploadExtension(fileName) {
    const extension = pathutils.extname(String(fileName || '')).slice(1);
    return UPLOAD_EXTENSIONS.includes(extension) ? extension : '';
}

/**
 * The folder that holds the uploaded photos of the annotations of a measurement file: `annotations` next to it.
 * @param {string} measurementPath  the path of the measurement file in the dataset
 * @returns {string}
 */
export function annotationsFolder(measurementPath) {
    const folder = pathutils.getParentFolder(measurementPath);
    return folder ? `${folder}/${ANNOTATIONS_FOLDER}` : ANNOTATIONS_FOLDER;
}

/**
 * Where the next uploaded photo of an annotation goes: `<folder of the measurement file>/annotations/<id>-<n>.<ext>`
 * with the lowest `n` from 1 that no file of the annotation has, whatever its extension (so `<id>-1.jpg` and `<id>-1.png`
 * never both exist). The name has the `id`, not the `ref`, because a ref can change. Names are compared without regard
 * to letter case, as the Registry refuses a path that exists in any case.
 * @param {string} measurementPath
 * @param {string} id  the id of the annotation
 * @param {string} extension  lower case, with no dot
 * @param {Iterable<string>} [taken]  the paths that are used already (the folder's files and the annotation's photos)
 * @returns {string}
 */
export function nextUploadPath(measurementPath, id, extension, taken = []) {
    const stem = String(id || '').replace(/[^A-Za-z0-9._-]/g, '_');
    if (!stem) throw new Error('An annotation needs an id before a photo can be uploaded');
    if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new Error('The extension of the photo is not valid');
    const folder = annotationsFolder(measurementPath);
    const prefix = `${folder}/${stem}-`.toLowerCase();
    const used = new Set();
    for (const path of taken) {
        const name = path.toLowerCase();
        const number = name.startsWith(prefix) ? /^(\d+)\.[^/.]+$/.exec(name.slice(prefix.length)) : null;
        if (number) used.add(Number(number[1]));
    }
    let n = 1;
    while (used.has(n)) n++;
    return `${folder}/${stem}-${n}.${extension}`;
}

/**
 * Whether the annotations of a measurement document have a place on the earth: the document states its CRS and its
 * 3D features were not left with the geometry of an older writer (the cloud had no CRS to work them out with).
 * @param {any} document  as measurementFormat reads or writes it
 */
export function isGeoreferenced(document) {
    return !!document?.crs && !sectionOf(document, VIEW.POINT_CLOUD)[LEGACY_GEOMETRY];
}

/**
 * The geometry to send to the coverage query: the WGS84 Point, LineString or Polygon of an annotation, or null when
 * it has none that can be asked (it is not georeferenced, or it is a kind the query does not take).
 * @param {any} geometry  a GeoJSON geometry in EPSG:4326
 * @param {{ georeferenced?: boolean }} [options]
 * @returns {{ type: string, coordinates: any } | null}
 */
export function coverageGeometry(geometry, { georeferenced = true } = {}) {
    if (!georeferenced || !geometry || !Array.isArray(geometry.coordinates)) return null;
    if (!['Point', 'LineString', 'Polygon'].includes(geometry.type)) return null;
    const numbers = geometry.coordinates.flat(3);
    return numbers.length && numbers.every((/** @type {any} */ n) => typeof n === 'number' && Number.isFinite(n))
        ? { type: geometry.type, coordinates: geometry.coordinates }
        : null;
}

/**
 * The coverage geometry of a feature of the 2D map (its geometry is in the map's projection).
 * @param {import('ol/Feature').default | null | undefined} feature
 */
export function mapFeatureGeometry(feature) {
    const geometry = feature?.getGeometry?.();
    if (!geometry) return null;
    const written = new GeoJSON().writeGeometryObject(geometry, { dataProjection: EPSG.WGS84, featureProjection: EPSG.WEB_MERCATOR });
    return coverageGeometry(written);
}

/**
 * The coverage geometry of an annotation of a measurement document, by its id: null when the document is not
 * georeferenced (a point cloud with no usable CRS: its items are not sent to the query) or has no such feature.
 * @param {any} document
 * @param {string} id
 */
export function documentFeatureGeometry(document, id) {
    const feature = (Array.isArray(document?.features) ? document.features : []).find((/** @type {any} */ f) => idOf(f) === id);
    return coverageGeometry(feature?.geometry, { georeferenced: isGeoreferenced(document) });
}

/**
 * Where the "approximate location" marker goes on a photo, as percentages of its width and height: the pixel the
 * coverage query gave, over the size of the full image. Null when there is no pixel, the size is not known, or the
 * pixel is not inside the image.
 * @param {any} pixel
 * @param {{ width?: number, height?: number } | null | undefined} size  the dimensions of the full image
 * @returns {{ left: number, top: number } | null}
 */
export function markerPosition(pixel, size) {
    const width = Number(size?.width);
    const height = Number(size?.height);
    if (!isPixel(pixel) || !(width > 0) || !(height > 0)) return null;
    const [x, y] = pixel;
    if (x < 0 || y < 0 || x > width || y > height) return null;
    return { left: (x / width) * 100, top: (y / height) * 100 };
}
