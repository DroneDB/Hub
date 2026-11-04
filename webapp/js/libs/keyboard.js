/**
 * Keyboard state module.
 *
 * The default export tracks which modifier keys are held (shift, ctrl, meta) and lets
 * components subscribe to key down / key up: onKeyDown, onKeyUp, off*, isShiftPressed(), etc.
 */
import { reactive } from 'vue';

// Which modifier keys are held
const keyboardState = reactive({
    shiftPressed: false,
    ctrlPressed: false,
    metaPressed: false
});

let keyDownListeners = [];
let keyUpListeners = [];

const api = {
    onKeyDown: function (listener) {
        keyDownListeners.push(listener);
    },

    onKeyUp: function (listener) {
        keyUpListeners.push(listener);
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

    // Toggle-select modifier: Ctrl, or Cmd on macOS where Ctrl-click is a right click
    isToggleSelectPressed: function () {
        return keyboardState.ctrlPressed || keyboardState.metaPressed;
    },

    isModifierPressed: function () {
        return keyboardState.shiftPressed || keyboardState.ctrlPressed || keyboardState.metaPressed;
    },

    updateState: function (e) {
        keyboardState.shiftPressed = e.shiftKey;
        keyboardState.ctrlPressed = e.ctrlKey;
        keyboardState.metaPressed = e.metaKey;
    }
};

// lifetime: app (module-level keyboard state for the whole page)
window.addEventListener("keydown", e => {
    // e.key can be undefined on some browsers/devices (e.g. iOS virtual keyboards, synthetic events)
    const key = e.key || "";
    const state = {
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey
    };

    if (key === "Control") state.ctrlKey = true;
    if (key === "Meta") state.metaKey = true;
    if (key === "Shift") state.shiftKey = true;

    api.updateState(state);

    keyDownListeners.forEach(l => l(e));
});

// lifetime: app (module-level keyboard state for the whole page)
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

// iOS fix, when keyboard is open it pushes the viewport out
// lifetime: app (module-level keyboard state for the whole page)
document.addEventListener('focusout', function () {
    if (window.scrollY > 0) window.scrollTo(0, 0);
});

export default api;
