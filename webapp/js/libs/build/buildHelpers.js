import BuildManager, { BUILD_STATES } from '@/libs/build/buildManager';
import FileAvailabilityChecker from '@/libs/build/fileAvailabilityChecker';
import { formatMissingDeps } from '@/libs/build/buildDepFormat';
import ddb from 'ddb';

function isBuildableFile(dataset, file) {
    if (!dataset) return false;
    return BuildManager.isBuildableType(file.entry.type);
}

function hasActiveBuild(dataset, file) {
    if (!dataset) return false;
    return BuildManager.hasActiveBuild(dataset, file.entry.path);
}

function isBuildLoading(dataset, file) {
    if (!dataset) return false;
    const buildState = BuildManager.getBuildState(dataset, file.entry.path);
    if (!buildState) return false;

    const activeStates = [BUILD_STATES.PROCESSING, BUILD_STATES.ENQUEUED, BUILD_STATES.SCHEDULED, BUILD_STATES.AWAITING, BUILD_STATES.CREATED];
    return activeStates.includes(buildState.currentState);
}

function getBuildBadge(dataset, file) {
    if (!dataset) return null;

    // Live Hangfire state (from BuildManager polling) takes priority: it is
    // the most up-to-date signal once a job actually exists.
    const buildState = BuildManager.getBuildState(dataset, file.entry.path);
    if (buildState) {
        switch (buildState.currentState) {
            case BUILD_STATES.FAILED:
                return 'fa-solid fa-circle-xmark red';
            case BUILD_STATES.PROCESSING:
            case BUILD_STATES.ENQUEUED:
            case BUILD_STATES.SCHEDULED:
            case BUILD_STATES.AWAITING:
            case BUILD_STATES.CREATED:
                return null; // spinner overlay already covers the "building" case
            default:
                return null;
        }
    }

    // No live job yet: fall back to the static build status returned by the
    // list API. "ready" (built) is the default state and never gets a badge.
    switch (file.entry.buildStatus) {
        case 'pending':
            return 'fa-solid fa-triangle-exclamation orange';
        case 'queued':
            return 'fa-solid fa-clock amber';
        case 'failed':
            return 'fa-solid fa-circle-xmark red';
        default:
            return null;
    }
}

/**
 * Human-readable tooltip/description for why a buildable file's badge is
 * shown. Single source of truth so Thumbnail, TableView, DetailPanel and
 * FileAvailabilityDialog never diverge on wording.
 */
function getBuildBadgeTooltip(dataset, file) {
    if (!dataset) return '';

    const buildState = BuildManager.getBuildState(dataset, file.entry.path);
    if (buildState) {
        if (buildState.currentState === BUILD_STATES.FAILED) return 'Build failed';
        return '';
    }

    switch (file.entry.buildStatus) {
        case 'pending':
            return `Waiting for: ${formatMissingDeps(file.entry.buildMissingDependencies)}`;
        case 'queued':
            return 'Queued for processing';
        case 'failed':
            return 'Build failed';
        default:
            return '';
    }
}

async function buildFile(dataset, file) {
    await BuildManager.startBuild(dataset, file.entry.path, true);
}

function isBuildSucceeded(dataset, file) {
    if (!dataset) return false;
    const buildState = BuildManager.getBuildState(dataset, file.entry.path);
    if (!buildState) return false;
    return buildState.currentState === BUILD_STATES.SUCCEEDED;
}

/**
 * Robustly determines whether a buildable file is already built and ready for
 * visualization. Uses the BuildManager cache first (fast path), then falls
 * back to the availability checker which queries the API and performs a HEAD
 * request on the expected build product (COG/COPC/nxs/fgb). This catches files
 * that were built in previous sessions and are not present in the cache.
 */
async function isFileBuilt(dataset, file) {
    if (!dataset) return false;

    const buildState = BuildManager.getBuildState(dataset, file.entry.path);
    if (buildState) return buildState.currentState === BUILD_STATES.SUCCEEDED;

    try {
        const viewType = file.entry.type === ddb.entry.type.MODEL ? 'model' : 'map';
        const result = await FileAvailabilityChecker.check(dataset, file.entry, viewType);
        return !!(result && result.available && result.status === 'ready');
    } catch (e) {
        return false;
    }
}

export {
    isBuildableFile,
    hasActiveBuild,
    isBuildLoading,
    getBuildBadge,
    getBuildBadgeTooltip,
    formatMissingDeps,
    buildFile,
    isBuildSucceeded,
    isFileBuilt
};
