/**
 * Build Manager - delegates to taskMonitor for unified polling.
 *
 * It holds the Hangfire jobs of the builds of a dataset: how far a build is and why it failed.
 * Whether a build's output exists is not a job state: that is the artifacts the entry lists
 * (libs/build/entryBuild.js).
 *
 * Public API preserved for backward compatibility with existing consumers:
 * DetailPanel, Thumbnail, buildHelpers, fileAvailabilityChecker,
 * contextMenuItems, FileAvailabilityDialog, useDatasetActions, useDatasetListing.
 */

import taskMonitor from '@/libs/tasks/taskMonitor';
import { datasetKey, isActiveState } from '@/libs/tasks/taskStates';
import { isBuilt } from '@/libs/build/entryBuild';
import { isBuildableType } from '@/libs/entryTypeCapabilities';

// Build job states according to Hangfire / JobIndex states (progress and failures, not availability)
const BUILD_STATES = {
    AWAITING: 'Awaiting',
    CREATED: 'Created',
    DELETED: 'Deleted',
    ENQUEUED: 'Enqueued',
    FAILED: 'Failed',
    PROCESSING: 'Processing',
    SCHEDULED: 'Scheduled',
    SUCCEEDED: 'Succeeded'
};


class BuildManager {
    constructor() {
        this._buildByPath = new Map(); // datasetKey -> Map<filePath, TaskSummaryDto>
        this.eventListeners = {};
        this.datasets = new Map();
        this._acquired = new Set(); // datasetKeys holding a taskMonitor reference
    }

    /* ---- event system ---- */

    on(event, callback) {
        if (!this.eventListeners[event]) this.eventListeners[event] = [];
        this.eventListeners[event].push(callback);
    }
    off(event, callback) {
        if (this.eventListeners[event]) {
            const idx = this.eventListeners[event].indexOf(callback);
            if (idx > -1) this.eventListeners[event].splice(idx, 1);
        }
    }
    emit(event, data) {
        (this.eventListeners[event] || []).forEach(cb => {
            try { cb(data); } catch (e) { console.error('Event listener error:', e); }
        });
    }

    /* ---- dataset key (libs/tasks/taskStates) ---- */

    getDatasetKey(dataset) {
        return datasetKey(dataset);
    }

    /* ---- dataset registration & initialisation ---- */

    registerDataset(dataset) {
        const key = this.getDatasetKey(dataset);
        this.datasets.set(key, dataset);
        // Subscribe once; check against all registered datasets, not just the first one
        if (!this._boundOnStateChange) {
            this._boundOnStateChange = (data) => {
                if (data.dataset && this.datasets.has(this.getDatasetKey(data.dataset))) {
                    this._sync(data.dataset);
                    this.emit('buildStateChanged', data);
                }
            };
            taskMonitor.on('buildStateChanged', this._boundOnStateChange);
        }
        // Start the unified poller for this dataset (once per dataset, released on unregister)
        if (!this._acquired.has(key)) {
            this._acquired.add(key);
            taskMonitor.acquire(dataset);
        }
        this._sync(dataset);
    }

    /** Drop this dataset's monitor reference and cached build state. */
    unregisterDataset(dataset) {
        const key = this.getDatasetKey(dataset);
        if (this._acquired.delete(key)) taskMonitor.release(dataset);
        this.datasets.delete(key);
        this._buildByPath.delete(key);
    }

    /** Sync _buildByPath from taskMonitor store (filtered on toolId='build'). */
    _sync(dataset) {
        const key = this.getDatasetKey(dataset);
        const prev = this._buildByPath.get(key) || new Map();
        const updated = new Map();

        for (const task of taskMonitor.getTasks(dataset)) {
            if (task.toolId === 'build' && task.path) {
                updated.set(task.path, task);
            }
        }
        this._buildByPath.set(key, updated);

        // Emit state changes
        for (const [path, task] of updated) {
            const prevEntry = prev.get(path);
            if (prevEntry && prevEntry.state !== task.state) {
                this.emit('buildStateChanged', {
                    dataset,
                    filePath: path,
                    previousState: prevEntry.state,
                    newState: task.state,
                    buildInfo: { path, currentState: task.state },
                });
            }
        }
    }

