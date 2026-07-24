/**
 * taskMonitor - Unified per-dataset task polling and in-memory store.
 * Replaces the previous separate `buildManager.startPolling` (GET /builds) and
 * provides a single reactive source of truth for all task consumers
 * (buildManager, TaskHistory, useHeavyTask).
 *
 * Polling schedule:
 *   2500 ms while any active task exists, 15000 ms when idle.
 */

const POLL_ACTIVE = 2500;
const POLL_IDLE   = 15000;
const TAKE        = 200;

// Non-terminal states (mirrors TaskStateCatalog.Active)
const ACTIVE_STATES = ['Awaiting', 'Created', 'Enqueued', 'Processing', 'Scheduled', 'Reused'];

//----- per-dataset store helper -----

function key(dataset) {
    return dataset.baseApi || `${dataset.org}/${dataset.slug}`;
}

const stores = new Map(); // datasetKey -> { tasks: Map, timerId, dataset, _started }

function getStore(dataset) {
    const k = key(dataset);
    let ent = stores.get(k);
    if (!ent) {
        ent = { tasks: new Map(), timerId: null, dataset, _started: false };
        stores.set(k, ent);
    }
    return ent;
}

function hasActive(ent) {
    for (const t of ent.tasks.values()) {
        if (ACTIVE_STATES.includes(t.state)) return true;
    }
    return false;
}

//----- core operations -----

async function _fetch(ent) {
    const ds = ent.dataset;
    try {
        const arr = await ds.getTasks({ take: TAKE }) || [];
        const previous = new Map(ent.tasks);

        ent.tasks.clear();
        for (const t of arr) ent.tasks.set(t.taskId, t);

        // Emit buildStateChanged for build tasks whose state changed
        for (const [_taskId, task] of ent.tasks) {
            if (task.toolId !== 'build') continue;
            const prev = previous.get(_taskId);
            if (prev && prev.state !== task.state) {
                emit('buildStateChanged', {
                    dataset: ds,
                    filePath: task.path,
                    previousState: prev.state,
                    newState: task.state,
                    buildInfo: { path: task.path, currentState: task.state },
                });
            }
        }
    } catch (err) {
        console.error('taskMonitor: fetch failed', err);
    }
}

//----- polling timer -----

function _scheduleTick(ent) {
    _clearTimer(ent);
    if (!ent._started) return;
    const delay = hasActive(ent) ? POLL_ACTIVE : POLL_IDLE;
    ent.timerId = setTimeout(() => { _fetch(ent); _scheduleTick(ent); }, delay);
}

function _clearTimer(ent) {
    if (ent.timerId != null) {
        clearTimeout(ent.timerId);
        ent.timerId = null;
    }
}

//----- event system -----

function emit(event, data) {
    const fn = TaskMonitor._listeners?.[event];
    if (!fn) return;
    for (const handler of fn) {
        try { handler(data); }
        catch (e) { /* ignore */ }
    }
}

//----- public API -----

const TaskMonitor = {
    /** Begin monitoring. Starts an immediate fetch + adaptive timer. */
    start(dataset) {
        const ent = getStore(dataset);
        ent._started = true;
        ent.dataset = dataset;
        _fetch(ent);
        _scheduleTick(ent);
    },

    /** Stop polling for this dataset. */
    stop(dataset) {
        const ent = getStore(dataset);
        if (!ent) return;
        ent._started = false;
        _clearTimer(ent);
    },

    /** Trigger an immediate refresh (e.g. user hit Refresh, tab activated). */
    forceRefresh(dataset) {
        const ent = getStore(dataset);
        if (!ent) return;
        _fetch(ent);
    },

    /** Hint that new files were added (may spawn new build tasks). */
    onFilesAdded(dataset) {
        const ent = getStore(dataset);
        if (ent && ent._started) _fetch(ent);
    },

    /** Get all task summaries for a dataset (TaskSummaryDto[]). */
    getTasks(dataset) {
        const ent = getStore(dataset);
        return ent ? Array.from(ent.tasks.values()) : [];
    },

    /** Get a single task by taskId, or null. */
    getTask(dataset, taskId) {
        const ent = getStore(dataset);
        if (!ent) return null;
        return ent.tasks.get(taskId) || null;
    },

    /** Does this dataset have any active tasks? */
    hasActiveTasks(dataset) {
        const ent = getStore(dataset);
        return ent ? hasActive(ent) : false;
    },

    /** Subscribe to events (buildStateChanged, buildStarted). */
    on(event, fn) {
        (this._listeners[event] || (this._listeners[event] = [])).push(fn);
    },

    /** Unsubscribe from events. */
    off(event, fn) {
        const list = this._listeners[event];
        if (!list) return;
        this._listeners[event] = list.filter(f => f !== fn);
    },

    // Internal event listeners storage (accessed by emit())
    _listeners: {},

    /** Start a new build task via the dataset API, then trigger a refresh. */
    async startBuild(dataset, filePath, force = false) {
        await dataset.build(filePath, force);
        emit('buildStarted', { dataset, filePath, force });
        _fetch(getStore(dataset));
        return true;
    },
};

export default TaskMonitor;