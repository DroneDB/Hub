import { parseUri, isDDBUri } from './utils';
import Registry from './registry';

// Server side search
export default async function searchEntries(uri, query) {
    if (isDDBUri(uri)) {
        const { registryUrl, org, ds } = parseUri(uri);
        const dataset = Registry.forUrl(registryUrl).Organization(org).Dataset(ds);
        return dataset.search(query);
    }
}
