/**
 * The map's measurements: where they are saved (the sidecar of the one file on show, else the
 * measurements.geojson of the folder), load, save, export (GeoJSON, CSV), delete, clear, the
 * measurement list, groups and the units change.
 *
 * The map is a working copy of its measurements in that file: Save makes the file match the
 * map, and Delete saved removes them from it. The 3D viewer's measurements in the same file
 * (next to a point cloud) are not shown and stay as they are; the file goes when nothing is
 * left in it. The file is read once per owner; when the owner changes (another file, another
 * folder, a layer added to a view) the map shows the new file, and unsaved measurements are
 * offered a Save to the file they were made in first. The raster an analysis tool works on
 * does not decide the file: a tool never moves the measurements.
 *
 * Externals: measureControls, files, dataset, canWrite, canDelete, currentUnitPref,
 * showAlert, showFlash, choose(options) (a question as a promise of 'confirm' / 'secondary' / 'cancel'),
 * onFileWritten(path), onFileRemoved(path), onMeasurementsLoaded() (the file of the owner on show was read and shown).
 */
import { toRaw } from 'vue';
import ddb from 'ddb';
import { newId } from '@/libs/ids';
import { MeasurementStorage, MeasurementOwner, saveResultMessage, notifySaveRefused, notifyRenumbered } from '@/libs/map/measurementStorage';
import { measurementOwnerEntry } from '@/libs/map/measurementOwner';
import MeasureControls from '@/libs/map/controls/measureControl';
import { GROUP_COLOR } from '@/libs/map/mapUtils';
import { createFeatureScope } from '@/composables/featureScope';
import { escapeHtml } from '@/libs/sanitize';
import { measurementsToCsv } from '@/libs/map/measurementCsv';
import { downloadCsv } from '@/libs/csv';

