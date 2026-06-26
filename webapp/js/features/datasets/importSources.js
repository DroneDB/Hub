/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * importSources - Static metadata describing the available import sources and the
 * parameter fields each one needs. Field names MUST match the backend source params
 * (see RegistryImportSource / ArchiveUrlImportSource). Fields flagged `sensitive`
 * are encrypted server-side before being handed to the worker.
 */
export const IMPORT_SOURCES = [
    {
        type: 'registry',
        label: 'DroneDB Registry / Hub',
        icon: 'fa-solid fa-server',
        description: 'Import a dataset from another DroneDB Registry or Hub instance.',
        fields: [
            { name: 'url', label: 'Registry URL', type: 'text', placeholder: 'https://hub.dronedb.app', required: true },
            { name: 'organization', label: 'Organization', type: 'text', placeholder: 'organization slug', required: true },
            { name: 'dataset', label: 'Dataset', type: 'text', placeholder: 'dataset slug', required: true },
            { name: 'username', label: 'Username', type: 'text', placeholder: 'optional (for private datasets)', required: false },
            { name: 'password', label: 'Password', type: 'password', placeholder: 'optional', required: false, sensitive: true }
        ]
    },
    {
        type: 'archive-url',
        label: 'Archive URL',
        icon: 'fa-solid fa-file-zipper',
        description: 'Download and extract a zip/tar/7z/rar archive from a URL.',
        fields: [
            { name: 'url', label: 'Archive URL', type: 'text', placeholder: 'https://example.com/data.zip', required: true },
            { name: 'username', label: 'Username', type: 'text', placeholder: 'optional (HTTP basic auth)', required: false },
            { name: 'password', label: 'Password', type: 'password', placeholder: 'optional', required: false, sensitive: true }
        ]
    }
];

/** Returns the source metadata for a given type, or null. */
export function getImportSource(type) {
    return IMPORT_SOURCES.find(s => s.type === type) || null;
}
