/**
 * Handles saving and loading of GeoJSON measurement files
 */
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
        const fileName = path.split('/').pop();
        if (path.endsWith('_measurements.geojson') || fileName === 'measurements.geojson') {
            return path;
        }

        // Remove extension and add _measurements.geojson
        const lastDot = path.lastIndexOf('.');
        const basePath = lastDot > 0 ? path.substring(0, lastDot) : path;

        return `${basePath}_measurements.geojson`;
    }

    /**
     * Save measurements as GeoJSON file.
     *
     * Foreign feature types (stockpiles or anything written by other DroneDB
     * subsystems into the same file) are preserved verbatim - we only replace
     * features whose `measurementType` is one of the regular 2D types managed
     * by olMeasure.
     *
     * @param {Object} geojsonData - GeoJSON FeatureCollection from olMeasure.
     * @returns {Promise<{path: string, fileName: string}>} Storage path info.
     */
    async save(geojsonData) {
        try {
            const ownedTypes = new Set(['point', 'length', 'area']);
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
                if (!(e && (e.status === 404 || /not found/i.test(String(e.message || ''))))) {
                    console.warn('Existing measurements file unreadable; will overwrite:', e);
                }
            }

            const merged = {
                ...geojsonData,
                metadata: {
                    ...(geojsonData.metadata || {}),
                    modifiedAt: new Date().toISOString()
                },
                features: [...(geojsonData.features || []), ...foreign]
            };

            const content = JSON.stringify(merged, null, 2);
            const blob = new Blob([content], { type: 'application/geo+json' });

            await this.dataset.writeObj(this.measurementPath, blob);

            console.log(`Measurements saved to: ${this.measurementPath} (${merged.features.length} feature(s), ${foreign.length} preserved)`);
            return { path: this.measurementPath, fileName: this._fileName() };
        } catch (error) {
            console.error('Failed to save measurements:', error);
            throw new Error(`Failed to save measurements: ${error.message}`);
        }
    }

    /** Just the file name component of the storage path (for toasts). */
    _fileName() {
        const p = this.measurementPath || '';
        const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
        return idx >= 0 ? p.substring(idx + 1) : p;
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
        } catch (error) {
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
            throw new Error(`Failed to delete measurements: ${error.message}`);
        }
    }

    /**
     * Export measurements as download
     * @param {Object} geojsonData - GeoJSON FeatureCollection
     * @param {string} filename - Filename for download
     */
    exportToFile(geojsonData, filename = null) {
        const fname = filename || `measurements_${Date.now()}.geojson`;
        const content = JSON.stringify(geojsonData, null, 2);
        const blob = new Blob([content], { type: 'application/geo+json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`Measurements exported as: ${fname}`);
    }
}
