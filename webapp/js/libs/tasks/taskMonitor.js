/**
 * taskMonitor - Unified per-dataset task polling and in-memory store.
 * A single reactive source of truth for all task consumers
 * (buildManager, TaskHistory, useHeavyTask).
 *
 * Refresh schedule (see pollingPolicy):
 *   - the server pushes a "tasks changed" event (server-sent events) and the list is
 *     fetched then; polling is only a 2-minute safety net while the stream is up;
 *   - otherwise 2.5 s while any task is active, 15 s doubling up to 2 minutes when idle;
 *   - nothing while the page is hidden, one refresh when it shows again;
 *   - the list GET is conditional (ETag): an unchanged list costs a 304.
 * The event stream is closed while an upload runs (it would hold one of the browser's
 * HTTP/1.1 connections; files added during an upload trigger refreshes anyway).
 *
 * Events:
 *   'tasksUpdated' - the store snapshot changed: a task was added or deleted, or changed state or
 *                    progress (buildManager derives the build state of each file from it). The
 *                    first fetch of a dataset always fires it, even for an empty list.
 *   'datasetGone'  - the server answered 404 to the task list: the dataset is not there any more (an
 *                    import that was cancelled or failed has rolled back and deleted it, FR-UPL-05,
 *                    D-004). Fires once, with { dataset, error }, and the dataset is not polled again.
 *                    The Hub never deletes the dataset: the page shows the not-found state.
 *   'importEnded'  - a background import (see "Background imports" below) ended: { dataset, task, gone }, with the
 *                    task as last listed (Succeeded or Failed), or `gone: true` when its dataset was deleted by the
 *                    rollback of a cancelled or failed import (the task is the last one seen, or null).
 * A gone dataset ends its tasks for every reader: isGone() says so, hasActiveTasks() is false, and
 * useHeavyTask rejects a task that it still saw running ("The dataset was deleted."). The last list
 * stays readable (getTasks, getTask), frozen.
 *
 * Background imports (FR-UPL-10, FR-XC-16): an import outlives the dialog that started it and the page that showed it, so
 * it is tracked here, in the scope of the app, not by a component: trackImport(dataset, taskId) keeps the dataset's
 * monitor acquired until that task ends (then 'importEnded', and the reference is released); findImports(dataset) asks the
 * dataset's task list once (after a reload) and tracks the imports it finds running; getImports(dataset) lists the running
 * imports the store holds, for the row and the banner that show "Importing… 40 %".
 */
import { nextPollDelay } from './pollingPolicy';
import { openEventStream } from '@/libs/sse';
import emitter from '@/libs/eventBus';
import { UPLOAD_ACTIVITY_EVENT } from '@/libs/upload/uploadEvents';
import { datasetKey, isActiveState, isTerminalState } from './taskStates';
import { isNotFound } from '@/libs/ddb/apiError';

const TAKE        = 200;
// After the event stream fails, polling alone for this long before trying it again
const STREAM_RETRY_MS = 60000;

const isHidden = () => typeof document !== 'undefined' && document.hidden === true;
let uploading = false;

// ----- per-dataset store helper -----

// Stable identity of a dataset for store keys and event matching (libs/tasks/taskStates)
export { datasetKey };

/** The tool of the import task, as the Registry names it (HeavyToolIds.ImportDataset). */
export const IMPORT_TOOL_ID = 'import-dataset';

const stores = new Map(); // datasetKey -> { tasks: Map, loaded, gone, timerId, dataset, refs, _started }

function getStore(dataset) {
    const k = datasetKey(dataset);
    let ent = stores.get(k);
    if (!ent) {
        ent = {
            // loaded: the server returned the list at least once. Until then `tasks` is empty
            // because nothing was fetched, not because the dataset has no tasks
            tasks: new Map(), loaded: false, timerId: null, dataset, refs: 0, _started: false, _lastSig: null,
            idleStreak: 0, stream: null, streamUp: false, streamFailedAt: 0,
            // gone: the task list answered 404, the dataset was deleted (see 'datasetGone')
            gone: false
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
    // A deleted dataset runs nothing any more, whatever its last list said
    if (ent.gone) return false;
    for (const t of ent.tasks.values()) {
        if (isActiveState(t.state)) return true;
    }
    return false;
}

// Cheap snapshot signature: which task carries which state/progress/phase/error, and the files a
// succeeded build waits for (they arrive without a change of the task's state), what the row offers
// (`actions`), whether a node keeps it queued, who cancelled it and the label of its target.
// Lets us tell (in O(n) string compare) whether a fetch actually changed anything.
function computeSignature(ent) {
    return Array.from(ent.tasks.values())
        .sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)))
        .map(t => `${t.taskId}:${t.state}:${t.progressPercent ?? ''}:${t.phaseMessage ?? ''}:${t.errorType ?? ''}:` +
            `${t.waitingForFiles ? (t.missingFiles ?? []).join(',') : '-'}:` +
            `${(t.actions ?? []).join(',')}:${t.waitingForNode ? 1 : 0}:${t.cancelledBy ?? ''}:${t.targetLabel ?? ''}`)
        .join('|');
}

// ----- background imports -----

// datasetKey -> { dataset, taskIds: Set<string>, last: Map<taskId, last listed summary> }
const importTracks = new Map();

const isImport = t => t.toolId === IMPORT_TOOL_ID;

// datasetKey|taskId of the tracked imports being asked for by id
const lookingUp = new Set();

