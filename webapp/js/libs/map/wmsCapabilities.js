// @ts-check
/**
 * Layers of a third-party WMS server, from its GetCapabilities document. Not a Registry request: no session token.
 */

const TIMEOUT_MS = 15000;

/** Direct children of `el` named `name`. @param {Element} el @param {string} name */
const childrenNamed = (el, name) => [...el.children].filter(c => c.localName === name);

/**
 * Default TIME of a layer: its `default` attribute, else the start of the last extent value.
 * @param {Element} layer
 */
function defaultTimeOf(layer) {
    for (const dim of childrenNamed(layer, 'Dimension')) {
        if ((dim.getAttribute('name') || '').toLowerCase() !== 'time') continue;
        const def = dim.getAttribute('default');
        if (def) return def;
        const extent = (dim.textContent || '').trim();
        if (!extent) return '';
        const parts = extent.split(',');
        // e.g. "2026-03-12T12:28:18Z/..." -> first ISO date of the range
        return parts[parts.length - 1].trim().split('/')[0];
    }
    return '';
}

/**
 * Named (requestable) layers of a capabilities document.
 * @param {string} xmlText
 * @returns {{ name: string, title: string, defaultTime: string }[]}
 */
export function parseWmsLayers(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('Invalid XML response from WMS server.');
    const layers = [];
    for (const el of xml.querySelectorAll('Layer')) {
        const [nameEl] = childrenNamed(el, 'Name');
        if (!nameEl) continue;
        const [titleEl] = childrenNamed(el, 'Title');
        layers.push({ name: nameEl.textContent || '', title: titleEl ? titleEl.textContent || '' : '', defaultTime: defaultTimeOf(el) });
    }
    return layers;
}

/**
 * @param {string} url  the WMS endpoint (with or without a query string)
 * @returns {Promise<{ name: string, title: string, defaultTime: string }[]>}
 */
export async function fetchWmsLayers(url) {
    const capUrl = `${url}${url.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetCapabilities`;
    let text;
    try {
        const res = await fetch(capUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        text = await res.text();
    } catch (e) {
        throw new Error(e && e.name === 'TimeoutError' ? 'WMS capabilities request timed out.' : 'Could not connect to WMS server.', { cause: e });
    }
    let layers;
    try {
        layers = parseWmsLayers(text);
    } catch (e) {
        throw new Error(e.message === 'Invalid XML response from WMS server.' ? e.message : 'Failed to parse WMS capabilities.', { cause: e });
    }
    if (layers.length === 0) throw new Error('No layers found in WMS capabilities.');
    return layers;
}
