import { describe, it, expect, afterEach } from 'vitest';
import Keyboard from './keyboard';

const press = (type, init) => window.dispatchEvent(new KeyboardEvent(type, init));

afterEach(() => {
    // Release everything so the module state does not leak between tests
    press('keyup', { key: 'Control' });
    press('keyup', { key: 'Meta' });
});

describe('Keyboard toggle-select modifier', () => {
    it('is off when nothing is held', () => {
        expect(Keyboard.isToggleSelectPressed()).toBe(false);
    });

    it('is on while Ctrl is held and off after release', () => {
        press('keydown', { key: 'Control', ctrlKey: true });
        expect(Keyboard.isToggleSelectPressed()).toBe(true);
        expect(Keyboard.isCtrlPressed()).toBe(true);
        press('keyup', { key: 'Control' });
        expect(Keyboard.isToggleSelectPressed()).toBe(false);
    });

    it('is on while Cmd (Meta) is held, though Ctrl is not', () => {
        press('keydown', { key: 'Meta', metaKey: true });
        expect(Keyboard.isToggleSelectPressed()).toBe(true);
        expect(Keyboard.isCtrlPressed()).toBe(false);
        press('keyup', { key: 'Meta' });
        expect(Keyboard.isToggleSelectPressed()).toBe(false);
    });

    it('ignores Shift alone', () => {
        press('keydown', { key: 'Shift', shiftKey: true });
        expect(Keyboard.isToggleSelectPressed()).toBe(false);
        press('keyup', { key: 'Shift' });
    });
});
