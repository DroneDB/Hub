/**
 * Handles saving and loading of GeoJSON measurement files. What is in the file (the version, the
 * application, the view sections, the migration of old files) is measurementFormat's: this reads
 * the file through it and writes what it gives back.
 */
import { pathutils } from 'ddb';
import { downloadText } from '@/libs/download';
import { isNotFound } from '@/libs/ddb/apiError';
import { VIEW, ownerOf, sectionOf, parse, write, MeasurementFileError } from '@/libs/map/measurementFormat';

/** Whether a path is a measurements file (`<name>_measurements.geojson` or `measurements.geojson`). */
export function isMeasurementFile(path) {
    return path.endsWith('_measurements.geojson') || pathutils.basename(path) === 'measurements.geojson';
}

/**
 * The views that keep measurements in the same file: the 2D map and the 3D point-cloud viewer
 * (the map of a folder with a point cloud saves next to it, like the 3D viewer does).
 */
export const MeasurementOwner = VIEW;

export { ownerOf };

const OWNER_LABEL = Object.freeze({ [MeasurementOwner.MAP]: '2D map', [MeasurementOwner.POINT_CLOUD]: '3D viewer' });

/**
 * What a save or a delete did, for the message of either view.
 * @param {{ fileName: string, count: number, deleted: boolean, owner: string }} result
 */
export function saveResultMessage(result) {
    if (result.count) return `Saved ${result.count} measurement${result.count > 1 ? 's' : ''} to "${result.fileName}"`;
    if (result.deleted) return `Removed "${result.fileName}": no measurements left`;
    const other = OWNER_LABEL[result.owner === MeasurementOwner.MAP ? MeasurementOwner.POINT_CLOUD : MeasurementOwner.MAP];
    return `Removed the ${OWNER_LABEL[result.owner]} measurements from "${result.fileName}" (the ${other} ones stay)`;
}

/**
 * The measurements file of an entry, as one view sees it. A view loads, saves and deletes its own
 * measurements only: those of the other view stay in the file as they are, and the file goes when
 * nothing is left in it.
 */
export class MeasurementStorage {
    /**
     * @param {Dataset} dataset - ddb dataset
     * @param {Entry} entry - the entry the measurements belong to (a raster, a point cloud or a folder's file)
     * @param {string} [owner] - the view that reads and writes (a MeasurementOwner)
     * @param {{ pointCloudCrs?: any }} [options] - `pointCloudCrs`: the SRS (or coordinate system) of the point cloud,
     *   for the migration of a file that does not state its own
     */
    constructor(dataset, entry, owner = MeasurementOwner.MAP, options = {}) {
        this.dataset = dataset;
        this.entry = entry;
        this.owner = owner;
        this.pointCloudCrs = options.pointCloudCrs ?? null;
        this.measurementPath = this.getMeasurementPath();
    }

    /**
     * Generate the measurements file path
     * @returns {string} GeoJSON file path
     */
    getMeasurementPath() {
        const path = this.entry.path;

        // If the path is already a measurements file, use it directly
        if (isMeasurementFile(path)) return path;

        // Remove extension and add _measurements.geojson
        return `${pathutils.dropExtension(path)}_measurements.geojson`;
    }

    _owns(feature) {
        return ownerOf(feature) === this.owner;
    }

    /**
     * The file as a 2.0 document, migrated in memory (a read never writes).
     * A file that is not there is the Registry's 404 (the client's ApiError with status 404, for a
     * missing file and for a folder that is not there either): the first save makes it. An empty file
     * (a 200 with no body) is a new file too. Any other failure (a network error, 401, 403, 5xx) is
     * not a missing file: the read throws, so a save does not replace what it could not read.
     * @returns {Promise<Object|null>} null when there is no file (or it is empty)
     * @throws {MeasurementFileError} when the file cannot be read or used: it is not touched, and a save
     *   stops there instead of replacing it with the view's measurements alone
     */
    async _read() {
        let content;
        try {
            content = await this.dataset.getFileContents(this.measurementPath);
        } catch (e) {
            if (isNotFound(e)) return null;
            throw new MeasurementFileError('unreadable', `The measurements file cannot be read: ${e && e.message ? e.message : e}`, { cause: e });
        }
        return parse(content, { pointCloudCrs: this.pointCloudCrs });
    }

    /**
     * Makes the file hold the given measurements of this view, next to those of the other view.
     * The file is removed when nothing is left in it. A file that cannot be read is not replaced.
     *
     * @param {Object} geojsonData - GeoJSON FeatureCollection of this view's measurements (the converter's
     *   document: its features and its section in `metadata.views`)
     * @returns {Promise<{path: string, fileName: string, count: number, deleted: boolean, owner: string}>}
     *   `count` measurements of this view are in the file; `deleted` when the file was removed.
     * @throws when the file cannot be read or written
     */
    async save(geojsonData) {
        try {
            const previous = await this._read();
            const own = geojsonData.features || [];
            const document = write(previous, this.owner, own, sectionOf(geojsonData, this.owner));
            const result = { path: this.measurementPath, fileName: this._fileName(), count: own.length, owner: this.owner };
            if (!document.features.length) {
                await this._deleteIfPresent();
                return { ...result, deleted: true };
            }

            const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/geo+json' });
            // The measurement file of this view: merged above, replaced here
            await this.dataset.writeObj(this.measurementPath, blob, { overwrite: true });
            return { ...result, deleted: false };
        } catch (error) {
            console.error('Failed to save measurements:', error);
            throw new Error(`Failed to save measurements: ${error.message}`, { cause: error });
        }
    }

    /**
     * Removes this view's measurements from the file (the file goes when nothing is left).
     * @returns {Promise<{path: string, fileName: string, count: number, deleted: boolean, owner: string}>}
     */
    deleteSaved() {
        return this.save({ type: 'FeatureCollection', features: [] });
    }

    /** Deletes the file; a file that is already gone is not an error. */
    async _deleteIfPresent() {
        try {
            await this.dataset.deleteObj(this.measurementPath);
        } catch (e) {
            if (!isNotFound(e)) throw e;
        }
    }

    /** Just the file name component of the storage path (for toasts). */
    _fileName() {
        return this.measurementPath ? pathutils.basename(this.measurementPath) : '';
    }

    /**
     * This view's saved measurements (with the file's metadata, and the view's own section).
     * @returns {Promise<Object|null>} GeoJSON, or null when the file has none of this view's
     * @throws {MeasurementFileError} when the file cannot be read or used
     */
    async load() {
        const document = await this._read();
        if (!document) return null;
        const features = document.features.filter(f => this._owns(f));
        if (!features.length) return null;
        const views = { [this.owner]: sectionOf(document, this.owner) };
        return { ...document, metadata: { ...document.metadata, views }, features };
    }

    /**
     * Export measurements as download: the 2.0 document of this view's measurements
     * @param {Object} geojsonData - GeoJSON FeatureCollection (see save)
     * @param {string} filename - Filename for download
     */
    exportToFile(geojsonData, filename = null) {
        const fname = filename || `measurements_${Date.now()}.geojson`;
        const document = write(null, this.owner, geojsonData.features || [], sectionOf(geojsonData, this.owner));
        downloadText(JSON.stringify(document, null, 2), fname, 'application/geo+json');

        console.log(`Measurements exported as: ${fname}`);
    }
}
