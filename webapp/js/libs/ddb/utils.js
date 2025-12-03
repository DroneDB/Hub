/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const Registry = require('./registry');
const UriRegex = /(?<proto>ddb|ddb\+unsafe):\/\/(?<remote>[^/?#]*)\/(?<org>[^/?#]*)\/(?<ds>[^/?#]*)\/?(?<path>.*)/;
const pathutils = require('./pathutils');

module.exports = {
    // Given a uri, decomposes it
    // into registry and org/ds/path components
    parseUri: function (uri) {
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
    },

    isDDBUri: function (uri) {
        return uri.startsWith("ddb://") || uri.startsWith("ddb+unsafe://");
    },

    datasetPathFromUri: function (uri) {
        const { registryUrl, org, ds, path } = this.parseUri(uri);
        const dataset = new Registry(registryUrl).Organization(org).Dataset(ds);
        return [dataset, path];
    },

    datasetFromUri: function (uri) {
        const [dataset, _] = this.datasetPathFromUri(uri);
        return dataset;
    },

    pathFromUri: function (uri) {
        if (this.isDDBUri(uri)) {
            const [_, path] = this.datasetPathFromUri(uri);
            return path;
        } else if (uri.startsWith("file://")) {
            return uri.replace(/^file:\/\//, "");
        } else throw Error("Cannot extract path from URI: " + uri);
    },

    entryFromFile: function (file) {
        const [dataset, _] = this.datasetPathFromUri(file.path);
        return dataset.Entry(file.entry);
    },

    entryLabel: function (entry) {
        if (entry.properties?.meta?.name?.data !== undefined) {
            return entry.properties.meta.name.data;
        } else {
            return pathutils.basename(entry.path);
        }
    }    
}