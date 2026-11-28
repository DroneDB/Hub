// @ts-check
/**
 * The element a viewer shows in full screen: the whole page.
 *
 * Only what is inside the fullscreen element is drawn, and the overlays of PrimeVue (dialogs, the lists of a Select,
 * toasts, menus) are appended to the <body>, outside a viewer's own element: with the viewer alone in full screen they
 * were not visible, though they took the keys. So the page is shown in full screen and the viewer fills it: the style
 * of a viewer that can be in full screen has a rule `html:fullscreen <its root> { position: fixed; inset: 0 }` with a
 * z-index above the Hub header and below the overlays (PrimeVue's start at 1000).
 * @returns {HTMLElement}
 */
export function fullscreenRoot() {
    return document.documentElement;
}
