import { parseUri, isDDBUri } from './utils';
import Registry from './registry';

const thumbs = {
    // hash: optional entry hash, see Dataset.thumbUrl
    fetch: function (uri, thumbSize = 256, hash = undefined) {
        if (isDDBUri(uri)) {
            const { registryUrl, org, ds, path } = parseUri(uri);
            const dataset = Registry.forUrl(registryUrl).Organization(org).Dataset(ds);
            return dataset.thumbUrl(path, thumbSize, hash);
        }
        throw new Error(`Unsupported URI: ${uri}`);
    }
};

export default thumbs;
