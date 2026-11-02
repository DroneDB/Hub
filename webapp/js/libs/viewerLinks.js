// @ts-check
/**
 * The address of a file in the map or another viewer, as a link to share or embed.
 */
import { b64encode, b64urlEncode } from '@/libs/base64';

// Shown next to the "viewer only" option, wherever it is offered
export const VIEWER_ONLY_HELP = 'Hides the Hub header, the back button and the buttons that add or remove layers. Anyone with the link can still open the rest of the dataset.';

/**
 * @param {object} p
 * @param {string} p.baseUrl  origin of the Hub, no trailing slash
 * @param {string} p.org
 * @param {string} p.ds
 * @param {string} p.path  dataset-relative path of the file
 * @param {string} p.view  viewer of the route, e.g. "map"
 * @param {string[]} [p.layers]  paths of the layers added to the map, in the order they were added
 * @param {boolean} [p.viewerOnly]  open without the Hub header and back button
 */
export function viewerUrl({ baseUrl, org, ds, path, view, layers = [], viewerOnly = false }) {
    // The path segment is the route's own encoding; the layer values are base64url so they
    // sit in a query as they are
    const url = `${baseUrl}/r/${org}/${ds}/view/${b64encode(path)}/${view}`;
    const query = layers.map(p => `layer=${b64urlEncode(p)}`);
    if (viewerOnly) query.push('embed=1');
    return query.length ? `${url}?${query.join('&')}` : url;
}
