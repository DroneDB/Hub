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

describe('useMapPanels openAmong and close', () => {
    it('tells which of some panels is open, or none', () => {
        const a = panel(), b = panel(), c = panel();
        const { open, openAmong } = useMapPanels({ a, b, c });
        expect(openAmong(['a', 'b'])).toBeNull();
        open('c', 'z');
        expect(openAmong(['a', 'b'])).toBeNull();
        open('b', 'y');
        expect(openAmong(['a', 'b'])).toBe('b');
    });

    it('closes a panel only when it is open', () => {
        const a = panel();
        let closed = 0;
        const { open, close } = useMapPanels({ a: { ...a, close: () => { closed++; a.close(); } } });
        close('a');
        expect(closed).toBe(0);
        open('a', 'x');
        close('a');
        expect(closed).toBe(1);
        expect(a.state.entry).toBeNull();
    });
});
