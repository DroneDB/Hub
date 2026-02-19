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
     * Save measurements as GeoJSON file
     * @param {Object} geojsonData - GeoJSON FeatureCollection
     * @returns {Promise<Object>} Server response
     */
    async save(geojsonData) {
        try {
            // Update timestamp
            if (geojsonData.metadata) {
                geojsonData.metadata.modifiedAt = new Date().toISOString();
            }

            const content = JSON.stringify(geojsonData, null, 2);
            const blob = new Blob([content], { type: 'application/geo+json' });

            const result = await this.dataset.writeObj(this.measurementPath, blob);

            console.log(`Measurements saved to: ${this.measurementPath}`);
            return result;
        } catch (error) {
            console.error('Failed to save measurements:', error);
            throw new Error(`Failed to save measurements: ${error.message}`);
        }
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
