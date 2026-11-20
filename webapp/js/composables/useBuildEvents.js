// @ts-check
/**
 * useBuildEvents - build notifications of the dataset page. Listens to the BuildManager while the owning component lives and
 * reports build progress as toasts; errors go to the page's error dialog.
 *
 *   setup() { return { ...useBuildEvents() }; }
 *   mounted() { this.watchBuildEvents(() => this.dataset, (msg, title) => this.showError(msg, title)); }
 */
import { getCurrentScope, onScopeDispose } from 'vue';
import { pathutils } from 'ddb';
import BuildManager from '@/libs/build/buildManager';
import taskMonitor from '@/libs/tasks/taskMonitor';
import reg from '@/libs/api/sharedRegistry';
import { toolTitle } from '@/libs/tasks/taskFormat';
import { isActiveState } from '@/libs/tasks/taskStates';
import { notify } from '@/libs/notify';
import { useTimerGroup } from '@/composables/useTimers';

/** How long the builds that end together are collected into one toast (FR-PRC-26). */
export const BUILD_TOAST_WINDOW_MS = 1500;
/** A task whose builds have not all ended says what it has after this long without a build ending. */
const TASK_QUIET_MS = 30_000;
/** The file names a summary toast lists before "and n more". */
const LISTED_NAMES = 5;

/** @param {{ filePath?: string }} data */
const fileNameOf = data => (data.filePath ? pathutils.basename(data.filePath) : 'file');

