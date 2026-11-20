/**
 * Vitest setup file - runs before each test (happy-dom environment).
 * Defines the globals webpack's DefinePlugin sets at build time.
 */
import fs from 'node:fs';
import path from 'node:path';

// __APP_PRODUCTION__ (webpack DefinePlugin)
globalThis.__APP_PRODUCTION__ = true;

// __HUB_VERSION__ (webpack DefinePlugin, from package.json)
globalThis.__HUB_VERSION__ = '2.7.0';

// The colour tokens of the light theme (css/_variables.scss :root), on <html> as the stylesheets
// put them: canvas code reads them through colorToken (libs/colorScheme.js)
if (typeof document !== 'undefined') {
    const variables = fs.readFileSync(path.resolve(__dirname, 'webapp/css/_variables.scss'), 'utf8');
    const start = variables.indexOf(':root {');
    const block = variables.slice(start, variables.indexOf('\n}', start));
    for (const [, name, value] of block.matchAll(/^\s*(--ddb-[\w-]+):\s*([^;]+);/gm)) {
        document.documentElement.style.setProperty(name, value.trim());
    }
}
