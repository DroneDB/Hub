/**
 * The map's measurements: where they are saved (the first georaster / point cloud on
 * show, else the folder's measurements.geojson), load, save, export (GeoJSON, CSV), delete, clear,
 * the measurement list, groups and the units change.
 *
 * The map is a working copy of its measurements in that file: Save makes the file match the
 * map, and Delete saved removes them from it. The 3D viewer's measurements in the same file
 * (next to a point cloud) are not shown and stay as they are; the file goes when nothing is
 * left in it. The file is read once per target; when the target changes (another folder),
 * the map shows the new file and unsaved measurements are dropped with a notice.
 *
 * Externals: measureControls, files, dataset, canWrite, canDelete, currentUnitPref,
 * showAlert, showFlash, onFileWritten(path), onFileRemoved(path).
 */
import ddb from 'ddb';
import { newId } from '@/libs/ids';
import { MeasurementStorage, MeasurementOwner, saveResultMessage } from '@/libs/map/measurementStorage';
import MeasureControls from '@/libs/map/controls/measureControl';
import { GROUP_COLOR } from '@/libs/map/mapUtils';
import { createFeatureScope } from '@/composables/featureScope';
import { measurementsToCsv } from '@/libs/map/measurementCsv';
import { downloadCsv } from '@/libs/csv';

const definition = {
    data() {
        return {
            measuring: false,
            measurementStorage: null,
            // The entry the measurements belong to (its storage path is derived from it)
            activeMeasurementEntry: null,
            hasSavedMeasurements: false,
            // Storage path of the measurements on the map (the file is read once per path)
            _loadedMeasurementPath: null,
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
                onExportCsv: () => { this.exportMeasurementsToCsv(); },
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

        // The entry the measurements belong to: the first georaster / point cloud on show, else the folder
        _measurementTargetEntry() {
            const T = ddb.entry.type;
            const anchor = this.files.find(f => f.entry && (f.entry.type === T.GEORASTER || f.entry.type === T.POINTCLOUD));
            return anchor ? anchor.entry : this.standaloneMeasurementEntry();
        },

        _setSaved(saved) {
            this.hasSavedMeasurements = saved;
            this.measureControls.setSavedState(saved);
        },

        /**
         * Shows the saved measurements of the target on show. Runs on every change of the
         * files; the file is read only when the target changes, so the map never gets the
         * same measurements twice and keeps its unsaved edits while the target stays.
         */
        async loadSavedMeasurements() {
            if (!this.dataset || !this.measureControls) return;
            const entry = this._measurementTargetEntry();
            const storage = new MeasurementStorage(this.dataset, entry, MeasurementOwner.MAP);
            const previous = this._loadedMeasurementPath;
            if (storage.measurementPath === previous) return;
            this._loadedMeasurementPath = storage.measurementPath;

            if (previous && this.measureControls.isDirty()) {
                this.showFlash(`Unsaved measurement changes for "${ddb.pathutils.basename(previous)}" discarded`, 'warning');
            }
            this.measureControls.clearAllMeasurements();
            this.measurementGroups = [];
            this.deletedMeasurementIds.clear();
            this.activeMeasurementEntry = entry;
            this.measurementStorage = storage;
            this._setSaved(false);
            this.measureControls.markSaved();

            const geojson = await storage.load();
            // Another target took over while the file was read
            if (this._loadedMeasurementPath !== storage.measurementPath) return;
            if (geojson) {
                const result = this.measureControls.importFromGeoJSON(geojson);
                if (result && result.groups) this.restoreGroupsFromMetadata(result.groups);
            }
            this._setSaved(!!geojson);
            this.measureControls.markSaved();
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
            // Save the measurements in the new units; a user who cannot write only sees them in the new units
            if (this.canWrite) await this.saveMeasurements();
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
            // The map was emptied; the saved file (if any) stays until the next Save,
            // so deletion tracking can be cleared as well.
            this.deletedMeasurementIds.clear();
        },

        /**
         * Makes the file match the map: writes the measurements, or removes them (and the file
         * when nothing is left in it). The file list hears of either.
         */
        async saveMeasurements() {
            if (!this.canWrite) {
                this.showAlert('Permission Denied', 'You do not have permission to save measurements in this dataset');
                return;
            }

            if (!this.measureControls || !this.measurementStorage) {
                this.showAlert('Error', 'Cannot save: measurement controls not initialized');
                return;
            }

            const geojson = this.measureControls.exportToGeoJSON(this.activeMeasurementEntry.path, this.measurementGroups);
            const count = geojson.features ? geojson.features.length : 0;
            if (!count && !this.hasSavedMeasurements) {
                this.showAlert('Warning', 'No measurements to save');
                return;
            }

            try {
                this._afterFileChange(await this.measurementStorage.save(geojson));
            } catch (e) {
                console.error('Error saving measurements:', e);
                this.showAlert('Error', `Failed to save measurements: ${e.message}`);
            }
        },

        // The file holds what the map shows now: the saved state, the file list and a message follow
        _afterFileChange(result) {
            this._setSaved(result.count > 0);
            this.measureControls.markSaved();
            // The file mirrors the map, so the "logically deleted" IDs are no longer relevant
            this.deletedMeasurementIds.clear();
            if (result.deleted) this.onFileRemoved(result.path);
            else this.onFileWritten(result.path);
            this.showFlash(saveResultMessage(result), 'positive');
        },

        // The measurements to export, as GeoJSON; null (with a warning when there are none) otherwise
        _exportableMeasurements() {
            const activeEntry = this.activeMeasurementEntry;
            if (!this.measureControls || !activeEntry) return null;
            const geojson = this.measureControls.hasMeasurements()
                ? this.measureControls.exportToGeoJSON(activeEntry.path, this.measurementGroups)
                : null;
            if (!geojson || !geojson.features || geojson.features.length === 0) {
                this.showAlert('Warning', 'No measurements to export');
                return null;
            }
            return geojson;
        },

        /** Downloads the measurements as a GeoJSON file */
        exportMeasurementsToFile() {
            const geojson = this._exportableMeasurements();
            if (geojson && this.measurementStorage) this.measurementStorage.exportToFile(geojson);
        },

        /** Downloads the measurements as a CSV table, with the values in the units the map shows */
        exportMeasurementsToCsv() {
            const geojson = this._exportableMeasurements();
            if (!geojson) return;
            downloadCsv(measurementsToCsv(geojson, this.measurementGroups, this.measureControls.unitPref),
                `measurements_${Date.now()}.csv`);
        },

        /**
         * Removes the map's measurements from the file and from the map
         */
        async deleteSavedMeasurements() {
            if (!this.measurementStorage) return;

            try {
                const result = await this.measurementStorage.deleteSaved();
                this.measureControls.clearAllMeasurements();
                this._afterFileChange(result);
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
 * The feature's state and methods live on their own scope
 * (createFeatureScope); `externals` supplies what it needs from the map view.
 * @param {Record<string, any>} externals
 */
export function useMapMeasurements(externals) {
    const none = () => () => {};
    return createFeatureScope({ ...definition, externals: { onFileWritten: none, onFileRemoved: none, ...externals } });
}
