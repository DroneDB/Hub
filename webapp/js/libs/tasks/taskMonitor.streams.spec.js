/**
 * What the task monitor keeps open and applies: a stream only for a dataset that a consumer shows (every stream holds
 * one of the six HTTP/1.1 connections of the page), the background follow of busy datasets that ends with the session,
 * the answers of overlapping list requests, and a store that was released.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const opened = [];
vi.mock('@/libs/sse', () => ({
    openEventStream: vi.fn(opts => { opened.push(opts); })
}));

import taskMonitor from './taskMonitor';

let seq = 0;
const registryListeners = {};

function makeRegistry() {
    return {
        url: 'https://hub.test',
        authHeaders: () => ({}),
        addEventListener: (event, fn) => { (registryListeners[event] ||= []).push(fn); },
        removeEventListener: (event, fn) => { registryListeners[event] = (registryListeners[event] ?? []).filter(f => f !== fn); }
    };
}

function makeDataset(registry, tasks = []) {
    seq += 1;
    return {
        registry,
        baseApi: `/orgs/o/ds/d${seq}`,
        getTasks: vi.fn(async () => tasks),
    };
}

const importTask = { taskId: 'imp', toolId: 'import-dataset', state: 'Processing', progressPercent: 10 };
const liveStreams = () => opened.filter(o => !o.signal.aborted);

beforeEach(() => {
    opened.length = 0;
    for (const key of Object.keys(registryListeners)) delete registryListeners[key];
});

describe('event streams of the task monitor', () => {
    const acquired = [];
    afterEach(() => {
        for (const [dataset, options] of acquired.splice(0)) taskMonitor.release(dataset, options);
    });
    const acquire = (dataset, options) => { taskMonitor.acquire(dataset, options); acquired.push([dataset, options]); };

    it('opens no stream for the busy datasets that are only followed, one for the dataset that is shown', async () => {
        const registry = makeRegistry();
        const busy = Array.from({ length: 8 }, () => makeDataset(registry, [importTask]));
        for (const dataset of busy) taskMonitor.trackBusy(dataset, 'imp', 'importing');
        const page = makeDataset(registry);
        acquire(page);
        await vi.waitFor(() => expect(page.getTasks).toHaveBeenCalled());

        // Eight busy rows and the page would hold nine of the six connections a browser has
        expect(liveStreams()).toHaveLength(1);
        expect(liveStreams()[0].url).toBe(`https://hub.test${page.baseApi}/tasks/events`);
        for (const dataset of busy) taskMonitor.forgetBusy(dataset);
    });

    it('opens again, when the page is shown after it was hidden, only the stream of the dataset that is shown', async () => {
        const registry = makeRegistry();
        const busy = Array.from({ length: 8 }, () => makeDataset(registry, [importTask]));
        for (const dataset of busy) taskMonitor.trackBusy(dataset, 'imp', 'importing');
        const page = makeDataset(registry);
        acquire(page);
        await vi.waitFor(() => expect(liveStreams()).toHaveLength(1));

        const hidden = vi.spyOn(document, 'hidden', 'get');
        try {
            hidden.mockReturnValue(true);
            document.dispatchEvent(new Event('visibilitychange'));
            expect(liveStreams()).toHaveLength(0);

            hidden.mockReturnValue(false);
            const asked = busy.map(dataset => dataset.getTasks.mock.calls.length);
            document.dispatchEvent(new Event('visibilitychange'));
            // Every followed dataset is read again once, and only the shown one streams
            await vi.waitFor(() => busy.forEach((dataset, i) => expect(dataset.getTasks.mock.calls.length).toBeGreaterThan(asked[i])));
            await vi.waitFor(() => expect(liveStreams()).toHaveLength(1));
            expect(liveStreams()[0].url).toBe(`https://hub.test${page.baseApi}/tasks/events`);
        } finally {
            hidden.mockRestore();
            for (const dataset of busy) taskMonitor.forgetBusy(dataset);
        }
    });

    it('opens the stream of a followed dataset when a consumer starts showing it, and closes it when that one leaves', async () => {
        const registry = makeRegistry();
        const dataset = makeDataset(registry, [importTask]);
        taskMonitor.trackBusy(dataset, 'imp', 'importing');
        await vi.waitFor(() => expect(taskMonitor.getBusy(dataset)).not.toBeNull());
        expect(opened).toHaveLength(0);

        taskMonitor.acquire(dataset);
        expect(liveStreams()).toHaveLength(1);

        taskMonitor.release(dataset);
        expect(liveStreams()).toHaveLength(0);
        // Still followed in the background: polled, not streamed
        expect(taskMonitor.getBusy(dataset)).not.toBeNull();
        taskMonitor.forgetBusy(dataset);
    });
});

describe('the busy datasets that are followed in the background', () => {
    it('are let go when the session ends: nothing polls them anonymously', async () => {
        const registry = makeRegistry();
        const dataset = makeDataset(registry, [importTask]);
        taskMonitor.trackBusy(dataset, 'imp', 'importing');
        await vi.waitFor(() => expect(taskMonitor.getBusy(dataset)).not.toBeNull());
        const ended = vi.fn();
        taskMonitor.on('busyEnded', ended);

        for (const fn of registryListeners.logout ?? []) fn();

        expect(taskMonitor.getBusy(dataset)).toBeNull();
        expect(taskMonitor.isLoaded(dataset)).toBe(false);
        // Nothing ended: the user left
        expect(ended).not.toHaveBeenCalled();
        taskMonitor.off('busyEnded', ended);
    });

    it('of another Registry stay followed', async () => {
        const other = makeDataset(makeRegistry(), [importTask]);
        taskMonitor.trackBusy(other, 'imp', 'importing');
        await vi.waitFor(() => expect(taskMonitor.getBusy(other)).not.toBeNull());
        const signedOut = makeRegistry();
        taskMonitor.trackBusy(makeDataset(signedOut, [importTask]), 'imp', 'importing');

        // The listeners are those of the registry that registered them
        const [, fromSignedOut] = registryListeners.logout;
        fromSignedOut();

        expect(taskMonitor.getBusy(other)).not.toBeNull();
        taskMonitor.forgetBusy(other);
    });
});

describe('the answers of the task list', () => {
    const acquired = [];
    afterEach(() => {
        for (const dataset of acquired.splice(0)) taskMonitor.release(dataset);
        taskMonitor.off('tasksUpdated', onUpdated);
    });
    const onUpdated = vi.fn();
    beforeEach(() => { onUpdated.mockClear(); taskMonitor.on('tasksUpdated', onUpdated); });

    // The first request of the dataset is asked while it is acquired, and answered by `deferred`
    function followedWithDeferred() {
        const resolvers = [];
        const dataset = makeDataset(undefined);
        dataset.getTasks = vi.fn(() => new Promise(resolve => resolvers.push(resolve)));
        taskMonitor.acquire(dataset);
        acquired.push(dataset);
        return { dataset, resolvers };
    }

    it('are applied in the order the requests were asked, an older one that arrives late is dropped', async () => {
        const { dataset, resolvers } = followedWithDeferred();
        const second = taskMonitor.forceRefresh(dataset);
        expect(resolvers).toHaveLength(2);

        // The newer request is answered first (a build ended), then the older one arrives with the state before it
        resolvers[1]([{ taskId: 'b', toolId: 'build', state: 'Succeeded' }]);
        await second;
        resolvers[0]([{ taskId: 'b', toolId: 'build', state: 'Processing' }]);
        await Promise.resolve();
        await Promise.resolve();

        expect(taskMonitor.getTask(dataset, 'b').state).toBe('Succeeded');
        // One change was told: the end of the build, not the end and then a build that runs again
        expect(onUpdated).toHaveBeenCalledTimes(1);
    });

    it('of a store that was released while the request was on its way are not applied', async () => {
        const { dataset, resolvers } = followedWithDeferred();
        taskMonitor.release(dataset);
        acquired.length = 0;

        resolvers[0]([{ taskId: 'b', toolId: 'build', state: 'Succeeded' }]);
        await Promise.resolve();
        await Promise.resolve();

        expect(onUpdated).not.toHaveBeenCalled();
        expect(taskMonitor.getTasks(dataset)).toEqual([]);
    });
});

describe('forceRefresh', () => {
    it('does not bring back a store that was released: nothing is asked and nothing is kept', async () => {
        const dataset = makeDataset(undefined);
        taskMonitor.acquire(dataset);
        taskMonitor.release(dataset);
        dataset.getTasks.mockClear();

        await taskMonitor.forceRefresh(dataset);

        expect(dataset.getTasks).not.toHaveBeenCalled();
        expect(taskMonitor.isLoaded(dataset)).toBe(false);
    });
});
