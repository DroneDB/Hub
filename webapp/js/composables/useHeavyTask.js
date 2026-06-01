/**
 * useHeavyTask
 *
 * Options-API mixin that orchestrates Processing Platform heavy tasks
 * (build, raster-export, photogrammetry, ...): submit, poll status + log
 * until a terminal state, and expose reactive per-task progress.
 *
 * Requirements on the host component:
 * - none mandatory; `this.$toast` is used opportunistically for notifications.
 *
 * Usage:
 *   methods: {
 *     async runPhotogrammetry() {
 *       const result = await this.runHeavyTask(this.dataset, 'photogrammetry', {
 *         params: { folder: '', options: [] },
 *         onProgress: (t) => { ... },
 *       });
 *       // result is the final TaskStatusDto (state === 'Succeeded')
 *     }
 *   }
 *
 * Reactive state:
 *   this.heavyTasks  -> object keyed by taskId: { taskId, toolId, state,
 *                       percent, phase, logTail, logCursor, error, artifact }
 */
const TERMINAL_STATES = ['Succeeded', 'Failed', 'Deleted'];
const DEFAULT_POLL_MS = 2000;

export default {
    data() {
        return {
            heavyTasks: {},
            // taskId -> setTimeout handle, so polling can be cancelled on unmount.
            _heavyTaskTimers: {},
        };
    },

    beforeUnmount() {
        Object.values(this._heavyTaskTimers || {}).forEach(h => clearTimeout(h));
        this._heavyTaskTimers = {};
    },

    methods: {
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
            this._clearTimer(taskId);
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
            const pollMs = options.pollMs || DEFAULT_POLL_MS;
            const notify = options.notify !== false;

            return new Promise((resolve, reject) => {
                const tick = async () => {
                    try {
                        const status = await dataset.getTask(taskId);
                        const prev = this.heavyTasks[taskId] || {};

                        // Pull incremental log lines beyond our cursor.
                        let logTail = prev.logTail || [];
                        let logCursor = prev.logCursor || 0;
                        try {
                            const log = await dataset.getTaskLog(taskId, logCursor);
                            if (log && Array.isArray(log.lines) && log.lines.length) {
                                logTail = logTail.concat(log.lines).slice(-500);
                            }
                            if (log && typeof log.cursor === 'number') logCursor = log.cursor;
                        } catch (_) { /* log fetch is best-effort */ }

                        const entry = {
                            taskId,
                            toolId: status.toolId,
                            version: status.version,
                            state: status.state,
                            percent: status.progress ? (status.progress.percent || 0) : 0,
                            phase: status.progress ? status.progress.phase : null,
                            logTail,
                            logCursor,
                            error: status.error || null,
                            artifact: status.artifact || null,
                            createdAt: status.createdAt,
                            startedAt: status.startedAt,
                            finishedAt: status.finishedAt,
                        };
                        this._setHeavyTask(taskId, entry);

                        if (typeof options.onProgress === 'function') {
                            try { options.onProgress(entry); } catch (_) { /* ignore */ }
                        }

                        if (TERMINAL_STATES.includes(status.state)) {
                            this._clearTimer(taskId);
                            if (status.state === 'Succeeded') {
                                if (notify) this._toast('success', 'Task completed',
                                    `${entry.toolId} finished`);
                                resolve(entry);
                            } else {
                                if (notify) this._toast('error', 'Task failed',
                                    entry.error || `${entry.toolId} ${status.state.toLowerCase()}`);
                                const err = new Error(entry.error || `Task ${status.state}`);
                                err.task = entry;
                                reject(err);
                            }
                            return;
                        }

                        this._heavyTaskTimers[taskId] = setTimeout(tick, pollMs);
                    } catch (e) {
                        this._clearTimer(taskId);
                        reject(e);
                    }
                };
                tick();
            });
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

        _toast(severity, summary, detail) {
            if (this.$toast && typeof this.$toast.add === 'function') {
                this.$toast.add({ severity, summary, detail, life: severity === 'error' ? 6000 : 3000 });
            }
        },
    },
};
