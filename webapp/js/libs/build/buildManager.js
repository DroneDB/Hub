/**
 * Build Manager - delegates to taskMonitor for unified polling.
 *
 * It holds the Hangfire jobs of the builds of a dataset: how far a build is and why it failed.
 * Whether a build's output exists is not a job state: that is the artifacts the entry lists
 * (libs/build/entryBuild.js).
 *
 * Used by DetailPanel, EntryThumbnail, buildHelpers, fileAvailabilityChecker,
 * contextMenuItems, FileAvailabilityDialog, useDatasetActions and useDatasetListing.
 */

import { shallowReactive } from 'vue';
import taskMonitor from '@/libs/tasks/taskMonitor';
import { datasetKey, isActiveState, latestTaskByPath } from '@/libs/tasks/taskStates';
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
        // datasetKey -> Map<filePath, TaskSummaryDto>: the newest build task of each file. Reactive,
        // and each change replaces a dataset's map, so a view that reads a build state renders again
        this._buildByPath = shallowReactive(new Map());
        this.eventListeners = {};
        this.datasets = new Map();
        this._acquired = new Set(); // datasetKeys holding a taskMonitor reference
        this._listed = new Set(); // datasetKeys whose build states come from a fetched task list
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
        // Subscribe once; check against all registered datasets, not just the first one. Any change
        // of the task list counts: a state change, a new task, a task deleted
        if (!this._boundOnTasksUpdated) {
            this._boundOnTasksUpdated = ({ dataset: changed }) => {
                if (changed && this.datasets.has(this.getDatasetKey(changed))) this._sync(changed);
            };
            taskMonitor.on('tasksUpdated', this._boundOnTasksUpdated);
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
        this._listed.delete(key);
    }

    /**
     * Sync _buildByPath from the taskMonitor store: the newest build task of each file, and emit
     * 'buildStateChanged' for each file whose shown build changed (another task, another state, or
     * none). The first fetched list of a dataset only loads: nothing changed for the page yet.
     * Before that fetch the list is empty, so comparing against it would report every past
     * build as if it had just ended.
     */
    _sync(dataset) {
        const key = this.getDatasetKey(dataset);
        const prev = this._buildByPath.get(key);
        const updated = latestTaskByPath(taskMonitor.getTasks(dataset).filter(t => t.toolId === 'build'));

        // A build just started (startBuild) stays shown until the list has its task: a task of the
        // file that was not listed when it started, or one that is still running (a build already
        // in progress that the server reused)
        for (const [path, held] of prev ?? []) {
            if (!held.knownTaskIds) continue;
            const listed = updated.get(path);
            if (!listed || (held.knownTaskIds.has(listed.taskId) && !isActiveState(listed.state))) updated.set(path, held);
        }
        this._buildByPath.set(key, updated);
        if (!taskMonitor.isLoaded(dataset)) return;
        if (!this._listed.has(key)) {
            this._listed.add(key);
            return;
        }

        for (const path of new Set([...prev.keys(), ...updated.keys()])) {
            const before = prev.get(path);
            const after = updated.get(path);
            if (before?.taskId === after?.taskId && before?.state === after?.state) continue;
            this.emit('buildStateChanged', {
                dataset,
                filePath: path,
                previousState: before?.state ?? null,
                newState: after?.state ?? null,
                buildInfo: after ? { path, currentState: after.state } : null,
            });
        }
    }

    /* ---- build state queries (consume _buildByPath) ---- */

    hasActiveBuild(dataset, filePath) {
        const key = this.getDatasetKey(dataset);
        const cache = this._buildByPath.get(key);
        if (!cache || !cache.has(filePath)) return false;
        return isActiveState(cache.get(filePath).state);
    }

    /** Get build info for a file. Returns { path, currentState }. */
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

            // Shown as enqueued until the list has the new task (see _sync); a new map, so the
            // views that read the old one render again
            const key = this.getDatasetKey(dataset);
            const knownTaskIds = new Set(taskMonitor.getTasks(dataset)
                .filter(t => t.toolId === 'build' && t.path === filePath).map(t => t.taskId));
            const next = new Map(this._buildByPath.get(key) ?? []);
            next.set(filePath, { path: filePath, state: BUILD_STATES.ENQUEUED, knownTaskIds });
            this._buildByPath.set(key, next);

            // Trigger immediate refresh so the new build task shows up
            taskMonitor.forceRefresh(dataset);
            this.emit('buildStarted', { dataset, filePath, force });
            return true;
        } catch (error) {
            this.emit('buildError', { dataset, filePath, error: error.message });
            throw error;
        }
    }

    /* ---- load builds (delegates to taskMonitor) ---- */

    async loadBuilds(dataset) {
        const key = this.getDatasetKey(dataset);
        this.datasets.set(key, dataset);
        await taskMonitor.forceRefresh(dataset);
        this._sync(dataset);
        return taskMonitor.getTasks(dataset)
            .filter(t => t.toolId === 'build')
            .map(t => ({ path: t.path, currentState: t.state }));
    }

    // A task was just started: refresh now
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

    /* ---- cleanup ---- */

    cleanup() {
        for (const ds of Array.from(this.datasets.values())) this.unregisterDataset(ds);
        taskMonitor.off('tasksUpdated', this._boundOnTasksUpdated);
        this._boundOnTasksUpdated = null;
        this._buildByPath.clear();
        this.datasets.clear();
        this._acquired.clear();
        this._listed.clear();
        this.eventListeners = {};
    }
}

export { BUILD_STATES };
export default new BuildManager();