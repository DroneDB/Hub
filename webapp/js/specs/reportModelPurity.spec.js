/**
 * The report model is pure: the live report page and the PDF renderer build the same sections from
 * it, and the PDF renderer has no map and may have no DOM. So no file of the model, nor any file it
 * imports however indirectly, may import OpenLayers or touch `window` or `document`.
 *
 * The check parses the source (with the parser of ESLint, so a comment, a string or a local variable
 * named `document` does not count): from each model file it follows every static and dynamic import
 * of a file of the Hub, and fails on an import of `ol` (or `ol/...`) and on a use of the global
 * `window` or `document`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';

const JS = path.resolve(__dirname, '..');
const REPORTS = path.join(JS, 'libs/reports');

/**
 * The files of the model. reportSettings is not one: it is the client of the settings endpoints,
 * and the model takes the defaults from reportDefaults instead.
 */
const MODEL_FILES = [
    'reportModel', 'reportKinds', 'reportItems', 'reportTotals', 'reportTables', 'reportSections',
    'reportFrames', 'reportSources', 'reportDefinition', 'reportStore', 'reportDefaults'
].map((name) => path.join(REPORTS, `${name}.js`));

const DOM_GLOBALS = ['window', 'document'];

/**
 * What a source imports and which of `window` and `document` it uses as globals.
 * @param {string} source
 * @returns {{ imports: string[], problems: string[] }}
 */
function readSource(source) {
    /** @type {string[]} */
    const imports = [];
    /** @type {string[]} */
    const problems = [];
    const collect = {
        create: () => {
            const add = (/** @type {any} */ node) => {
                if (!node.source) return;
                if (node.source.type === 'Literal') imports.push(node.source.value);
                else problems.push(`imports a computed path at line ${node.loc.start.line}`);
            };
            return { ImportDeclaration: add, ExportNamedDeclaration: add, ExportAllDeclaration: add, ImportExpression: add };
        }
    };
    const messages = new Linter().verify(source, [{
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: Object.fromEntries(DOM_GLOBALS.map((g) => [g, 'readonly']))
        },
        plugins: { purity: { rules: { imports: collect } } },
        rules: {
            'purity/imports': 'error',
            'no-restricted-globals': ['error', ...DOM_GLOBALS],
            'no-restricted-properties': ['error', ...DOM_GLOBALS.map((property) => ({ object: 'globalThis', property }))]
        }
    }]);
    for (const m of messages) {
        if (m.fatal) problems.push(`cannot be parsed: ${m.message}`);
        // 'window' or 'globalThis.window': the name of the global
        else problems.push(`uses ${m.message.match(/'(?:globalThis\.)?([^']+)'/)?.[1] ?? m.message} at line ${m.line}`);
    }
    return { imports, problems };
}

/** @param {string} specifier */
const isOpenLayers = (specifier) => specifier === 'ol' || specifier.startsWith('ol/');

/**
 * The file of the Hub a specifier names (through the aliases of the build), null for a package.
 * @param {string} specifier
 * @param {string} from  the importing file
 * @returns {string | null}
 */
function resolve(specifier, from) {
    let base;
    if (specifier.startsWith('@/')) base = path.join(JS, specifier.slice(2));
    else if (specifier === 'ddb' || specifier.startsWith('ddb/')) base = path.join(JS, 'libs', specifier);
    else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
    else return null;
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.vue`, `${base}.json`, path.join(base, 'index.js')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    throw new Error(`${path.relative(JS, from)} imports ${specifier}, which is no file`);
}

/**
 * Every file the entries import, however indirectly (the entries included), and what each breaks,
 * with the chain of imports that reaches it.
 * @param {string[]} entries
 * @returns {{ files: string[], problems: string[] }}
 */
function walk(entries) {
    /** @type {Map<string, string | null>} file -> the file that first imported it */
    const parents = new Map(entries.map((f) => [f, null]));
    const problems = [];
    const queue = [...entries];
    const name = (/** @type {string} */ f) => path.relative(JS, f);
    const chainOf = (/** @type {string} */ f) => {
        const chain = [];
        for (let at = /** @type {string | null | undefined} */ (f); at; at = parents.get(at)) chain.unshift(path.basename(at));
        return chain.join(' > ');
    };
    while (queue.length > 0) {
        const file = /** @type {string} */ (queue.shift());
        const report = (/** @type {string} */ what) => problems.push(`${name(file)} ${what} (${chainOf(file)})`);
        if (!/\.m?js$/.test(file)) {
            if (!file.endsWith('.json')) report('is not a JavaScript module');
            continue;
        }
        const { imports, problems: own } = readSource(fs.readFileSync(file, 'utf8'));
        own.forEach(report);
        for (const specifier of imports) {
            if (isOpenLayers(specifier)) report(`imports ${specifier}`);
            const target = resolve(specifier, file);
            if (target && !parents.has(target)) {
                parents.set(target, file);
                queue.push(target);
            }
        }
    }
    return { files: [...parents.keys()], problems };
}

describe('the report model is free of OpenLayers and of the DOM', () => {
    it('finds the model files', () => {
        for (const file of MODEL_FILES) expect(fs.existsSync(file), path.relative(JS, file)).toBe(true);
    });

    it('imports no OpenLayers and uses no window or document, however indirectly', () => {
        const { files, problems } = walk(MODEL_FILES);
        expect(files.length).toBeGreaterThan(MODEL_FILES.length);
        expect(problems).toEqual([]);
    });

    it('would see an OpenLayers import a few files away (the map measuring module has one)', () => {
        const { problems } = walk([path.join(JS, 'libs/map/olMeasurementConverter.js')]);
        expect(problems.some((p) => p.startsWith('libs/map/geodesic.js imports ol/proj'))).toBe(true);
    });
});

describe('the source reading of the check', () => {
    it('reads static, re-exported, side-effect and dynamic imports, over several lines', () => {
        const { imports } = readSource([
            "import a from 'ol/proj';",
            'import {',
            '    b,',
            '    c',
            "} from '@/libs/format';",
            "export { d } from './d';",
            "export * from './e';",
            "import './side';",
            "const f = await import('ol');"
        ].join('\n'));
        expect(imports).toEqual(['ol/proj', '@/libs/format', './d', './e', './side', 'ol']);
    });

    it('does not count comments, strings, regular expressions, properties and local variables', () => {
        const { imports, problems } = readSource([
            "// import x from 'ol/proj'; window.open()",
            "/* document.body; import('ol') */",
            "/** @type {import('ol/Map').default} */",
            "const s = 'the document window';",
            'const u = `a document`;',
            "const r = /window|document'/g;",
            'const o = { x: options.document, y: self.window };',
            'export function read(document) { return document.features; }',
            'export function write() { const window = 3; return window; }'
        ].join('\n'));
        expect(imports).toEqual([]);
        expect(problems).toEqual([]);
    });

    it('counts the global window and document, also in typeof, globalThis and a template', () => {
        const { problems } = readSource([
            'const w = window.innerWidth;',
            'const d = globalThis.document;',
            'const t = `size ${document.body.clientWidth} px`;',
            "if (typeof window !== 'undefined') { w; }"
        ].join('\n'));
        expect(problems.map((p) => p.replace(/ at line \d+$/, ''))).toEqual([
            'uses window', 'uses document', 'uses document', 'uses window'
        ]);
    });
});
