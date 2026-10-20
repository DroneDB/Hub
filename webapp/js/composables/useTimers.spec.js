import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useTimeout, useInterval, useDebounceFn } from './useTimers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('component-owned timers', () => {
    it('clear themselves when the owner goes away', () => {
        const once = vi.fn(), every = vi.fn(), debounced = vi.fn();
        const scope = effectScope();
        scope.run(() => {
            useTimeout(once, 100);
            useInterval(every, 50);
            useDebounceFn(debounced, 100)('x');
        });
        vi.advanceTimersByTime(60);
        expect(every).toHaveBeenCalledTimes(1);
        scope.stop();
        vi.advanceTimersByTime(1000);
        expect(once).not.toHaveBeenCalled();
        expect(debounced).not.toHaveBeenCalled();
        expect(every).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('debounce runs once with the last arguments', () => {
        const fn = vi.fn();
        const d = useDebounceFn(fn, 100);
        d(1); d(2); d(3);
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith(3);
    });
});
