import { describe, it, expect } from 'vitest';
import { useMapPanels } from './useMapPanels';

// A panel whose state is the entry it shows (null: closed)
function panel() {
    const state = { entry: null };
    return { state, visible: () => state.entry !== null, open: e => { state.entry = e; }, close: () => { state.entry = null; } };
}

describe('useMapPanels', () => {
    it('keeps one panel open at a time', () => {
        const a = panel(), b = panel();
        const { toggle } = useMapPanels({ a, b });
        toggle('a', 'x');
        expect(a.state.entry).toBe('x');
        toggle('b', 'y');
        expect(a.state.entry).toBeNull();
        expect(b.state.entry).toBe('y');
        toggle('b');
        expect(b.state.entry).toBeNull();
    });

    it('opens with every argument and closes the others', () => {
        const a = panel(), b = panel();
        const seen = [];
        const { open } = useMapPanels({ a, b: { ...b, open: (...args) => { seen.push(args); b.open(args[0]); } } });
        open('a', 'x');
        open('b', 'y', { opt: 1 });
        expect(a.state.entry).toBeNull();
        expect(seen).toEqual([['y', { opt: 1 }]]);
    });
});
