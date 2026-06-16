/**
 * Keyboard state module.
 *
 * Exports:
 *   - `keyboardState`  (reactive): { shiftPressed, ctrlPressed, metaPressed }
 *   - Default export   (legacy API): onKeyDown, onKeyUp, onShortcut, off*, isShiftPressed(), etc.
 *
 * The reactive state can be imported in composition-API components:
 *   import { keyboardState } from '@/libs/keyboard';
 *   // keyboardState.shiftPressed is reactive
 *
 * The legacy API is kept for backward compatibility with Options API components.
 */
import { reactive } from 'vue';

// Reactive state — usable in Vue templates and composables
const keyboardState = reactive({
    shiftPressed: false,
    ctrlPressed: false,
    metaPressed: false
});

let keyDownListeners = [];
let keyUpListeners = [];
let shortcutListeners = [];

const api = {
    onKeyDown: function (listener) {
        keyDownListeners.push(listener);
    },

    onKeyUp: function (listener) {
        keyUpListeners.push(listener);
    },

    onShortcut: function (listener) {
        shortcutListeners.push(listener);
    },

    offShortcut: function (listener) {
        shortcutListeners = shortcutListeners.filter(l => l !== listener);
    },

    offKeyDown: function (listener) {
        keyDownListeners = keyDownListeners.filter(l => l !== listener);
    },

    offKeyUp: function (listener) {
        keyUpListeners = keyUpListeners.filter(l => l !== listener);
    },

    isShiftPressed: function () {
        return keyboardState.shiftPressed;
    },

    isCtrlPressed: function () {
        return keyboardState.ctrlPressed;
    },

    isMetaPressed: function () {
        return keyboardState.metaPressed;
    },

    isModifierPressed: function () {
        return keyboardState.shiftPressed || keyboardState.ctrlPressed || keyboardState.metaPressed;
    },

    resetModifiers: function () {
        keyboardState.shiftPressed = false;
        keyboardState.ctrlPressed = false;
        keyboardState.metaPressed = false;
    },

    updateState: function (e) {
        keyboardState.shiftPressed = e.shiftKey;
        keyboardState.ctrlPressed = e.ctrlKey;
        keyboardState.metaPressed = e.metaKey;
    }
};

const fireShortcutEvent = (accelerator) => {
    for (let i = 0; i < shortcutListeners.length; i++) {
        if (shortcutListeners[i](accelerator)) break;
    }
};

window.addEventListener("keydown", e => {
    const state = {
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey
    };

    if (e.key === "Control") state.ctrlKey = true;
    if (e.key === "Meta") state.metaKey = true;
    if (e.key === "Shift") state.shiftKey = true;

    api.updateState(state);

    // Shortcuts
    if (e.key.length === 1 && (state.ctrlKey || state.metaKey)) {
        fireShortcutEvent("CmdOrCtrl+" + e.key.toUpperCase());
    } else if (e.key.length === 2 && e.key[0] === 'F') {
        fireShortcutEvent(e.key);
    } else if (e.key.length === 6) {
        // Delete
        fireShortcutEvent(e.key);
    }

    keyDownListeners.forEach(l => l(e));
});

window.addEventListener("keyup", e => {
    const state = {
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey
    };

    if (e.key === "Control") state.ctrlKey = false;
    if (e.key === "Meta") state.metaKey = false;
    if (e.key === "Shift") state.shiftKey = false;

    api.updateState(state);

    keyUpListeners.forEach(l => l(e));
});

window.addEventListener("contextmenuopened", api.resetModifiers, false);

// iOS fix, when keyboard is open it pushes the viewport out
document.addEventListener('focusout', function (e) {
    if (window.scrollY > 0) window.scrollTo(0, 0);
});

export default api;
