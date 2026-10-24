import BuildManager, { BUILD_STATES } from '@/libs/build/buildManager';
import { formatMissingDeps } from '@/libs/build/buildDepFormat';
import { isBuildableType } from '@/libs/entryTypeCapabilities';
import { isBuilt, currentEntry, shownBuildStatus } from '@/libs/build/entryBuild';

function isBuildableFile(dataset, file) {
    if (!dataset) return false;
    return isBuildableType(file.entry.type);
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

    // The build job gives failures (and the spinner overlay covers a running build); whether the
    // build exists is on the entry: "ready" (built) is the default and never gets a badge.
    switch (shownBuildStatus(BuildManager.getBuildState(dataset, file.entry.path), file.entry)) {
        case 'failed':
            return 'fa-solid fa-circle-xmark red';
        case 'pending':
            return 'fa-solid fa-triangle-exclamation orange';
        case 'queued':
            return 'fa-solid fa-clock amber';
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

    switch (shownBuildStatus(BuildManager.getBuildState(dataset, file.entry.path), file.entry)) {
        case 'failed':
            return 'Build failed';
        case 'pending':
            return `Waiting for: ${formatMissingDeps(file.entry.buildMissingDependencies)}`;
        case 'queued':
            return 'Queued for processing';
        default:
            return '';
    }
}

async function buildFile(dataset, file) {
    await BuildManager.startBuild(dataset, file.entry.path, true);
}

/**
 * Whether a file has a complete build (artifacts listed, no build status) and none is running:
 * what the "Download COG/COPC/..." menu items need. A job that succeeded does not say it.
 */
function isBuildComplete(dataset, file) {
    if (!dataset) return false;
    return !BuildManager.hasActiveBuild(dataset, file.entry.path) && isBuilt(file.entry);
}

/**
 * Whether a buildable file is already built (a rebuild asks for confirmation, a build download
 * needs it). The entry the page holds answers when it lists a complete build; otherwise the
 * entry is listed again, once, so a build that finished after the listing is found (no probe of
 * the build folder).
 */
async function isFileBuilt(dataset, file) {
    if (!dataset) return false;
    if (BuildManager.hasActiveBuild(dataset, file.entry.path)) return false;

    try {
        return isBuilt(await currentEntry(dataset, file.entry, isBuilt));
    } catch (e) {
        console.warn(`Cannot tell whether ${file.entry.path} is built:`, e);
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
    isBuildComplete,
    isFileBuilt
};
