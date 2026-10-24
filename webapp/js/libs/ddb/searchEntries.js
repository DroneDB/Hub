/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
