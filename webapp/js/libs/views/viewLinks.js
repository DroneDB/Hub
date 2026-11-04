// @ts-check
/**
 * The addresses of the map viewer and of the other viewers, as links to open, share or embed.
 *
 * - a file in the map (`fileViewUrl`): /r/:org/:ds/view/:encodedPath/map, with entry parameters
 *   the viewer reads once (`add`, `pick`);
 * - a saved view (`savedViewUrl`): /r/:org/:ds/views/:uid;
 * - a file in another viewer (`viewerUrl`).
 *
 * A link opens in a new tab, like the other viewers, so the dataset page stays where it was.
 * Every link can ask for Viewer only (`embed=1`), always as the last query key.
 */
import { b64encode, b64urlEncode } from '@/libs/base64';

// Shown next to the "viewer only" option, wherever it is offered
export const VIEWER_ONLY_HELP = 'Hides the Hub header, the back button and the buttons that add or remove layers. Anyone with the link can still open the rest of the dataset.';

/** @param {string} url @param {string[]} query  `key=value` pieces */
const withQuery = (url, query) => (query.length ? `${url}?${query.join('&')}` : url);

/** @param {boolean} viewerOnly */
const embedQuery = viewerOnly => (viewerOnly ? ['embed=1'] : []);

/** @param {{ org: string, ds: string }} dataset */
const datasetRoot = ({ org, ds }) => `/r/${encodeURIComponent(org)}/${encodeURIComponent(ds)}`;

/**
 * The map on a file. The path segment is the route's own encoding (base64); the `add` values are
 * base64url, so they sit in a query as they are.
 * @param {{ org: string, ds: string }} dataset
 * @param {string} path  dataset-relative path of the base file
 * @param {object} [options]
 * @param {string[]} [options.add]  paths of other files to show with it, in order
 * @param {boolean} [options.pick]  open the file picker once the map shows
 * @param {boolean} [options.viewerOnly]  open without the Hub header and back button
 * @param {string} [options.baseUrl]  origin of the Hub, no trailing slash; empty for a path
 */
export function fileViewUrl(dataset, path, { add = [], pick = false, viewerOnly = false, baseUrl = '' } = {}) {
    const query = [
        ...add.map(p => `add=${b64urlEncode(p)}`),
        ...(pick ? ['pick=1'] : []),
        ...embedQuery(viewerOnly)
    ];
    return withQuery(`${baseUrl}${datasetRoot(dataset)}/view/${b64encode(path)}/map`, query);
}

/**
 * A saved view.
 * @param {{ org: string, ds: string }} dataset @param {string} uid
 * @param {{ viewerOnly?: boolean, baseUrl?: string }} [options]  see fileViewUrl
 */
export function savedViewUrl(dataset, uid, { viewerOnly = false, baseUrl = '' } = {}) {
    return withQuery(`${baseUrl}${datasetRoot(dataset)}/views/${encodeURIComponent(uid)}`, embedQuery(viewerOnly));
}

/**
 * A file in the viewer `view` of the route (e.g. "model"), for sharing or embedding.
 * @param {object} p
 * @param {string} p.baseUrl  origin of the Hub, no trailing slash
 * @param {string} p.org
 * @param {string} p.ds
 * @param {string} p.path  dataset-relative path of the file
 * @param {string} p.view  viewer of the route, e.g. "map"
 * @param {boolean} [p.viewerOnly]  open without the Hub header and back button
 */
export function viewerUrl({ baseUrl, org, ds, path, view, viewerOnly = false }) {
    return withQuery(`${baseUrl}${datasetRoot({ org, ds })}/view/${b64encode(path)}/${view}`, embedQuery(viewerOnly));
}

/** The absolute URL of a link (to copy). @param {string} url */
export const absoluteUrl = url => new URL(url, window.location.origin).toString();

/** Opens a link in a new tab. @param {string} url */
export function openInNewTab(url) {
    window.open(url, '_blank', 'noopener');
}
