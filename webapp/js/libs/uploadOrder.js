/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { pathutils } from 'ddb';

/**
 * uploadOrder - best-effort ordering of files queued for upload.
 *
 * The Registry starts a build as soon as each file is indexed, so a 3D model
 * uploaded before its companions (.mtl, textures, ...) is often built before
 * they exist. Queueing companions first makes it likely (not certain: uploads
 * run in parallel) that they arrive before the model that references them.
 */

// Extensions of model files that may reference companion files
const MODEL_EXTENSIONS = new Set(['obj', 'ply', 'gltf', 'glb']);

function isModelFile(file) {
    const name = file && typeof file.name === 'string' ? file.name : '';
    return MODEL_EXTENSIONS.has(pathutils.extname(name).slice(1));
}

/**
 * Stable partition: companion (non-model) files first, model files last.
 * Relative order within each group is preserved.
 *
 * @param {ArrayLike<{name: string}>} files - File-like objects (File, FileList items, ...)
 * @returns {Array} a new array; the input is not modified
 */
export function orderCompanionsFirst(files) {
    if (!files) return [];

    const companions = [];
    const models = [];
    for (const file of Array.from(files)) {
        (isModelFile(file) ? models : companions).push(file);
    }
    return companions.concat(models);
}
