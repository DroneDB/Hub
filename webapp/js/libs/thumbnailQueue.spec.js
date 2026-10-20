/**
 * Unit tests for libs/thumbnailQueue.js (HUB-03)
 * Run with: npx vitest run webapp/js/libs/thumbnailQueue.spec.js
 */
import { describe, it, expect, vi } from 'vitest';
import { createThumbnailQueue, createVisibilityTracker, thumbnailRequestSize, PRIORITY } from '@/libs/thumbnailQueue';

describe('createThumbnailQueue', () => {
    it('never runs more loads than its concurrency', () => {
        const queue = createThumbnailQueue({ concurrency: 6 });
        const started = [];
        const tickets = Array.from({ length: 98 }, (_, i) => queue.enqueue(() => started.push(i)));
        expect(started).toHaveLength(6);
        expect(queue.running).toBe(6);

        tickets[0].release();
        expect(started).toHaveLength(7);
        for (let i = 0; i < 98; i++) tickets[i].release();
        expect(started).toHaveLength(98);
        expect(queue.running).toBe(0);
    });

    it('serves visible tiles before prefetched ones', () => {
        const queue = createThumbnailQueue({ concurrency: 1 });
        const order = [];
        const first = queue.enqueue(() => order.push('first'));
        queue.enqueue(() => order.push('near'), PRIORITY.NEAR);
        queue.enqueue(() => order.push('visible'), PRIORITY.VISIBLE);
        first.release();
        expect(order).toEqual(['first', 'visible']);
    });

    it('does not load a tile cancelled before its turn', () => {
        const queue = createThumbnailQueue({ concurrency: 1 });
        const start = vi.fn();
        const busy = queue.enqueue(() => {});
        const scrolledAway = queue.enqueue(start);
        scrolledAway.cancel();
        busy.release();
        expect(start).not.toHaveBeenCalled();
        expect(queue.waiting).toBe(0);
    });

    it('a cancelled running load frees its slot, a second release is ignored', () => {
        const queue = createThumbnailQueue({ concurrency: 1 });
        const t = queue.enqueue(() => {});
        t.cancel();
        t.release();
        expect(queue.running).toBe(0);
    });
});

describe('createVisibilityTracker', () => {
    class FakeObserver {
        static last;
        constructor(cb, options) { this.cb = cb; this.options = options; this.els = new Set(); FakeObserver.last = this; }
        observe(el) { this.els.add(el); }
        unobserve(el) { this.els.delete(el); }
        disconnect() { this.els.clear(); }
        fire(el, visible) { this.cb([{ target: el, isIntersecting: visible }]); }
    }

    it('reports a tile only when the observer says it intersects the scroll container', () => {
        const root = {};
        const tracker = createVisibilityTracker({ root: () => root, Observer: FakeObserver });
        const el = {};
        const onChange = vi.fn();
        tracker.observe(el, onChange);

        expect(onChange).not.toHaveBeenCalled();
        expect(FakeObserver.last.options.root).toBe(root);
        FakeObserver.last.fire(el, true);
        expect(onChange).toHaveBeenCalledWith(true);

        tracker.unobserve(el);
        FakeObserver.last.fire(el, false);
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});

describe('thumbnailRequestSize', () => {
    it('asks for the tile size times the pixel ratio, in steps', () => {
        expect(thumbnailRequestSize(128, 1)).toBe(128);
        expect(thumbnailRequestSize(128, 1.5)).toBe(256);
        expect(thumbnailRequestSize(128, 2)).toBe(256);
        expect(thumbnailRequestSize(128, 3)).toBe(512);
        expect(thumbnailRequestSize(48, 1)).toBe(128);
    });
});