const definition = {
    // The map is gone: the storage is let go, so an answer or a Reload notice that comes later finds it is not the map's
    beforeUnmount() {
        this.measurementStorage = null;
    },
    data() {
        return {
            measuring: false,
            measurementStorage: null,
            // The entry the measurements belong to (its storage path is derived from it)
            activeMeasurementEntry: null,
            hasSavedMeasurements: false,
            // Storage path of the measurements on the map (the file is read once per path)
            _loadedMeasurementPath: null,
            // A question about unsaved measurements (and the save it leads to) is going: no other change is handled meanwhile
            _switching: false,
            // Counts the changes of the map's measurements and of the file they match, for hasUnsavedMeasurements
            _changeTick: 0,
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
    computed: {
        // Whether the map has measurements that are not in the file. isDirty reads the control, which is not reactive:
        // the tick says when to ask it again (a change of the measurements, a load or a save)
        hasUnsavedMeasurements() {
            return this._changeTick >= 0 && !!this.measureControls && this.measureControls.isDirty();
        },

        // The refs of the annotations of the file that the map does not show (the 3D viewer's), repeats kept: the
        // measurement list warns of a ref used twice in the whole file. The storage's sequence is not reactive: the
        // tick says when to read it again (it changes with a load or a save)
        measurementListOtherRefs() {
            return this._changeTick >= 0 && this.measurementStorage ? [...toRaw(this.measurementStorage).refs.foreignRefs] : [];
        },

        // Where the measurements of the map are saved (the file of its owner); '' before the first load
        measurementsFilePath() {
            return this.measurementStorage ? this.measurementStorage.measurementPath : '';
        }
    },
    methods: {
        /**
         * Creates the measure control (into the `measureControls` external), wired to this
         * feature's save/clear/export/delete/list actions.
         * @param {{ openDialog: Function, onToolSelected?: Function, onFeatureRemoved?: Function, onFeatureModified?: Function }} host
         */
        createMeasureControls({ openDialog, onToolSelected = () => {}, onFeatureRemoved = () => {}, onFeatureModified = () => {} }) {
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
                getGroups: () => this.measurementGroups,
                // The refs of the file the map shows: the ones it issues come after them
                getRefSequence: () => (this.measurementStorage ? toRaw(this.measurementStorage).refs : null),
                // The Photos tab of a measurement's dialog: the dataset, the file the measurement is saved in (the uploads go
                // beside it), whether the user cannot change photos, and where an uploaded photo is told (the file list
                // shows it, as it shows the measurement file the map saves)
                getPhotoHost: () => (this.measurementStorage && this.dataset
                    ? { dataset: this.dataset, measurementPath: toRaw(this.measurementStorage).measurementPath, readOnly: !this.canWrite, onWritten: path => this.onFileWritten(path) }
                    : null),
                onMeasurementDeleted: feature => {
                    if (!feature) return;
                    const id = feature.get && feature.get('id');
                    if (id) this.deletedMeasurementIds.add(id);
                    onFeatureRemoved(feature);
                },
                onFeatureModified,
                canWrite: this.canWrite,
                canDelete: this.canDelete
            });
            // lifetime: owner (the measure control: its source goes with it, and the control is made once per map)
            this.measureControls.source.on('change', () => { this._changeTick++; });
            return this.measureControls;
        },

        /**
         * The entry the measurements belong to: the one file on show (its sidecar holds them), else the folder
         * (a folder's children, several files, a view with layers: the file of the folder of the first one).
         * The rule is libs/map/measurementOwner, which a report's links use too.
         */
        measurementOwnerEntry() {
            return measurementOwnerEntry(this.files);
        },

        // Whether the map still works on this storage (the state is reactive: its value is a proxy of the object)
        _isCurrentStorage(storage) {
            return toRaw(this.measurementStorage) === storage;
        },

        _setSaved(saved) {
            this.hasSavedMeasurements = saved;
            this.measureControls.setSavedState(saved);
        },

        // The map's measurements are the file's now (after a load or a save); what reads isDirty follows
        _markSaved() {
            this.measureControls.markSaved();
            this._changeTick++;
        },

        /**
         * Shows the saved measurements of the owner on show. Runs on every change of the files;
         * the file is read only when the owner changes, so the map never gets the same
         * measurements twice and keeps its unsaved edits while the owner stays. After a read that
         * failed, `reload` reads the file of the same owner again (the map then shows the file,
         * and the unsaved edits are dropped with a notice).
         * Unsaved edits are offered a Save to their own file before another one is shown (see
         * _settleUnsaved); a files change that comes while that question is open is not
         * handled on its own: the answer is followed by a read of whatever is on show then.
         */
        async loadSavedMeasurements({ reload = false } = {}) {
            if (!this.dataset || !this.measureControls || this._switching) return;
            const previous = this._loadedMeasurementPath;
            let entry = this.measurementOwnerEntry();
            let storage = new MeasurementStorage(this.dataset, entry, MeasurementOwner.MAP);
            if (storage.measurementPath === previous && !reload) return;

            if (previous && this.measureControls.isDirty()) {
                this._switching = true;
                try {
                    const next = storage.measurementPath;
                    if (!(await this._settleUnsaved(next, reload))) return;
                } finally {
                    this._switching = false;
                }
                // The files may have changed while the question was open: what is on show now is read
                entry = this.measurementOwnerEntry();
                storage = new MeasurementStorage(this.dataset, entry, MeasurementOwner.MAP);
                if (storage.measurementPath === previous && !reload) return;
            }
            this._loadedMeasurementPath = storage.measurementPath;

            this.measureControls.clearAllMeasurements();
            this.measurementGroups = [];
            this.deletedMeasurementIds.clear();
            this.activeMeasurementEntry = entry;
            this.measurementStorage = storage;
            this._setSaved(false);
            this._markSaved();
            this._loadAnnotationSchema(storage);

            let geojson;
            try {
                geojson = await storage.load();
            } catch (e) {
                // A file that cannot be read stays as it is: Save is refused until a read succeeds (Reload)
                console.error('Error loading measurements:', e);
                if (this._isCurrentStorage(storage)) {
                    this.showAlert('Error', `Could not load the saved measurements: ${e.message}`);
                }
                return;
            }
            // Another read (another owner, a Reload) or the end of the map took over while the file was read
            if (!this._isCurrentStorage(storage)) return;
            if (geojson) {
                const result = this.measureControls.importFromGeoJSON(geojson);
                if (result && result.groups) this.restoreGroupsFromMetadata(result.groups);
            }
            this._setSaved(!!geojson);
            this._markSaved();
            this.onMeasurementsLoaded();
        },

        // The organization's categories, severities and statuses, for the properties dialog (the default ones until they are read)
        async _loadAnnotationSchema(storage) {
            const schema = await storage.annotationSchema();
            if (this.measureControls && this._isCurrentStorage(storage)) this.measureControls.setAnnotationSchema(schema);
        },

        /**
         * What happens to the unsaved measurements when another file is about to be shown: the user
         * is asked to Save them to the file they were made in, to Discard them, or to keep editing them
         * (Cancel, Escape or the close button: nothing is lost by dismissing the question). Keeping them
         * leaves the map on their own file while other files are on show (the measurement list names it);
         * their next Save moves the map on to the file of what is on show. The question is not asked when a
         * save is not possible (a user who cannot write, a file that was not read, a Reload that
         * reads the same file again): they are dropped with a notice. A Save that does not
         * succeed (its alert says why) keeps the map as it is, with its own file, instead of dropping
         * what the user asked to keep.
         * @param {string} next  the measurements path about to be shown
         * @param {boolean} reload  a read of the same file again
         * @returns {Promise<boolean>}  whether the map goes on to show the new file
         */
        async _settleUnsaved(next, reload) {
            const own = toRaw(this.measurementStorage);
            if (!own) return false;
            if (reload || !this.canWrite || own.saveRefusal) {
                this.showFlash(`Unsaved measurement changes for "${ddb.pathutils.basename(own.measurementPath)}" discarded`, 'warning');
                return true;
            }
            const answer = await this.choose({
                title: 'Unsaved measurements',
                message: `Save the measurements to <strong>${escapeHtml(own.measurementPath)}</strong> before showing <strong>${escapeHtml(next)}</strong>?`,
                confirmText: 'Save',
                secondaryText: 'Discard',
                secondaryDanger: true,
                cancelText: 'Keep editing'
            });
            // The map was left while the question was open
            if (!this._isCurrentStorage(own)) return false;
            if (answer === 'cancel') return false;
            if (answer === 'secondary') return true;
            // The storage and the entry are still the previous file's: the Save writes the map to them
            await this.saveMeasurements();
            return !this.measureControls.isDirty();
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

            // The map does not show what the file holds (the read failed or is still going)
            const storage = toRaw(this.measurementStorage);
            if (notifySaveRefused(storage, () => this._isCurrentStorage(storage), () => this.loadSavedMeasurements({ reload: true }))) return;

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
                return;
            }
            // Measurements kept on their own file while other files came on show: saved, the map moves on
            if (!this._switching) await this.loadSavedMeasurements();
        },

        // The file holds what the map shows now: the saved state, the file list and a message follow
        _afterFileChange(result) {
            // The file numbered the measurements that had no reference (and renumbered the new ones whose reference
            // another session had taken): the map shows what the file holds, and is not changed by it
            this.measureControls.applyRefs(result.refs);
            notifyRenumbered(result);
            this._setSaved(result.count > 0);
            this._markSaved();
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
         * properties dialog of the selected measurement or point annotation.
         */
        handleEditMeasurementFromList(item) {
            if (!this.measureControls || !item || !item.feature) return;
            this.measurementListDialogOpen = false;
            this.measureControls.openPropertiesDialog(item.feature);
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
         * @param {Array} groups - Groups array from the map's section of the file (metadata.views.map.groups)
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
    return createFeatureScope({ ...definition, externals: { onFileWritten: none, onFileRemoved: none, onMeasurementsLoaded: none, ...externals } });
}
