// @ts-check
/**
 * useBuildCompletion - a view that waits for a build (FR-XC-16). One composable on the BuildManager's
 * `buildStateChanged` event, so no view polls on its own: a tile, a viewer opened while its file builds.
 *
 *   const { buildState, building, percent } = useBuildCompletion(() => dataset.value, () => [entry.value.path],
 *       ({ filePath, succeeded }) => { if (succeeded) load(); });
 *
 * `dataset` and `paths` are values, refs or getters (a viewer has its dataset once its entry loaded). `onEnd` runs once
 * per build of one of the paths that ends (Succeeded, Failed or Deleted: a terminal state, libs/tasks/taskStates), with
 * `{ filePath, state, succeeded, dataset }`. The composable follows the dataset's builds (BuildManager.registerDataset,
 * counted, so the dataset page that follows it too is not disturbed) and lets go when the owner's scope ends.
 *
 * It also gives the build the view shows, reactively: `buildState` ({ path, currentState } of the first path that has a
 * build, or null), `building` (that build is active) and `percent` (how far it is, or null).
 */
import { computed, getCurrentScope, onScopeDispose, toValue, watch } from 'vue';
import BuildManager from '@/libs/build/buildManager';
import { datasetKey, isActiveState, isTerminalState } from '@/libs/tasks/taskStates';

/**
 * @typedef {object} BuildEnd
 * @property {string} filePath
 * @property {string} state  the terminal state of the build
 * @property {boolean} succeeded
 * @property {any} dataset
 */

/**
 * @param {any} dataset  the ddb Dataset, a ref or a getter of it (null until there is one)
 * @param {string[] | import('vue').Ref<string[]> | (() => string[])} paths  the dataset paths of the files that wait for a build
 * @param {(end: BuildEnd) => void} [onEnd]
 */
export function useBuildCompletion(dataset, paths, onEnd) {
    const currentDataset = () => toValue(dataset) ?? null;
    const watched = () => (toValue(paths) ?? []).filter(Boolean);

    /** @param {{ dataset: any, filePath: string, newState: string | null }} event */
    function onBuildStateChanged(event) {
        const ds = currentDataset();
        if (!ds || !event.dataset || datasetKey(event.dataset) !== datasetKey(ds)) return;
        if (!watched().includes(event.filePath) || !event.newState || !isTerminalState(event.newState)) return;
        onEnd?.({ filePath: event.filePath, state: event.newState, succeeded: event.newState === 'Succeeded', dataset: event.dataset });
    }

    // The dataset's builds are followed, and their events listened to, while the view has the dataset (a tile of a file
    // that is not built by libddb has none, so it adds no listener)
    let followed = null;
    function follow(ds) {
        if (followed === ds) return;
        if (followed) BuildManager.unregisterDataset(followed);
        if (!followed && ds) BuildManager.on('buildStateChanged', onBuildStateChanged);
        if (followed && !ds) BuildManager.off('buildStateChanged', onBuildStateChanged);
        followed = ds;
        if (ds) BuildManager.registerDataset(ds);
    }
    const stopWatching = watch(currentDataset, follow, { immediate: true });

    // Each poll gives the BuildManager a new map: the build is the previous object while its path and state are the same,
    // so a view that shows it (every tile of a folder) does not render again on a poll that changed nothing
    const buildState = computed(previous => {
        const ds = currentDataset();
        if (!ds) return null;
        for (const path of watched()) {
            const state = BuildManager.getBuildState(ds, path);
            if (!state) continue;
            return previous && previous.path === state.path && previous.currentState === state.currentState ? previous : state;
        }
        return null;
    });
    const building = computed(() => !!buildState.value && isActiveState(buildState.value.currentState));
    const percent = computed(() => {
        const ds = currentDataset();
        return ds && buildState.value ? BuildManager.getBuildProgress(ds, buildState.value.path) : null;
    });

    function stop() {
        stopWatching();
        follow(null);
    }
    if (getCurrentScope()) onScopeDispose(stop);

    return { buildState, building, percent, stop };
}
