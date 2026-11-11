/**
 * File Availability Checker
 *
 * Checks file availability for visualization before opening the viewer.
 * Verifies build state and availability of required output files.
 */

import ddb from 'ddb';
import BuildManager from '@/libs/build/buildManager';
import taskMonitor from '@/libs/tasks/taskMonitor';
import { describeEntryPendingBuild } from '@/libs/build/pendingBuild';
import { buildWarningOf } from '@/libs/build/buildWarnings';
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
 * @property {string} status - Status: 'ready', 'building', 'queued' (never built), 'rebuild' (built without the
 *   artifact the viewer needs), 'blocked', 'failed', 'unsupported' (the server cannot read this file: processing it
 *   again does not help), 'unknown', 'not-found', 'error'
 * @property {string} message - Descriptive message for the user
 * @property {string} title - Message title
 * @property {Object|null} buildState - Build state if available
 * @property {Array<string>} actions - Available actions for the user
 * @property {string} [hint] - What the administrator of the server does about it ('unsupported'), shown in the details
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
                const listed = options.current ? entry : await currentEntry(dataset, entry, e => !!findArtifactIn(e, roles));
                if (findArtifactIn(listed, roles)) {
                    return { available: true, status: 'ready', message: '', title: '', buildState: null, actions: [] };
                }
                // The artifact is not there: why is the build state's to say (running, on hold, failed, never built),
                // as for any viewer, from the entry just listed. The viewer shows that state with its Build / Rebuild
                // action and loads the file when the build ends (useViewerBuild, FR-XC-16), not a fixed message that
                // never changes (FR-VWR-08)
                return this.checkBuildableFile(dataset, listed, viewType, { ...options, current: true });
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

            // The server cannot read this kind of file, as libddb tags it (a DWG on a server without its converter): the
            // user is told so, and no build is offered, because processing the file again cannot help (FR-EXP-18)
            const unsupported = buildWarningOf(listed);
            if (unsupported && !unsupported.retry) {
                return {
                    available: false,
                    status: 'unsupported',
                    message: unsupported.text,
                    title: unsupported.title,
                    buildState: null,
                    actions: ['close', 'details'],
                    hint: unsupported.adminHint
                };
            }

            // Deferred: it waits for files the dataset lacks, or for a retry after a temporary error. Checked
            // before any terminal job: a build that succeeded once can become pending again (its
            // companion file was removed) and the job history still says "Succeeded".
            if (listed.buildStatus === 'pending') {
                const pending = describeEntryPendingBuild(listed);
                return {
                    available: false,
                    status: 'blocked',
                    message: `The file '${this.getFileName(entry.path)}' cannot be opened yet.\n\n${pending.text}`,
                    title: pending.title,
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

            // 3. Built, but without the artifact this viewer needs (a model built before 3D Tiles has only its
            // Nexus output): only a forced build makes it, libddb skips a build that is complete (FR-VWR-08)
            if (roles && isBuilt(listed)) {
                return {
                    available: false,
                    status: 'rebuild',
                    message: `The file '${this.getFileName(entry.path)}' was built before this viewer could show it: its build has no output for this viewer.\n\nRebuild it to open it here.`,
                    title: 'Rebuild Needed',
                    buildState: null,
                    actions: ['cancel', 'retry-build']
                };
            }

            // 4. Buildable file without its build - needs processing
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
