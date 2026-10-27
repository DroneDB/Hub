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
import { isLocalVector } from '@/libs/openItemDefaults';
import { ArtifactRole, findArtifactIn } from '@/libs/ddb/buildArtifacts';
import { currentEntry, isBuilt } from '@/libs/build/entryBuild';
import { isActiveState, isWaitingBackgroundTask } from '@/libs/tasks/taskStates';
import { isBuildableType } from '@/libs/entryTypeCapabilities';

// Build artifact each viewer needs, by role (the entry DTO lists the artifacts that exist).
// An array is an any-of match.
const VIEW_ARTIFACT_ROLES = {
    'pointcloud': ArtifactRole.POINTCLOUD_COPC,
    'map-pointcloud': ArtifactRole.POINTCLOUD_COPC,
    'map-georaster': ArtifactRole.RASTER_COG,
    // The map vector renderer draws MVT tiles: requiring the pyramid itself keeps the gate
    // closed when a vector build produced the GeoPackage but no MVT.
    'map-vector': ArtifactRole.VECTOR_MVT,
    // A vector without geolocation (CAD drawing, no CRS) has no MVT pyramid; the local
    // viewer reads its drawing-coordinate metadata instead.
    'unified-vector-local': ArtifactRole.VECTOR_LOCAL,
    // The model viewer renders the multiresolution model: a bm3d one, or the Nexus one of a build
    // that predates bm3d (libddb lists the second only while the first is missing).
    'model': [ArtifactRole.MODEL_BM3D, ArtifactRole.MODEL_NEXUS],
    // The UnifiedViewer (georeferenced Giro3D scene) cannot render the multiresolution mesh.
    'unified-model': ArtifactRole.MODEL_3DTILES,
    // Uploaded OGC 3D Tiles (.3tz) are extracted to the same artifact.
    'unified-tiles3d': ArtifactRole.MODEL_3DTILES,
    // Splats prefer the LOD artifact but accept the plain .spz of older builds.
    'splat': [ArtifactRole.GSPLAT_LOD, ArtifactRole.GSPLAT_SPZ],
    'panorama': null, // Panoramas use the original file
    'markdown': null  // Markdown files use the original file
};

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
     * @param {{ current?: boolean }} [options] - current: the entry was just listed (a viewer page
     *   reads it on load), so a missing artifact is not looked for in a fresh listing
     * @returns {Promise<AvailabilityResult>}
     */
    async check(dataset, entry, viewType, options = {}) {
        // Normalize: .3tz files indexed by older ddb versions may appear as Generic.
        if (entry.type === ddb.entry.type.GENERIC && /\.3tz$/i.test(entry.path || '')) entry = { ...entry, type: ddb.entry.type.TILES3D };

        // For non-buildable files, only check if they exist
        if (!isBuildableType(entry.type)) {
            return this.checkNonBuildableFile(dataset, entry, viewType);
        }

        // The unified 3D viewer needs its SPECIFIC artifact (3D Tiles for models, COPC for point
        // clouds, COG for rasters, MVT for vectors). A generic "Succeeded" build state is not
        // enough - e.g. a model can have a legacy Nexus build but no 3D Tiles output - so verify
        // the exact artifact directly.
        if (viewType === 'unified') {
            const roles = this.getRequiredArtifact(entry.type, viewType, entry);
            if (roles) {
                const available = await this.hasArtifact(dataset, entry, roles, options.current);
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
        return this.checkBuildableFile(dataset, entry, viewType, options);
    }

    /**
     * Checks non-buildable files (panorama, markdown)
     */
    async checkNonBuildableFile(dataset, entry) {
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
     * Checks buildable files (pointcloud, georaster, model, vector).
     *
     * What can be opened is what the entry lists: libddb's artifacts (through Registry) say whether
     * the output a viewer needs exists, and the build status the server could not leave out says why
     * it does not (on hold, running, failed). The Hangfire job is the progress of a running build
     * and the reason of a failed one: a job that succeeded does not make a build that is not there.
     */
    async checkBuildableFile(dataset, entry, viewType, options = {}) {
        try {
            // 1. A running job is authoritative about progress (nothing fresher can exist)
            const job = this.currentJob(dataset, entry.path);
            if (job && isActiveState(job.currentState))
                return this.handleExistingBuildState(job, entry);

            // 2. The entry as the server reports it now: the artifacts it lists, else why not
            const roles = this.getRequiredArtifact(entry.type, viewType, entry);
            const isReady = e => roles ? !!findArtifactIn(e, roles) : isBuilt(e);
            const listed = options.current ? entry : await currentEntry(dataset, entry, isReady);

            if (isReady(listed)) {
                return { available: true, status: 'ready', message: '', title: '', buildState: job, actions: [] };
            }

            // Deferred because a dependency (companion file or external tool) is missing. Checked
            // before any terminal job: a build that succeeded once can become pending again (its
            // companion file was removed) and the job history still says "Succeeded".
            if (listed.buildStatus === 'pending') {
                return {
                    available: false,
                    status: 'blocked',
                    message: `Processing of '${this.getFileName(entry.path)}' is on hold.\n\nMissing: ${formatMissingDeps(listed.buildMissingDependencies)}.`,
                    title: 'Processing On Hold',
                    buildState: null,
                    actions: ['cancel', 'retry-build']
                };
            }

            // A build the server sees running that this page has no job for yet (started elsewhere)
            if (listed.buildStatus === 'building')
                return this.handleExistingBuildState({ path: entry.path, currentState: 'Processing' }, entry);

            // The job says why a build ended without its output: it failed, or left a state we do not know
            if (job && job.currentState !== 'Succeeded')
                return this.handleExistingBuildState(job, entry);
            if (listed.buildStatus === 'failed')
                return this.handleExistingBuildState({ path: entry.path, currentState: 'Failed' }, entry);

            // 3. Buildable file without its build - needs processing
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
     * The build job of an entry as { path, currentState }: the BuildManager cache and the task
     * monitor store, a running one first (they are the same tasks; the cache also holds the
     * "Enqueued" a build start writes before the monitor has refreshed).
     */
    currentJob(dataset, path) {
        const cached = BuildManager.getBuildState(dataset, path);
        const task = taskMonitor.getTasks(dataset).find(t => t.toolId === 'build' && t.path === path && !isWaitingBackgroundTask(t));
        const jobs = [cached, task && { path: task.path, currentState: task.state }].filter(Boolean);
        return jobs.find(j => isActiveState(j.currentState)) || jobs[0] || null;
    }

    /**
     * Handles the job of a build that is running or ended without its output
     */
    handleExistingBuildState(buildState, entry) {
        const fileName = this.getFileName(entry.path);

        if (isActiveState(buildState.currentState)) {
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
     * Whether the entry lists the artifact (a role, or an any-of list of roles). The entry DTO
     * carries the artifacts that exist, so nothing is probed; one that was listed before its build
     * finished lists none, and is checked once against a fresh listing (unless it is `current`).
     */
    async hasArtifact(dataset, entry, roles, current = false) {
        const listed = current ? entry : await currentEntry(dataset, entry, e => !!findArtifactIn(e, roles));
        return !!findArtifactIn(listed, roles);
    }

    /**
     * The artifact role (or any-of list of roles) a viewer needs for this entry, or null
     * when the viewer reads the original file.
     */
    getRequiredArtifact(entryType, viewType, entry = null) {
        // Determine the key for VIEW_ARTIFACT_ROLES
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
                key = isLocalVector(entry) ? 'unified-vector-local' : 'map-vector';
            } else if (entryType === ddb.entry.type.MODEL) {
                key = 'unified-model';
            } else if (entryType === ddb.entry.type.TILES3D) {
                key = 'unified-tiles3d';
            }
        }

        return VIEW_ARTIFACT_ROLES[key];
    }

    /**
     * Extracts the filename from the path
     */
    getFileName(path) {
        if (!path) return 'file';
        return ddb.pathutils.basename(path);
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
