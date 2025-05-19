export function setTitle(title) {
    document.title = `${title} - ${HubOptions.appName || "DroneDB"}`;
}

export function getCookie(key) {
    const cobj = document.cookie
        .split(';')
        .map(v => v.split('='))
        .reduce((acc, v) => {
            acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
            return acc;
        }, {});
    return cobj[key];
}

export function clearCookie(key) {
    document.cookie = `${key}=;-1;path=/`;
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
    } catch (e) {
        return true;
    }
}

export function clone(obj) {
    if (typeof obj === 'undefined') return undefined;
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.error(e);
        debugger;
        return undefined;
    }
}

export function bytesToSize(bytes, decimals = 2) {
    if (bytes == 0) return '0 byte';
    var k = 1000; // or 1024 for binary
    var dm = decimals || 3;
    var sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


/* Is currently in full screen or not */
export function isFullScreenCurrently() {
    var fse = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;

    // If no element is in full-screen
    if (fse === null)
        return false;
    else
        return true;
}

export function supportsFullScreen() {
    return !!(document.body.requestFullScreen || document.body.webkitRequestFullScreen || document.body.mozRequestFullScreen || document.body.msRequestFullScreen);
}

// https://stackoverflow.com/a/7525760
export function requestFullScreen(element) {

    if (typeof element === 'undefined') {
        element = document.body; // Make the body go full screen.
    }

    // Supports most browsers and their versions.
    var requestMethod = element.requestFullScreen || element.webkitRequestFullScreen || element.mozRequestFullScreen || element.msRequestFullScreen;

    if (requestMethod) { // Native full screen.
        requestMethod.call(element);
    } else if (typeof window.ActiveXObject !== "undefined") { // Older IE.
        var wscript = new ActiveXObject("WScript.Shell");
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
    return Object.keys(unorderedObj).sort().reduce(
        (obj, key) => {
            obj[key] = unorderedObj[key];
            return obj;
        }, {});
}