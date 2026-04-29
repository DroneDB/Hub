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
            deleteSavedMeasurementsDialogOpen: false,
            // Tracks IDs of measurements deleted in the current session via the
            // Measurement List dialog. Used to filter persisted features (e.g.
            // stockpiles) that would otherwise be re-hydrated from the saved
            // GeoJSON file. Reset whenever the file is rewritten (save) or
            // wiped (delete-saved/clear-all).
            deletedMeasurementIds: new Set()
        };
    },
    methods: {
        /**
         * Handle clear all measurements
         */
        onClearAllMeasurements() {
            this.measureControls.updateButtonsVisibility(false, this.hasSavedMeasurements);
            // In-memory state was reset; the saved file (if any) is unchanged,
            // so deletion tracking can be cleared as well.
            if (this.deletedMeasurementIds) this.deletedMeasurementIds.clear();
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

                // The persisted file now mirrors the in-memory state, so any
                // previously "logically deleted" IDs are no longer relevant.
                if (this.deletedMeasurementIds) this.deletedMeasurementIds.clear();

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
                if (this.deletedMeasurementIds) this.deletedMeasurementIds.clear();

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
            // Track the ID so persisted re-hydration logic (e.g. the Stockpile
            // panel restoring the last saved pile) can filter it out until the
            // next save/delete-saved.
            const id = item.feature.get('id');
            if (id && this.deletedMeasurementIds) this.deletedMeasurementIds.add(id);
            this.measureControls.deleteMeasurement(item.feature);
            // Refresh the list
            this.measurementListItems = this.measureControls.getMeasurementsList();
            if (this.measurementListItems.length === 0) {
                this.measurementListDialogOpen = false;
            }
        },

        /**
         * Edit a measurement from the list dialog: close the list and open the
         * properties dialog for the selected feature. Point annotations have a
         * dedicated dialog flow (color + description) so route those there.
         */
        handleEditMeasurementFromList(item) {
            if (!this.measureControls || !item || !item.feature) return;
            this.measurementListDialogOpen = false;
            const feature = item.feature;
            if (feature.get('measurementType') === 'point') {
                this.measureControls.openPointAnnotationDialog(feature, this.measureControls.getMap(), true);
            } else {
                this.measureControls.openPropertiesDialog(feature, { showDelete: true });
            }
        }
    }
};
