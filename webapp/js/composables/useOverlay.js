// @ts-check
/**
 * The overlay stack (FR-XC-19): every overlay that takes the keyboard (HubWindow, the video
 * lightbox, the photo popup of the dataset map) is pushed here while it is shown, in opening
 * order, and this module does for all of them what an overlay needs:
 *
 * - Escape closes the topmost overlay only. An open Select or menu inside it keeps the key:
 *   its open state is read from ARIA (aria-expanded="true" on a combobox or a popup button),
 *   before the control sees the key, as PrimeVue's Select stops every Escape, closed or not.
 * - `data-owns-escape` is the one way a control keeps Escape for itself (FR-XC-19, FR-XC-20):
 *   inside the topmost overlay, Escape from within a [data-owns-escape] element is left to it
 *   (no preventDefault, no close), e.g. the SearchField, which clears its query on Escape
 *   while the dialog stays open. Not marked yet: the CodeMirror editor of TextEditorDialog
 *   (a later unit).
 * - The focus target on open (FR-XC-02, `focusTargetIn`): the first focusable element of a
 *   [data-autofocus] element (a typed confirmation's input is one); for a destructive
 *   confirmation the [data-cancel] button; the first visible, enabled field; for any other
 *   dialog the [data-confirm] button; the first visible, enabled control; else the overlay
 *   itself. A control that is not rendered (a hidden tab panel) is never the target.
 * - The focus stays inside on open: a menu that opened the overlay can take the focus back
 *   after its command (PrimeVue's Menu focuses its trigger on Enter, a context menu its list),
 *   so the target is focused again on the next frames while the focus is outside.
 * - The return on close (FR-XC-03): to the control that had the focus when the overlay was
 *   pushed (for an overlay opened from a menu, the control focused before the menu), when it
 *   is still in the page; else to the page's h1, else to main. Only when the focus was in the
 *   overlay (or nowhere): a click elsewhere keeps its focus.
 * - The focus trap: `vFocusTrap`, PrimeVue's focustrap directive (HubWindow gets it from its
 *   modal Dialog).
 *
 *   const { isTopmost, focusInitial } = useOverlay({
 *       active: () => props.visible, container: () => el.value,
 *       onEscape: e => { e.preventDefault(); emit('close'); }, autoFocus: true
 *   });
 */
import { watch, nextTick, getCurrentScope, onScopeDispose, toValue } from 'vue';
import FocusTrap from 'primevue/focustrap';

/** PrimeVue's focustrap directive: Tab cycles inside the element (`directives: { focustrap: vFocusTrap }`) */
export const vFocusTrap = FocusTrap;

/**
 * @typedef {object} OverlayOptions
 * @property {import('vue').MaybeRefOrGetter<boolean>} active  shown: pushed while true
 * @property {() => (HTMLElement | null | undefined)} container  the overlay's element
 * @property {() => (HTMLElement | null | undefined)} [focusRoot]  where the focus target is looked for (the container)
 * @property {(e: KeyboardEvent) => void} [onEscape]  Escape while it is the topmost overlay
 * @property {import('vue').MaybeRefOrGetter<boolean>} [danger]  a destructive confirmation: the focus starts on [data-cancel]
 * @property {() => (HTMLElement | null | undefined)} [returnTo]  where the focus goes on close, instead of the opener
 * @property {boolean} [autoFocus]  focus the target on the tick after it is pushed (else call focusInitial)
 */

/**
 * @typedef {object} Overlay
 * @property {() => (HTMLElement | null)} container
 * @property {() => (HTMLElement | null)} focusRoot
 * @property {((e: KeyboardEvent) => void) | undefined} onEscape
 * @property {() => boolean} danger
 * @property {(() => (HTMLElement | null | undefined)) | undefined} returnTo
 * @property {HTMLElement | null} opener
 * @property {number[]} frames
 */

/** @type {Overlay[]} the shown overlays, in opening order: the last one has the keyboard */
const stack = [];

