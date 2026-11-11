import { describe, it, expect } from 'vitest';
import { useFileSelection } from './useFileSelection';

const files = ['a', 'b', 'c', 'd', 'e'].map(path => ({ path }));
const make = () => useFileSelection(() => files, f => f.path);
const keys = sel => [...sel.selected.value].sort();

describe('useFileSelection', () => {
    it('selects one item per click and ranges with Shift, both directions', () => {
        const sel = make();
        sel.toggle(3);
        expect(keys(sel)).toEqual(['d']);
        sel.toggle(1, { shift: true });
        expect(keys(sel)).toEqual(['b', 'c', 'd']);
        sel.toggle(4, { shift: true });
        expect(keys(sel)).toEqual(['d', 'e']);
    });

    it('toggles with Ctrl and starts ranges from the last Ctrl click', () => {
        const sel = make();
        sel.toggle(0);
        sel.toggle(2, { ctrl: true });
        expect(keys(sel)).toEqual(['a', 'c']);
        sel.toggle(0, { ctrl: true });
        expect(keys(sel)).toEqual(['c']);
        sel.toggle(4, { shift: true });
        expect(keys(sel)).toEqual(['c', 'd', 'e']);
    });

    it('keeps a selection on a right click inside it', () => {
        const sel = make();
        sel.load([files[1], files[2]]);
        sel.toggle(2, { right: true });
        expect(keys(sel)).toEqual(['b', 'c']);
        sel.toggle(4, { right: true });
        expect(keys(sel)).toEqual(['e']);
    });

    it('selects all and clears', () => {
        const sel = make();
        sel.selectAll();
        expect(sel.selected.value.size).toBe(5);
        expect(sel.has(files[0])).toBe(true);
        sel.clear();
        expect(sel.selected.value.size).toBe(0);
        expect(files.some(f => 'selected' in f)).toBe(false);
    });
});
