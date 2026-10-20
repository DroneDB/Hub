// @ts-check
/**
 * useHeavyTask - Processing Platform heavy tasks (build, raster-export, photogrammetry,
 * ...): submit, poll status and log until a terminal state, expose reactive progress.
 * (HQ-06: a composable; was an Options-API mixin.)
 *
 *   setup() {
 *       const { runHeavyTask, trackHeavyTask } = useHeavyTask();
 *       return { runHeavyTask, trackHeavyTask };
 *   }
 *
 * The shared task poller (libs/tasks/taskMonitor) is the primary data source; the full
 * status is fetched on the terminal state only, and log lines while the task is tracked.
 * Everything stops when the owning component (effect scope) goes away: a task still
 * running then never settles its promise, and the poller is released.
 */
import { ref, getCurrentScope, onScopeDispose } from 'vue';
import taskMonitor from '@/libs/tasks/taskMonitor';
import { isTerminalState } from '@/libs/tasks/taskStates';
import { notify } from '@/libs/notify';

const DEFAULT_POLL_MS = 2000;

/**
 * @typedef {object} HeavyTaskOptions
 * @property {string} [version] Tool version
 * @property {string} [path] Target path
 * @property {object} [params] Tool params
 * @property {boolean} [force] Bypass dedup
 * @property {number} [pollMs] Poll interval (ms)
 * @property {(entry: object) => void} [onProgress] Called with the live task entry on each poll
 * @property {boolean} [notify] Show a toast on the terminal state (default true)
 */

