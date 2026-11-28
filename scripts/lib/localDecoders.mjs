/**
 * Checks of a build folder for the decoders the Hub serves itself (offline-first).
 * Shared by scripts/check_bundle_budget.mjs and its spec.
 *
 * Giro3D's Tiles3D falls back to unpkg.com addresses for the Draco and basis decoders when
 * it is not given a path. Those two default strings stay in the bundle even though the Hub
 * always passes its own paths, so they are the only unpkg.com text allowed; any other
 * address, or a Hub that stops passing the paths, fails here.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The default decoder addresses of Giro3D's Tiles3D (the revision is a template expression or a concatenation). */
const RENDERER_DEFAULT = /unpkg\.com\/three@[\s\S]{0,80}?\/examples\/jsm\/libs\/(?:draco\/gltf|basis)\//g;

/** The decoders webpack copies next to the page, and the path the viewer passes for them. */
export const LOCAL_DECODERS = [
    { path: 'wasm/draco/', files: ['draco_wasm_wrapper.js', 'draco_decoder.wasm'] },
    { path: 'wasm/basis/', files: ['basis_transcoder.js', 'basis_transcoder.wasm'] }
];

function* sources(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* sources(p);
        else if (/\.(js|mjs|css|html)$/.test(e.name)) yield p;
    }
}

/**
 * @param {string} outDir the webpack output folder
 * @returns {string[]} what is wrong (empty when the build is clean)
 */
export function checkLocalDecoders(outDir) {
    const problems = [];
    for (const d of LOCAL_DECODERS)
        for (const f of d.files)
            if (!fs.existsSync(path.join(outDir, d.path, f))) problems.push(`${d.path}${f} is not in the build (the copy plugin no longer ships it)`);

    const passed = new Set();
    for (const file of sources(outDir)) {
        const text = fs.readFileSync(file, 'utf8');
        const rest = text.replace(RENDERER_DEFAULT, '');
        const at = rest.indexOf('unpkg.com');
        if (at >= 0) problems.push(`${path.relative(outDir, file)} requests unpkg.com: ...${rest.slice(Math.max(0, at - 40), at + 60).replace(/\s+/g, ' ')}...`);
        for (const d of LOCAL_DECODERS) if (text.includes('/' + d.path)) passed.add(d.path);
    }
    for (const d of LOCAL_DECODERS)
        if (!passed.has(d.path)) problems.push(`no emitted script passes /${d.path} to the renderer, so its default unpkg.com address would be used`);
    return problems;
}
