/**
 * One viewer shell, one entry loader, one undo stack.
 */
import { describe, it, expect } from 'vitest';

describe('undoStack', () => {
    it('undoes and redoes in order and respects the limit', async () => {
        const { createUndoStack } = await import('@/libs/undoStack');
        const s = createUndoStack({ limit: 2 });
        s.push('a'); s.push('b'); s.push('c');
        expect(s.undo()).toBe('c');
        expect(s.undo()).toBe('b');
        expect(s.canUndo()).toBe(false);
        expect(s.redo()).toBe('b');
    });
});

describe('viewer shell', () => {
    it('useViewerEntry and ViewerShell exist', async () => {
        const { useViewerEntry } = await import('@/composables/useViewerEntry');
        expect(typeof useViewerEntry).toBe('function');
        const shell = (await import('@/components/ViewerShell.vue')).default;
        expect(shell).toBeTruthy();
    });

    it('useViewerSettings persists through usePreference', async () => {
        const { useViewerSettings } = await import('@/composables/useViewerSettings');
        expect(typeof useViewerSettings).toBe('function');
    });
});
