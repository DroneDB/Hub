/**
 * The Hub has one blue. The PrimeVue preset takes its primary scale from the palette
 * (libs/palette.spec.js holds the stylesheets equal to it), "info" is that same blue in every
 * PrimeVue component that has it, and no stylesheet or component names a blue of its own.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FOCUS_RING, PRIMARY } from '@/libs/palette';
import { DARK_CLASS } from '@/libs/colorScheme';
import { primeVueOptions } from './theme';
import { readSource, ruleOf } from '@/specs/cssSource';

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

// FR-XC-21: every colour block of the preset has its dark block, which applies under the class
// libs/colorScheme.js puts on <html>
describe('two schemes', () => {
    it('applies the dark scheme under the dark class, not the media query', () => {
        expect(primeVueOptions.theme.options.darkModeSelector).toBe(`.${DARK_CLASS}`);
        expect(DARK_CLASS).toBe('app-dark');
    });

    it('has a dark block next to every light block, with the same parts', () => {
        const blocks = { semantic: preset.semantic.colorScheme };
        for (const [name, component] of Object.entries(preset.components)) {
            if (component.colorScheme) blocks[name] = component.colorScheme;
        }
        for (const [name, scheme] of Object.entries(blocks)) {
            expect(Object.keys(scheme.dark ?? {}), name).toEqual(expect.arrayContaining(Object.keys(scheme.light)));
        }
    });

    it('the dark primary is shade 400 with dark text, as in the dark scheme of Lara', () => {
        const dark = preset.semantic.colorScheme.dark;
        expect(dark.primary.color).toBe(PRIMARY[400]);
        expect(dark.primary.contrastColor).toBe('{surface.950}');
    });
});

// FR-NAV-05: one ring for every component, from the token set of libs/palette.js (the stylesheets
// keep a copy that libs/palette.spec.js holds equal); Lara's light halo of each component is gone
describe('the focus ring', () => {
    it('is FOCUS_RING: 2px solid, 2px out, primary.700 (primary.300 in the dark scheme), no shadow', () => {
        expect(preset.semantic.focusRing).toMatchObject({ width: FOCUS_RING.width, style: 'solid', offset: FOCUS_RING.offset });
        expect(FOCUS_RING).toMatchObject({ width: '2px', offset: '2px' });
        expect(preset.semantic.colorScheme.light.focusRing).toEqual({ color: PRIMARY[700], shadow: 'none' });
        expect(preset.semantic.colorScheme.dark.focusRing).toEqual({ color: PRIMARY[300], shadow: 'none' });
        expect(FOCUS_RING.light.color).toBe(PRIMARY[700]);
        expect(FOCUS_RING.dark.color).toBe(PRIMARY[300]);
    });

    /** Every focusRing object in the components, with its path. */
    const rings = () => {
        const found = [];
        const walk = (node, at) => {
            if (!node || typeof node !== 'object') return;
            for (const [key, value] of Object.entries(node)) {
                if (key === 'focusRing') found.push([at.join('.'), value]);
                else walk(value, [...at, key]);
            }
        };
        walk(preset.components, []);
        return found;
    };

    it('is the one ring of every component: its colour, and no halo of its own', () => {
        const own = rings().filter(([, ring]) =>
            ('color' in ring && !/^\{(form\.field\.)?focus\.ring\.color\}$/.test(ring.color))
            || ('shadow' in ring && ring.shadow !== 'none' && !/^(inset )?\{(form\.field\.)?focus\.ring\.shadow\}$/.test(ring.shadow)));
        expect(own).toEqual([]);
        expect(rings().length).toBeGreaterThan(50);
    });

    it('goes inside the edge of the rows, tabs and headers that Lara rings with an inset shadow', () => {
        const inset = rings().filter(([, ring]) => /^inset /.test(ring.shadow ?? ''));
        expect(inset.length).toBeGreaterThan(5);
        for (const [at, ring] of inset) expect(ring.offset, at).toBe(`-${FOCUS_RING.width}`);
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

// An outlined secondary button sits next to fields and select buttons (the toolbars of the lists):
// it has their border, and text dark enough not to read as disabled
describe('outlined secondary buttons', () => {
    it('have the border of a form field and dark text', () => {
        const secondary = preset.components.button.colorScheme.light.outlined.secondary;
        expect(secondary.borderColor).toBe('{surface.300}');
        expect(secondary.color).toBe('{surface.700}');
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
    // '/' on every platform: the names below are written with it
    .map(file => path.relative(WEBAPP, file).split(path.sep).join('/'));

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

    it.each(['light', 'dark'])('no component of the %s theme names an orange', scheme => {
        const orange = Object.keys(preset.components)
            .filter(name => /\{orange\./.test(JSON.stringify(preset.components[name].colorScheme?.[scheme] ?? {})));
        expect(orange).toEqual([]);
    });

    // FR-VWR-06: Lara's yellow.600 text on its tint is 2.8:1; the warning text token passes in both themes
    it.each(['light', 'dark'])('a warning message, inline message and toast is the warning text token in the %s theme', scheme => {
        const of = name => preset.components[name].colorScheme[scheme].warn;
        expect(of('message')).toMatchObject({
            color: 'var(--ddb-warning-text)',
            outlined: { color: 'var(--ddb-warning-text)', borderColor: 'var(--ddb-warning-text)' },
            simple: { color: 'var(--ddb-warning-text)' }
        });
        expect(of('inlinemessage').color).toBe('var(--ddb-warning-text)');
        expect(of('toast').color).toBe('var(--ddb-warning-text)');
    });

    it('names no yellow shade as warning text on a page or a tint (yellow.950 is the text on the yellow fill)', () => {
        const text = JSON.stringify(['light', 'dark'].flatMap(scheme => [
            ...['message', 'inlinemessage', 'toast'].map(name => preset.components[name].colorScheme[scheme].warn),
            preset.components.button.colorScheme[scheme].outlined.warn, preset.components.button.colorScheme[scheme].text.warn
        ]));
        expect(text).not.toMatch(/"color":"\{yellow\.\d+\}"/);
    });

    it('warn is yellow with dark text on buttons, tags and badges', () => {
        const button = light('button');
        expect(button.root.warn).toMatchObject({ background: '{yellow.400}', color: '{yellow.950}' });
        // Text in a warning colour is the one warning text token, with its light and dark values
        expect(button.outlined.warn.color).toBe('var(--ddb-warning-text)');
        expect(button.text.warn.color).toBe('var(--ddb-warning-text)');
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

    it('draws no map overlay in the orange of the earlier analysis overlays', () => {
        // analysisStyles.js names it once, to give the overlays saved in it today's yellow
        expect(sourcesMatching(/#ff(9800|5722)\b/i).filter(file => !file.startsWith('css/')))
            .toEqual(['js/libs/map/analysisStyles.js']);
    });
});

// The Hub loads Bootstrap's utilities (w-100), not those of PrimeFlex or Tailwind: a class of theirs styles nothing,
// so a list in a table cell or a form field stays at its content's width
describe('utility classes', () => {
    it('names no w-full, which the Hub does not load (Bootstrap\'s w-100 is)', () => {
        expect(sourcesMatching(/\bw-full\b/)).toEqual([]);
    });
});

describe('tab lists', () => {
    it('bring a tab into view clear of the Previous and Next arrows that lie over their edges', () => {
        const viewport = ruleOf(readSource(WEBAPP, 'css/app.scss'), '.p-tablist-viewport');
        expect(viewport).toMatch(/scroll-padding-inline:\s*var\(--p-tabs-nav-button-width\);/);
    });
});