const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select, [role="combobox"]';
const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable="true"], audio[controls], video[controls]';
const UNUSABLE = '[disabled], [aria-disabled="true"], [tabindex="-1"], [data-p-hidden-focusable="true"]';
const MENU = '[role="menu"], [role="menubar"]';
const POPUP_LIST = '[role="menu"], [role="menubar"], [role="listbox"]';
const OPEN_POPUP = '[role="combobox"][aria-expanded="true"], [aria-haspopup]:not([aria-haspopup="false"])[aria-expanded="true"]';
// The frames on which the initial focus is put back if something outside took it
const KEEP_FRAMES = 2;

/**
 * Whether the element is rendered and not hidden: checkVisibility in browsers, else its
 * ancestors (the hidden attribute, display: none, visibility: hidden).
 * @param {Element} el
 * @returns {boolean}
 */
export function isVisible(el) {
    const check = /** @type {any} */ (el).checkVisibility;
    if (typeof check === 'function') return check.call(el, { checkVisibilityCSS: true, visibilityProperty: true });
    for (let node = el; node; node = node.parentElement) {
        if (node instanceof HTMLElement && node.hidden) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
}

/** @param {Element} el */
const usable = el => el instanceof HTMLElement && !el.matches(UNUSABLE) && isVisible(el);
/** @param {Element} el */
const usableField = el => usable(el) && !el.matches('[readonly]');

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @param {(el: Element) => boolean} ok
 * @returns {HTMLElement | null}
 */
function first(root, selector, ok) {
    for (const el of root.querySelectorAll(selector)) if (ok(el)) return /** @type {HTMLElement} */ (el);
    return null;
}

/**
 * The element that gets the focus when an overlay opens (FR-XC-02), or null.
 * @param {HTMLElement | null | undefined} root
 * @param {{ danger?: boolean }} [options]
 * @returns {HTMLElement | null}
 */
export function focusTargetIn(root, { danger = false } = {}) {
    if (!root) return null;
    for (const marked of root.querySelectorAll('[data-autofocus]')) {
        if (!isVisible(marked)) continue;
        if (marked instanceof HTMLElement && marked.matches(FOCUSABLE) && !marked.matches('[disabled]')) return marked;
        const inner = first(marked, FOCUSABLE, usable);
        if (inner) return inner;
    }
    if (danger) {
        const cancel = first(root, '[data-cancel]', usable);
        if (cancel) return cancel;
    }
    return first(root, FIELD, usableField)
        || (danger ? null : first(root, '[data-confirm]', usable))
        || first(root, FOCUSABLE, usable);
}

/** @param {HTMLElement | null} el the element itself as the last focus target */
function focusable(el) {
    if (el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    return el;
}

// The element focused before a menu took the focus: the opener of what the menu opens
/** @type {Element | null} */
let focusedBeforeMenu = null;
if (typeof document !== 'undefined') {
    // lifetime: app - one listener for the page, added when the module loads
    document.addEventListener('focusin', e => {
        if (e.target instanceof Element && !e.target.closest(MENU)) focusedBeforeMenu = e.target;
    }, true);
}

/** @returns {HTMLElement | null} the control that opens an overlay now */
function openerNow() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return null;
    if (active.closest(MENU)) return focusedBeforeMenu instanceof HTMLElement ? focusedBeforeMenu : null;
    return active;
}

/** @returns {HTMLElement | null} the page's h1, else main (FR-XC-03) */
function pageFocus() {
    const heading = [...document.querySelectorAll('h1')].find(h => !h.closest('[role="dialog"]') && isVisible(h));
    return focusable(/** @type {HTMLElement | null} */ (heading || document.querySelector('main')));
}

/**
 * The key belongs to an open Select or menu of the overlay (ARIA state, before the control
 * handles the key), to a [data-owns-escape] control in it, or to a popup list outside it that
 * has the focus (a menu opened from it).
 * @param {KeyboardEvent} e
 * @param {Overlay} overlay
 */
function popupOwnsKey(e, overlay) {
    const focused = e.target instanceof Element ? e.target : document.activeElement;
    if (focused && focused.closest(OPEN_POPUP)) return true;
    const container = overlay.container();
    if (!container) return false;
    // A control that keeps Escape for itself (a search field that clears its query)
    const owner = focused && focused.closest('[data-owns-escape]');
    if (owner && container.contains(owner)) return true;
    if (container.querySelector(OPEN_POPUP)) return true;
    return !!focused && !container.contains(focused) && !!focused.closest(POPUP_LIST);
}

/** @param {KeyboardEvent} e */
function onKeydown(e) {
    if (e.key !== 'Escape' || e.isComposing) return;
    const top = stack[stack.length - 1];
    if (!top || !top.onEscape || popupOwnsKey(e, top)) return;
    top.onEscape(e);
}

/** @param {Overlay} overlay */
function push(overlay) {
    // Capturing: the overlay decides before a Select, which stops Escape even when it is closed
    if (!stack.length) document.addEventListener('keydown', onKeydown, true);
    stack.push(overlay);
}

/** @param {Overlay} overlay */
function returnFocus(overlay) {
    const active = document.activeElement;
    const container = overlay.container();
    const inside = !active || active === document.body || (!!container && container.contains(active));
    if (!inside) return;
    const preferred = overlay.returnTo ? overlay.returnTo() : overlay.opener;
    const target = preferred && preferred.isConnected && isVisible(preferred) ? preferred : pageFocus();
    if (target) target.focus({ preventScroll: true });
}

/** @param {Overlay} overlay */
function remove(overlay) {
    const index = stack.indexOf(overlay);
    if (index < 0) return;
    const wasTop = index === stack.length - 1;
    overlay.frames.forEach(id => cancelAnimationFrame(id));
    overlay.frames = [];
    stack.splice(index, 1);
    if (!stack.length) document.removeEventListener('keydown', onKeydown, true);
    if (wasTop) returnFocus(overlay);
    overlay.opener = null;
}

/** Whether an overlay is shown (a menu that closes then leaves the focus to it). */
export function hasOpenOverlay() {
    return stack.length > 0;
}

/**
 * Puts the overlay on the stack while `active` is true.
 * @param {OverlayOptions} options
 * @returns {{ isTopmost: () => boolean, focusInitial: () => (HTMLElement | null) }}
 */
export function useOverlay(options) {
    /** @type {Overlay} */
    const overlay = {
        container: () => options.container() || null,
        focusRoot: () => (options.focusRoot ? options.focusRoot() : options.container()) || null,
        onEscape: options.onEscape,
        danger: () => !!toValue(options.danger),
        returnTo: options.returnTo,
        opener: null,
        frames: []
    };
    const isTopmost = () => stack[stack.length - 1] === overlay;

    /**
     * Puts the focus back on `target` on the next frames, while the overlay is on top and
     * the focus is outside it (a menu that refocused its trigger after its command).
     * @param {HTMLElement} target
     * @param {number} frames
     */
    function keepFocus(target, frames) {
        if (frames <= 0 || typeof requestAnimationFrame !== 'function') return;
        const id = requestAnimationFrame(() => {
            overlay.frames = overlay.frames.filter(f => f !== id);
            const container = overlay.container();
            if (!isTopmost() || !container || !target.isConnected) return;
            if (!container.contains(document.activeElement)) target.focus({ preventScroll: true });
            keepFocus(target, frames - 1);
        });
        overlay.frames.push(id);
    }

    /** Focuses the target of FR-XC-02 (else the overlay itself); returns it. */
    function focusInitial() {
        if (!stack.includes(overlay)) return null;
        const target = focusTargetIn(overlay.focusRoot(), { danger: overlay.danger() }) || focusable(overlay.container());
        if (!target) return null;
        target.focus({ preventScroll: true });
        keepFocus(target, KEEP_FRAMES);
        return target;
    }

    function open() {
        if (stack.includes(overlay)) return;
        // Before anything inside takes the focus
        overlay.opener = openerNow();
        push(overlay);
        if (options.autoFocus) nextTick(focusInitial);
    }

    watch(() => !!toValue(options.active), shown => (shown ? open() : remove(overlay)), { immediate: true });
    if (getCurrentScope()) onScopeDispose(() => remove(overlay));

    return { isTopmost, focusInitial };
}
