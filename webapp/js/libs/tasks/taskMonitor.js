/**
 * taskMonitor - Unified per-dataset task polling and in-memory store.
 * Replaces the previous separate `buildManager.startPolling` (GET /builds) and
 * provides a single reactive source of truth for all task consumers
 * (buildManager, TaskHistory, useHeavyTask).
 *
 * Refresh schedule (HUB-05, see pollingPolicy):
 *   - the server pushes a "tasks changed" event (server-sent events) and the list is
 *     fetched then; polling is only a 2-minute safety net while the stream is up;
 *   - otherwise 2.5 s while any task is active, 15 s doubling up to 2 minutes when idle;
 *   - nothing while the page is hidden, one refresh when it shows again;
 *   - the list GET is conditional (ETag): an unchanged list costs a 304.
 * The event stream is closed while an upload runs (it would hold one of the browser's
 * HTTP/1.1 connections; files added during an upload trigger refreshes anyway).
 *
 * Events:
 *   'buildStateChanged' - a build task changed state (consumed by buildManager).
 *   'tasksUpdated'      - the store snapshot actually changed (consume to re-render).
 */
import { nextPollDelay } from './pollingPolicy';
import { openEventStream } from '@/libs/sse';
import emitter from '@/libs/eventBus';
import { UPLOAD_ACTIVITY_EVENT } from '@/libs/upload/uploadEvents';
import { datasetKey, isActiveState } from './taskStates';

const TAKE        = 200;
// After the event stream fails, polling alone for this long before trying it again
const STREAM_RETRY_MS = 60000;

const isHidden = () => typeof document !== 'undefined' && document.hidden === true;
let uploading = false;

// ----- per-dataset store helper -----

// Stable identity of a dataset for store keys and event matching (libs/tasks/taskStates)
export { datasetKey };

const stores = new Map(); // datasetKey -> { tasks: Map, timerId, dataset, refs, _started }

function getStore(dataset) {
    const k = datasetKey(dataset);
    let ent = stores.get(k);
    if (!ent) {
        ent = {
            tasks: new Map(), timerId: null, dataset, refs: 0, _started: false, _lastSig: '',
            idleStreak: 0, stream: null, streamUp: false, streamFailedAt: 0
        };
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
        if (isActiveState(t.state)) return true;
    }
    return false;
}

// Cheap snapshot signature: which task carries which state/progress/phase/error.
// Lets us tell (in O(n) string compare) whether a fetch actually changed anything.
function computeSignature(ent) {
    return Array.from(ent.tasks.values())
        .sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)))
        .map(t => `${t.taskId}:${t.state}:${t.progressPercent ?? ''}:${t.phaseMessage ?? ''}:${t.errorType ?? ''}`)
        .join('|');
}

// ----- core operations -----

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
            ent.idleStreak = 0;
            emit('tasksUpdated', { dataset: ds });
        } else {
            ent.idleStreak++;
        }
    } catch (err) {
        console.error('taskMonitor: fetch failed', err);
    }
}

// ----- polling timer -----

function _scheduleTick(ent) {
    _clearTimer(ent);
    if (!ent._started) return;
    _updateStream(ent);
    const delay = nextPollDelay({
        hidden: isHidden(), active: hasActive(ent), idleStreak: ent.idleStreak, pushed: ent.streamUp
    });
    if (delay == null) return; // hidden: visibilitychange refreshes and reschedules
    // Await the fetch before rescheduling to avoid overlapping/out-of-order requests
    ent.timerId = setTimeout(async () => { await _fetch(ent); _scheduleTick(ent); }, delay);
}

// Activity (a new build, files added, a user refresh) brings the fast cadence back
function _wake(ent) {
    ent.idleStreak = 0;
    _scheduleTick(ent);
}

// ----- change notifications (server-sent events) -----

function _streamWanted(ent) {
    return ent._started && !isHidden() && !uploading &&
        ent.dataset?.registry && ent.dataset?.baseApi &&
        typeof globalThis.ReadableStream !== 'undefined' &&
        Date.now() - ent.streamFailedAt > STREAM_RETRY_MS;
}

function _updateStream(ent) {
    if (!_streamWanted(ent)) {
        _closeStream(ent);
        return;
    }
    if (ent.stream) return;

    const controller = new AbortController();
    ent.stream = controller;
    const registry = ent.dataset.registry;
    const token = registry.getAuthToken?.();
    openEventStream({
        url: `${registry.url}${ent.dataset.baseApi}/tasks/events`,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
        onOpen: () => {
            if (ent.stream !== controller) return;
            ent.streamUp = true;
            _scheduleTick(ent);
        },
        onEvent: e => {
            if (e.type === 'tasks') _fetch(ent).then(() => _scheduleTick(ent));
        },
        onClose: () => {
            if (ent.stream !== controller) return;
            ent.stream = null;
            ent.streamUp = false;
            ent.streamFailedAt = Date.now();
            _scheduleTick(ent);
        }
    });
}

function _closeStream(ent) {
    if (!ent.stream) return;
    const controller = ent.stream;
    ent.stream = null;
    ent.streamUp = false;
    controller.abort();
}

// ----- page visibility and uploads -----

function onVisibilityChange() {
    for (const ent of stores.values()) {
        if (!ent._started) continue;
        if (isHidden()) {
            _clearTimer(ent);
            _closeStream(ent);
        } else {
            // Shown again: one refresh, then the normal schedule
            _fetch(ent).then(() => _wake(ent));
        }
    }
}

function onUploadActivity({ active }) {
    uploading = active;
    for (const ent of stores.values()) if (ent._started) _scheduleTick(ent);
}

let hooked = false;
function hookPage() {
    if (hooked) return;
    hooked = true;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
    emitter.on(UPLOAD_ACTIVITY_EVENT, onUploadActivity);
}

function unhookPage() {
    if (!hooked || stores.size > 0) return;
    hooked = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
    emitter.off(UPLOAD_ACTIVITY_EVENT, onUploadActivity);
}

function _clearTimer(ent) {
    if (ent.timerId != null) {
        clearTimeout(ent.timerId);
        ent.timerId = null;
    }
}

// ----- event system -----

function emit(event, data) {
    const fn = TaskMonitor._listeners?.[event];
    if (!fn) return;
    for (const handler of fn) {
        try { handler(data); }
        catch { /* ignore */ }
    }
}

// ----- public API -----

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
        hookPage();
        if (!isHidden()) _fetch(ent);
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
        _closeStream(ent);
        stores.delete(datasetKey(dataset));
        unhookPage();
    },

    /** Trigger an immediate refresh (e.g. user hit Refresh, tab activated). Returns the in-flight fetch promise so callers can await freshness. */
    forceRefresh(dataset) {
        const ent = getStore(dataset);
        if (!ent) return Promise.resolve();
        return _fetch(ent).then(() => { if (ent._started) _wake(ent); });
    },

    /** Hint that new files were added (may spawn new build tasks). */
    onFilesAdded(dataset) {
        const ent = peekStore(dataset);
        if (ent && ent._started) _fetch(ent).then(() => _wake(ent));
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
        if (ent) _fetch(ent).then(() => { if (ent._started) _wake(ent); });
        return true;
    },
};

export default TaskMonitor;