/**
 * Lint is gated on zero warnings, the guard rules exist, components can be mounted
 * with @vue/test-utils, build tools are dev-only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';

import { vueDiagnostics, compareWithBaseline } from '../../../scripts/lib/componentTypes.mjs';
import { LOCAL_DECODERS, checkLocalDecoders } from '../../../scripts/lib/localDecoders.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('lint and build guardrails', () => {
    it('lint fails on any warning instead of hiding warnings', () => {
        expect(pkg.scripts.lint).not.toMatch(/--quiet/);
        expect(pkg.scripts.lint).toMatch(/--max-warnings 0/);
    });

    it('guard rules exist for mixins, $parent, raw storage and raw fetch in components', async () => {
        const { GUARDS } = await import(path.join(ROOT, 'eslint-rules', 'guards.mjs'));
        expect(GUARDS.map(g => g.id)).toEqual(expect.arrayContaining(['mixins', '$parent', 'template-$parent', 'storage', 'network']));
    });

    it('build tools are devDependencies only', () => {
        const runtime = Object.keys(pkg.dependencies);
        for (const name of ['webpack', 'webpack-cli', 'babel-loader', '@babel/core', 'vue-loader', 'sass', 'sass-loader', 'css-loader']) {
            expect(runtime).not.toContain(name);
        }
        for (const name of ['spark-md5', 'jsdom', 'prettier']) {
            expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty(name);
        }
    });

    it('has a typecheck script and a jsconfig', () => {
        expect(pkg.scripts.typecheck).toMatch(/vue-tsc/);
        expect(fs.existsSync(path.join(ROOT, 'jsconfig.json'))).toBe(true);
    });

    it('mounts a component with @vue/test-utils', async () => {
        const { mount } = await import('@vue/test-utils');
        const { h } = await import('vue');
        const wrapper = mount({ props: { n: { type: Number, required: true } }, render() { return h('b', this.n); } }, { props: { n: 3 } });
        expect(wrapper.text()).toBe('3');
    });
});

// The guards, run by ESLint on source that breaks them: a rule that is configured but does not match is no guard
describe('guard rules reject what they name', () => {
    const GUARD_RULES = new Set(['no-restricted-syntax', 'no-restricted-properties', 'no-restricted-globals', 'vue/no-restricted-syntax']);
    const eslint = new ESLint({ cwd: ROOT });

    /** The guard messages ESLint gives a source: a component, or a composable when the file is .js. */
    async function guardsHit(code, file = 'webapp/js/features/sample/Sample.vue') {
        const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
        return result.messages.filter(m => GUARD_RULES.has(m.ruleId)).map(m => m.message);
    }
    const component = (script, template = '<div />') =>
        `<template>${template}</template>\n<script>\n${script}\n</script>\n`;

    it.each([
        ['an options mixin', 'export default { mixins: [a] };', /mixin/],
        ['a quoted mixins key', "export default { 'mixins': [a] };", /mixin/],
        ['defineComponent({ mixins })', "import { defineComponent } from 'vue';\nexport default defineComponent({ mixins: [a] });", /mixin/],
        ['defineComponent({ mixins }) kept in a constant', "import { defineComponent } from 'vue';\nconst C = defineComponent({ mixins: [a] });\nexport default C;", /mixin/],
        ['a global mixin', 'app.mixin({});\nexport default {};', /mixin/],
        ['this.$parent', 'export default { methods: { f() { return this.$parent.x; } } };', /\$parent/],
        ['localStorage', "export default { created() { localStorage.getItem('a'); } };", /localStorage/],
        ['sessionStorage', "export default { created() { sessionStorage.getItem('a'); } };", /sessionStorage/],
        ['window.localStorage', "export default { created() { window.localStorage.getItem('a'); } };", /localStorage/],
        ['globalThis.localStorage', "export default { created() { globalThis.localStorage.getItem('a'); } };", /localStorage/],
        ['self.sessionStorage', "export default { created() { self.sessionStorage.getItem('a'); } };", /sessionStorage/],
        ['fetch', "export default { created() { fetch('/x'); } };", /Registry client/],
        ['window.fetch', "export default { created() { window.fetch('/x'); } };", /Registry client/],
        ['globalThis.fetch', "export default { created() { globalThis.fetch('/x'); } };", /Registry client/],
        ['XMLHttpRequest', 'export default { created() { new XMLHttpRequest(); } };', /Registry client/]
    ])('in a component: %s', async (_name, script, message) => {
        expect(await guardsHit(component(script))).toEqual([expect.stringMatching(message)]);
    });

    it('rejects $parent in a template, in an expression and in an event handler', async () => {
        for (const template of ['<p>{{ $parent.x }}</p>', '<p :title="$parent.title" />', '<button @click="$parent.close()" />']) {
            expect(await guardsHit(component('export default {};', template))).toEqual([expect.stringMatching(/\$parent/)]);
        }
    });

    it('applies to the composables as well, but not to their specs', async () => {
        const code = "export const f = () => globalThis.localStorage.getItem('a');\n";
        expect(await guardsHit(code, 'webapp/js/composables/useSample.js')).toHaveLength(1);
        expect(await guardsHit(code, 'webapp/js/composables/useSample.spec.js')).toEqual([]);
    });

    it('lets a component that stays clear of them through', async () => {
        const code = component("import { ref } from 'vue';\nexport default { setup() { return { n: ref(0) }; } };", '<p>{{ n }}</p>');
        expect(await guardsHit(code)).toEqual([]);
    });
});

