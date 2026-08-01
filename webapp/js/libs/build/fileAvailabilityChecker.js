/**
 * File Availability Checker
 *
 * Checks file availability for visualization before opening the viewer.
 * Verifies build state and availability of required output files.
 */

import ddb from 'ddb';
import BuildManager from '@/libs/build/buildManager';
import taskMonitor from '@/libs/tasks/taskMonitor';
import { formatMissingDeps } from '@/libs/build/buildDepFormat';

// Mapping between viewer type and required output file
const VIEW_OUTPUT_FILES = {
    'pointcloud': 'copc/cloud.copc.laz',
    'map-pointcloud': 'copc/cloud.copc.laz',
    'map-georaster': 'cog/cog.tif',
    'map-vector': 'vec/vector.fgb',
    // Models prefer the OGC 3D Tiles artifact (3dtiles/tileset.json) but accept the legacy
    // Nexus output (nxs/model.nxz) too, so datasets built before 3D Tiles support keep
    // working (any-of match). The model viewer picks the right renderer per availability.
    'model': 'nxs/model.nxz',
    // The UnifiedViewer (georeferenced Giro3D scene) needs the 3D Tiles output specifically,
    // since it cannot render the legacy Nexus mesh.
    'unified-model': '3dtiles/tileset.json',
    // Uploaded OGC 3D Tiles (.3tz) are extracted to the same 3dtiles/ build artifact.
    'unified-tiles3d': '3dtiles/tileset.json',
    // Splats prefer the LOD artifact (model.rad) but accept the legacy plain .spz too,
    // so datasets built before the .rad-only switch keep working (any-of match).
    'splat': ['gsplat/model.rad', 'gsplat/model.spz'],
    'panorama': null, // Panoramas use the original file
    'markdown': null  // Markdown files use the original file
};

// File types that require a build
const BUILDABLE_TYPES = [
    ddb.entry.type.POINTCLOUD,
    ddb.entry.type.GEORASTER,
    ddb.entry.type.MODEL,
    ddb.entry.type.VECTOR,
    ddb.entry.type.GAUSSIAN_SPLAT,
    ddb.entry.type.TILES3D
];

/**
 * Availability check result
 * @typedef {Object} AvailabilityResult
 * @property {boolean} available - Whether the file is available for visualization
 * @property {string} status - Status: 'ready', 'building', 'queued', 'failed', 'not-buildable', 'not-found'
 * @property {string} message - Descriptive message for the user
 * @property {string} title - Message title
 * @property {Object|null} buildState - Build state if available
 * @property {Array<string>} actions - Available actions for the user
 */

class FileAvailabilityChecker {
    /**
     * Checks if a file is ready for visualization
     * @param {Object} dataset - DDB Dataset
     * @param {Object} entry - File entry
     * @param {string} viewType - Viewer type ('pointcloud', 'map', 'model', 'panorama', 'markdown')
     * @returns {Promise<AvailabilityResult>}
     */
    async check(dataset, entry, viewType) {
        // Normalize: .3tz files indexed by older ddb versions may appear as Generic.
        if (entry.type === ddb.entry.type.GENERIC && /\.3tz$/i.test(entry.path || '')) entry = { ...entry, type: ddb.entry.type.TILES3D };

        // For non-buildable files, only check if they exist
        if (!this.isBuildableType(entry.type)) {
            return this.checkNonBuildableFile(dataset, entry, viewType);
        }

        // The unified 3D viewer needs its SPECIFIC artifact (3D Tiles for models, COPC for point
        // clouds, COG for rasters, MVT/FGB for vectors). A generic "Succeeded" build state is not
        // enough - e.g. a model can have a legacy Nexus build but no 3D Tiles output - so verify
        // the exact artifact directly.
        if (viewType === 'unified') {
            const outputFile = this.getOutputFile(entry.type, viewType);
            if (outputFile) {
                const entryObj = dataset.Entry(entry);
                const available = await this.checkOutputFileAvailability(entryObj, outputFile);
                if (available) {
                    return { available: true, status: 'ready', message: '', title: '', buildState: null, actions: [] };
                }
                return {
                    available: false,
                    status: 'not-found',
                    message: `'${this.getFileName(entry.path)}' is not available in the 3D viewer.\n\nThe required output has not been produced yet - this file may need to be (re)built.`,
                    title: 'Not available in 3D viewer',
                    buildState: null,
                    actions: ['close']
                };
            }
        }

        // For buildable files, verify build state
        return this.checkBuildableFile(dataset, entry, viewType);
    }

