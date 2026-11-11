import { describe, it, expect, vi } from 'vitest';
import { createUndoStack } from './undoStack';

describe('createUndoStack', () => {
    it('drops the undone actions when a new one is pushed', () => {
        const s = createUndoStack();
        s.push(1); s.push(2);
        expect(s.undo()).toBe(2);
        s.push(3);
        expect(s.canRedo()).toBe(false);
        expect(s.undo()).toBe(3);
        expect(s.undo()).toBe(1);
        expect(s.undo()).toBeUndefined();
    });

    it('reports every change', () => {
        const onChange = vi.fn();
        const s = createUndoStack({ onChange });
        s.push('a'); s.undo(); s.redo(); s.clear();
        expect(onChange).toHaveBeenCalledTimes(4);
        expect(s.canUndo()).toBe(false);
    });
});
