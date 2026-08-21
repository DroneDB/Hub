/**
 * useHeavyTask
 *
 * Options-API mixin that orchestrates Processing Platform heavy tasks
 * (build, raster-export, photogrammetry, ...): submit, poll status + log
 * until a terminal state, and expose reactive per-task progress.
 *
 * Primary data source is now `taskMonitor` (shared GET /tasks poller).
 * Full status (GET /tasks/{id}) fetched only on terminal state for artifact/error,
 * or when a task is not yet in the shared store.  Incremental logs fetched only
 * while actively tracking.
 */
const TERMINAL_STATES = ['Succeeded', 'Failed', 'Deleted'];
const DEFAULT_POLL_MS = 2000;
import taskMonitor from '@/libs/tasks/taskMonitor';
import { taskProgressMode } from '@/libs/utils';

export default {
    data() {
        return {
            heavyTasks: {},
            // taskId -> setTimeout handle, so polling can be cancelled on unmount.
            _heavyTaskTimers: {},
        };
    },

    created() {
        // Non-reactive on purpose: holds dataset instances and promises that must not be proxied.
        this._heavyTaskUnmounted = false;
        this._heavyTaskDatasets = {};
        this._heavyTaskPromises = {};
    },

    beforeUnmount() {
        this._heavyTaskUnmounted = true;
        Object.keys(this._heavyTaskDatasets || {}).forEach(taskId => this._endHeavyTask(taskId));
        this._heavyTaskTimers = {};
    },

    methods: {
        // Animated indeterminate bar while a task reports no real percent.
        taskProgressMode,

        /**
         * Submits a heavy task and polls until it reaches a terminal state.
         *
         * @param {Object} dataset The ddb Dataset instance
         * @param {string} toolId Tool id
         * @param {Object} [options]
         * @param {string} [options.version] Tool version
         * @param {string} [options.path] Target path
         * @param {Object} [options.params] Tool params
         * @param {boolean} [options.force] Bypass dedup
         * @param {number} [options.pollMs] Poll interval (ms)
         * @param {Function} [options.onProgress] Called with the live task entry on each poll
         * @param {boolean} [options.notify] Show toasts on terminal state (default true)
         * @returns {Promise<Object>} The final task entry; rejects when Failed/Deleted
         */
        async runHeavyTask(dataset, toolId, options = {}) {
            const submit = await dataset.submitTask(toolId, {
                version: options.version,
                path: options.path,
                params: options.params || {},
                force: options.force || false,
            });

            if (submit && submit.error) {
                throw new Error(submit.error);
            }
            const taskId = submit.taskId;

            this._setHeavyTask(taskId, {
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
                deduplicated: !!submit.deduplicated,
            });

            return this._pollHeavyTask(dataset, taskId, options);
        },

        /** Begins (or resumes) polling for an already-known task id. */
        trackHeavyTask(dataset, taskId, options = {}) {
            if (!this.heavyTasks[taskId]) {
                this._setHeavyTask(taskId, {
                    taskId, toolId: null, state: 'Enqueued', percent: 0, phase: null,
                    logTail: [], logCursor: 0, error: null, artifact: null,
                });
            }
            return this._pollHeavyTask(dataset, taskId, options);
        },

        async cancelHeavyTask(dataset, taskId) {
            this._endHeavyTask(taskId);
            try {
                await dataset.cancelTask(taskId);
            } finally {
                const entry = this.heavyTasks[taskId];
                if (entry) this._setHeavyTask(taskId, { ...entry, state: 'Deleted' });
            }
        },

        async retryHeavyTask(dataset, taskId, options = {}) {
            await dataset.retryTask(taskId);
            return this._pollHeavyTask(dataset, taskId, options);
        },

        // ---- internals ----------------------------------------------------

        _pollHeavyTask(dataset, taskId, options) {
            // Host already gone (e.g. unmounted while submitTask was in flight): never
            // acquire, and never settle, matching the mid-tick unmount behaviour.
            if (this._heavyTaskUnmounted) return new Promise(() => {});

            const existing = this._heavyTaskPromises[taskId];
            if (existing) return existing;

            const pollMs = options.pollMs || DEFAULT_POLL_MS;
            const notify = options.notify !== false;

            // Hold the shared poller open for as long as we track this task: reading a
            // released monitor would freeze us on a non-terminal state forever.
            taskMonitor.acquire(dataset);
            this._heavyTaskDatasets[taskId] = dataset;

            let startTick;
            const promise = new Promise((resolve, reject) => {
                const tick = async () => {
                    if (this._heavyTaskUnmounted) return;
                    try {
                        // Primary data source: taskMonitor (shared GET /tasks poller).
                        let summary = taskMonitor.getTask(dataset, taskId);

                        // If not in the shared store yet, fall back to direct API.
                        if (!summary) {
                            try { summary = (await dataset.getTasks({ skip: 0, take: 200 }) || []).find(t => t.taskId === taskId); }
                            catch(e) { /* ignore */ }
                            if (this._heavyTaskUnmounted) return;
                        }

                        if (!summary) {
                            // Still not available; schedule retry (task may be new).
                            this._heavyTaskTimers[taskId] = setTimeout(tick, pollMs);
                            return;
                        }

                        const prev = this.heavyTasks[taskId] || {};

                        // Pull incremental log lines beyond our cursor (best-effort).
                        let logTail = prev.logTail || [];
                        let logCursor = prev.logCursor || 0;
                        try {
                            const log = await dataset.getTaskLog(taskId, logCursor);
                            if (log && Array.isArray(log.lines) && log.lines.length) {
                                logTail = logTail.concat(log.lines).slice(-500);
                            }
                            if (log && typeof log.cursor === 'number') logCursor = log.cursor;
                        } catch (e) { /* log fetch is best-effort */ }
                        if (this._heavyTaskUnmounted) return;

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
                            artifact: null, // artifact not in summary; fetched on terminal state
                            createdAt: summary.createdAt,
                            startedAt: summary.startedAt,
                            finishedAt: summary.finishedAt,
                        };
                        this._setHeavyTask(taskId, entry);

                        if (typeof options.onProgress === 'function') {
                            try { options.onProgress(entry); } catch (e) { /* ignore */ }
                        }

                        if (TERMINAL_STATES.includes(summary.state)) {
                            this._endHeavyTask(taskId);
                            // Fetch full status (includes artifact/error details).
                            try {
                                const full = await dataset.getTask(taskId);
                                entry.error = full.error || null;
                                entry.artifact = full.artifact || null;
                            } catch(e) { /* best-effort */ }
                            if (this._heavyTaskUnmounted) return;

                            if (summary.state === 'Succeeded') {
                                if (notify) this._toast('success', 'Task completed',
                                    `${entry.toolId} finished`);
                                resolve(entry);
                            } else {
                                if (notify) this._toast('error', 'Task failed',
                                    entry.error || `${entry.toolId} ${summary.state.toLowerCase()}`);
                                const err = new Error(entry.error || `Task ${summary.state}`);
                                err.task = entry;
                                reject(err);
                            }
                            return;
                        }

                        this._heavyTaskTimers[taskId] = setTimeout(tick, pollMs);
                    } catch (e) {
                        this._endHeavyTask(taskId);
                        if (this._heavyTaskUnmounted) return;
                        reject(e);
                    }
                };
                startTick = tick;
            });

            // Registered before the first tick so a synchronous teardown can't leak the entry.
            this._heavyTaskPromises[taskId] = promise;
            startTick();
            return promise;
        },

        _setHeavyTask(taskId, entry) {
            this.heavyTasks = { ...this.heavyTasks, [taskId]: entry };
        },

        _clearTimer(taskId) {
            const h = this._heavyTaskTimers[taskId];
            if (h) {
                clearTimeout(h);
                delete this._heavyTaskTimers[taskId];
            }
        },

        /** Single teardown path: stop the timer, drop the dedup entry, release the monitor. */
        _endHeavyTask(taskId) {
            this._clearTimer(taskId);
            const ds = this._heavyTaskDatasets[taskId];
            if (ds) {
                taskMonitor.release(ds);
                delete this._heavyTaskDatasets[taskId];
            }
            delete this._heavyTaskPromises[taskId];
        },

        _toast(severity, summary, detail) {
            if (this.$toast && typeof this.$toast.add === 'function') {
                this.$toast.add({ severity, summary, detail, life: severity === 'error' ? 6000 : 3000 });
            }
        },
    },
};
