/**
 * Build Manager - Manages build state, polling and cache
 *
 * ARCHITECTURE NOTE:
 * This manager works with actual file entries that contain real type information,
 * NOT file paths or extensions. Components should pass actual entry objects
 * with type, path, and other metadata rather than strings or guessed types.
 *
 * USAGE:
 * - onFilesAdded(dataset, [entry1, entry2, ...]) - with actual entries
 * - isBuildableType(entry.type) - with real entry type
 * - No extension-based type guessing
 */

import ddb from 'ddb';

const POLL_INTERVAL = 5000; // 5 seconds
const BUILDABLE_TYPES = [
    ddb.entry.type.POINTCLOUD,
    ddb.entry.type.GEORASTER,
    ddb.entry.type.MODEL,
    ddb.entry.type.VECTOR
];

// Build states according to Hangfire
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

// "Active" states that require polling
const ACTIVE_STATES = [
    BUILD_STATES.AWAITING,
    BUILD_STATES.CREATED,
    BUILD_STATES.ENQUEUED,
    BUILD_STATES.PROCESSING,
    BUILD_STATES.SCHEDULED
];

class BuildManager {
    constructor() {
        this.buildCache = new Map(); // Map<datasetKey, Map<filePath, buildInfo>>
        this.pollingTimers = new Map(); // Map<datasetKey, timerId>
        this.eventListeners = {};
        this.datasets = new Map(); // Map<datasetKey, dataset>
    }

    /**
     * Registers a dataset for build monitoring
     */
    registerDataset(dataset) {
        const key = this.getDatasetKey(dataset);
        this.datasets.set(key, dataset);

        if (!this.buildCache.has(key)) {
            this.buildCache.set(key, new Map());
        }
    }

    /**
     * Checks if a file type is buildable
     */
    isBuildableType(entryType) {
        return BUILDABLE_TYPES.includes(entryType);
    }

    /**
     * Checks if a file has an active/pending build
     */
    hasActiveBuild(dataset, filePath) {
        const key = this.getDatasetKey(dataset);
        const cache = this.buildCache.get(key);

        if (!cache || !cache.has(filePath)) {
            return false;
        }

        const buildInfo = cache.get(filePath);
        return ACTIVE_STATES.includes(buildInfo.currentState);
    }

    /**
     * Gets the build state for a file
     */
    getBuildState(dataset, filePath) {
        const key = this.getDatasetKey(dataset);
        const cache = this.buildCache.get(key);

        if (!cache || !cache.has(filePath)) {
            return null;
        }

        return cache.get(filePath);
    }

    /**
     * Starts a build for a file
     */
    async startBuild(dataset, filePath, force = false) {
        try {
            // Check if it's buildable
            const entry = await dataset.listOne(filePath);
            if (!this.isBuildableType(entry.type)) {
                throw new Error(`File type ${entry.type} is not buildable`);
            }

            // Check if it already has an active build
            if (this.hasActiveBuild(dataset, filePath) && !force) {
                throw new Error(`Build already in progress for ${filePath}`);
            }

            // Start the build
            await dataset.build(filePath, force);

            // Update cache with temporary "Enqueued" state
            const key = this.getDatasetKey(dataset);
            const cache = this.buildCache.get(key) || new Map();
            cache.set(filePath, {
                path: filePath,
                currentState: BUILD_STATES.ENQUEUED,
                createdAt: new Date().toISOString()
            });
            this.buildCache.set(key, cache);

            // Start polling if not already active
            this.startPolling(dataset);

            // Emit event
            this.emit('buildStarted', { dataset, filePath, force });

            return true;
        } catch (error) {
            this.emit('buildError', { dataset, filePath, error: error.message });
            throw error;
        }
    }

    /**
     * Loads existing builds for a dataset
     */
    async loadBuilds(dataset) {
        try {
            const builds = await dataset.getBuilds(1, 100); // Get the first 100 builds
            const key = this.getDatasetKey(dataset);
            const cache = this.buildCache.get(key) || new Map();

            // Update cache with existing builds
            builds.forEach(build => {
                if (build.path) {
                    cache.set(build.path, build);
                }
            });

            this.buildCache.set(key, cache);

            // Check if there are active builds that require polling
            const hasActiveBuilds = builds.some(build =>
                ACTIVE_STATES.includes(build.currentState)
            );

            if (hasActiveBuilds) {
                this.startPolling(dataset);
            }

            return builds;
        } catch (error) {
            console.error('Error loading builds:', error);
            throw error;
        }
    }

