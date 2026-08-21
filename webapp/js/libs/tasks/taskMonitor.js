/**
 * taskMonitor - Unified per-dataset task polling and in-memory store.
 * Replaces the previous separate `buildManager.startPolling` (GET /builds) and
 * provides a single reactive source of truth for all task consumers
 * (buildManager, TaskHistory, useHeavyTask).
 *
 * Polling schedule:
 *   2500 ms while any active task exists, 15000 ms when idle.
 *
 * Events:
 *   'buildStateChanged' - a build task changed state (consumed by buildManager).
 *   'tasksUpdated'      - the store snapshot actually changed (consume to re-render).
 */

const POLL_ACTIVE = 2500;
const POLL_IDLE   = 15000;
const TAKE        = 200;

// Non-terminal states (mirrors TaskStateCatalog.Active)
const ACTIVE_STATES = ['Awaiting', 'Created', 'Enqueued', 'Processing', 'Scheduled', 'Reused'];

//----- per-dataset store helper -----

// Stable identity of a dataset for store keys and event matching.
export function datasetKey(dataset) {
    return dataset.baseApi || `${dataset.org}/${dataset.slug}`;
}

const stores = new Map(); // datasetKey -> { tasks: Map, timerId, dataset, refs, _started }

function getStore(dataset) {
    const k = datasetKey(dataset);
    let ent = stores.get(k);
    if (!ent) {
        ent = { tasks: new Map(), timerId: null, dataset, refs: 0, _started: false, _lastSig: '' };
        stores.set(k, ent);
    }
    return ent;
}

// Read-only lookup: never resurrects a released dataset, so a consumer can't mistake
// a frozen snapshot for live data and wait forever on a state that will never change.
function peekStore(dataset) {
    return stores.get(datasetKey(dataset));
}

function hasActive(ent) {
    for (const t of ent.tasks.values()) {
        if (ACTIVE_STATES.includes(t.state)) return true;
    }
    return false;
}

// Cheap snapshot signature: which task carries which state/progress/phase.
// Lets us tell (in O(n) string compare) whether a fetch actually changed anything.
function computeSignature(ent) {
    return Array.from(ent.tasks.values())
        .sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)))
        .map(t => `${t.taskId}:${t.state}:${t.progressPercent ?? ''}:${t.phaseMessage ?? ''}`)
        .join('|');
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

        // Notify generic listeners (e.g. the Tasks tab) when the snapshot changed.
        const sig = computeSignature(ent);
        if (sig !== ent._lastSig) {
            ent._lastSig = sig;
            emit('tasksUpdated', { dataset: ds });
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
    // Await the fetch before rescheduling to avoid overlapping/out-of-order requests
    ent.timerId = setTimeout(async () => { await _fetch(ent); _scheduleTick(ent); }, delay);
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
    /**
     * Take a reference on this dataset's monitor, starting it if idle.
     * Ref-counted so consumers that outlive the dataset screen (e.g. a bulk download
     * tracked from the persistent Header) keep receiving fresh data until they finish.
     */
    acquire(dataset) {
        const ent = getStore(dataset);
        ent.refs++;
        ent.dataset = dataset;
        if (ent._started) return;
        ent._started = true;
        _fetch(ent);
        _scheduleTick(ent);
    },

    /** Drop a reference; the last one stops polling and discards the snapshot. */
    release(dataset) {
        const ent = peekStore(dataset);
        if (!ent) return;
        ent.refs = Math.max(0, ent.refs - 1);
        if (ent.refs > 0) return;
        ent._started = false;
        _clearTimer(ent);
        stores.delete(datasetKey(dataset));
    },

    /** Trigger an immediate refresh (e.g. user hit Refresh, tab activated). Returns the in-flight fetch promise so callers can await freshness. */
    forceRefresh(dataset) {
        const ent = getStore(dataset);
        if (!ent) return Promise.resolve();
        return _fetch(ent);
    },

    /** Hint that new files were added (may spawn new build tasks). */
    onFilesAdded(dataset) {
        const ent = peekStore(dataset);
        if (ent && ent._started) _fetch(ent);
    },

    /** Get all task summaries for a dataset (TaskSummaryDto[]). */
    getTasks(dataset) {
        const ent = peekStore(dataset);
        return ent ? Array.from(ent.tasks.values()) : [];
    },

    /** Get a single task by taskId, or null. */
    getTask(dataset, taskId) {
        const ent = peekStore(dataset);
        if (!ent) return null;
        return ent.tasks.get(taskId) || null;
    },

    /** Does this dataset have any active tasks? */
    hasActiveTasks(dataset) {
        const ent = peekStore(dataset);
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
        const ent = peekStore(dataset);
        if (ent) _fetch(ent);
        return true;
    },
};

export default TaskMonitor;