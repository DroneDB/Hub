/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const { parseUri, isDDBUri } = require('./utils');
const Registry = require('./registry');

// Server side search
async function searchEntries(uri, query) {
    if (isDDBUri(uri)) {
        const { registryUrl, org, ds, path } = parseUri(uri);
        const dataset = new Registry(registryUrl).Organization(org).Dataset(ds);
        return dataset.search(query);
    }
};

module.exports = searchEntries;