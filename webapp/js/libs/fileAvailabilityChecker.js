/**
 * File Availability Checker
 *
 * Checks file availability for visualization before opening the viewer.
 * Verifies build state and availability of required output files.
 */

import ddb from 'ddb';
import BuildManager from './buildManager';

// Mapping between viewer type and required output file
const VIEW_OUTPUT_FILES = {
    'pointcloud': 'ept/ept.json',
    'map-pointcloud': 'ept/ept.json',
    'map-georaster': 'cog/cog.tif',
    'map-vector': 'vec/vector.fgb',
    'model': 'nxs/model.nxz',
    'panorama': null, // Panoramas use the original file
    'markdown': null  // Markdown files use the original file
};

// File types that require a build
const BUILDABLE_TYPES = [
    ddb.entry.type.POINTCLOUD,
    ddb.entry.type.GEORASTER,
    ddb.entry.type.MODEL,
    ddb.entry.type.VECTOR
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
        // For non-buildable files, only check if they exist
        if (!this.isBuildableType(entry.type)) {
            return this.checkNonBuildableFile(dataset, entry, viewType);
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
            // 1. Check build state in BuildManager cache
            const buildState = BuildManager.getBuildState(dataset, entry.path);

            if (buildState)
                return this.handleExistingBuildState(buildState, entry);

            // 2. If no build state in cache, query the API
            const builds = await dataset.getBuilds(1, 200);
            const currentBuild = builds.find(b => b.path === entry.path);

            if (currentBuild)
                return this.handleExistingBuildState(currentBuild, entry);

            // 3. No build found - check if output file exists anyway
            const outputFile = this.getOutputFile(entry.type, viewType);
            if (outputFile) {
                const entryObj = dataset.Entry(entry);
                const isAvailable = await this.checkOutputFileAvailability(entryObj, outputFile);

                if (isAvailable) {
                    // Cache a synthetic "Succeeded" build state to avoid rechecking
                    const syntheticBuildState = {
                        path: entry.path,
                        currentState: 'Succeeded',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    BuildManager.updateBuildState(dataset, syntheticBuildState);

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
            const url = entryObj.buildUrl(outputFile);
            return await entryObj.dataset.registry.headRequest(url);
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
