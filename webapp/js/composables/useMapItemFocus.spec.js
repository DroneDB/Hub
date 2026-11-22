/**
 * The `?item=` of the map: asked at most once, when the measurements are read and the first position is settled; an
 * item the map does not have says so and the map opens as usual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/libs/notify', () => ({ notify: { warn: m.warn } }));

const { useMapItemFocus } = await import('./useMapItemFocus');

let controls;
let focus;
beforeEach(() => {
    m.warn.mockClear();
    controls = { value: { focusItem: vi.fn(() => true) } };
});
const make = item => useMapItemFocus({ item: () => item, measureControls: controls });

describe('useMapItemFocus', () => {
    it('frames the item once the measurements are read and the first position is settled, in either order', () => {
        focus = make('a1');
        focus.onMeasurementsLoaded();
        expect(controls.value.focusItem).not.toHaveBeenCalled();
        focus.onFilesFitted();
        expect(controls.value.focusItem).toHaveBeenCalledWith('a1');

        controls.value.focusItem.mockClear();
        focus = make('a1');
        focus.onFilesFitted();
        expect(controls.value.focusItem).not.toHaveBeenCalled();
        focus.onMeasurementsLoaded();
        expect(controls.value.focusItem).toHaveBeenCalledWith('a1');
        expect(m.warn).not.toHaveBeenCalled();
    });

    it('asks once: a later read of the measurements (another file) does not move the map again', () => {
        focus = make('a1');
        focus.onFilesFitted();
        focus.onMeasurementsLoaded();
        focus.onMeasurementsLoaded();
        focus.onFilesFitted();
        expect(controls.value.focusItem).toHaveBeenCalledOnce();
    });

    it('says "This item no longer exists" when the map has no annotation with the id, once', () => {
        controls.value.focusItem.mockReturnValue(false);
        focus = make('gone');
        focus.onFilesFitted();
        focus.onMeasurementsLoaded();
        focus.onMeasurementsLoaded();
        expect(m.warn).toHaveBeenCalledOnce();
        expect(m.warn).toHaveBeenCalledWith('This item no longer exists', { summary: 'Item not found' });
    });

    it('does nothing when the address asked for no item', () => {
        focus = make('');
        focus.onFilesFitted();
        focus.onMeasurementsLoaded();
        expect(controls.value.focusItem).not.toHaveBeenCalled();
        expect(m.warn).not.toHaveBeenCalled();
    });

    it('says the item does not exist when the map has no measure control', () => {
        controls.value = null;
        focus = make('a1');
        focus.onFilesFitted();
        focus.onMeasurementsLoaded();
        expect(m.warn).toHaveBeenCalledOnce();
    });
});