// Everything the Hub imports is declared, so a clean install builds it
describe('package.json declares what the Hub imports', () => {
    const JS = path.join(ROOT, 'webapp', 'js');
    const imported = new Set();
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); continue; }
            if (!/\.(js|vue)$/.test(e.name) || /\.(spec|test)\./.test(e.name)) continue;
            const text = fs.readFileSync(p, 'utf8');
            // `import x from 'p'`, `} from 'p'` of a multi-line import, `import 'p'` and `import('p')`
            const forms = [
                /^\s*(?:import|export)\b[^\n]*\bfrom\s+['"]([^'"]+)['"]/gm,
                /^\s*\}\s*from\s+['"]([^'"]+)['"]/gm,
                /^\s*import\s+['"]([^'"]+)['"]/gm,
                /\bimport\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]\s*\)/g
            ];
            for (const [, spec] of forms.flatMap(re => [...text.matchAll(re)])) {
                if (/^(\.|@\/|ddb$|node:)/.test(spec)) continue;
                imported.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
            }
        }
    })(JS);

    it('has a dependency entry for every package a component or script imports', () => {
        expect(imported.size).toBeGreaterThan(20);
        const declared = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
        expect([...imported].filter(name => !declared.has(name)).sort()).toEqual([]);
    });

    it('says which Node.js versions it needs, the ones its lint and test tools need', () => {
        expect(pkg.engines.node).toMatch(/20\.19/);
        const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
        expect(readme).toMatch(/Node\.js 20\.19/);
        expect(readme).not.toMatch(/openssl-legacy-provider|recurse-submodules/);
    });

    it('names the vendored libraries it ships in the notice', () => {
        const notice = fs.readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8');
        for (const name of ['Photo Sphere Viewer', 'uevent']) expect(notice).toContain(name);
    });
});

