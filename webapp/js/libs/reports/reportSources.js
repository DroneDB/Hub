// @ts-check
/**
 * Reads the measurement files a report names, one result per source, for the report model: the file as a 3.0
 * document, or the reason it could not be read. A source that fails does not stop the others: the report lists
 * it with its error. A read never writes.
 *
 * A file with 3D measures is read as the 3D viewer reads it: with the CRS of its point cloud's COPC, taken from the
 * cloud's entry (copcSrsOf), which the report measures them in, and the CRS a file that states none was written in
 * (unstatedMeasurementCrs). A cloud that cannot be listed leaves the file as it is: its measures are measured in the
 * CRS it states.
 */
import { parse, sectionOf, ownerOf, VIEW } from '@/libs/map/measurementFormat';
import { localPointsOf } from '@/libs/map/pointCloudGeometry';
import { copcSrsOf, unstatedMeasurementCrs } from '@/libs/build/pointCloudCrs';
import { isNotFound } from '@/libs/ddb/apiError';

/**
 * @typedef {object} SourceDataset
 * @property {(path: string) => Promise<any>} getFileContents
 * @property {(path: string) => Promise<any>} [listOne]  the entry of a path (the point cloud of a file with 3D measures)
 */

/**
 * The entry of the point cloud whose 3D measures a document holds, or null: the document has none with points, names
 * no point cloud, or the cloud cannot be listed.
 * @param {SourceDataset} dataset
 * @param {Record<string, any>} document
 */
async function measuredCloudOf(dataset, document) {
    const cloud = sectionOf(document, VIEW.POINT_CLOUD).pointCloudFile;
    const features = Array.isArray(document.features) ? document.features : [];
    if (typeof cloud !== 'string' || !cloud || typeof dataset.listOne !== 'function'
        || !features.some((/** @type {any} */ f) => ownerOf(f) === VIEW.POINT_CLOUD && localPointsOf(f))) return null;
    try {
        return await dataset.listOne(cloud);
    } catch (e) {
        console.warn(`The point cloud ${cloud} could not be listed: its measures keep the CRS of their file`, e);
        return null;
    }
}

/**
 * @param {SourceDataset} dataset
 * @param {string} file
 * @returns {Promise<{ file: string, document: Record<string, any> | null, pointCloudCrs?: string | null } | { file: string, error: string }>}
 */
export async function loadReportSource(dataset, file) {
    let content;
    try {
        content = await dataset.getFileContents(file);
    } catch (e) {
        if (isNotFound(e)) return { file, error: 'The file does not exist' };
        return { file, error: `The file cannot be read: ${e instanceof Error && e.message ? e.message : String(e)}` };
    }
    let document;
    try {
        document = parse(content);
    } catch (e) {
        return { file, error: e instanceof Error && e.message ? e.message : String(e) };
    }
    if (!document) return { file, error: 'The file is empty' };
    const cloud = await measuredCloudOf(dataset, document);
    if (!cloud) return { file, document };
    const pointCloudCrs = copcSrsOf(cloud);
    return { file, document: withCloudCrs(content, document, unstatedMeasurementCrs(cloud, pointCloudCrs)), pointCloudCrs };
}

/**
 * The file read again with the CRS the cloud had when a file that states none was written (what the viewer gives its
 * read), or the first read when there is no such CRS.
 * @param {any} content  the file as it was fetched (it was read once already)
 * @param {Record<string, any>} document  the first read
 * @param {any} crs
 */
function withCloudCrs(content, document, crs) {
    if (!crs) return document;
    try {
        return parse(content, { pointCloudCrs: crs }) ?? document;
    } catch {
        return document;
    }
}

/**
 * The sources of a definition, read all at once.
 * @param {SourceDataset} dataset
 * @param {{ file: string, label: string }[]} sources  the `sources` of the definition
 */
export function loadReportSources(dataset, sources) {
    return Promise.all(sources.map(async source => ({ label: source.label, ...(await loadReportSource(dataset, source.file)) })));
}
