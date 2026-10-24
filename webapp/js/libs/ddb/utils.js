/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Registry from './registry';
import pathutils from './pathutils';

const UriRegex = /(?<proto>ddb|ddb\+unsafe):\/\/(?<remote>[^/?#]*)\/(?<org>[^/?#]*)\/(?<ds>[^/?#]*)\/?(?<path>.*)/;

// Given a uri, decomposes it into registry and org/ds/path components
export function parseUri(uri) {
    const matches = uri.match(UriRegex);
    if (!matches) throw new Error(`Cannot parse URI ${uri}`);
    const { groups } = matches;

    const proto = groups.proto === "ddb" ? "https" : "http";

    return {
        registryUrl: `${proto}://${groups.remote}`,
        org: groups.org,
        ds: groups.ds,
        path: groups.path
    };
}

export function isDDBUri(uri) {
    return uri.startsWith("ddb://") || uri.startsWith("ddb+unsafe://");
}

export function datasetPathFromUri(uri) {
    const { registryUrl, org, ds, path } = parseUri(uri);
    const dataset = Registry.forUrl(registryUrl).Organization(org).Dataset(ds);
    return [dataset, path];
}

export function pathFromUri(uri) {
    if (isDDBUri(uri)) {
        const [, path] = datasetPathFromUri(uri);
        return path;
    } else if (uri.startsWith("file://")) {
        return uri.replace(/^file:\/\//, "");
    } else throw Error("Cannot extract path from URI: " + uri);
}

export function entryLabel(entry) {
    if (entry.properties?.meta?.name?.data !== undefined) {
        return entry.properties.meta.name.data;
    } else {
        return pathutils.basename(entry.path);
    }
}

export default { parseUri, isDDBUri, datasetPathFromUri, pathFromUri, entryLabel };
