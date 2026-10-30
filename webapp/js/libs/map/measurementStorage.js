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

export class MeasurementStorage {
    /**
     * @param {Dataset} dataset - ddb dataset
     * @param {Entry} entry - Point cloud entry
     */
    constructor(dataset, entry) {
        this.dataset = dataset;
        this.entry = entry;
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

    /**
     * Measurement types the 2D map owns: every type it writes from its measurement layer
     * (stockpiles, contours and raster profiles included, or each save would write them twice). When saving,
     * features of these types are replaced by the incoming GeoJSON; the others (the 3D
     * viewer's) are kept as they are.
     */
    static OL_MEASURE_OWNED_TYPES = Object.freeze(['point', 'length', 'area', 'stockpile', 'contour', 'profile']);

    /**
     * Set of measurement types considered "owned" by the Potree (3D point
     * cloud) viewer.
     */
    static POTREE_OWNED_TYPES = Object.freeze(['point', 'distance', 'area', 'height', 'circle', 'angle', 'annotation']);

    /**
     * Save measurements as GeoJSON file.
     *
     * Foreign feature types (anything written by other DroneDB subsystems
     * into the same file) are preserved verbatim - we only replace features
     * whose `measurementType` is in `ownedTypes`. Defaults to the 2D
     * map measure-control types for backward compatibility; callers from the 3D
     * Potree viewer must pass `POTREE_OWNED_TYPES`.
     *
     * @param {Object} geojsonData - GeoJSON FeatureCollection from the caller.
     * @param {Object} [options]
     * @param {Iterable<string>} [options.ownedTypes] - measurementType values
     *   the caller fully owns and intends to overwrite.
     * @returns {Promise<{path: string, fileName: string, deleted: boolean}>} Storage path info;
     *   `deleted` when nothing was left to keep, so the file was removed instead of written.
     */
    async save(geojsonData, options = {}) {
        try {
            const ownedTypes = new Set(options.ownedTypes || MeasurementStorage.OL_MEASURE_OWNED_TYPES);
            // Read the existing file (if any) and keep all foreign features.
            let foreign = [];
            try {
                const prev = await this.dataset.getFileContents(this.measurementPath);
                if (prev && (typeof prev !== 'string' || prev.trim())) {
                    const parsed = JSON.parse(prev);
                    if (parsed && Array.isArray(parsed.features)) {
                        foreign = parsed.features.filter(f => {
                            const t = f && f.properties && f.properties.measurementType;
                            return !t || !ownedTypes.has(t);
                        });
                    }
                }
            } catch (e) {
                // 404 / missing / unreadable: nothing to preserve.
                if (!isNotFound(e)) {
                    console.warn('Existing measurements file unreadable; will overwrite:', e);
                }
            }

            const features = [...(geojsonData.features || []), ...foreign];
            if (!features.length) {
                await this._deleteIfPresent();
                console.log(`Measurements file removed (nothing left): ${this.measurementPath}`);
                return { path: this.measurementPath, fileName: this._fileName(), deleted: true };
            }

            const merged = {
                ...geojsonData,
                metadata: {
                    ...(geojsonData.metadata || {}),
                    modifiedAt: new Date().toISOString()
                },
                features
            };

            const content = JSON.stringify(merged, null, 2);
            const blob = new Blob([content], { type: 'application/geo+json' });

            await this.dataset.writeObj(this.measurementPath, blob);

            console.log(`Measurements saved to: ${this.measurementPath} (${merged.features.length} feature(s), ${foreign.length} preserved)`);
            return { path: this.measurementPath, fileName: this._fileName(), deleted: false };
        } catch (error) {
            console.error('Failed to save measurements:', error);
            throw new Error(`Failed to save measurements: ${error.message}`, { cause: error });
        }
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
     * Load measurements from GeoJSON file
     * @returns {Promise<Object|null>} GeoJSON or null if not found
     */
    async load() {
        try {
            const content = await this.dataset.getFileContents(this.measurementPath);

            if (!content || content.trim() === '') {
                return null;
            }

            const geojson = JSON.parse(content);
            console.log(`Measurements loaded from: ${this.measurementPath}`);

            return geojson;
        } catch (error) {
            // File doesn't exist or parsing error
            if (error.status === 404) {
                console.log('No measurements file found');
                return null;
            }

            console.error('Failed to load measurements:', error);
            return null;
        }
    }

    /**
     * Check if a measurements file exists
     * @returns {Promise<boolean>}
     */
    async exists() {
        try {
            await this.dataset.list(this.measurementPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Delete the measurements file
     * @returns {Promise<void>}
     */
    async delete() {
        try {
            await this.dataset.deleteObj(this.measurementPath);
            console.log(`Measurements deleted: ${this.measurementPath}`);
        } catch (error) {
            console.error('Failed to delete measurements:', error);
            throw new Error(`Failed to delete measurements: ${error.message}`, { cause: error });
        }
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
