/**
 * Vitest setup file - runs before each test (happy-dom environment).
 * Defines the globals webpack's DefinePlugin sets at build time.
 */
import fs from 'node:fs';
import path from 'node:path';

// __APP_PRODUCTION__ (webpack DefinePlugin)
globalThis.__APP_PRODUCTION__ = true;

// __HUB_VERSION__ (webpack DefinePlugin, from package.json)
globalThis.__HUB_VERSION__ = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

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

// The name of a node as a browser gives it through the getter of Node.prototype. happy-dom answers nodeName from the
// class of each node (Element, Text, Comment...) and its getter on Node.prototype answers '', while DOMPurify reads
// that getter: it would see no tag name, remove every allowed element and keep only its text. The getter of
// Node.prototype answers here what the node's own class does, as in a browser.
if (typeof Node !== 'undefined') {
    const ownNodeName = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeName');
    if (ownNodeName?.get && ownNodeName.configurable) {
        Object.defineProperty(Node.prototype, 'nodeName', {
            configurable: true,
            get() {
                for (let proto = Object.getPrototypeOf(this); proto && proto !== Node.prototype; proto = Object.getPrototypeOf(proto)) {
                    const getter = Object.getOwnPropertyDescriptor(proto, 'nodeName')?.get;
                    if (getter) return getter.call(this);
                }
                return ownNodeName.get.call(this);
            }
        });
    }
}
