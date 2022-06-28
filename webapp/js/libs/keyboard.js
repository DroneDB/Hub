let shiftPressed = false;
let ctrlPressed = false;
let metaPressed = false;

let keyDownListeners = [];
let keyUpListeners = [];
let shortcutListeners = [];

const api = {
    onKeyDown: function(listener){
        keyDownListeners.push(listener);
    },

    onKeyUp: function(listener){
        keyUpListeners.push(listener);
    },

    onShortcut: function(listener){
        shortcutListeners.push(listener);
    },

    offShortcut: function(listener){
        shortcutListeners = shortcutListeners.filter(l => l !== listener);
    },

    offKeyDown: function(listener){
        keyDownListeners = keyDownListeners.filter(l => l !== listener);
    },

    offKeyUp: function(listener){
        keyUpListeners = keyUpListeners.filter(l => l !== listener);
    },

    isShiftPressed: function(){
        return shiftPressed;
    },

    isCtrlPressed: function(){
        return ctrlPressed;
    },

    isMetaPressed: function(){
        return metaPressed;
    },

    isModifierPressed: function(){
        return shiftPressed || ctrlPressed || metaPressed;
    },

    resetModifiers: function(){
        shiftPressed = ctrlPressed = metaPressed = false;
    },

    updateState: function(e){
        shiftPressed = e.shiftKey;
        ctrlPressed = e.ctrlKey;
        metaPressed = e.metaKey;
    }
};

const fireShortcutEvent = (accelerator) => {
    for (let i = 0; i < shortcutListeners.length; i++){
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
    if (e.key.length === 1 && (state.ctrlKey || state.metaKey)){
        fireShortcutEvent("CmdOrCtrl+" + e.key.toUpperCase());
    }else if (e.key.length === 2 && e.key[0] === 'F'){
        fireShortcutEvent(e.key);
    }else if (e.key.length === 6){
        // Delete
        fireShortcutEvent(e.key);
    }

    keyDownListeners.forEach(l => l(e));
});

window.addEventListener("keyup",  e => {
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
document.addEventListener('focusout', function(e) {
    if (window.scrollY > 0) window.scrollTo(0, 0);
});

export default api;
