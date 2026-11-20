import { describe, it, expect } from 'vitest';
import { isRightClick, RIGHT_CLICK_MAX_MOVE_PX } from './mouse';

const press = (x, y, button = 2) => ({ button, clientX: x, clientY: y });

describe('isRightClick (D-027)', () => {
    it('is a right-button release where the right button went down', () => {
        expect(isRightClick(press(100, 100), press(100, 100))).toBe(true);
    });

    it('allows a move of 4 CSS px or less: 3 + 4 is 5 px away, 3 + 2 is not', () => {
        expect(RIGHT_CLICK_MAX_MOVE_PX).toBe(4);
        expect(isRightClick(press(100, 100), press(104, 100))).toBe(true);
        expect(isRightClick(press(100, 100), press(102, 103))).toBe(true);
        expect(isRightClick(press(100, 100), press(103, 104))).toBe(false);
        expect(isRightClick(press(100, 100), press(105, 100))).toBe(false);
    });

    it('is not a click after a right-drag of 20 px, in any direction', () => {
        expect(isRightClick(press(100, 100), press(120, 100))).toBe(false);
        expect(isRightClick(press(100, 100), press(100, 80))).toBe(false);
    });

    it('is not a click for the other buttons, or with no press seen', () => {
        expect(isRightClick(press(100, 100, 0), press(100, 100, 0))).toBe(false);
        expect(isRightClick(press(100, 100, 0), press(100, 100, 2))).toBe(false);
        expect(isRightClick(press(100, 100, 2), press(100, 100, 0))).toBe(false);
        expect(isRightClick(null, press(100, 100))).toBe(false);
        expect(isRightClick(press(100, 100), undefined)).toBe(false);
    });
});