// Offline-first: the decoders are served by this server
describe('the build ships the decoders itself', () => {
    it('copies the Draco and basis decoders from three.js, and the files exist there', () => {
        const webpack = fs.readFileSync(path.join(ROOT, 'webpack.config.js'), 'utf8');
        const lines = webpack.split('\n');
        for (const d of LOCAL_DECODERS) {
            for (const file of d.files) {
                const line = lines.find(l => l.includes(`to: '${d.path}${file}'`));
                expect(line, `${d.path}${file}`).toBeDefined();
                const [, from] = /from: '([^']+)'/.exec(line);
                expect(from).toMatch(/^node_modules\/three\/examples\/jsm\/libs\//);
                expect(fs.existsSync(path.join(ROOT, from)), from).toBe(true);
            }
        }
    });

    describe('the build check', () => {
        const build = files => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-build-'));
            for (const [name, text] of Object.entries(files)) {
                fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
                fs.writeFileSync(path.join(dir, name), text);
            }
            return dir;
        };
        const DECODERS = Object.fromEntries(LOCAL_DECODERS.flatMap(d => d.files.map(f => [d.path + f, ''])));
        const PASSES = 'new Tiles3D({ dracoDecoderPath: "/wasm/draco/", ktx2DecoderPath: "/wasm/basis/" });';
        // What Giro3D keeps when it is given the paths: its defaults, in the source form and minified
        const DEFAULTS = 'o?.dracoDecoderPath??`https://unpkg.com/three@0.${r.REVISION}.0/examples/jsm/libs/draco/gltf/`;'
            + 'x??"https://unpkg.com/three@0."+r.REVISION+".0/examples/jsm/libs/basis/";';
        const check = files => {
            const dir = build(files);
            try { return checkLocalDecoders(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        };

        it('passes a build that ships the decoders and passes their paths', () => {
            expect(check({ ...DECODERS, 'main.js': PASSES, 'vendors.js': DEFAULTS })).toEqual([]);
        });

        it('fails on an unpkg.com request that is not a renderer default', () => {
            const problems = check({ ...DECODERS, 'main.js': PASSES + 'import("https://unpkg.com/some-lib/x.js");', 'vendors.js': DEFAULTS });
            expect(problems).toEqual([expect.stringMatching(/main\.js requests unpkg\.com/)]);
        });

        it('fails when the viewer stops passing the Draco path, so the default would be fetched', () => {
            const problems = check({ ...DECODERS, 'main.js': 'new Tiles3D({ ktx2DecoderPath: "/wasm/basis/" });', 'vendors.js': DEFAULTS });
            expect(problems).toEqual([expect.stringMatching(/\/wasm\/draco\/ to the renderer/)]);
        });

        it('fails when the decoder files are not copied', () => {
            const partial = { ...DECODERS };
            delete partial['wasm/draco/draco_decoder.wasm'];
            expect(check({ ...partial, 'main.js': PASSES })).toEqual([expect.stringMatching(/draco_decoder\.wasm is not in the build/)]);
        });
    });
});

// `npm run typecheck` checks no component: the components have their own ratchet
describe('the type check of the components', () => {
    const OUTPUT = [
        'webapp/js/features/a/A.vue(12,3): error TS2304: Cannot find name \'ref\'.',
        '  The type of \'x\' is not what was expected.',
        'webapp/js/libs/b.js(4,1): error TS2339: Property \'y\' does not exist on type \'Z\'.',
        'webapp/js/features/c/C.vue(7,9): error TS2339: Property \'q\' does not exist on type \'{}\'.',
        ''
    ].join('\n');

    it('counts the diagnostics of components only', () => {
        expect(vueDiagnostics(OUTPUT)).toEqual([
            expect.stringContaining('A.vue(12,3)'),
            expect.stringContaining('C.vue(7,9)')
        ]);
        expect(vueDiagnostics('')).toEqual([]);
    });

    it('fails on a new error and on a baseline that is higher than needed', () => {
        expect(compareWithBaseline(10, 10).ok).toBe(true);
        expect(compareWithBaseline(11, 10)).toMatchObject({ ok: false, message: expect.stringContaining('Fix the new ones') });
        expect(compareWithBaseline(9, 10)).toMatchObject({ ok: false, message: expect.stringContaining('--update') });
    });

    it('is configured: checkJs on, components only, a baseline and a script', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'jsconfig.components.json'), 'utf8'));
        expect(config.extends).toBe('./jsconfig.json');
        expect(config.compilerOptions.checkJs).toBe(true);
        expect(config.include).toEqual(['webapp/js/**/*.vue']);
        const { vueErrors } = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'componentTypesBaseline.json'), 'utf8'));
        expect(Number.isInteger(vueErrors) && vueErrors >= 0).toBe(true);
        expect(pkg.scripts['typecheck:components']).toMatch(/check_component_types/);
    });
});

