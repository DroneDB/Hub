/**
 * The real Potree with its libraries, loaded into the test window in the order of POTREE_RESOURCES
 * (the scripts are the vendored files the Hub serves), for tests that need what Potree builds from
 * a title or a name, or how it reads a COPC file (`{ copc: true }` adds copc.js, window.Copc).
 * `{ internals: ['InputHandler'] }` also puts classes of the bundle that it does not export on window.Potree
 * (the viewer makes its input handler itself, and a test without WebGL has no viewer to take it from).
 * Call it once per test file: the scripts define globals ($, THREE, Potree).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POTREE_RESOURCES, POTREE_BASE } from './potreeResources';

// What the viewer needs to build a label: no CSS, no module scripts that need a browser worker
const SCRIPTS = POTREE_RESOURCES.filter(url => url.endsWith('.js') && !url.includes('/plasio/') && !url.includes('/spectrum/'));

// Where the bundle of Potree ends its exports
const EXPORTS_END = "Object.defineProperty(exports, '__esModule'";

/** The bundle with `exports.<name> = <name>` for each of the internals, before the end of its exports. */
function exposing(source, internals) {
    if (!internals.length) return source;
    const at = source.lastIndexOf(EXPORTS_END);
    if (at < 0) throw new Error('The end of the exports of potree.js is not where it was: the internals cannot be exposed');
    return source.slice(0, at) + internals.map(name => `exports.${name} = ${name};\n`).join('') + source.slice(at);
}

export function loadPotree({ copc = false, internals = [] } = {}) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public');
    for (const url of SCRIPTS) {
        if (!copc && url.includes('/copc/')) continue;
        const source = fs.readFileSync(path.join(root, url), 'utf8');
        (0, eval)(url === `${POTREE_BASE}/potree.js` ? exposing(source, internals) : source);
    }
    return window.Potree;
}
