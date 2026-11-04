/**
 * The layout is CSS, and the tests have no layout engine: the specs that guard a layout read the
 * rules from the source of a stylesheet or a component.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The text of a file, by a path relative to `dir` (the `__dirname` of the spec). @param {string} dir @param {string} file */
export const readSource = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');

/**
 * The declarations of the first rule written `selector {` (up to its closing brace), '' when there is none.
 * @param {string} source @param {string} selector
 */
export const ruleOf = (source, selector) => {
    const start = source.indexOf(`${selector} {`);
    return start < 0 ? '' : source.slice(start, source.indexOf('}', start));
};

/**
 * The text inside the first `@media (query) { ... }` block (its nested braces balanced), '' when there is none;
 * `ruleOf` reads the rules of a media query from it.
 * @param {string} source @param {string} query the condition as written, e.g. 'max-width: 767.98px'
 */
export const mediaBlock = (source, query) => {
    const start = source.indexOf(`@media (${query}) {`);
    if (start < 0) return '';
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
    }
    return '';
};
