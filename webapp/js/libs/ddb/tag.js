/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { DEFAULT_REGISTRY } = require('./constants');
const TagComponentInvalidChars = /[^a-z0-9_-]/g;
const TagComponentValid = /^[a-z0-9][a-z0-9_-]{1,128}$/;

module.exports = class Tag {

    /*
    A tag name must be valid ASCII and may contain lowercase
    letters, digits, underscores and dashes.
    A tag name must start with a lowercase letter or digit and may contain
    between 2 and 129 characters total.
    */
    static validComponent(tagComponent) {
        if (!tagComponent) return false;

        return TagComponentValid.test(tagComponent);
    }

    static filterComponentChars(tagComponent){
        if (typeof tagComponent !== "string") return "";
        return tagComponent.replace(TagComponentInvalidChars, "");
    }

    constructor(tag) {
        const parts = tag.split("/");

        if (parts.length === 2) {
            if (typeof window === "undefined" || window.location.hostname === DEFAULT_REGISTRY) {
                this.registryUrl = ""; // default
            } else {
                const proto = window.location.protocol === "https" ?
                    "" :
                    `${window.location.protocol}//`;
                const port = (window.location.port ? ":" + window.location.port : "");
                this.registryUrl = `${proto}${window.location.hostname}${port}`;
            }
            if (!this.validComponent(parts[0])) throw new Error(`Invalid tag component: ${parts[0]}`);
            if (!this.validComponent(parts[1])) throw new Error(`Invalid tag component: ${parts[1]}`);

            this.org = parts[0];
            this.ds = parts[1];
        } else if (parts.length === 3) {
            this.registryUrl = parts[0];
            if (!this.validComponent(parts[1])) throw new Error(`Invalid tag component: ${parts[1]}`);
            if (!this.validComponent(parts[2])) throw new Error(`Invalid tag component: ${parts[2]}`);

            this.org = parts[1];
            this.ds = parts[2];
        } else {
            throw new Error("Cannot parse tag: " + tag);
        }
    }
    toString() {
        if (this.registryUrl) {
            return `${this.registryUrl}/${this.org}/${this.ds}`;
        } else {
            return `${this.org}/${this.ds}`;
        }
    }
}
