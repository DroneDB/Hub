import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useTimeout } from './useTimers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('component-owned timers', () => {
    it('clear themselves when the owner goes away', () => {
        const once = vi.fn();
        const scope = effectScope();
        scope.run(() => useTimeout(once, 100));
        scope.stop();
        vi.advanceTimersByTime(1000);
        expect(once).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('useTimerGroup', () => {
    it('clears every pending call with the owner', async () => {
        const { useTimerGroup } = await import('./useTimers');
        const fn = vi.fn();
        const scope = effectScope();
        const later = scope.run(() => useTimerGroup());
        later(fn, 100);
        later(fn, 200);
        vi.advanceTimersByTime(150);
        expect(fn).toHaveBeenCalledTimes(1);
        scope.stop();
        vi.advanceTimersByTime(500);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});
