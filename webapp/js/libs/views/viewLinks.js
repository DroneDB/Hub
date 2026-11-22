// @ts-check
/**
 * The addresses of the map viewer and of the other viewers, as links to open, share or embed.
 *
 * - a file in the map (`fileViewUrl`): /r/:org/:ds/view/:encodedPath/map, with entry parameters
 *   the viewer reads once (`add`, `pick`);
 * - a saved view (`savedViewUrl`): /r/:org/:ds/views/:uid;
 * - a file in another viewer (`viewerUrl`);
 * - a report's live page (`reportUrl`), and an item of it (`itemAnchor`).
 *
 * The map and the point cloud viewer take `item=<id>` (`item`): the viewer frames and selects that annotation.
 *
 * A link opens in a new tab, like the other viewers, so the dataset page stays where it was.
 * Every link can ask for Viewer only (`embed=1`), always as the last query key.
 */
import ddb from 'ddb';
import { b64encode, b64urlEncode } from '@/libs/base64';

// Shown next to the "viewer only" option, wherever it is offered
export const VIEWER_ONLY_HELP = 'Hides the Hub header, the back button and the buttons that add or remove layers. Anyone with the link can still open the rest of the dataset.';

/** @param {string} url @param {string[]} query  `key=value` pieces */
const withQuery = (url, query) => (query.length ? `${url}?${query.join('&')}` : url);

/** The annotation a viewer frames and selects, when given. @param {string|undefined} item */
const itemQuery = item => (item ? [`item=${encodeURIComponent(item)}`] : []);

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
 * @param {string} [options.item]  id of the annotation to frame and select
 * @param {boolean} [options.viewerOnly]  open without the Hub header and back button
 * @param {string} [options.baseUrl]  origin of the Hub, no trailing slash; empty for a path
 */
export function fileViewUrl(dataset, path, { add = [], pick = false, item, viewerOnly = false, baseUrl = '' } = {}) {
    const query = [
        ...add.map(p => `add=${b64urlEncode(p)}`),
        ...(pick ? ['pick=1'] : []),
        ...itemQuery(item),
        ...embedQuery(viewerOnly)
    ];
    return withQuery(`${baseUrl}${datasetRoot(dataset)}/view/${b64encode(path)}/map`, query);
}

/**
 * A saved view.
 * @param {{ org: string, ds: string }} dataset @param {string} uid
 * @param {{ item?: string, viewerOnly?: boolean, baseUrl?: string }} [options]  see fileViewUrl
 */
export function savedViewUrl(dataset, uid, { item, viewerOnly = false, baseUrl = '' } = {}) {
    return withQuery(`${baseUrl}${datasetRoot(dataset)}/views/${encodeURIComponent(uid)}`, [...itemQuery(item), ...embedQuery(viewerOnly)]);
}

/**
 * The live page of a report.
 * @param {{ org: string, ds: string }} dataset @param {string} uid
 * @param {{ baseUrl?: string }} [options]  baseUrl: origin of the Hub, no trailing slash; empty for a path
 */
export function reportUrl(dataset, uid, { baseUrl = '' } = {}) {
    return `${baseUrl}${datasetRoot(dataset)}/reports/${encodeURIComponent(uid)}`;
}

/** The anchor of an item on the live page of a report, with its `#`. @param {string} id */
export const itemAnchor = id => `#item-${id}`;

/** The id of the item an address hash names (`#item-<id>`), or null. @param {string} hash */
export function itemOfAnchor(hash) {
    const match = /^#item-(.+)$/.exec(hash || '');
    if (!match) return null;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

/**
 * A file in the viewer `view` of the route (e.g. "model"), for sharing or embedding.
 * @param {object} p
 * @param {string} p.baseUrl  origin of the Hub, no trailing slash
 * @param {string} p.org
 * @param {string} p.ds
 * @param {string} p.path  dataset-relative path of the file
 * @param {string} p.view  viewer of the route, e.g. "map"
 * @param {string} [p.item]  id of the annotation the viewer frames and selects
 * @param {boolean} [p.viewerOnly]  open without the Hub header and back button
 */
export function viewerUrl({ baseUrl, org, ds, path, view, item, viewerOnly = false }) {
    return withQuery(`${baseUrl}${datasetRoot({ org, ds })}/view/${b64encode(path)}/${view}`, [...itemQuery(item), ...embedQuery(viewerOnly)]);
}

/**
 * The viewer offered instead of the one asked for when the build of a file could not make the output that one needs
 * (the 'not-generated' state of the availability check): the model viewer of a model whose 3D Tiles could not be made,
 * which shows its bm3d output; null for any other file. The 3D viewer offers it in its build notice, the dataset page
 * in the dialog about a file that cannot open.
 * @param {{ org: string, ds: string } | null | undefined} dataset
 * @param {{ type?: number, path?: string } | null | undefined} entry
 * @param {{ viewerOnly?: boolean }} [options]  viewerOnly: from a viewer opened as Viewer only, so it stays one
 * @returns {{ label: string, icon: string, view: string, to: string } | null}
 */
export function notGeneratedAlternative(dataset, entry, { viewerOnly = false } = {}) {
    if (!dataset || !entry?.path || entry.type !== ddb.entry.type.MODEL) return null;
    const view = 'model';
    return {
        label: 'Open in the model viewer',
        icon: 'fa-solid fa-cube',
        view,
        to: viewerUrl({ baseUrl: '', org: dataset.org, ds: dataset.ds, path: entry.path, view, viewerOnly })
    };
}

/** The absolute URL of a link (to copy). @param {string} url */
export const absoluteUrl = url => new URL(url, window.location.origin).toString();

/** Opens a link in a new tab. @param {string} url */
export function openInNewTab(url) {
    window.open(url, '_blank', 'noopener');
}
