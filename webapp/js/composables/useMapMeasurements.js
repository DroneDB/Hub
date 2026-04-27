/**
 * Mixin for measurement management (save, export, delete, clear).
 * Shared between Map.vue and SingleMap.vue.
 *
 * The consuming component must provide:
 *   - this.measureControls   (olMeasure.Controls instance)
 *   - this.canWrite          (boolean)
 *   - this.canDelete         (boolean)
 *   - this.getActiveMeasurementEntry()  → the entry whose path is used for export/save
 *   - this.initMeasurementStorage()     → (re)initialize this.measurementStorage if needed
 */
export default {
    data() {
        return {
            measuring: false,
            measurementStorage: null,
            hasSavedMeasurements: false,
            clearMeasurementsDialogOpen: false,
            deleteSavedMeasurementsDialogOpen: false
        };
    },
    methods: {
        /**
         * Handle clear all measurements
         */
        onClearAllMeasurements() {
            this.measureControls.updateButtonsVisibility(false, this.hasSavedMeasurements);
        },

        /**
         * Save measurements
         */
        async saveMeasurements() {
            if (!this.canWrite) {
                this.showAlert('Permission Denied', 'You do not have permission to save measurements in this dataset');
                return;
            }

            if (!this.measureControls) {
                this.showAlert('Error', 'Cannot save: measurement controls not initialized');
                return;
            }

            if (!this.measureControls.hasMeasurements()) {
                this.showAlert('Warning', 'No measurements to save');
                return;
            }

            // Let the component initialize storage if needed
            if (!this.measurementStorage) {
                await this.initMeasurementStorage();

                if (!this.measurementStorage) {
                    this.showAlert('Error', 'Cannot save measurements: no valid target found.');
                    return;
                }
            }

            const activeEntry = this.getActiveMeasurementEntry();
            if (!activeEntry) {
                this.showAlert('Error', 'Cannot save: no entry found');
                return;
            }

            try {
                const geojson = this.measureControls.exportToGeoJSON(activeEntry.path);

                if (!geojson.features || geojson.features.length === 0) {
                    this.showAlert('Warning', 'No measurements to save');
                    return;
                }

                const result = await this.measurementStorage.save(geojson);
                this.hasSavedMeasurements = true;
                this.measureControls.updateButtonsVisibility(true, true);

                const fileName = (result && result.fileName) || 'measurements.geojson';
                console.log(`Saved ${geojson.features.length} measurements to ${fileName}`);
                this.showFlash(
                    `Saved ${geojson.features.length} measurement(s) to "${fileName}"`,
                    'positive', 'fa-regular fa-circle-check');
            } catch (e) {
                console.error('Error saving measurements:', e);
                this.showAlert('Error', `Failed to save measurements: ${e.message}`);
            }
        },

        /**
         * Export measurements to file
         */
        exportMeasurementsToFile() {
            const activeEntry = this.getActiveMeasurementEntry();
            if (!this.measureControls || !activeEntry) return;

            if (!this.measureControls.hasMeasurements()) {
                this.showAlert('Warning', 'No measurements to export');
                return;
            }

            const geojson = this.measureControls.exportToGeoJSON(activeEntry.path);

            if (!geojson.features || geojson.features.length === 0) {
                this.showAlert('Warning', 'No measurements to export');
                return;
            }

            if (this.measurementStorage) {
                this.measurementStorage.exportToFile(geojson);
            }
        },

        /**
         * Delete saved measurements
         */
        async deleteSavedMeasurements() {
            if (!this.measurementStorage) return;

            try {
                await this.measurementStorage.delete();
                this.hasSavedMeasurements = false;

                this.measureControls.clearAllMeasurements();
                this.measureControls.updateButtonsVisibility(
                    this.measureControls.hasMeasurements(),
                    false
                );

                console.log('Saved measurements deleted');
                this.showFlash('Saved measurements deleted', 'positive', 'fa-regular fa-circle-check');
            } catch (e) {
                console.error('Error deleting measurements:', e);
                this.showAlert('Error', `Failed to delete measurements: ${e.message}`);
            }
        },

        /**
         * Handle clear measurements confirm dialog close
         */
        handleClearMeasurementsDialogClose(result) {
            this.clearMeasurementsDialogOpen = false;
            if (result === 'confirm' && this.measureControls) {
                this.measureControls.confirmClearAll();
            }
        },

        /**
         * Handle delete saved measurements confirm dialog close
         */
        handleDeleteSavedMeasurementsDialogClose(result) {
            this.deleteSavedMeasurementsDialogOpen = false;
            if (result === 'confirm') {
                this.measureControls.confirmDeleteSaved();
            }
        },

        /**
         * Open measurement list dialog
         */
        openMeasurementListDialog() {
            if (!this.measureControls) return;
            this.measurementListItems = this.measureControls.getMeasurementsList();
            this.measurementListDialogOpen = true;
        },

        /**
         * Delete a measurement from the list dialog
         */
        handleDeleteMeasurementFromList(item) {
            if (!this.measureControls || !item.feature) return;
            this.measureControls.deleteMeasurement(item.feature);
            // Refresh the list
            this.measurementListItems = this.measureControls.getMeasurementsList();
            if (this.measurementListItems.length === 0) {
                this.measurementListDialogOpen = false;
            }
        }
    }
};