// Comments and test titles say why in words: the ids of planning documents are not part of this repository
describe('planning ids in comments and test titles', () => {
    const eslint = new ESLint({ cwd: ROOT });
    // The ids are written in two halves so that this file does not hold one itself
    const REQUIREMENT = 'FR-' + 'XC' + '-13';
    const DECISION = 'D-' + '049';
    const ACCEPTANCE = 'AC-' + '031';
    const AREA = 'ORG-' + '06';
    const WORK_ITEM = 'U' + '405';
    const SECTION = '§' + '7.1';
    const ROADMAP = 'Drone' + 'DB-Roadmap/';

    // The files of the repository: git's list, or, in a copy without git (a container build), the files on disk
    // outside what is installed or built
    function repositoryFiles() {
        try {
            return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
        } catch {
            const skipped = new Set(['node_modules', 'build', 'coverage', '.git']);
            const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
                .filter(entry => !skipped.has(entry.name))
                .flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
            return walk('');
        }
    }

    async function planningIdsIn(code, file = 'webapp/js/libs/sample.js') {
        const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
        return result.messages.filter(m => m.ruleId === 'planning/no-planning-ids').map(m => m.message);
    }

    it.each([
        ['a line comment', `// The expired notice (${REQUIREMENT}) is shown once\nexport const a = 1;\n`, REQUIREMENT],
        ['a block comment', `/**\n * Case ignored, ${DECISION}.\n */\nexport const a = 1;\n`, DECISION],
        ['an acceptance id', `// At 390x844 (${ACCEPTANCE}) nothing scrolls\nexport const a = 1;\n`, ACCEPTANCE],
        ['an area code', `// Focus goes back (${AREA})\nexport const a = 1;\n`, AREA],
        ['a work item id', `// A narrow map (${WORK_ITEM}) hides it\nexport const a = 1;\n`, WORK_ITEM],
        ['a section mark', `// Answered as in ${SECTION}\nexport const a = 1;\n`, SECTION],
        ['a roadmap path', `// See ${ROADMAP}notes\nexport const a = 1;\n`, ROADMAP],
        ['a test title', `it('keeps the focus (${REQUIREMENT})', () => {});\n`, REQUIREMENT],
        ['a test title in a template literal', `describe(\`at \${width}: ${AREA}\`, () => {});\n`, AREA]
    ])('rejects %s', async (_name, code, id) => {
        const messages = await planningIdsIn(code, 'webapp/js/libs/sample.spec.js');
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(id);
    });

    it('rejects an id in a comment of a component template and of its script', async () => {
        const messages = await planningIdsIn(
            `<template><!-- ${REQUIREMENT} --><div /></template>\n<script>\n// ${DECISION}\nexport default {};\n</script>\n`,
            'webapp/js/features/sample/Sample.vue');
        expect(messages).toHaveLength(2);
    });

    it('accepts comments and titles that say why in words, and strings that only look like ids', async () => {
        const clean = [
            '// The expired notice is shown once, then dropped from the address',
            "it('keeps the focus on the opener when the dialog closes', () => {});",
            "const refs = ['A-1', 'B-12', 'ab-cd-12'];",
            "// UTF-8 and SHA-256 are not ids, nor is a D-1 pile ref or 'ORG-1'"
        ].join('\n');
        expect(await planningIdsIn(clean, 'webapp/js/libs/sample.spec.js')).toEqual([]);
    });

    it('rejects an id in the name of the file, in either case', async () => {
        const messages = await planningIdsIn('export const a = 1;\n', `webapp/js/features/map-viewer-${WORK_ITEM.toLowerCase()}.spec.js`);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('a file name');
        expect(await planningIdsIn('export const a = 1;\n', 'webapp/js/features/map-viewer.spec.js')).toEqual([]);
    });

    it('finds no id in the name of any file of the repository (images and documents too, which are not linted)', async () => {
        const { planningIdInFileName } = await import(path.join(ROOT, 'eslint-rules', 'no-planning-ids.mjs'));
        const tracked = repositoryFiles();
        expect(tracked.length).toBeGreaterThan(100);
        expect(tracked.filter(file => planningIdInFileName(file))).toEqual([]);
        // The check reads names as they are written
        for (const name of [`a-${WORK_ITEM.toLowerCase()}.png`, `${AREA.toLowerCase().replace('-', '_')}.md`, `${DECISION}.txt`])
            expect(planningIdInFileName(`docs/${name}`), name).not.toBeNull();
        for (const name of ['jquery-3.1.1.min.js', 'sha-256.js', 'h264.mp4', 'd3.v7.js', 'map-viewer.spec.js'])
            expect(planningIdInFileName(name), name).toBeNull();
    });

    it('is on for the sources of the Hub', async () => {
        for (const file of ['webapp/js/libs/a.js', 'webapp/js/features/a/A.vue', 'e2e/a.test.mjs', 'scripts/a.mjs']) {
            expect(await eslint.calculateConfigForFile(path.join(ROOT, file)))
                .toMatchObject({ rules: { 'planning/no-planning-ids': [2] } });
        }
    });
});
