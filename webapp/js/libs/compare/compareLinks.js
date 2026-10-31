// @ts-check
/**
 * Links to the compare view (route /r/:org/:ds/compare). It opens in a new tab, like the
 * other viewers, so the dataset page stays where it was.
 */
import { b64urlEncode } from '@/libs/base64';

/**
 * @param {{ org: string, ds: string }} dataset
 * @param {{ paths?: string[], pick?: boolean, uid?: string }} options
 *        `paths`: dataset-relative raster paths, leftmost first; `pick`: open the file picker;
 *        `uid`: a saved comparison
 */
export function compareUrl({ org, ds }, { paths = [], pick = false, uid } = {}) {
    const query = new URLSearchParams();
    if (uid) query.set('c', uid);
    paths.forEach(p => query.append('p', b64urlEncode(p)));
    if (pick) query.set('pick', '1');
    const qs = query.toString();
    return `/r/${encodeURIComponent(org)}/${encodeURIComponent(ds)}/compare${qs ? `?${qs}` : ''}`;
}

/** The absolute URL of a compare link (to copy). @param {string} url  from compareUrl */
export const absoluteUrl = url => new URL(url, window.location.origin).toString();

/**
 * Opens the compare view in a new tab.
 * @param {{ org: string, ds: string }} dataset @param {Parameters<typeof compareUrl>[1]} options
 */
export function openCompare(dataset, options) {
    window.open(compareUrl(dataset, options), '_blank', 'noopener');
}
