/**
 * HQ-01 acceptance: lint is gated on zero warnings, the guard rules exist,
 * components can be mounted with @vue/test-utils, build tools are dev-only.
 * Fails today: `npm run lint` uses --quiet, no guard rules, no @vue/test-utils.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const eslintConfig = fs.readFileSync(path.join(ROOT, 'eslint.config.mjs'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'eslint-rules', 'guards.mjs'), 'utf8');

describe('HQ-01 guardrails', () => {
    it('lint fails on any warning instead of hiding warnings', () => {
        expect(pkg.scripts.lint).not.toMatch(/--quiet/);
        expect(pkg.scripts.lint).toMatch(/--max-warnings 0/);
    });

    it('guard rules block mixins, $parent, raw storage and raw fetch in components', async () => {
        const { GUARDS } = await import(path.join(ROOT, 'eslint-rules', 'guards.mjs'));
        expect(GUARDS.map(g => g.id)).toEqual(expect.arrayContaining(['mixins', '$parent', 'storage', 'network']));
        expect(eslintConfig).toMatch(/no-restricted-syntax/);
        expect(eslintConfig).toMatch(/mixins/);
        expect(eslintConfig).toMatch(/\$parent/);
        expect(eslintConfig).toMatch(/localStorage/);
        expect(eslintConfig).toMatch(/fetch/);
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
