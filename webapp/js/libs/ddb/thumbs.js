/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import entry from './entry';
import { parseUri, isDDBUri } from './utils';
import Registry from './registry';

const thumbs = {
    supportedForType: function (entryType) {
        entryType = parseInt(entryType);
        return entryType === entry.type.GEOIMAGE ||
            entryType === entry.type.GEORASTER ||
            entryType === entry.type.IMAGE ||
            entryType === entry.type.POINTCLOUD ||
            entryType === entry.type.PANORAMA ||
            entryType === entry.type.GEOPANORAMA ||
            entryType === entry.type.GAUSSIAN_SPLAT;
    },

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
