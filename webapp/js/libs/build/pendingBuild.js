// @ts-check
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words of a deferred build (an entry whose buildStatus is "pending"), the one place every
 * view takes them from: the badge tooltips of the file list and the thumbnails, the details panel
 * and the dialog shown when such a file is opened.
 *
 * A deferred build is one of two kinds, and they need different advice:
 * - it waits for files the dataset lacks (the .mtl or a texture of an .obj, the .shx or .dbf of a
 *   .shp): no timer retries it, it builds by itself as soon as a file of one of those names is
 *   added to the dataset, so the user is told what to upload;
 * - it is on hold for another reason (a temporary error): the server retries it by itself.
 *
 * Which kind it is comes from the server, never from the names: libddb decides it and Registry
 * passes it on, as buildAwaitingFiles on an entry and as awaitingFiles on an item of
 * GET builds/pending.
 *
 * A leaf module (no other build/* imports), so buildHelpers.js and fileAvailabilityChecker.js can
 * both use it without a circular dependency.
 */

/**
 * @typedef {object} PendingBuildText
 * @property {boolean} awaitingFiles  the build waits for files (it is not retried on a timer)
 * @property {string[]} files  the names of the missing files, as the server reports them
 * @property {string} label  short status, for a badge
 * @property {string} title  title of a dialog about the build
 * @property {string} text  what the build waits for and what the user can do, in full sentences
 */

/**
 * @param {string[] | null | undefined} missingDependencies  the missing names the server reports
 * @param {boolean | null | undefined} awaitingFiles  the server says the build waits for files;
 *        anything but true is a build on hold
 * @returns {PendingBuildText}
 */
export function describePendingBuild(missingDependencies, awaitingFiles) {
    const files = Array.isArray(missingDependencies) ? missingDependencies.filter(Boolean) : [];
    if (awaitingFiles !== true) {
        return {
            awaitingFiles: false,
            files,
            label: 'On Hold',
            title: 'Processing On Hold',
            text: 'Processing is on hold and will be retried automatically.'
        };
    }

    const which = files.length > 0 ? `: ${files.join(', ')}` : '';
    const upload = files.length === 1
        ? 'Upload the missing file to this dataset and processing starts by itself.'
        : 'Upload the missing files to this dataset and processing starts by itself.';
    return {
        awaitingFiles: true,
        files,
        label: 'Waiting for files',
        title: 'Waiting for Files',
        text: `Waiting for files${which}. ${upload}`
    };
}

/**
 * The words of the deferred build of an entry (see describePendingBuild).
 * @param {{ buildMissingDependencies?: string[], buildAwaitingFiles?: boolean } | null | undefined} entry
 * @returns {PendingBuildText}
 */
export function describeEntryPendingBuild(entry) {
    return describePendingBuild(entry?.buildMissingDependencies, entry?.buildAwaitingFiles);
}
