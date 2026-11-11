/**
 * Unit tests for libs/potree/potreeControls.js
 * Run with: npx vitest run webapp/js/libs/potree/potreeControls.spec.js
 */
import { describe, it, expect, vi } from 'vitest';
import { labelPotreeControls } from './potreeControls';
import { PotreeSession } from './potreeSession';

// The quick buttons as Potree 1.8 builds them (loadGUI)
function potreeUi() {
    const root = document.createElement('div');
    root.innerHTML = '<div id="potree_quick_buttons"><img class="potree_menu_toggle" src="menu_button.svg"></div>';
    const toggle = root.querySelector('.potree_menu_toggle');
    toggle.onclick = vi.fn();
    return { root, toggle };
}

const key = k => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });

describe('labelPotreeControls', () => {
    it('makes the menu toggle a named button', () => {
        const { root, toggle } = potreeUi();
        labelPotreeControls(root, new PotreeSession({ window: {} }));
        expect(toggle.getAttribute('role')).toBe('button');
        expect(toggle.getAttribute('aria-label')).toBe('Menu');
        expect(toggle.getAttribute('tabindex')).toBe('0');
        expect(toggle.getAttribute('alt')).toBe('');
    });

    it('opens the menu with Enter and Space, not with other keys', () => {
        const { root, toggle } = potreeUi();
        labelPotreeControls(root, new PotreeSession({ window: {} }));
        toggle.dispatchEvent(key('Enter'));
        toggle.dispatchEvent(key(' '));
        toggle.dispatchEvent(key('a'));
        expect(toggle.onclick).toHaveBeenCalledTimes(2);
    });

    it('drops the key listener with the session', () => {
        const { root, toggle } = potreeUi();
        const session = new PotreeSession({ window: {} });
        labelPotreeControls(root, session);
        session.dispose();
        toggle.dispatchEvent(key('Enter'));
        expect(toggle.onclick).not.toHaveBeenCalled();
    });

    it('does nothing when Potree has not built the control', () => {
        const root = document.createElement('div');
        expect(() => labelPotreeControls(root, new PotreeSession({ window: {} }))).not.toThrow();
        expect(() => labelPotreeControls(null, new PotreeSession({ window: {} }))).not.toThrow();
    });
});