export function useBuildEvents() {
    /** @type {() => any} */
    let getDataset = () => null;
    /** @type {(message: string, title: string) => void} */
    let showError = (message, title) => notify.error(message, { summary: title });

    // The builds that ended together are one toast (FR-PRC-26): a run of photogrammetry builds nine files, and nine
    // toasts cover the page. Collected per dataset for a short window; the builds a listed task started (parentJobId)
    // are collected per task, until the last of them ended: "Photogrammetry finished - 9 files built".
    const later = useTimerGroup();
    /** @typedef {{ built: string[], failed: string[], parentId: string | null, dataset: any, ends: number }} BuildGroup */
    /** @type {Map<string, BuildGroup>} */
    const groups = new Map();

    /** @param {any} dataset @param {string} parentId */
    const parentOf = (dataset, parentId) => (dataset ? taskMonitor.getTasks(dataset).find(t => t.taskId === parentId) : undefined);

    /** The builds of the task that have not ended yet. @param {BuildGroup} group */
    const activeSiblings = group => (group.dataset ? taskMonitor.getTasks(group.dataset) : [])
        .filter(t => t.toolId === 'build' && t.parentJobId === group.parentId && isActiveState(t.state));

    /** @param {string[]} names */
    const listNames = names => (names.length > LISTED_NAMES
        ? `${names.slice(0, LISTED_NAMES).join(', ')} and ${names.length - LISTED_NAMES} more`
        : names.join(', '));

    /**
     * Shows the toast of a group. `partial`: builds of the task still run, so the toast says what is built so far and
     * the group keeps collecting (never "finished" while a build of the task runs); else the group ends.
     * @param {string} key
     * @param {boolean} [partial]
     */
    function flush(key, partial = false) {
        const group = groups.get(key);
        if (!group) return;
        if (!partial) groups.delete(key);
        const { built, failed } = group;
        const total = built.length + failed.length;
        if (total === 1 && !group.parentId) {
            // A build alone: the toast of the build
            if (built.length) notify.success(`Build completed for ${built[0]}`, { summary: 'Build Completed' });
            else notify.error(`Build failed for ${failed[0]}`, { summary: 'Build Failed' });
            return;
        }
        const count = failed.length
            ? `${built.length} built, ${failed.length} failed`
            : `${built.length} file${built.length === 1 ? '' : 's'} built`;
        const parent = group.parentId ? parentOf(group.dataset, group.parentId) : null;
        const tool = parent ? toolTitle(parent.toolId, reg.features.value('taskTools') || []) : '';
        let summary = count;
        if (partial) summary = `${tool ? `${tool} - ` : ''}${count} so far`;
        else if (tool) summary = `${tool} finished - ${count}`;
        const names = listNames([...built, ...failed.map(n => `${n} (failed)`)]);
        if (!built.length) notify.error(names, { summary });
        else if (failed.length) notify.warn(names, { summary });
        else notify.success(names, { summary });
    }

    /**
     * The builds of a task are one toast when the last of them ended. A build that never ends does not keep the news
     * back for good: after TASK_QUIET_MS without a build ending, the group says what is built so far - or waits while
     * the task itself still runs (it may still start builds; its row shows that it runs).
     * @param {string} key
     * @param {BuildGroup} group
     */
    function settle(key, group) {
        if (!activeSiblings(group).length) {
            flush(key);
            return;
        }
        const at = group.ends;
        later(() => {
            // A build that ended since then has its own timer
            if (groups.get(key) !== group || group.ends !== at) return;
            if (!activeSiblings(group).length) flush(key);
            else if (isActiveState(parentOf(group.dataset, /** @type {string} */ (group.parentId))?.state)) settle(key, group);
            else flush(key, true);
        }, TASK_QUIET_MS);
    }

    const onStateChanged = data => {
        const ok = data.newState === 'Succeeded';
        if (!ok && data.newState !== 'Failed') return;
        const name = fileNameOf(data);
        const parentId = data.parentJobId && parentOf(data.dataset, data.parentJobId) ? data.parentJobId : null;
        const key = parentId ? `task:${parentId}` : `dataset:${data.dataset ? BuildManager.getDatasetKey(data.dataset) : ''}`;
        let group = groups.get(key);
        if (!group) {
            group = { built: [], failed: [], parentId, dataset: data.dataset, ends: 0 };
            groups.set(key, group);
            if (!parentId) later(() => flush(key), BUILD_TOAST_WINDOW_MS);
        }
        (ok ? group.built : group.failed).push(name);
        group.ends++;
        if (parentId) settle(key, group);
    };
    const onStarted = data => notify.info(`Build started for ${fileNameOf(data)}`, { summary: 'Build Started' });
    const onError = data => showError(data.error, 'Build Error');
    const onNewBuildable = data => {
        if (data.dataset !== getDataset()) return;
        const n = data.filePaths.length;
        notify.info(`${n} buildable file${n > 1 ? 's' : ''} detected - processing in background`, { summary: 'Buildable Files Detected' });
    };

    let listening = false;
    function stop() {
        later.clear();
        // The builds that ended and were not told yet are told now (a failure is never dropped with the page)
        for (const [key, group] of [...groups]) flush(key, Boolean(group.parentId) && activeSiblings(group).length > 0);
        groups.clear();
        if (!listening) return;
        BuildManager.off('buildStateChanged', onStateChanged);
        BuildManager.off('buildStarted', onStarted);
        BuildManager.off('buildError', onError);
        BuildManager.off('newBuildableFilesDetected', onNewBuildable);
        listening = false;
    }
    if (getCurrentScope()) onScopeDispose(stop);

    /**
     * Starts listening (from mounted(), when the page's dataset exists).
     * @param {() => any} datasetGetter
     * @param {(message: string, title: string) => void} [errorHandler]
     */
    function watchBuildEvents(datasetGetter, errorHandler) {
        getDataset = datasetGetter;
        if (errorHandler) showError = errorHandler;
        if (listening) return;
        BuildManager.on('buildStateChanged', onStateChanged);
        BuildManager.on('buildStarted', onStarted);
        BuildManager.on('buildError', onError);
        BuildManager.on('newBuildableFilesDetected', onNewBuildable);
        listening = true;
    }

    return {
        watchBuildEvents,
        // Build actions started from the explorer, table and detail panel
        handleBuildStarted: file => notify.info(`Build started for ${file.label}`, { summary: 'Build Started' }),
        handleBuildError: data => showError(data.error, 'Build Error')
    };
}

