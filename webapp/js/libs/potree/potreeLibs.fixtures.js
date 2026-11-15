/**
 * The real Potree with its libraries, loaded into the test window in the order of POTREE_RESOURCES
 * (the scripts are the vendored files the Hub serves), for tests that need what Potree builds from
 * a title or a name. Call it once per test file: the scripts define globals ($, THREE, Potree).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POTREE_RESOURCES } from './potreeResources';

// What the viewer needs to build a label: no CSS, no module scripts that need a browser worker
const SCRIPTS = POTREE_RESOURCES.filter(url => url.endsWith('.js') && !url.includes('/copc/') && !url.includes('/plasio/') && !url.includes('/spectrum/'));

export function loadPotree() {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public');
    for (const url of SCRIPTS) (0, eval)(fs.readFileSync(path.join(root, url), 'utf8'));
    return window.Potree;
}
