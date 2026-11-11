/**
 * The keyboard model of the file grid and table (FR-EXP-09): one active item, moved by the arrows
 * (by 1, by a row), Home/End, Shift to extend; Enter opens, Space toggles.
 */
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useListNavigation } from './useListNavigation';

const key = (k, mods = {}) => ({ key: k, preventDefault: vi.fn(), ...mods });

function setup({ count = 10, columns = 4, horizontal = true } = {}) {
    const move = vi.fn();
    const open = vi.fn();
    const toggle = vi.fn();
    const nav = useListNavigation({ count: () => count, columns: () => columns, horizontal, move, open, toggle, idPrefix: 'f' });
    return { nav, move, open, toggle };
}

describe('useListNavigation', () => {
    it('starts on the first item with the first arrow, then moves by 1 with Left and Right', () => {
        const { nav, move } = setup();
        expect(nav.activeId.value).toBeUndefined();
        nav.onKeydown(key('ArrowRight'));
        expect(nav.active.value).toBe(0);
        nav.onKeydown(key('ArrowRight'));
        nav.onKeydown(key('ArrowRight'));
        nav.onKeydown(key('ArrowLeft'));
        expect(nav.active.value).toBe(1);
        expect(move).toHaveBeenLastCalledWith(1, { extend: false, keepSelection: false });
        expect(nav.activeId.value).toBe('f-1');
    });

    it('moves by the column count with Up and Down', () => {
        const { nav } = setup({ columns: 4 });
        nav.setActive(1);
        nav.onKeydown(key('ArrowDown'));
        expect(nav.active.value).toBe(5);
        nav.onKeydown(key('ArrowUp'));
        nav.onKeydown(key('ArrowUp'));
        expect(nav.active.value).toBe(0);
    });

    it('stops at the first and the last item', () => {
        const { nav } = setup({ count: 6, columns: 4 });
        nav.setActive(5);
        nav.onKeydown(key('ArrowRight'));
        nav.onKeydown(key('ArrowDown'));
        expect(nav.active.value).toBe(5);
        nav.setActive(0);
        nav.onKeydown(key('ArrowLeft'));
        expect(nav.active.value).toBe(0);
    });

    it('jumps to the first and the last item with Home and End', () => {
        const { nav, move } = setup({ count: 18 });
        nav.setActive(7);
        nav.onKeydown(key('End'));
        expect(move).toHaveBeenLastCalledWith(17, { extend: false, keepSelection: false });
        nav.onKeydown(key('Home'));
        expect(move).toHaveBeenLastCalledWith(0, { extend: false, keepSelection: false });
    });

    it('extends the selection with Shift, from any of the moves', () => {
        const { nav, move } = setup();
        nav.setActive(2);
        nav.onKeydown(key('ArrowRight', { shiftKey: true }));
        expect(move).toHaveBeenLastCalledWith(3, { extend: true, keepSelection: false });
        nav.onKeydown(key('End', { shiftKey: true }));
        expect(move).toHaveBeenLastCalledWith(9, { extend: true, keepSelection: false });
    });

    it('moves the active item only with Ctrl or Cmd, and Space toggles it', () => {
        const { nav, move, toggle } = setup();
        nav.setActive(0);
        nav.onKeydown(key('ArrowRight', { ctrlKey: true }));
        expect(move).toHaveBeenLastCalledWith(1, { extend: false, keepSelection: true });
        const space = key(' ');
        expect(nav.onKeydown(space)).toBe(true);
        expect(toggle).toHaveBeenCalledWith(1);
        expect(space.preventDefault).toHaveBeenCalled();
    });

    it('opens the active item with Enter, and does nothing with Enter when none is active', () => {
        const { nav, open } = setup();
        expect(nav.onKeydown(key('Enter'))).toBe(false);
        nav.setActive(3);
        const enter = key('Enter');
        expect(nav.onKeydown(enter)).toBe(true);
        expect(open).toHaveBeenCalledWith(3);
        expect(enter.preventDefault).toHaveBeenCalled();
    });

    it('is a list of one column in a table: Up and Down by 1, no horizontal arrows', () => {
        const { nav, move } = setup({ columns: 1, horizontal: false });
        nav.setActive(2);
        nav.onKeydown(key('ArrowDown'));
        expect(nav.active.value).toBe(3);
        const right = key('ArrowRight');
        expect(nav.onKeydown(right)).toBe(false);
        expect(right.preventDefault).not.toHaveBeenCalled();
        expect(move).toHaveBeenCalledTimes(1);
    });

    it('leaves the other keys, and Alt combinations, to the page', () => {
        const { nav, move } = setup();
        nav.setActive(2);
        const a = key('a', { ctrlKey: true });
        expect(nav.onKeydown(a)).toBe(false);
        expect(a.preventDefault).not.toHaveBeenCalled();
        expect(nav.onKeydown(key('ArrowRight', { altKey: true }))).toBe(false);
        expect(move).not.toHaveBeenCalled();
    });

    it('does nothing in an empty list, and has no active id past the end of a shorter one', () => {
        const empty = setup({ count: 0 });
        expect(empty.nav.onKeydown(key('ArrowDown'))).toBe(false);
        const count = ref(5);
        const nav = useListNavigation({ count: () => count.value, move: vi.fn() });
        nav.setActive(4);
        expect(nav.activeId.value).toBe('list-item-4');
        count.value = 3;
        expect(nav.activeId.value).toBeUndefined();
    });
});
