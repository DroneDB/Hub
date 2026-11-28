// @ts-check
/**
 * Open a dataset file or a web link in a new browser window (the dataset page's
 * "open" for files without a viewer).
 */
import { utils } from 'ddb';

/** @param {string} uri  a ddb:// URI or an http(s) URL */
export function openInBrowser(uri) {
    if (utils.isDDBUri(uri)) {
        const [ds, path] = utils.datasetPathFromUri(uri);
        window.open(ds.downloadUrl(path, { inline: true }), uri);
    } else if (/^https?:\/\//i.test(uri)) {
        window.open(uri, '_blank');
    } else {
        console.warn(`Cannot open ${uri}`);
    }
}
