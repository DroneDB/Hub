/**
 * Handles saving and loading of GeoJSON measurement files
 */
import { pathutils } from 'ddb';
import { downloadText } from '@/libs/download';

/** Whether a path is a measurements file (`<name>_measurements.geojson` or `measurements.geojson`). */
export function isMeasurementFile(path) {
    return path.endsWith('_measurements.geojson') || pathutils.basename(path) === 'measurements.geojson';
}

/** A missing file, as the dataset API reports it. */
const isNotFound = e => !!(e && (e.status === 404 || /not found/i.test(String(e.message || ''))));

/**
 * The views that keep measurements in the same file: the 2D map and the 3D point-cloud viewer
 * (the map of a folder with a point cloud saves next to it, like the 3D viewer does).
 */
export const MeasurementOwner = Object.freeze({ MAP: 'map', POINT_CLOUD: 'pointCloud' });

const OWNER_LABEL = Object.freeze({ [MeasurementOwner.MAP]: '2D map', [MeasurementOwner.POINT_CLOUD]: '3D viewer' });

// Types that only the 3D viewer writes
const POINT_CLOUD_TYPES = new Set(['distance', 'height', 'circle', 'angle', 'annotation']);

// File metadata that belongs to one view: the other view's save leaves it as it is
const OWNED_METADATA = Object.freeze({ [MeasurementOwner.MAP]: ['groups'], [MeasurementOwner.POINT_CLOUD]: [] });

/**
 * The view a saved feature belongs to. The 3D viewer writes the local coordinates of every
 * feature (points and areas included, which the map also has); everything else is the map's.
 * @param {object} feature  GeoJSON feature
 * @returns {string} a MeasurementOwner
 */
export function ownerOf(feature) {
    const props = (feature && feature.properties) || {};
    return props.localCoordinates || POINT_CLOUD_TYPES.has(props.measurementType)
        ? MeasurementOwner.POINT_CLOUD
        : MeasurementOwner.MAP;
}

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
     */
    constructor(dataset, entry, owner = MeasurementOwner.MAP) {
        this.dataset = dataset;
        this.entry = entry;
        this.owner = owner;
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

    /** The file as it is (null when there is none or it cannot be read). */
    async _read() {
        try {
            const content = await this.dataset.getFileContents(this.measurementPath);
            if (!content || (typeof content === 'string' && !content.trim())) return null;
            const geojson = typeof content === 'string' ? JSON.parse(content) : content;
            return geojson && Array.isArray(geojson.features) ? geojson : null;
        } catch (e) {
            if (!isNotFound(e)) console.warn('Measurements file unreadable:', e);
            return null;
        }
    }

    /**
     * Makes the file hold the given measurements of this view, next to those of the other view.
     * The file is removed when nothing is left in it.
     *
     * @param {Object} geojsonData - GeoJSON FeatureCollection of this view's measurements
     * @returns {Promise<{path: string, fileName: string, count: number, deleted: boolean, owner: string}>}
     *   `count` measurements of this view are in the file; `deleted` when the file was removed.
     */
    async save(geojsonData) {
        try {
            const previous = await this._read();
            const kept = previous ? previous.features.filter(f => !this._owns(f)) : [];
            const own = geojsonData.features || [];
            const features = [...own, ...kept];
            const result = { path: this.measurementPath, fileName: this._fileName(), count: own.length, owner: this.owner };
            if (!features.length) {
                await this._deleteIfPresent();
                return { ...result, deleted: true };
            }

            // The other view's metadata stays; this view's is replaced
            const previousMetadata = { ...((previous && previous.metadata) || {}) };
            OWNED_METADATA[this.owner].forEach(key => { delete previousMetadata[key]; });
            const merged = {
                ...geojsonData,
                metadata: { ...previousMetadata, ...(geojsonData.metadata || {}), modifiedAt: new Date().toISOString() },
                features
            };
            const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/geo+json' });
            await this.dataset.writeObj(this.measurementPath, blob);
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
     * This view's saved measurements (with the file's metadata).
     * @returns {Promise<Object|null>} GeoJSON, or null when the file has none of this view's
     */
    async load() {
        const geojson = await this._read();
        if (!geojson) return null;
        const features = geojson.features.filter(f => this._owns(f));
        return features.length ? { ...geojson, features } : null;
    }

    /**
     * Export measurements as download
     * @param {Object} geojsonData - GeoJSON FeatureCollection
     * @param {string} filename - Filename for download
     */
    exportToFile(geojsonData, filename = null) {
        const fname = filename || `measurements_${Date.now()}.geojson`;
        downloadText(JSON.stringify(geojsonData, null, 2), fname, 'application/geo+json');

        console.log(`Measurements exported as: ${fname}`);
    }
}
