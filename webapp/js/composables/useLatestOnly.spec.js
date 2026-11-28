import { describe, it, expect } from 'vitest';
import { useLatestOnly } from './useLatestOnly';

describe('useLatestOnly', () => {
    it('keeps the newest start current and every earlier one stale', () => {
        const latest = useLatestOnly();
        const first = latest();
        expect(first()).toBe(true);
        const second = latest();
        expect(first()).toBe(false);
        expect(second()).toBe(true);
    });

    it('is independent for each action', () => {
        const a = useLatestOnly();
        const b = useLatestOnly();
        const startA = a();
        b();
        expect(startA()).toBe(true);
    });
});
