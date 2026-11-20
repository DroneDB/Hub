import { parseUri, isDDBUri } from './utils';
import Registry from './registry';

// Retrieves the entries of a remote (ddb://) URI
export default async function fetchEntries(uri, options = {}) {
    if (isDDBUri(uri)) {
        const { registryUrl, org, ds, path } = parseUri(uri);
        const dataset = Registry.forUrl(registryUrl).Organization(org).Dataset(ds);
        return dataset.list(path, { signal: options.signal });
    }
    throw new Error(`Unsupported URI: ${uri}`);
}
