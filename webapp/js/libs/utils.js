import { formatBytes, formatTimeAgo } from './format';

export function setTitle(title) {
    document.title = `${title} - ${HubOptions.appName || "DroneDB"}`;
}

export function getCookie(key) {
    const cobj = document.cookie
        .split(';')
        .filter(v => v.includes('='))
        .map(v => v.split('='))
        .reduce((acc, v) => {
            acc[decodeURIComponent(v[0].trim())] = decodeURIComponent((v[1] || '').trim());
            return acc;
        }, {});
    return cobj[key];
}

export function queryParams(location) {
    let params = {};
    let paramsRaw = (location.search.replace("?", "").match(/([^&=]+)=?([^&]*)/g) || []);
    for (let i in paramsRaw) {
        let parts = paramsRaw[i].split("=");
        if (parts[1] !== undefined) {
            params[parts[0]] = parts[1];
        }
    }
    return params;
};

export function inIframe() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function clone(obj) {
    if (typeof obj === 'undefined') return undefined;
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.error('Clone failed:', e);
        return undefined;
    }
}

/**
 * Format bytes to human-readable string using binary units (1 KB = 1024 bytes): formatBytes of
 * libs/format.js, the one definition.
 * @param {number} bytes - The number of bytes
 * @param {number} [decimals=2] - At most this many decimals
 * @returns {string} Formatted size string (e.g., "1.5 MB")
 */
export function bytesToSize(bytes, decimals = 2) {
    return formatBytes(bytes, { decimals });
}

/** Relative time ("5 minutes ago"): formatTimeAgo of libs/format.js, the one definition. */
export { formatTimeAgo };

/**
 * The millisecond timestamp of a date the server sent (an ISO string).
 * @param {unknown} value
 * @returns {number|null} null when there is no date or it is not one (a date that is unknown, not 1970)
 */
export function parseTimestamp(value) {
    if (typeof value !== 'string' || !value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
}
/* Is currently in full screen or not */
export function isFullScreenCurrently() {
    const fse = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;

    // If no element is in full-screen
    return fse !== null;
}

// The standard method first, then the prefixed ones of older browsers
const REQUEST_FULLSCREEN = ['requestFullscreen', 'requestFullScreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen', 'msRequestFullScreen'];

/** The element's method that makes it full screen, or null. @param {Element} element */
function requestFullScreenMethod(element) {
    const name = REQUEST_FULLSCREEN.find(n => typeof element[n] === 'function');
    return name ? element[name] : null;
}

export function supportsFullScreen() {
    return !!requestFullScreenMethod(document.body);
}

// https://stackoverflow.com/a/7525760
export function requestFullScreen(element) {

    if (typeof element === 'undefined') {
        element = document.body; // Make the body go full screen.
    }

    const requestMethod = requestFullScreenMethod(element);

    if (requestMethod) { // Native full screen.
        const result = requestMethod.call(element);
        // The standard method returns a promise, rejected when the browser refuses (no user gesture, a policy)
        if (result && typeof result.catch === 'function') {
            result.catch(e => console.warn('Full screen was refused:', e));
        }
    } else if (typeof window.ActiveXObject !== "undefined") { // Older IE.
        var wscript = new window.ActiveXObject("WScript.Shell");
        if (wscript !== null) {
            wscript.SendKeys("{F11}");
        }
    }
}

// https://stackoverflow.com/a/7525760
export function exitFullScreen() {

    // Supports most browsers and their versions.
    var exitMethod = document.exitFullscreen || document.webkitExitFullscreen || document.mozExitFullscreen || document.msExitFullscreen;

    if (exitMethod) { // Native full screen.
        exitMethod.call(document);
    } else {
        console.warn("Cannot find suitable exitFullscreen call");
    }
}

// https://stackoverflow.com/a/53486112
export function debounce(fn, delay) {
    var timeoutID = null;
    return function () {
        clearTimeout(timeoutID);
        var args = arguments;
        var that = this;
        timeoutID = setTimeout(function () {
            fn.apply(that, args);
        }, delay);
    };
}

export function sortObjectKeys(unorderedObj) {
    if (!unorderedObj || typeof unorderedObj !== 'object') return unorderedObj;
    return Object.keys(unorderedObj).sort().reduce(
        (obj, key) => {
            obj[key] = unorderedObj[key];
            return obj;
        }, {});
}