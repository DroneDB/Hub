/**
 * The Hub has one blue. The PrimeVue preset takes its primary scale from the palette
 * (libs/palette.spec.js holds the stylesheets equal to it), "info" is that same blue in every
 * PrimeVue component that has it, and no stylesheet or component names a blue of its own.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PRIMARY } from '@/libs/palette';
import { primeVueOptions } from './theme';

const WEBAPP = path.resolve(__dirname, '..');
const preset = primeVueOptions.theme.preset;

describe('the brand blue', () => {
    it('is the PrimeVue primary scale and the primary colours', () => {
        expect(preset.semantic.primary).toEqual(PRIMARY);
        const light = preset.semantic.colorScheme.light;
        expect(light.primary.color).toBe(PRIMARY[500]);
        expect(light.primary.hoverColor).toBe(PRIMARY[600]);
        expect(light.primary.activeColor).toBe(PRIMARY[700]);
        expect(light.highlight.background).toBe(PRIMARY[50]);
    });
});

describe('severity info', () => {
    const light = name => preset.components[name].colorScheme.light;

    it('is the primary solid on buttons, tags and badges', () => {
        const info = light('button').root.info;
        expect(info.background).toBe('{primary.color}');
        expect(info.hoverBackground).toBe('{primary.hover.color}');
        expect(info.activeBackground).toBe('{primary.active.color}');
        expect(light('tag').info.background).toBe('{primary.color}');
        expect(light('badge').info.background).toBe('{primary.color}');
    });

    it('is a primary tint with primary.700 text on messages, inline messages and toasts', () => {
        for (const name of ['message', 'inlinemessage', 'toast']) {
            const info = light(name).info;
            expect(info.background).toContain('{primary.50}');
            expect(info.color).toBe('{primary.700}');
        }
    });

    it('names no other blue in the components it changes', () => {
        const info = JSON.stringify([
            light('button').root.info, light('button').outlined.info, light('button').text.info,
            ...['tag', 'badge', 'message', 'inlinemessage', 'toast'].map(name => light(name).info)
        ]);
        expect(info).not.toMatch(/\{(blue|sky|cyan)\./);
    });
});

// The app's own sources (no specs): what the guards below read
const sources = [];
const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(vue|js|scss|css)$/.test(entry.name) && !/\.(spec|test)\.js$/.test(entry.name)) sources.push(full);
    }
};
walk(path.join(WEBAPP, 'js'));
walk(path.join(WEBAPP, 'css'));
/** The sources that match a pattern, relative to webapp/. @param {RegExp} pattern */
const sourcesMatching = pattern => sources.filter(file => pattern.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(WEBAPP, file));

describe('no blue of its own', () => {
    it.each([
        ['a PrimeVue blue, sky or cyan token', /--p-(blue|sky|cyan|indigo)-\d/],
        ['the removed cyan --ddb-info or --ddb-secondary', /var\(--ddb-(info|secondary)\)/],
        ['an info button (use the default severity)', /<Button[^>]*severity="info"/],
        ['an info confirm button (the default is primary)', /confirm-severity="info"/]
    ])('has no %s', (_label, pattern) => {
        expect(sourcesMatching(pattern)).toEqual([]);
    });
});

// Orange next to the danger red read as a second red: warnings are yellow (as Lara's warning
// messages and toasts are), and the controls of the Hub have no orange
describe('no orange', () => {
    const light = name => preset.components[name].colorScheme.light;

    it('no component of the light theme names an orange', () => {
        const orange = Object.keys(preset.components)
            .filter(name => /\{orange\./.test(JSON.stringify(preset.components[name].colorScheme?.light ?? {})));
        expect(orange).toEqual([]);
    });

    it('warn is yellow with dark text on buttons, tags and badges', () => {
        const button = light('button');
        expect(button.root.warn).toMatchObject({ background: '{yellow.400}', color: '{yellow.950}' });
        expect(button.outlined.warn.color).toBe('{yellow.800}');
        expect(button.text.warn.color).toBe('{yellow.800}');
        expect(light('tag').warn).toEqual({ background: '{yellow.400}', color: '{yellow.950}' });
        expect(light('badge').warn).toEqual({ background: '{yellow.400}', color: '{yellow.950}' });
    });

    it.each([
        ['a PrimeVue orange token', /--p-orange-\d/],
        ['the severity "warning", which PrimeVue does not know (it is "warn")', /severity="warning"/],
        ['the removed orange --ddb-build-pending', /--ddb-build-pending/]
    ])('has no %s', (_label, pattern) => {
        expect(sourcesMatching(pattern)).toEqual([]);
    });
});
