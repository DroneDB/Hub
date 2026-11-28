/**
 * The files of Potree 1.8 that the point cloud viewer loads, with the Hub version in
 * their URL: the Registry serves versioned URLs as immutable (HubCachePolicy), so a browser
 * fetches them once per Hub release instead of revalidating them every hour.
 */

export const POTREE_BASE = '/potree/build/potree';

// In execution order (loadResources keeps it)
export const POTREE_RESOURCES = [
    POTREE_BASE + '/potree.css',
    '/potree/libs/jquery-ui/jquery-ui.min.css',
    '/potree/libs/spectrum/spectrum.css',
    '/potree/libs/jstree/themes/mixed/style.css',
    '/potree/libs/jquery/jquery-3.1.1.min.js',
    '/potree/libs/spectrum/spectrum.js',
    '/potree/libs/jquery-ui/jquery-ui.min.js',
    '/potree/libs/three.js/build/three.min.js',
    '/potree/libs/three.js/extra/lines.js',
    '/potree/libs/other/BinaryHeap.js',
    '/potree/libs/tween/tween.min.js',
    '/potree/libs/d3/d3.min.js',
    '/potree/libs/proj4/proj4.js',
    '/potree/libs/i18next/i18next.js',
    '/potree/libs/jstree/jstree.min.js',
    POTREE_BASE + '/potree.js',
    '/potree/libs/copc/index.js',
    '/potree/libs/plasio/js/laslaz.js'
];

/**
 * The digest of the files of POTREE_RESOURCES as they are shipped (public/potree, SHA-256 of their text with the line
 * ends as LF, one digest of every file in order, the first 12 hex digits). It follows the Hub version in the URL of the
 * files (potreeVersion): the Registry serves a versioned URL as immutable for a year, so a build that changed a file of
 * Potree without a new version would never be fetched again by a browser that has the old one. potreeResources.spec
 * fails when a file changes without this digest: update it with the one it reports.
 */
export const POTREE_FILES_DIGEST = '6c7d3b769330';

/**
 * What the URLs of the Potree files carry after `?v=`: the Hub version and the digest of the files, so that either one
 * changing gives new URLs. Without a Hub version (a development build) there is none, as before.
 * @param {string | null | undefined} hubVersion
 */
export function potreeVersion(hubVersion) {
    return hubVersion ? `${hubVersion}-${POTREE_FILES_DIGEST}` : hubVersion;
}

/** The URLs with `?v=<version>` (unchanged without a version). */
export function versioned(urls, version) {
    if (!version) return urls.slice();
    const v = encodeURIComponent(version);
    return urls.map(url => `${url}?v=${v}`);
}

/**
 * Potree derives its script path from its own <script> URL (`src + '/..'`), which keeps the
 * query string of a versioned URL. Its workers and resources are found from that path, so it
 * is set to the folder itself after loading.
 */
export function fixPotreePaths(potree, origin) {
    if (!potree) return;
    potree.scriptPath = origin + POTREE_BASE;
    potree.resourcePath = potree.scriptPath + '/resources';
}
