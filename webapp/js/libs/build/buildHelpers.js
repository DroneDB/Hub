import BuildManager, { BUILD_STATES } from '@/libs/build/buildManager';

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
    const buildState = BuildManager.getBuildState(dataset, file.entry.path);
    if (!buildState) return null;

    switch (buildState.currentState) {
        case BUILD_STATES.FAILED:
            return 'fa-solid fa-circle-xmark red';
        default:
            return null;
    }
}

async function buildFile(dataset, file) {
    await BuildManager.startBuild(dataset, file.entry.path, true);
}

export {
    isBuildableFile,
    hasActiveBuild,
    isBuildLoading,
    getBuildBadge,
    buildFile
};
