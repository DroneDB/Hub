/**
 * loadResources - adds scripts and stylesheets to the page once each.
 *
 * Every URL starts downloading at once; scripts run in the order given (they are inserted
 * with async = false, which keeps insertion order for dynamically added scripts), so one
 * call can load libraries that depend on each other without one round trip per file.
 * A URL requested again, even while it is still loading, shares the first request.
 * A script needs the ones before it in the call, so when one fails the ones after it (which ran, or will run, without it)
 * are forgotten as well: nothing of the call stays cached as loaded, and a later call loads them all again, in order.
 *
 * @param {string|string[]} urls .js or .css URLs (a query string, such as a version, is allowed)
 * @returns {Promise<string[]>} resolves when every resource has loaded; rejects on the first failure
 */
const loading = new Map();
// The element each URL added to the page
const elements = new Map();

/** Takes a URL out of the cache and its element out of the page, so that it can be loaded again. */
function forget(url) {
    loading.delete(url);
    elements.get(url)?.remove();
    elements.delete(url);
}

export function loadResources(urls) {
    if (typeof urls === "string") urls = [urls];
    return Promise.all(urls.map((url, i) => loadResource(url).catch(error => {
        urls.slice(i + 1).forEach(forget);
        throw error;
    })));
}

function loadResource(url) {
    if (!loading.has(url)) {
        const promise = new Promise((resolve, reject) => {
            const fail = () => {
                // A failed resource may be requested again later
                forget(url);
                reject(new Error(`Cannot load ${url}`));
            };

            // The type comes from the path: a query (?v=...) is not part of it
            const path = url.split(/[?#]/)[0];
            if (path.endsWith(".js")) {
                const script = document.createElement('script');
                script.src = url;
                script.async = false;
                script.onload = () => resolve(url);
                script.onerror = fail;
                elements.set(url, script);
                document.body.appendChild(script);
            } else if (path.endsWith(".css")) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.type = 'text/css';
                link.href = url;
                link.media = 'all';
                link.onload = () => resolve(url);
                link.onerror = fail;
                elements.set(url, link);
                document.getElementsByTagName('head')[0].appendChild(link);
            } else {
                reject(new Error(`Unsupported resource type: ${url}`));
            }
        });
        loading.set(url, promise);
    }
    return loading.get(url);
}
