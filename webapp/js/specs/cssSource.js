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
