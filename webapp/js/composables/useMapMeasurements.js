/**
 * The map's measurements: where they are saved (the first georaster / point cloud on
 * show, else the folder's measurements.geojson), load, save, export, delete, clear,
 * the measurement list, groups and the units change.
 *
 * Externals: measureControls, files, dataset, canWrite, canDelete, currentUnitPref,
 * showAlert, showFlash.
 */
import ddb from 'ddb';
import { newId } from '@/libs/ids';
import { MeasurementStorage } from '@/libs/map/measurementStorage';
import MeasureControls from '@/libs/map/controls/measureControl';
import { GROUP_COLOR } from '@/libs/map/mapUtils';
import { createFeatureScope } from '@/composables/featureScope';

const definition = {
    data() {
        return {
            measuring: false,
            measurementStorage: null,
            // The entry the measurements belong to (its storage path is derived from it)
            activeMeasurementEntry: null,
            hasSavedMeasurements: false,
            // Group create/rename dialog
            measurementGroupDialogOpen: false,
            pendingGroupForRename: null,
            // Units change confirmation (with measurements on the map)
            changeUnitsDialogOpen: false,
            changeUnitsTargetUnit: 'metric',
            changeUnitsMeasurementsCount: 0,
            clearMeasurementsDialogOpen: false,
            deleteSavedMeasurementsDialogOpen: false,
            // Measurement groups (array of { id, name, color, visible, collapsed })
            measurementGroups: [],
            // Measurement list dialog
            measurementListDialogOpen: false,
            measurementListItems: [],
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
         * Creates the measure control (into the `measureControls` external), wired to this
         * feature's save/clear/export/delete/list actions.
         * @param {{ openDialog: Function, onToolSelected?: Function, onFeatureRemoved?: Function }} host
         */
        createMeasureControls({ openDialog, onToolSelected = () => {}, onFeatureRemoved = () => {} }) {
            this.measureControls = new MeasureControls({
                openDialog,
                onToolSelected: () => { this.measuring = true; onToolSelected(); },
                onToolDeselected: () => { this.measuring = false; },
                onSave: () => { this.saveMeasurements(); },
                onClearAll: () => { this.onClearAllMeasurements(); },
                onExport: () => { this.exportMeasurementsToFile(); },
                onDeleteSaved: () => { this.deleteSavedMeasurements(); },
                onRequestClearConfirm: () => { this.clearMeasurementsDialogOpen = true; },
                onRequestDeleteConfirm: () => { this.deleteSavedMeasurementsDialogOpen = true; },
                onListOpen: () => { this.openMeasurementListDialog(); },
                onMeasurementDeleted: feature => {
                    if (!feature) return;
                    const id = feature.get && feature.get('id');
                    if (id) this.deletedMeasurementIds.add(id);
                    onFeatureRemoved(feature);
                },
                canWrite: this.canWrite,
                canDelete: this.canDelete
            });
            return this.measureControls;
        },

        // measurements.geojson in the folder on show (the measurements of a view without rasters)
        standaloneMeasurementEntry() {
            const first = this.files.find(f => f.entry && f.entry.path);
            const folder = first ? ddb.pathutils.getParentFolder(first.entry.path) || '' : '';
            return { path: folder ? `${folder}/measurements.geojson` : 'measurements.geojson' };
        },

        /**
         * Loads the saved measurements: those of the first georaster / point cloud on show,
         * else the folder's measurements.geojson.
         */
        async loadSavedMeasurements() {
            if (!this.dataset || !this.measureControls) return;
            const T = ddb.entry.type;
            const anchor = this.files.find(f => f.entry && (f.entry.type === T.GEORASTER || f.entry.type === T.POINTCLOUD));
            this.activeMeasurementEntry = anchor ? anchor.entry : this.standaloneMeasurementEntry();
            this.measurementStorage = new MeasurementStorage(this.dataset, this.activeMeasurementEntry);

            let geojson = null;
            try {
                geojson = await this.measurementStorage.load();
            } catch (e) {
                if (anchor) console.error('Error loading measurements:', e);
            }
            this.hasSavedMeasurements = !!(geojson && geojson.features && geojson.features.length);
            if (this.hasSavedMeasurements) {
                const result = this.measureControls.importFromGeoJSON(geojson);
                if (result && result.groups) this.restoreGroupsFromMetadata(result.groups);
                this.measureControls.updateButtonsVisibility(true, true);
            } else if (!anchor) {
                // No standalone file yet: initMeasurementStorage creates it on the first save
                this.activeMeasurementEntry = null;
                this.measurementStorage = null;
            }
        },

        // (Re)creates the storage, with the folder's file as the fallback
        async initMeasurementStorage() {
            await this.loadSavedMeasurements();
            if (!this.measurementStorage && this.dataset) {
                this.activeMeasurementEntry = this.standaloneMeasurementEntry();
                this.measurementStorage = new MeasurementStorage(this.dataset, this.activeMeasurementEntry);
            }
        },

        // Units from the settings dialog: confirm first when measurements are on the map
        handleUnitsChanged(newUnit) {
            if (this.measureControls && this.measureControls.hasMeasurements()) {
                this.changeUnitsTargetUnit = newUnit;
                this.changeUnitsMeasurementsCount = this.measureControls.getMeasurementsCount();
                this.changeUnitsDialogOpen = true;
            } else {
                this.measureControls.applyUnitsChange(newUnit);
                this.currentUnitPref = newUnit;
            }
        },

        async handleChangeUnitsDialogClose(result) {
            this.changeUnitsDialogOpen = false;
            if (result !== 'confirm') return;
            this.measureControls.applyUnitsChange(this.changeUnitsTargetUnit);
            this.currentUnitPref = this.changeUnitsTargetUnit;
            // Save the measurements in the new units
            await this.saveMeasurements();
        },

        openCreateGroupDialog() {
            this.pendingGroupForRename = null;
            this.measurementGroupDialogOpen = true;
        },

        openRenameGroupDialog(group) {
            this.pendingGroupForRename = group;
            this.measurementGroupDialogOpen = true;
        },

        handleGroupDialogSave(groupData) {
            if (this.pendingGroupForRename) this.renameGroup(this.pendingGroupForRename, groupData);
            else this.createGroup(groupData);
            this.pendingGroupForRename = null;
            this.measurementGroupDialogOpen = false;
        },

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

            const activeEntry = this.activeMeasurementEntry;
            if (!activeEntry) {
                this.showAlert('Error', 'Cannot save: no entry found');
                return;
            }

            try {
                const geojson = this.measureControls.exportToGeoJSON(activeEntry.path, this.measurementGroups);

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
            const activeEntry = this.activeMeasurementEntry;
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
                this.measureControls.openPropertiesDialog(feature, { showDelete: true, groups: this.measurementGroups });
            }
        },

        // ── Group management ────────────────────────────────────────────

        /**
         * Create a new group
         * @param {{ name: string, color: string }} groupData
         */
        createGroup(groupData) {
            const id = newId();
            this.measurementGroups = [
                ...this.measurementGroups,
                { id, name: groupData.name, color: groupData.color || GROUP_COLOR, visible: true, collapsed: false }
            ];
            this.measurementListItems = this.measureControls ? this.measureControls.getMeasurementsList() : [];
        },

        /**
         * Rename an existing group
         * @param {{ id: string }} group
         * @param {{ name: string, color: string }} groupData
         */
        renameGroup(group, groupData) {
            this.measurementGroups = this.measurementGroups.map(g =>
                g.id === group.id ? { ...g, name: groupData.name, color: groupData.color || g.color } : g
            );
        },

        /**
         * Delete a group and all its measurements
         * @param {{ id: string }} group
         */
        deleteGroup(group) {
            if (!this.measureControls) return;
            // Delete all features belonging to this group
            const items = this.measureControls.getMeasurementsList();
            items.filter(m => m.groupId === group.id).forEach(m => {
                const id = m.feature.get('id');
                if (id && this.deletedMeasurementIds) this.deletedMeasurementIds.add(id);
                this.measureControls.deleteMeasurement(m.feature);
            });
            // Remove the group itself
            this.measurementGroups = this.measurementGroups.filter(g => g.id !== group.id);
            // Refresh list
            this.measurementListItems = this.measureControls.getMeasurementsList();
            if (this.measurementListItems.length === 0) {
                this.measurementListDialogOpen = false;
            }
        },

        /**
         * Toggle visibility of a group
         * @param {string} groupId
         */
        toggleGroupVisibility(groupId) {
            const group = this.measurementGroups.find(g => g.id === groupId);
            if (!group) return;
            const newVisible = !group.visible;
            this.measurementGroups = this.measurementGroups.map(g =>
                g.id === groupId ? { ...g, visible: newVisible } : g
            );
            if (this.measureControls && typeof this.measureControls.setGroupVisibility === 'function') {
                this.measureControls.setGroupVisibility(groupId, newVisible);
            }
        },

        /**
         * Move a measurement to a different group (or ungroup it)
         * @param {{ feature: ol.Feature }} item - Measurement item from the list
         * @param {string} groupId - Target group ID, or '' to ungroup
         */
        moveMeasurementToGroup(item, groupId) {
            if (!this.measureControls || !item.feature) return;
            this.measureControls.setMeasurementGroupId(item.feature, groupId);
            // Refresh list
            this.measurementListItems = this.measureControls.getMeasurementsList();
        },

        /**
         * Called after loading measurements from storage: restore groups from GeoJSON metadata.
         * @param {Array} groups - Groups array from geojson.metadata.groups
         */
        restoreGroupsFromMetadata(groups) {
            if (Array.isArray(groups) && groups.length > 0) {
                this.measurementGroups = groups;
            }
        }
    }
};

/**
 * HQ-07: a composable. The feature's state and methods live on their own scope
 * (createFeatureScope); `externals` supplies what it needs from the map view.
 * @param {Record<string, any>} externals
 */
export function useMapMeasurements(externals) {
    return createFeatureScope({ ...definition, externals });
}