export function useHeavyTask() {
    /** taskId -> live entry @type {import('vue').Ref<Record<string, any>>} */
    const heavyTasks = ref({});
    // Non-reactive on purpose: dataset instances, promises, timer handles
    /** @type {Record<string, ReturnType<typeof setTimeout>>} */
    const timers = {};
    /** @type {Record<string, any>} */
    const datasets = {};
    /** @type {Record<string, Promise<any>>} */
    const promises = {};
    let disposed = false;

    /** @param {string} taskId @param {object} entry */
    function setTask(taskId, entry) {
        heavyTasks.value = { ...heavyTasks.value, [taskId]: entry };
    }

    /** Single teardown path: stop the timer, drop the dedup entry, release the monitor. @param {string} taskId */
    function endTask(taskId) {
        if (timers[taskId]) {
            clearTimeout(timers[taskId]);
            delete timers[taskId];
        }
        if (datasets[taskId]) {
            taskMonitor.release(datasets[taskId]);
            delete datasets[taskId];
        }
        delete promises[taskId];
    }

    /** @param {any} dataset @param {string} taskId @param {HeavyTaskOptions} options */
    function poll(dataset, taskId, options) {
        // Owner already gone (e.g. unmounted while submitTask was in flight): never
        // acquire and never settle, like an unmount in the middle of a tick.
        if (disposed) return new Promise(() => {});
        if (promises[taskId]) return promises[taskId];

        const pollMs = options.pollMs || DEFAULT_POLL_MS;
        const showToast = options.notify !== false;

        // Hold the shared poller open while the task is tracked: reading a released
        // monitor would freeze on a non-terminal state.
        taskMonitor.acquire(dataset);
        datasets[taskId] = dataset;

        let startTick;
        const promise = new Promise((resolve, reject) => {
            const tick = async () => {
                if (disposed) return;
                try {
                    let summary = taskMonitor.getTask(dataset, taskId);
                    // Not in the shared store yet: ask the API directly
                    if (!summary) {
                        try { summary = (await dataset.getTasks({ skip: 0, take: 200 }) || []).find(t => t.taskId === taskId); }
                        catch { /* ignore */ }
                        if (disposed) return;
                    }
                    if (!summary) {
                        timers[taskId] = setTimeout(tick, pollMs);
                        return;
                    }

                    const prev = heavyTasks.value[taskId] || {};
                    // Incremental log lines beyond the cursor (best-effort)
                    let logTail = prev.logTail || [];
                    let logCursor = prev.logCursor || 0;
                    try {
                        const log = await dataset.getTaskLog(taskId, logCursor);
                        if (log && Array.isArray(log.lines) && log.lines.length) {
                            logTail = logTail.concat(log.lines).slice(-500);
                        }
                        if (log && typeof log.cursor === 'number') logCursor = log.cursor;
                    } catch { /* log fetch is best-effort */ }
                    if (disposed) return;

                    const entry = {
                        taskId: summary.taskId,
                        toolId: summary.toolId,
                        version: summary.version,
                        state: summary.state,
                        percent: summary.progressPercent ?? 0,
                        phase: summary.phaseMessage,
                        logTail,
                        logCursor,
                        error: summary.errorType || null,
                        artifact: null, // not in the summary; fetched on the terminal state
                        createdAt: summary.createdAt,
                        startedAt: summary.startedAt,
                        finishedAt: summary.finishedAt
                    };
                    setTask(taskId, entry);

                    if (typeof options.onProgress === 'function') {
                        try { options.onProgress(entry); } catch { /* ignore */ }
                    }

                    if (isTerminalState(summary.state)) {
                        endTask(taskId);
                        try {
                            const full = await dataset.getTask(taskId);
                            entry.error = full.error || null;
                            entry.artifact = full.artifact || null;
                        } catch { /* best-effort */ }
                        if (disposed) return;

                        if (summary.state === 'Succeeded') {
                            if (showToast) notify.success(`${entry.toolId} finished`, { summary: 'Task completed' });
                            resolve(entry);
                        } else {
                            if (showToast) notify.error(entry.error || `${entry.toolId} ${summary.state.toLowerCase()}`, { summary: 'Task failed', life: 'long' });
                            const err = /** @type {Error & { task?: object }} */ (new Error(entry.error || `Task ${summary.state}`));
                            err.task = entry;
                            reject(err);
                        }
                        return;
                    }

                    timers[taskId] = setTimeout(tick, pollMs);
                } catch (e) {
                    endTask(taskId);
                    if (disposed) return;
                    reject(e);
                }
            };
            startTick = tick;
        });

        // Registered before the first tick so a synchronous teardown cannot leak the entry
        promises[taskId] = promise;
        startTick();
        return promise;
    }

    /**
     * Submits a heavy task and polls until it reaches a terminal state.
     * @param {any} dataset the ddb Dataset
     * @param {string} toolId
     * @param {HeavyTaskOptions} [options]
     * @returns {Promise<any>} the final entry; rejects when Failed/Deleted
     */
    async function runHeavyTask(dataset, toolId, options = {}) {
        const submit = await dataset.submitTask(toolId, {
            version: options.version,
            path: options.path,
            params: options.params || {},
            force: options.force || false
        });
        if (submit && submit.error) throw new Error(submit.error);

        const taskId = submit.taskId;
        setTask(taskId, {
            taskId,
            toolId: submit.toolId || toolId,
            version: submit.version,
            state: submit.deduplicated ? 'Reused' : 'Enqueued',
            percent: 0,
            phase: null,
            logTail: [],
            logCursor: 0,
            error: null,
            artifact: null,
            deduplicated: !!submit.deduplicated
        });
        return poll(dataset, taskId, options);
    }

    /** Begins (or resumes) polling for an already-known task id. @param {any} dataset @param {string} taskId @param {HeavyTaskOptions} [options] */
    function trackHeavyTask(dataset, taskId, options = {}) {
        if (!heavyTasks.value[taskId]) {
            setTask(taskId, {
                taskId, toolId: null, state: 'Enqueued', percent: 0, phase: null,
                logTail: [], logCursor: 0, error: null, artifact: null
            });
        }
        return poll(dataset, taskId, options);
    }

    /** @param {any} dataset @param {string} taskId */
    async function cancelHeavyTask(dataset, taskId) {
        endTask(taskId);
        try {
            await dataset.cancelTask(taskId);
        } finally {
            const entry = heavyTasks.value[taskId];
            if (entry) setTask(taskId, { ...entry, state: 'Deleted' });
        }
    }

    /** @param {any} dataset @param {string} taskId @param {HeavyTaskOptions} [options] */
    async function retryHeavyTask(dataset, taskId, options = {}) {
        await dataset.retryTask(taskId);
        return poll(dataset, taskId, options);
    }

    /** Stops every poll and releases the monitor (also called when the owner's scope ends). */
    function dispose() {
        disposed = true;
        Object.keys(datasets).forEach(endTask);
    }
    if (getCurrentScope()) onScopeDispose(dispose);

    return {
        heavyTasks, runHeavyTask, trackHeavyTask, cancelHeavyTask, retryHeavyTask, dispose,
        /** For tests: polls still holding a timer or the monitor. */
        activeCount: () => Object.keys(datasets).length + Object.keys(timers).length
    };
}

export default useHeavyTask;
