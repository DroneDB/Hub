/**
 * useStackedLayout (D-026, FR-XC-20): whether the stacked tables are cards, from the media query of the
 * card renderer (below sm, 575.98 px), following the window and letting go of it with its scope.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useStackedLayout } from './useStackedLayout';

afterEach(() => vi.restoreAllMocks());

function fakeMedia(matches) {
    const listeners = new Set();
    const media = {
        matches,
        addEventListener: vi.fn((type, fn) => listeners.add(fn)),
        removeEventListener: vi.fn((type, fn) => listeners.delete(fn)),
        change: next => listeners.forEach(fn => fn({ matches: next })),
        listeners
    };
    vi.spyOn(window, 'matchMedia').mockImplementation(() => media);
    return media;
}

describe('useStackedLayout', () => {
    it('asks the media query of the cards, below 576 px', () => {
        fakeMedia(false);
        const scope = effectScope();
        scope.run(() => useStackedLayout());
        expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 575.98px)');
        scope.stop();
    });

    it('follows the window across sm, and stops with its scope', () => {
        const media = fakeMedia(true);
        const scope = effectScope();
        const stacked = scope.run(() => useStackedLayout());
        expect(stacked.value).toBe(true);
        media.change(false);
        expect(stacked.value).toBe(false);
        media.change(true);
        expect(stacked.value).toBe(true);
        scope.stop();
        expect(media.listeners.size).toBe(0);
    });

    it('is a table where the window has no matchMedia', () => {
        const original = window.matchMedia;
        // @ts-ignore a window without the API
        window.matchMedia = undefined;
        try {
            expect(useStackedLayout().value).toBe(false);
        } finally {
            window.matchMedia = original;
        }
    });
});
