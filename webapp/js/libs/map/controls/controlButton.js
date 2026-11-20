/**
 * The glyph of a button built outside a Vue template: an <i> with the class of the glyph (libs/glyphs), hidden from
 * assistive technology as the icons of the templates are (the button has the name).
 * @param {string} icon the class of a glyph of libs/glyphs
 * @returns {HTMLElement}
 */
export function iconElement(icon) {
    const el = document.createElement('i');
    el.className = icon;
    el.setAttribute('aria-hidden', 'true');
    return el;
}

/**
 * The icon button of a map control: its name is the aria-label (for assistive technology and
 * selectors), and the tooltip is "<name> - <how to use it>".
 * @param {string} label accessible name
 * @param {string} hint how to use it, after the name in the tooltip
 * @param {string} [icon] the class of its glyph (libs/glyphs), decorative
 * @returns {HTMLButtonElement}
 */
export function controlButton(label, hint, icon) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.title = `${label} - ${hint}`;
    if (icon) btn.appendChild(iconElement(icon));
    return btn;
}

/**
 * A named group of control buttons (an OpenLayers .ol-control box).
 * @param {string} label accessible name of the group
 * @param {string} [className] more classes besides ol-control
 * @returns {HTMLDivElement}
 */
export function controlGroup(label, className) {
    const el = document.createElement('div');
    el.className = className ? className + ' ol-control' : 'ol-control';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', label);
    return el;
}
