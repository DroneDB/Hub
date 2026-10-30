/**
 * The icon button of a map control: its name is the aria-label (for assistive technology and
 * selectors), and the tooltip is "<name> - <how to use it>".
 * @param {string} label accessible name
 * @param {string} hint how to use it, after the name in the tooltip
 * @param {string} [icon] URL of the icon image (decorative)
 * @returns {HTMLButtonElement}
 */
export function controlButton(label, hint, icon) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.title = `${label} - ${hint}`;
    if (icon) btn.innerHTML = '<img src="' + icon + '" alt=""/>';
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