    /**
     * Checks if a file type requires a build
     */
    isBuildableType(entryType) {
        return BUILDABLE_TYPES.includes(entryType);
    }

    /**
     * Checks non-buildable files (panorama, markdown)
     */
    async checkNonBuildableFile(dataset, entry, viewType) {
        // For panoramas and markdown, file is always available if it exists in the entry
        if (entry.hash && entry.path) {
            return {
                available: true,
                status: 'ready',
                message: '',
                title: '',
                buildState: null,
                actions: []
            };
        }

        return {
            available: false,
            status: 'not-found',
            message: 'The requested file is not available. It may have been moved or deleted.',
            title: 'File Not Available',
            buildState: null,
            actions: ['close']
        };
    }

    /**
     * Checks buildable files (pointcloud, georaster, model, vector)
     */
    async checkBuildableFile(dataset, entry, viewType) {
        try {
            const activeStates = ['Processing', 'Enqueued', 'Scheduled', 'Awaiting', 'Created'];

            // 1. Check build state in BuildManager cache. An in-progress build is always
            // authoritative (nothing fresher can exist), so surface it immediately.
            const buildState = BuildManager.getBuildState(dataset, entry.path);

            if (buildState && activeStates.includes(buildState.currentState))
                return this.handleExistingBuildState(buildState, entry);

            // 2. If no active build state in cache, query taskMonitor store for one
            const allTasks = taskMonitor.getTasks(dataset);
            const buildTasks = allTasks.filter(t => t.toolId === 'build');
            const currentBuild = buildTasks.find(b => b.path === entry.path);

            if (currentBuild && activeStates.includes(currentBuild.state))
                return this.handleExistingBuildState({ path: currentBuild.path, currentState: currentBuild.state }, entry);

            // 2b. No active job found: the list API may already know the build is
            // deferred because a dependency (companion file or external tool) is missing.
            // This must be checked BEFORE trusting any terminal (Succeeded/Failed) cached
            // job below: a build can have succeeded in the past and then become pending
            // again (e.g. its companion file was later removed), leaving a stale
            // "Succeeded" job record for the same path. entry.buildStatus reflects the
            // CURRENT on-disk state, freshly recomputed by the server on every list()
            // call from ddb.GetPendingBuildInfo(), so it takes priority over job history.
            if (entry.buildStatus === 'pending') {
                return {
                    available: false,
                    status: 'blocked',
                    message: `Processing of '${this.getFileName(entry.path)}' is on hold.\n\nMissing: ${formatMissingDeps(entry.buildMissingDependencies)}.`,
                    title: 'Processing On Hold',
                    buildState: null,
                    missingDependencies: entry.buildMissingDependencies || [],
                    actions: ['cancel', 'retry-build']
                };
            }

            // 2c. Not pending: now it's safe to trust a terminal cached build state
            // (Succeeded/Failed/etc.) found above.
            if (buildState)
                return this.handleExistingBuildState(buildState, entry);

            if (currentBuild)
                return this.handleExistingBuildState({ path: currentBuild.path, currentState: currentBuild.state }, entry);

            // 3. No build found - check if output file exists anyway
            const outputFile = this.getOutputFile(entry.type, viewType);
            if (outputFile) {
                const entryObj = dataset.Entry(entry);
                const isAvailable = await this.checkOutputFileAvailability(entryObj, outputFile);

                if (isAvailable) {
                    const syntheticBuildState = {
                        path: entry.path,
                        currentState: 'Succeeded',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    return {
                        available: true,
                        status: 'ready',
                        message: '',
                        title: '',
                        buildState: syntheticBuildState,
                        actions: []
                    };
                }
            }

            // 4. Buildable file without build - needs processing
            return {
                available: false,
                status: 'queued',
                message: `The file '${this.getFileName(entry.path)}' has not been processed yet.\n\nProcessing will start automatically soon. Do you want to start processing immediately?`,
                title: 'File Awaiting Processing',
                buildState: null,
                actions: ['cancel', 'start-build', 'wait']
            };

        } catch (error) {
            console.error('Error checking file availability:', error);
            return {
                available: false,
                status: 'error',
                message: `An error occurred while checking file availability: ${error.message}`,
                title: 'Error',
                buildState: null,
                actions: ['close']
            };
        }
    }

    /**
     * Handles an existing build state
     */
    handleExistingBuildState(buildState, entry) {
        const fileName = this.getFileName(entry.path);
        const activeStates = ['Processing', 'Enqueued', 'Scheduled', 'Awaiting', 'Created'];

        if (buildState.currentState === 'Succeeded') {
            return {
                available: true,
                status: 'ready',
                message: '',
                title: '',
                buildState: buildState,
                actions: []
            };
        }

        if (activeStates.includes(buildState.currentState)) {
            const timeInfo = this.getTimeInfo(buildState);
            return {
                available: false,
                status: 'building',
                message: `The file '${fileName}' is currently being processed.\n\nStatus: ${buildState.currentState}${timeInfo}\n\nThe viewer can be opened automatically when processing completes, or you can try again in a few minutes.`,
                title: 'File Being Processed',
                buildState: buildState,
                actions: ['cancel', 'wait-and-open']
            };
        }

        if (buildState.currentState === 'Failed') {
            return {
                available: false,
                status: 'failed',
                message: `Processing of file '${fileName}' has failed.\n\nThis can happen if the file is corrupted or not supported. You can try restarting the processing or contact the administrator.`,
                title: 'Processing Error',
                buildState: buildState,
                actions: ['cancel', 'retry-build', 'details']
            };
        }

        // Other states (Deleted, etc.)
        return {
            available: false,
            status: 'unknown',
            message: `The file '${fileName}' is in an invalid state (${buildState.currentState}).\n\nTry restarting the processing.`,
            title: 'Invalid State',
            buildState: buildState,
            actions: ['cancel', 'retry-build']
        };
    }

    /**
     * Checks output file availability
     */
    async checkOutputFileAvailability(entryObj, outputFile) {
        try {
            // outputFile may be a single path or an any-of list (e.g. splat .rad or .spz).
            const candidates = Array.isArray(outputFile) ? outputFile : [outputFile];
            for (const candidate of candidates) {
                const url = entryObj.buildUrl(candidate);
                if (await entryObj.dataset.registry.headRequest(url)) return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Gets the required output file based on type
     */
    getOutputFile(entryType, viewType) {
        // Determine the key for VIEW_OUTPUT_FILES
        let key = viewType;

        if (viewType === 'map') {
            if (entryType === ddb.entry.type.POINTCLOUD) {
                key = 'map-pointcloud';
            } else if (entryType === ddb.entry.type.GEORASTER) {
                key = 'map-georaster';
            } else if (entryType === ddb.entry.type.VECTOR) {
                key = 'map-vector';
            }
        } else if (viewType === 'unified') {
            // The UnifiedViewer renders each type from its build artifact.
            if (entryType === ddb.entry.type.POINTCLOUD) {
                key = 'map-pointcloud';
            } else if (entryType === ddb.entry.type.GEORASTER) {
                key = 'map-georaster';
            } else if (entryType === ddb.entry.type.VECTOR) {
                key = 'map-vector';
            } else if (entryType === ddb.entry.type.MODEL) {
                key = 'unified-model';
            } else if (entryType === ddb.entry.type.TILES3D) {
                key = 'unified-tiles3d';
            }
        }

        return VIEW_OUTPUT_FILES[key];
    }

    /**
     * Extracts the filename from the path
     */
    getFileName(path) {
        if (!path) return 'file';
        return path.split('/').pop() || path;
    }

    /**
     * Gets time information from build state
     */
    getTimeInfo(buildState) {
        if (!buildState.createdAt) return '';

        const created = new Date(buildState.createdAt);
        const now = new Date();
        const diffMs = now - created;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return '\nStarted: less than a minute ago';
        if (diffMins === 1) return '\nStarted: 1 minute ago';
        if (diffMins < 60) return `\nStarted: ${diffMins} minutes ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours === 1) return '\nStarted: 1 hour ago';
        return `\nStarted: ${diffHours} hours ago`;
    }
}

// Export a singleton instance
export default new FileAvailabilityChecker();
