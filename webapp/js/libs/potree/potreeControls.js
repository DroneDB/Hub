/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Accessible names for the controls that Potree 1.8 builds without one. Its menu toggle is an
 * <img> with an onclick: no role, no name, not reachable with the keyboard. The vendored Potree
 * files stay as they are; the viewer calls labelPotreeControls() once Potree has built its UI.
 */

// Selector of each unnamed Potree control -> its accessible name
export const POTREE_CONTROL_LABELS = Object.freeze({
    '.potree_menu_toggle': 'Menu'
});

const ACTIVATION_KEYS = new Set(['Enter', ' ']);

/**
 * Makes each unnamed control under root a named button that Enter and Space activate.
 * @param {ParentNode} root the element Potree built its UI in
 * @param {{ track: Function }} session owner of the key listeners (removed when the viewer closes)
 */
export function labelPotreeControls(root, session) {
    for (const [selector, label] of Object.entries(POTREE_CONTROL_LABELS)) {
        const el = root?.querySelector(selector);
        if (el) asButton(el, label, session);
    }
}

function asButton(el, label, session) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', label);
    // The name is the label; the image itself says nothing more
    el.setAttribute('alt', '');
    session.track(el, 'keydown', e => {
        if (!ACTIVATION_KEYS.has(e.key)) return;
        e.preventDefault();
        el.click();
    });
}