    /**
     * Starts polling for a dataset
     */
    startPolling(dataset) {
        const key = this.getDatasetKey(dataset);

        // If polling is already active, do nothing
        if (this.pollingTimers.has(key)) {
            return;
        }

        const poll = async () => {
            try {
                const builds = await dataset.getBuilds(1, 100);
                const cache = this.buildCache.get(key) || new Map();

                let hasActiveBuilds = false;
                const previousStates = new Map();

                // Save previous states
                cache.forEach((build, path) => {
                    previousStates.set(path, build.currentState);
                });

                // Update cache
                builds.forEach(build => {
                    if (build.path) {
                        const previousState = previousStates.get(build.path);
                        cache.set(build.path, build);

                        // Check if state has changed
                        if (previousState && previousState !== build.currentState) {
                            this.emit('buildStateChanged', {
                                dataset,
                                filePath: build.path,
                                previousState,
                                newState: build.currentState,
                                buildInfo: build
                            });
                        }

                        if (ACTIVE_STATES.includes(build.currentState)) {
                            hasActiveBuilds = true;
                            console.log('Active build found:', build.path, 'state:', build.currentState);
                        }
                    }
                });

                this.buildCache.set(key, cache);

                // If there are no active builds, stop polling
                if (!hasActiveBuilds) {
                    console.log('No active builds found, stopping polling for dataset:', key);
                    this.stopPolling(dataset);
                } else {
                    console.log('Active builds found, continuing polling for dataset:', key);
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        };

        // Polling every 5 seconds
        const timerId = setInterval(poll, POLL_INTERVAL);
        this.pollingTimers.set(key, timerId);

        // First immediate poll
        poll();
    }

    /**
     * Starts polling when new files are detected in the dataset
     * This method should be called when new buildable files with actual entries are added
     */
    async startPollingForNewFiles(dataset, fileEntries = []) {
        const key = this.getDatasetKey(dataset);

        // Register the dataset if not already done
        this.registerDataset(dataset);

        // Check for buildable files using real entry data
        const buildableFiles = fileEntries.filter(entry => {
            return entry && this.isBuildableType(entry.type);
        });

        if (buildableFiles.length > 0) {
            console.log('New buildable files detected:', buildableFiles.map(e => e.path));

            // Always start polling for buildable files - let polling determine actual states
            this.startPolling(dataset);

            // Emit event for new buildable files detected
            this.emit('newBuildableFilesDetected', {
                dataset,
                filePaths: buildableFiles.map(e => e.path)
            });
        }
    }

    /**
     * Helper method to detect if files are buildable based on actual entry data
     * This method checks both if files exist in cache and if they need building
     */
    hasNewBuildableFiles(dataset, fileEntries = []) {
        const key = this.getDatasetKey(dataset);
        const cache = this.buildCache.get(key) || new Map();

        return fileEntries.some(entry => {
            if (!entry || !this.isBuildableType(entry.type)) {
                return false;
            }

            // File is buildable and either not in cache or doesn't have a successful build
            const buildInfo = cache.get(entry.path);
            return !buildInfo || buildInfo.currentState !== BUILD_STATES.SUCCEEDED;
        });
    }



    /**
     * Stops polling for a dataset
     */
    stopPolling(dataset) {
        const key = this.getDatasetKey(dataset);
        const timerId = this.pollingTimers.get(key);

        if (timerId) {
            clearInterval(timerId);
            this.pollingTimers.delete(key);
        }
    }

    /**
     * Monitors a dataset for new buildable files and automatically starts polling
     * This method should be called when files are added to trigger build monitoring
     */
    monitorDatasetForBuilds(dataset) {
        this.registerDataset(dataset);

        // Load existing builds first
        this.loadBuilds(dataset).then(() => {
            // Check if there are any active builds or pending files
            const key = this.getDatasetKey(dataset);
            const cache = this.buildCache.get(key) || new Map();

            const hasActiveBuilds = Array.from(cache.values()).some(build =>
                ACTIVE_STATES.includes(build.currentState)
            );

            if (hasActiveBuilds) {
                console.log('Active builds detected, starting polling for dataset:', key);
                this.startPolling(dataset);
            }
        }).catch(error => {
            console.error('Error monitoring dataset for builds:', error);
        });
    }

    /**
     * Notifies the manager that new files have been added to a dataset
     * This triggers automatic build monitoring if needed
     * @param {Object} dataset - The dataset object
     * @param {Array} fileEntries - Array of file entries with actual type information
     */
    async onFilesAdded(dataset, fileEntries) {
        if (!fileEntries || fileEntries.length === 0) return;

        console.log('Files added to dataset, checking for buildables:', fileEntries.map(e => e.path || e));

        // Check if any of the new files are buildable
        if (this.hasNewBuildableFiles(dataset, fileEntries)) {
            console.log('Buildable files detected among new files, starting polling');
            await this.startPollingForNewFiles(dataset, fileEntries);
        }
    }

    /**
     * Cleans up everything (call when leaving the dataset)
     */
    cleanup() {
        // Stop all polling
        this.pollingTimers.forEach(timerId => clearInterval(timerId));
        this.pollingTimers.clear();

        // Clear cache
        this.buildCache.clear();
        this.datasets.clear();
        this.eventListeners = {};
    }

    /**
     * Generates a unique key for the dataset
     */
    getDatasetKey(dataset) {
        return `${dataset.org}/${dataset.ds}`;
    }

    /**
     * Event system
     */
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    off(event, callback) {
        if (this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }
}

// Export a singleton instance
export default new BuildManager();