    /* ---- build state queries (consume _buildByPath) ---- */

    hasActiveBuild(dataset, filePath) {
        const key = this.getDatasetKey(dataset);
        const cache = this._buildByPath.get(key);
        if (!cache || !cache.has(filePath)) return false;
        return isActiveState(cache.get(filePath).state);
    }

    /** Get build info for a file. Returns { path, currentState } to match old BuildJobDto. */
    getBuildState(dataset, filePath) {
        const key = this.getDatasetKey(dataset);
        const cache = this._buildByPath.get(key);
        if (!cache || !cache.has(filePath)) return null;
        const task = cache.get(filePath);
        return { path: task.path, currentState: task.state };
    }

    /* ---- start/force build ---- */

    async startBuild(dataset, filePath, force = false) {
        try {
            const entry = await dataset.listOne(filePath);
            if (!isBuildableType(entry.type)) {
                throw new Error(`File type ${entry.type} is not buildable`);
            }
            if (this.hasActiveBuild(dataset, filePath) && !force) {
                throw new Error(`Build already in progress for ${filePath}`);
            }
            await dataset.build(filePath, force);

            // Update cache with temporary "Enqueued" state
            const key = this.getDatasetKey(dataset);
            const cache = this._buildByPath.get(key) || new Map();
            cache.set(filePath, { path: filePath, state: BUILD_STATES.ENQUEUED });
            this._buildByPath.set(key, cache);

            // Trigger immediate refresh so the new build task shows up
            taskMonitor.forceRefresh(dataset);
            this.emit('buildStarted', { dataset, filePath, force });
            return true;
        } catch (error) {
            this.emit('buildError', { dataset, filePath, error: error.message });
            throw error;
        }
    }

    /* ---- load builds (backward compat, delegates to taskMonitor) ---- */

    async loadBuilds(dataset) {
        const key = this.getDatasetKey(dataset);
        this.datasets.set(key, dataset);
        await taskMonitor.forceRefresh(dataset);
        this._sync(dataset);
        return taskMonitor.getTasks(dataset)
            .filter(t => t.toolId === 'build')
            .map(t => ({ path: t.path, currentState: t.state }));
    }

    // Legacy API that consumers may still call — a task was just started, so refresh now
    startPolling(dataset)  { taskMonitor.forceRefresh(dataset); }

    /* ---- file-added callbacks ---- */

    async startPollingForNewFiles(dataset, fileEntries = []) {
        const buildableFiles = fileEntries.filter(e => e && isBuildableType(e.type));
        if (buildableFiles.length > 0) {
            taskMonitor.onFilesAdded(dataset);
            this.emit('newBuildableFilesDetected', {
                dataset,
                filePaths: buildableFiles.map(e => e.path),
            });
        }
    }

    /** Whether any of the entries (as just listed) is buildable and has no complete build. */
    hasNewBuildableFiles(dataset, fileEntries = []) {
        return fileEntries.some(entry => entry && isBuildableType(entry.type) && !isBuilt(entry));
    }

    async onFilesAdded(dataset, fileEntries) {
        if (!fileEntries || fileEntries.length === 0) return;
        if (this.hasNewBuildableFiles(dataset, fileEntries)) {
            await this.startPollingForNewFiles(dataset, fileEntries);
        }
    }

    monitorDatasetForBuilds(dataset) {
        this.registerDataset(dataset);
        this.loadBuilds(dataset).catch(e => console.error('Error monitoring dataset for builds:', e));
    }

    /* ---- cleanup ---- */

    cleanup() {
        for (const ds of Array.from(this.datasets.values())) this.unregisterDataset(ds);
        taskMonitor.off('buildStateChanged', this._boundOnStateChange);
        this._boundOnStateChange = null;
        this._buildByPath.clear();
        this.datasets.clear();
        this._acquired.clear();
        this.eventListeners = {};
    }
}

export { BUILD_STATES };
export default new BuildManager();