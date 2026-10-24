/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
