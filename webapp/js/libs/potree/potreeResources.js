/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The files of Potree 1.8 that the point cloud viewer loads (HUB-04), with the Hub version in
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
    '/potree/libs/d3/d3.js',
    '/potree/libs/proj4/proj4.js',
    '/potree/libs/i18next/i18next.js',
    '/potree/libs/jstree/jstree.js',
    POTREE_BASE + '/potree.js',
    '/potree/libs/copc/index.js',
    '/potree/libs/plasio/js/laslaz.js'
];

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
