/**
 * Plan XI-04 local rule: the DroneDB build layout lives in libs/ddb/buildArtifacts.js.
 * Other files ask for an artifact by role (Entry.findArtifact / requireArtifact), so
 * when Registry starts reporting artifact URLs only that module changes.
 *
 * Reports a string or template literal that contains a known artifact path, and a
 * template literal that composes a `.../build/` URL, outside the owning modules.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const JS_ROOT = path.join('webapp', 'js') + path.sep;
/** The layout table of libs/ddb/buildArtifacts.js (one source for the app and this rule). */
const ARTIFACT_PATHS = Object.values(JSON.parse(readFileSync(
    new URL('../webapp/js/libs/ddb/buildArtifacts.json', import.meta.url), 'utf8')));
/** The layout table, and Entry.buildUrl (the build-file endpoint). */
const OWNERS = new Set(['libs/ddb/buildArtifacts.js', 'libs/ddb/buildArtifacts.json', 'libs/ddb/entry.js']);

export default {
    meta: {
        type: 'problem',
        docs: { description: 'Build artifact paths only in libs/ddb/buildArtifacts.js (plan XI-04)' },
        schema: [],
        messages: {
            path: "'{{path}}' is a DroneDB build path: ask for the artifact by role (ArtifactRole + Entry.findArtifact/requireArtifact).",
            url: 'Build-file URLs come from Entry.artifactUrl/findArtifact, not from string building.'
        }
    },
    create(context) {
        const file = context.filename;
        const idx = file.lastIndexOf(JS_ROOT);
        const rel = idx >= 0 ? file.slice(idx + JS_ROOT.length).split(path.sep).join('/') : file;
        if (OWNERS.has(rel) || /\.(spec|test)\./.test(file)) return {};

        /** @param {import('eslint').Rule.Node} node @param {string} text */
        const check = (node, text, isTemplate) => {
            const found = ARTIFACT_PATHS.find(p => text.includes(p));
            if (found) context.report({ node, messageId: 'path', data: { path: found } });
            else if (isTemplate && /\/build\/$/.test(text)) context.report({ node, messageId: 'url' });
        };
        return {
            Literal(node) {
                if (typeof node.value === 'string') check(node, node.value, false);
            },
            TemplateElement(node) {
                check(node, node.value.cooked ?? node.value.raw, true);
            }
        };
    }
};
