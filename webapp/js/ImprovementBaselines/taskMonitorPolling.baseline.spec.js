/**
 * HUB-05 baseline: taskMonitor keeps polling /tasks while the tab is hidden and
 * every open dataset screen polls independently.
 *
 * Run with: npx vitest run webapp/js/ImprovementBaselines/taskMonitorPolling.baseline.spec.js
 *
 * HUB-05 landed: the former baselines (15 s forever, polling while hidden) are inverted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let taskMonitor;

function makeDataset(slug, calls) {
    return {
        org: 'org', ds: slug, slug,
        getTasks: vi.fn(async () => { calls.push(Date.now()); return []; }),
    };
}

describe('HUB-05 taskMonitor polling', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
        vi.resetModules();
        taskMonitor = (await import('@/libs/tasks/taskMonitor')).default;
    });
    afterEach(() => { vi.useRealTimers(); });

    it('idle polling slows down to one fetch per 2 minutes', async () => {
        const calls = [];
        const ds = makeDataset('a', calls);
        taskMonitor.acquire(ds);
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        const after5min = ds.getTasks.mock.calls.length;
        await vi.advanceTimersByTimeAsync(4 * 60_000);
        expect(ds.getTasks.mock.calls.length - after5min).toBeLessThanOrEqual(2);
        taskMonitor.release(ds);
    });

    it('a hidden page is refreshed once when it shows again, then polled normally', async () => {
        const calls = [];
        const ds = makeDataset('b', calls);
        taskMonitor.acquire(ds);
        await vi.advanceTimersByTimeAsync(1);
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(60_000);
        const hidden = ds.getTasks.mock.calls.length;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(1);
        expect(ds.getTasks.mock.calls.length).toBe(hidden + 1);
        await vi.advanceTimersByTimeAsync(15_000);
        expect(ds.getTasks.mock.calls.length).toBe(hidden + 2);
        taskMonitor.release(ds);
    });

    it('activity brings the fast cadence back', async () => {
        const calls = [];
        const ds = makeDataset('f', calls);
        taskMonitor.acquire(ds);
        await vi.advanceTimersByTimeAsync(5 * 60_000); // backed off to 2 minutes
        const before = ds.getTasks.mock.calls.length;
        taskMonitor.onFilesAdded(ds);
        await vi.advanceTimersByTimeAsync(16_000);
        expect(ds.getTasks.mock.calls.length - before).toBe(2); // the refresh + the 15 s poll
        taskMonitor.release(ds);
    });

    it('baseline: every poll asks for up to 200 tasks', async () => {
        const calls = [];
        const ds = makeDataset('c', calls);
        taskMonitor.acquire(ds);
        await vi.advanceTimersByTimeAsync(1);
        expect(ds.getTasks).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
        taskMonitor.release(ds);
    });

    it('target: no polling while the document is hidden', async () => {
        const calls = [];
        const ds = makeDataset('d', calls);
        taskMonitor.acquire(ds);
        await vi.advanceTimersByTimeAsync(1);
        const before = ds.getTasks.mock.calls.length;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(120_000);
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        expect(ds.getTasks.mock.calls.length - before).toBe(0);
        taskMonitor.release(ds);
    });

    it('target: idle polling backs off (≤ 2 fetches in the first idle minute after the initial one)', async () => {
        const calls = [];
        const ds = makeDataset('e', calls);
        taskMonitor.acquire(ds);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(ds.getTasks.mock.calls.length).toBeLessThanOrEqual(3);
        taskMonitor.release(ds);
    });
});
