/**
 * Build Manager - delegates to taskMonitor for unified polling.
 *
 * Public API preserved for backward compatibility with existing consumers:
 * DetailPanel, Thumbnail, buildHelpers, fileAvailabilityChecker,
 * contextMenuItems, FileAvailabilityDialog, useFileOperations, useDialogManager.
 */

import taskMonitor from '@/libs/tasks/taskMonitor';
import ddb from 'ddb';

const BUILDABLE_TYPES = [
    ddb.entry.type.POINTCLOUD,
    ddb.entry.type.GEORASTER,
    ddb.entry.type.MODEL,
    ddb.entry.type.VECTOR,
    ddb.entry.type.GAUSSIAN_SPLAT
];

// Build states according to Hangfire / JobIndex states
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

const ACTIVE_STATES = [
    BUILD_STATES.AWAITING,
    BUILD_STATES.CREATED,
    BUILD_STATES.ENQUEUED,
    BUILD_STATES.PROCESSING,
    BUILD_STATES.SCHEDULED
];

class BuildManager {
    constructor() {
        this._buildByPath = new Map(); // datasetKey -> Map<filePath, TaskSummaryDto>
        this.eventListeners = {};
        this.datasets = new Map();
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

    /* ---- dataset key (mirrors old getDatasetKey) ---- */

    getDatasetKey(dataset) {
        return dataset.baseApi || `${dataset.org}/${dataset.ds}`;
    }

    /* ---- buildable type helpers ---- */

    isBuildableType(entryType) {
        return BUILDABLE_TYPES.includes(entryType);
    }

    /* ---- dataset registration & initialisation ---- */

    registerDataset(dataset) {
        const key = this.getDatasetKey(dataset);
        this.datasets.set(key, dataset);
        this._boundOnStateChange = this._boundOnStateChange || ((data) => {
            if (data.dataset && data.dataset.baseApi === dataset.baseApi) {
                this._sync(data.dataset);
                this.emit('buildStateChanged', data);
            }
        });
        // Start the unified poller and listen for state changes
        taskMonitor.start(dataset);
        taskMonitor.on('buildStateChanged', this._boundOnStateChange);
        this._sync(dataset);
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
        return ACTIVE_STATES.includes(cache.get(filePath).state);
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
            if (!this.isBuildableType(entry.type)) {
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

    // Legacy API that consumers may still call — now forwards to taskMonitor
    startPolling(dataset)  { taskMonitor.start(dataset); }
    stopPolling(dataset)   { taskMonitor.stop(dataset); }

    /* ---- file-added callbacks ---- */

    async startPollingForNewFiles(dataset, fileEntries = []) {
        const buildableFiles = fileEntries.filter(e => e && this.isBuildableType(e.type));
        if (buildableFiles.length > 0) {
            taskMonitor.onFilesAdded(dataset);
            this.emit('newBuildableFilesDetected', {
                dataset,
                filePaths: buildableFiles.map(e => e.path),
            });
        }
    }

    hasNewBuildableFiles(dataset, fileEntries = []) {
        return fileEntries.some(entry => {
            if (!entry || !this.isBuildableType(entry.type)) return false;
            const bs = this.getBuildState(dataset, entry.path);
            return !bs || bs.currentState !== BUILD_STATES.SUCCEEDED;
        });
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

    /* ---- readiness helpers ---- */

    async isFileReadyForViewing(dataset, entry, _viewType) {
        if (!this.isBuildableType(entry.type)) return true;
        const bs = this.getBuildState(dataset, entry.path);
        if (bs) return bs.currentState === BUILD_STATES.SUCCEEDED;
        // Fallback: check taskMonitor store directly
        const builds = taskMonitor.getTasks(dataset).filter(t => t.toolId === 'build');
        const cur = builds.find(b => b.path === entry.path);
        if (cur) return cur.state === BUILD_STATES.SUCCEEDED;
        return false;
    }

    async waitForBuildCompletion(dataset, filePath, maxWaitMs = 300000) {
        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            const tick = async () => {
                try {
                    if (Date.now() - startTime > maxWaitMs) {
                        reject(new Error('Timeout waiting for build completion'));
                        return;
                    }
                    this._sync(dataset);
                    const bs = this.getBuildState(dataset, filePath);
                    if (!bs) { setTimeout(tick, 3000); return; }
                    if (bs.currentState === BUILD_STATES.SUCCEEDED) { resolve(bs); return; }
                    if (bs.currentState === BUILD_STATES.FAILED) {
                        reject(new Error(`Build failed for ${filePath}`));
                        return;
                    }
                    setTimeout(tick, 3000);
                } catch (e) { reject(e); }
            };
            tick();
        });
    }

    /* ---- cleanup ---- */

    cleanup() {
        for (const ds of this.datasets.values()) taskMonitor.stop(ds);
        taskMonitor.off('buildStateChanged', this._boundOnStateChange);
        this._buildByPath.clear();
        this.datasets.clear();
        this.eventListeners = {};
    }
}

export { BUILD_STATES };
export default new BuildManager();