// The tracked import ended: told once, and let go with the reference trackImport took when it was the last one
function endImport(ent, track, taskId, task, gone) {
    track.taskIds.delete(taskId);
    emit('importEnded', { dataset: ent.dataset, task, gone });
    if (track.taskIds.size === 0) {
        importTracks.delete(datasetKey(ent.dataset));
        TaskMonitor.release(ent.dataset);
    }
}

// The tracked imports of a dataset that ended (their task is terminal, or the dataset is gone) are told once, and let go.
// A tracked import the list does not have (the list holds the newest TAKE tasks: many builds push it out) is asked for
// by id, so it is not followed for ever
function settleImports(ent, gone = false) {
    const track = importTracks.get(datasetKey(ent.dataset));
    if (!track) return;
    for (const taskId of [...track.taskIds]) {
        const task = ent.tasks.get(taskId) ?? null;
        if (task) track.last.set(taskId, task);
        if (gone || (task && isTerminalState(task.state))) endImport(ent, track, taskId, task ?? track.last.get(taskId) ?? null, gone);
        else if (!task) lookUpImport(ent, taskId);
    }
}

// The tracked import `taskId` that the list left out, as GET /tasks/{id} says: ended when it is terminal or not found
async function lookUpImport(ent, taskId) {
    const ds = ent.dataset;
    const id = `${datasetKey(ds)}|${taskId}`;
    if (lookingUp.has(id) || typeof ds.getTask !== 'function') return;
    lookingUp.add(id);
    let status = null;
    try {
        status = await ds.getTask(taskId);
    } catch (err) {
        // Not reachable now (offline, a server error): the next poll asks again
        if (!isNotFound(err)) return;
    } finally {
        lookingUp.delete(id);
    }
    const track = importTracks.get(datasetKey(ds));
    if (!track?.taskIds.has(taskId) || ent.gone) return;
    const last = track.last.get(taskId) ?? null;
    if (!status) {
        // The task is not found any more (removed): it ended as it was last seen
        endImport(ent, track, taskId, last, false);
        return;
    }
    const task = { ...last, ...status };
    track.last.set(taskId, task);
    if (isTerminalState(task.state)) endImport(ent, track, taskId, task, false);
}

// ----- core operations -----

async function _fetch(ent) {
    const ds = ent.dataset;
    if (ent.gone) return;
    try {
        const arr = await ds.getTasks({ take: TAKE }) || [];

        ent.tasks.clear();
        for (const t of arr) ent.tasks.set(t.taskId, t);
        ent.loaded = true;
        settleImports(ent);

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
        if (isNotFound(err)) {
            // The dataset was deleted (a rolled back import): nothing left to poll
            if (!ent.gone) {
                ent.gone = true;
                _clearTimer(ent);
                _closeStream(ent);
                emit('datasetGone', { dataset: ds, error: err });
                settleImports(ent, true);
            }
            return;
        }
        console.error('taskMonitor: fetch failed', err);
    }
}

// ----- polling timer -----

function _scheduleTick(ent) {
    _clearTimer(ent);
    if (!ent._started || ent.gone) return;
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
    openEventStream({
        url: `${registry.url}${ent.dataset.baseApi}/tasks/events`,
        headers: registry.authHeaders ? registry.authHeaders() : {},
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

    /** Whether the server has returned this dataset's task list at least once. */
    isLoaded(dataset) {
        return peekStore(dataset)?.loaded === true;
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

    /**
     * Whether the server answered 404 to this dataset's task list: the dataset was deleted (a rolled
     * back import) and its tasks will not change any more.
     */
    isGone(dataset) {
        return peekStore(dataset)?.gone === true;
    },

    /** Does this dataset have any active tasks? (never a dataset that is gone) */
    hasActiveTasks(dataset) {
        const ent = peekStore(dataset);
        return ent ? hasActive(ent) : false;
    },

    /**
     * Tracks a background import of `dataset` until it ends (FR-UPL-10, FR-XC-16): the dataset's monitor stays acquired
     * while the task runs, whoever closes or leaves, and 'importEnded' tells when it is over. One task is tracked once.
     * @param {any} dataset
     * @param {string} taskId
     */
    trackImport(dataset, taskId) {
        if (!taskId) return;
        const key = datasetKey(dataset);
        let track = importTracks.get(key);
        if (track?.taskIds.has(taskId)) return;
        if (!track) {
            track = { dataset, taskIds: new Set(), last: new Map() };
            importTracks.set(key, track);
            TaskMonitor.acquire(dataset);
        }
        track.taskIds.add(taskId);
    },

    /**
     * Reads the task list of `dataset` once (after a reload) and tracks the imports that run, so the page can say that the
     * dataset is being imported. One list request, no polling unless an import runs. Returns the running imports.
     * @param {any} dataset
     * @returns {Promise<any[]>}
     */
    async findImports(dataset) {
        let tasks;
        try {
            tasks = await dataset.getTasks({ take: TAKE }) || [];
        } catch {
            // Not listed (no access, the dataset is gone): nothing to show
            return [];
        }
        const running = tasks.filter(t => isImport(t) && isActiveState(t.state));
        for (const task of running) TaskMonitor.trackImport(dataset, task.taskId);
        return running;
    },

    /** The imports of this dataset that run, as the store lists them (none for a dataset that is gone). */
    getImports(dataset) {
        const ent = peekStore(dataset);
        if (!ent || ent.gone) return [];
        return Array.from(ent.tasks.values()).filter(t => isImport(t) && isActiveState(t.state));
    },

    /** Subscribe to events (tasksUpdated, datasetGone, importEnded). */
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

};

export default TaskMonitor;