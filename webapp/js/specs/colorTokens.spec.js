/**
 * The colour tokens in both themes (FR-XC-21, AC-030, WCAG 2.2 AA): every colour of
 * css/_variables.scss has a dark value, and the pairs the Hub draws pass their contrast ratio:
 * 4.5:1 for text, 3:1 for the focus ring and other parts of a control (WCAG 1.4.3, 1.4.11).
 * The ratios are computed here from the tokens, as axe computes them.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readSource, ruleOf } from './cssSource';
import { primeVueOptions } from '@/theme';

const variables = readSource(path.resolve(__dirname, '../../css'), '_variables.scss');
const preset = primeVueOptions.theme.preset;

/** The declarations of a block, by its selector, as name -> value. @param {string} selector */
function declarations(selector) {
    const start = variables.indexOf(`${selector} {`);
    const body = variables.slice(start, variables.indexOf('\n}', start));
    const tokens = new Map();
    for (const [, name, value] of body.matchAll(/^\s*(--ddb-[\w-]+):\s*([^;]+);/gm)) tokens.set(name, value.trim());
    return tokens;
}
const LIGHT = declarations(':root');
const DARK = new Map([...LIGHT, ...declarations(':root.app-dark')]);
const THEMES = /** @type {const} */ ([['light', LIGHT], ['dark', DARK]]);

// ---- Colours: parse, mix and measure ----

/** @typedef {[number, number, number, number]} Rgba  0-255 channels and an alpha 0-1 */

/** @param {string} hex @returns {Rgba} */
function fromHex(hex) {
    const h = hex.length === 4 ? [...hex.slice(1)].map(c => c + c).join('') : hex.slice(1);
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1);
}

/** `a` drawn over the opaque `b`. @param {Rgba} a @param {Rgba} b @returns {Rgba} */
const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);

/**
 * A colour value of the tokens or of the PrimeVue preset, resolved in a theme.
 * @param {string} value
 * @param {Map<string, string>} tokens
 * @param {'light'|'dark'} scheme
 * @returns {Rgba}
 */
function colour(value, tokens, scheme) {
    const v = value.trim();
    const ref = v.match(/^var\((--ddb-[\w-]+)\)$/);
    if (ref) return colour(tokens.get(ref[1]), tokens, scheme);
    const token = v.match(/^\{([a-z]+)\.(\d+)\}$/);
    if (token) {
        const [, hue, shade] = token;
        if (hue === 'primary') return fromHex(preset.semantic.primary[shade]);
        if (hue === 'surface') return colour(preset.semantic.colorScheme[scheme].surface?.[shade] ?? surface(scheme, shade), tokens, scheme);
        return fromHex(preset.primitive[hue][shade]);
    }
    if (v.startsWith('#')) return fromHex(v);
    const rgba = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] === undefined ? 1 : +rgba[4]];
    if (v === 'transparent') return [0, 0, 0, 0];
    // color-mix(in srgb, A[ p%], B[ q%]): the share of B is q%, or what A leaves
    const mix = v.match(/^color-mix\(in srgb,\s*(.+?)(?:\s+([\d.]+)%)?,\s*(.+?)(?:\s+([\d.]+)%)?\)$/);
    if (mix) {
        const a = colour(mix[1], tokens, scheme);
        const b = colour(mix[3], tokens, scheme);
        const share = mix[2] !== undefined ? +mix[2] / 100 : mix[4] !== undefined ? 1 - +mix[4] / 100 : 0.5;
        // Premultiplied, as CSS mixes colours with an alpha
        const alpha = a[3] * share + b[3] * (1 - share);
        if (alpha === 0) return [0, 0, 0, 0];
        return [0, 1, 2].map(i => (a[i] * a[3] * share + b[i] * b[3] * (1 - share)) / alpha).concat(alpha);
    }
    throw new Error(`Not a colour: ${v}`);
}

/** Lara's surfaces: slate in the light scheme, zinc in the dark one; surface.0 is white. */
function surface(scheme, shade) {
    if (shade === '0') return '#ffffff';
    return preset.primitive[scheme === 'light' ? 'slate' : 'zinc'][shade];
}

/** @param {Rgba} c */
const luminance = c => {
    const [r, g, b] = c.slice(0, 3).map(x => x / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio of `fg` on `bg` (both drawn over `under` when they are see-through). */
function ratio(fg, bg, under = /** @type {Rgba} */ ([255, 255, 255, 1])) {
    const back = over(bg, under);
    const [a, b] = [luminance(over(fg, back)), luminance(back)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
}

/** The contrast of two tokens (or colour values) in a theme. */
const tokenRatio = (fg, bg, tokens, scheme) => ratio(colour(`var(${fg})`.replace('var(#', '#'), tokens, scheme), colour(`var(${bg})`, tokens, scheme));

describe('the contrast helper', () => {
    it('measures as WCAG does', () => {
        expect(ratio(fromHex('#000000'), fromHex('#ffffff'))).toBeCloseTo(21, 5);
        expect(ratio(fromHex('#767676'), fromHex('#ffffff'))).toBeCloseTo(4.54, 2);
        expect(ratio(fromHex('#0070e0'), fromHex('#ffffff'))).toBeCloseTo(4.78, 2);
    });

    it('mixes as CSS does', () => {
        const mixed = colour('color-mix(in srgb, #ffffff, transparent 50%)', LIGHT, 'light');
        expect(mixed).toEqual([255, 255, 255, 0.5]);
        expect(colour('color-mix(in srgb, #000000 25%, #ffffff)', LIGHT, 'light').slice(0, 3).map(Math.round)).toEqual([191, 191, 191]);
    });
});

// ---- Every colour has a dark value ----

// The same in both themes (the brand scale, the map, the viewers and the panels over them), or
// written as another token, which follows it
const SAME_IN_BOTH = /^--ddb-(primary-(\d+|rgb)|text-on-dark|text-on-warning|console-|map-|measure-|tooltip-|overlay-|viewer-|focus-ring-on-dark|glass-rgb|shade-rgb|paper)/;
const IS_COLOUR = /#[0-9a-f]{3,8}\b|rgba?\(|color-mix\(|^\d+,\s*\d+,\s*\d+$/i;
const ONLY_TOKENS = /^(var\(--ddb-[\w-]+\)\s*)+$/;

describe('every colour', () => {
    it('has a dark value, unless it is the same in both themes or another token', () => {
        const dark = declarations(':root.app-dark');
        const missing = [...LIGHT].filter(([name, value]) => IS_COLOUR.test(value) && !ONLY_TOKENS.test(value)
            && !SAME_IN_BOTH.test(name) && !dark.has(name)).map(([name]) => name);
        expect(missing).toEqual([]);
    });

    it('of the dark block is a colour the light block has (no token of the dark theme alone)', () => {
        const extra = [...declarations(':root.app-dark').keys()].filter(name => !LIGHT.has(name));
        expect(extra).toEqual([]);
    });
});

// ---- The pairs ----

const TEXT = 4.5;
const UI = 3;

/** [foreground, background, minimum]: a pair of tokens the Hub draws, in both themes */
const PAIRS = [
    // The text of the page and of cards and dialogs
    ...['--ddb-bg', '--ddb-bg-surface', '--ddb-bg-light', '--ddb-bg-subtle', '--ddb-bg-hover'].map(bg => ['--ddb-text', bg, TEXT]),
    ...['--ddb-bg', '--ddb-bg-surface'].flatMap(bg => [
        ['--ddb-text-secondary', bg, TEXT], ['--ddb-text-muted', bg, TEXT], ['--ddb-link', bg, TEXT], ['--ddb-danger', bg, TEXT]
    ]),
    // FR-UPL-06: text in a warning colour, on the page and on its tint
    ['--ddb-warning-text', '--ddb-bg', TEXT],
    ['--ddb-warning-text', '--ddb-bg-surface', TEXT],
    ['--ddb-warning-text', '--ddb-warning-bg', TEXT],
    // Text on the fills of the theme
    ['--ddb-text-on-color', '--ddb-primary', TEXT],
    ['--ddb-text-on-color', '--ddb-danger', TEXT],
    ['--ddb-text-on-warning', '--ddb-warning', TEXT],
    ['--ddb-link-on-tint', '--ddb-info-bg', TEXT],
    // FR-NAV-05, FR-MAP-11: the focus ring on the page and on cards, and its halo
    ['--ddb-focus-ring-color', '--ddb-bg', UI],
    ['--ddb-focus-ring-color', '--ddb-bg-surface', UI],
    ['--ddb-focus-ring-color', '--ddb-focus-ring-halo', UI],
    // Text in the success colour (the fill --ddb-success is 3:1 on white)
    ['--ddb-success-text', '--ddb-bg', TEXT],
    ['--ddb-success-text', '--ddb-bg-surface', TEXT],
    ['--ddb-success-text', '--ddb-success-bg', TEXT],
    // The syntax colours of the text editor, on its dialog
    ...['meta', 'keyword', 'atom', 'literal', 'string', 'escape', 'property', 'variable', 'type', 'comment']
        .map(kind => [`--ddb-code-${kind}`, '--ddb-bg-surface', TEXT])
];

describe.each(THEMES)('the %s theme', (scheme, tokens) => {
    it.each(PAIRS)('%s on %s: %s:1 or more', (fg, bg, min) => {
        expect(tokenRatio(fg, bg, tokens, scheme)).toBeGreaterThanOrEqual(min);
    });

    // FR-VWR-06: the text of a message (and an inline message and a toast) on its tint, which is
    // drawn on a card or a dialog (Lara's content background)
    it.each(['info', 'success', 'warn', 'error'])('a %s message passes 4.5:1 on its tint', severity => {
        const content = colour(scheme === 'light' ? '{surface.0}' : '{surface.900}', tokens, scheme);
        for (const name of ['message', 'inlinemessage', 'toast']) {
            const { color, background } = preset.components[name].colorScheme[scheme][severity];
            const tint = over(colour(background, tokens, scheme), content);
            expect(ratio(colour(color, tokens, scheme), tint), `${name} ${severity}`).toBeGreaterThanOrEqual(TEXT);
        }
    });

    // The PrimeVue primary: text and links on a card, and the text of a primary button
    it('the PrimeVue primary passes 4.5:1 on a card, and its button text on it', () => {
        const semantic = preset.semantic.colorScheme[scheme].primary;
        const content = colour(scheme === 'light' ? '{surface.0}' : '{surface.900}', tokens, scheme);
        expect(ratio(colour(semantic.color, tokens, scheme), content)).toBeGreaterThanOrEqual(TEXT);
        expect(ratio(colour(semantic.contrastColor, tokens, scheme), colour(semantic.color, tokens, scheme))).toBeGreaterThanOrEqual(TEXT);
    });

    it('the PrimeVue focus ring is the ring of the tokens', () => {
        expect(colour(preset.semantic.colorScheme[scheme].focusRing.color, tokens, scheme))
            .toEqual(colour('var(--ddb-focus-ring-color)', tokens, scheme));
    });
});

describe('the surfaces that are dark in both themes', () => {
    it('take a ring of 3:1 or more (the map panels, rgb(20 20 20) under a phone sheet)', () => {
        expect(ratio(colour('var(--ddb-focus-ring-on-dark)', LIGHT, 'light'), fromHex('#141414'))).toBeGreaterThanOrEqual(UI);
        expect(ratio(colour('var(--ddb-focus-ring-on-dark)', LIGHT, 'light'), colour('var(--ddb-viewer-bg)', LIGHT, 'light'))).toBeGreaterThanOrEqual(UI);
    });

    // The viewers' toolbars and buttons: a shade over the viewer's background (the 3D scene)
    it.each([
        ['the viewer background', 'var(--ddb-viewer-bg)'],
        ['the viewer sidebar', 'var(--ddb-viewer-sidebar-bg)'],
        ['a toolbar', 'var(--ddb-viewer-toolbar-bg)'],
        ['an overlay button', 'rgba(var(--ddb-shade-rgb), 0.55)'],
        ['the map bottom panel', 'rgba(var(--ddb-shade-rgb), 0.6)']
    ])('take a ring of 3:1 or more on %s, in both themes, where the theme ring does not', (_label, surface) => {
        for (const [scheme, tokens] of THEMES) {
            const back = over(colour(surface.replace(/var\((--ddb-[\w-]+)\)/, (m, name) => (/-rgb$/.test(name) ? tokens.get(name) : m)), tokens, scheme),
                colour('var(--ddb-viewer-bg)', tokens, scheme));
            expect(ratio(colour('var(--ddb-focus-ring-on-dark)', tokens, scheme), back), scheme).toBeGreaterThanOrEqual(UI);
        }
        // The light theme's ring would not do there
        const back = over(colour('var(--ddb-viewer-toolbar-bg)', LIGHT, 'light'), colour('var(--ddb-viewer-bg)', LIGHT, 'light'));
        expect(ratio(colour('var(--ddb-focus-ring-color)', LIGHT, 'light'), back)).toBeLessThan(UI);
    });
});

// ---- The findings that FR-XC-21 closes draw with the tokens ----

describe('the findings drawn with the tokens', () => {
    const JS = path.resolve(__dirname, '..');
    const CSS = path.resolve(__dirname, '../../css');
    const RING = /outline:\s*var\(--ddb-focus-ring-width\)\s+solid\s+var\(--ddb-focus-ring-color\)/;

    it('FR-NAV-05: the focus-ring mixin is the token set, and app.scss gives it to every focusable element', () => {
        const mixin = readSource(CSS, '_focus-ring.scss');
        expect(mixin).toMatch(RING);
        expect(mixin).toMatch(/outline-offset:\s*var\(--ddb-focus-ring-offset\)/);
        expect(mixin).toMatch(/outline-offset:\s*calc\(-1 \* var\(--ddb-focus-ring-width\)\)/);
        const app = readSource(CSS, 'app.scss');
        expect(app).toMatch(/@use 'focus-ring' as \*;/);
        expect(app).toMatch(/:where\(:focus-visible\)\s*\{\s*@include focus-ring;/);
    });

    // WCAG 1.4.11: the light theme's ring is about 2:1 on the viewers' dark toolbars
    it('the viewers, the lightboxes, the map overlays and the overlay buttons take the ring of the dark surfaces', () => {
        const ON_DARK = /--ddb-focus-ring-color:\s*var\(--ddb-focus-ring-on-dark\);/;
        const app = readSource(CSS, 'app.scss');
        const rule = app.slice(app.indexOf('.viewer-shell.dark,'), app.indexOf('}', app.indexOf('.viewer-shell.dark,')));
        for (const surface of ['.viewer-shell.dark', '.video-lightbox-overlay', '.lightbox-toolbar-extra', '.split-overlay']) {
            expect(rule).toContain(surface);
        }
        expect(rule).toMatch(ON_DARK);
        const overlay = readSource(CSS, '_overlay-button.scss');
        expect(overlay.slice(overlay.indexOf('@mixin overlay-button'), overlay.indexOf('@mixin toolbar-button'))).toMatch(ON_DARK);
        expect(overlay).not.toMatch(/\$active-background:\s*var\(--ddb-primary\)/);
        expect(readSource(CSS, '_analysis-panel.scss')).toMatch(ON_DARK);
        expect(ruleOf(readSource(CSS, 'ol-controls.css'), '.map-bottom-panel')).toMatch(ON_DARK);
        // Every dark viewer is a dark ViewerShell
        for (const viewer of ['pointcloud/PotreeViewer.vue', 'splat/SplatViewer.vue', 'unified/UnifiedViewer.vue',
            'panorama/PanoramaViewer.vue', 'model/ModelViewerShell.vue']) {
            expect(readSource(JS, `features/viewers/${viewer}`), viewer).toMatch(/<ViewerShell[^>]*\sdark\s/);
        }
    });

    it('FR-ACC (tree): the folder tree takes the ring of the Hub, inside its edge', () => {
        const tree = readSource(JS, 'features/dataset/explorer/TreeView.vue');
        expect(tree).toMatch(/&:focus-visible\s*\{\s*@include focus-ring\(\$inset: true\);/);
    });

    it('FR-MAP-11: a map button takes the ring with its halo on keyboard focus, and none on mouse focus', () => {
        const ol = readSource(CSS, 'ol-controls.css');
        const ring = ruleOf(ol, '.ol-control button:focus-visible');
        expect(ring).toMatch(/outline:\s*var\(--ddb-focus-ring-width\)\s+solid\s+var\(--ddb-focus-ring-color\)\s*!important/);
        expect(ring).toMatch(/outline-offset:\s*var\(--ddb-focus-ring-offset\)\s*!important/);
        expect(ring).toMatch(/box-shadow:\s*0 0 0 var\(--ddb-focus-ring-offset\) var\(--ddb-focus-ring-halo\)/);
        expect(ol).toMatch(/\.ol-control button:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none !important;/);
    });

    it('FR-ORG-07: the list of organizations keeps the reach of the ring clear, and the card takes the ring of the tokens', () => {
        const page = readSource(JS, 'features/organizations/OrganizationsPage.vue');
        expect(ruleOf(page, '.org-cards-area')).toMatch(/padding:\s*var\(--ddb-focus-ring-reach\) var\(--ddb-focus-ring-reach\) 0;/);
        const card = ruleOf(page, '&:has(.org-name:focus-visible)');
        expect(card).toMatch(RING);
        expect(card).toMatch(/outline-offset:\s*var\(--ddb-focus-ring-offset\)/);
    });

    it.each([
        ['features/dataset/upload/DatasetUpload.vue', '.upload-result.has-errors'],
        ['features/dataset/TaskHistory.vue', '.duration.running'],
        ['features/tasks/TasksTable.vue', '.duration.running'],
        ['features/dataset/dialogs/PasteConflictDialog.vue', '.amber']
    ])('FR-UPL-06: %s writes %s in the warning text, not the warning fill', (file, selector) => {
        expect(ruleOf(readSource(JS, file), selector)).toMatch(/color:\s*var\(--ddb-warning-text\)/);
    });

    it('FR-ADM-15: a configuration section in its default state is not faded', () => {
        const config = readSource(JS, 'features/admin/AdminConfig.vue');
        expect(config).not.toMatch(/config-section-inactive|opacity:\s*0\.5|grayscale/);
        expect(ruleOf(config, '.config-section-custom')).toMatch(/border-left:[^;]*var\(--ddb-primary\)/);
    });

    it('FR-MAP-21: Map Settings has one label size and one select, and the panels one field', () => {
        const settings = readSource(JS, 'features/viewers/map/MapSettingsDialog.vue');
        expect(ruleOf(settings, '.setting-label')).not.toMatch(/font-size/);
        expect(ruleOf(settings, '.setting-select')).not.toMatch(/font-size/);
        expect(ruleOf(readSource(JS, 'features/viewers/map/CustomBasemapEditor.vue'), '.editor-label')).not.toMatch(/font-size/);
        const trigger = ruleOf(readSource(JS, 'features/viewers/map/ColormapDropdown.vue'), '.colormap-trigger');
        expect(trigger).toMatch(/background:\s*var\(--panel-field-bg\)/);
        expect(trigger).toMatch(/border:\s*1px solid var\(--panel-field-border\)/);
        // The panels' fields keep the ring of the Hub (no outline: none on focus)
        const panels = readSource(CSS, '_analysis-panel.scss');
        const start = panels.indexOf('.panel-select:focus,');
        expect(start).toBeGreaterThan(0);
        expect(panels.slice(start, panels.indexOf('}', start))).not.toMatch(/outline/);
    });

    it('FR-MAP-21: the band selector is the panel field, with no focus rule of its own', () => {
        const bands = readSource(JS, 'features/viewers/map/BandSelector.vue');
        expect(bands).toMatch(/<select [^>]*class="panel-select"/);
        expect(bands).not.toMatch(/channel-select|outline:\s*none/);
    });
});

// ---- No colour of its own (FR-XC-21: the colours of scoped styles and viewers are tokens) ----

describe('the stylesheets of the components', () => {
    const JS = path.resolve(__dirname, '..');
    const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(\s*\d|(?<![-\w])(white|black)\s*(;|!|\))/i;
    // Data, not styling: the rainbow of the custom colour swatch; the vendor-prefixed fallbacks of
    // the point cloud background (documented in _variables.scss, exception 3)
    const DATA = [
        ['components/ColorSwatchPicker.vue', /linear-gradient\(135deg, #ff0000, #00ff00, #0000ff\)/],
        ['features/viewers/pointcloud/PotreeViewer.scss', /-(moz|webkit|o|ms)-(radial-)?gradient/]
    ];
    const styles = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(vue|scss|css)$/.test(entry.name)) styles.push(full);
        }
    };
    walk(JS);

    it('name no colour: a token, or a triplet token with an alpha', () => {
        expect(styles.length).toBeGreaterThan(150);
        expect(LITERAL.test('color: #fff;') && LITERAL.test('background: rgba(0, 0, 0, 0.5);') && LITERAL.test('color: white;')).toBe(true);
        expect(LITERAL.test('white-space: nowrap;') || LITERAL.test('rgba(var(--ddb-glass-rgb), 0.2)')).toBe(false);
        const found = [];
        for (const file of styles) {
            const rel = path.relative(JS, file).split(path.sep).join('/');
            const text = fs.readFileSync(file, 'utf8');
            // Only the style blocks of a component; a stylesheet whole
            const css = file.endsWith('.vue') ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') : text;
            css.split('\n').forEach(line => {
                const code = line.replace(/\/\*.*?\*\/|\/\/.*$/g, '');
                if (!LITERAL.test(code)) return;
                if (DATA.some(([f, allowed]) => f === rel && allowed.test(code))) return;
                found.push(`${rel}: ${code.trim()}`);
            });
        }
        expect(found).toEqual([]);
    });
});

// ---- The canvas reads the tokens, and draws again on a change of scheme ----

describe('the canvas colours', () => {
    const html = document.documentElement;

    it('of the file layers are the --ddb-map-* tokens, read when the styles are made', async () => {
        const { FILE_COLORS } = await import('@/libs/map/fileLayerStyles');
        const { FileLayers } = await import('@/libs/map/fileLayers');
        expect(FILE_COLORS.shot).toBe(LIGHT.get('--ddb-map-shot'));
        const layers = new FileLayers();
        const before = layers.styles;
        const was = html.style.getPropertyValue('--ddb-map-shot');
        try {
            html.style.setProperty('--ddb-map-shot', '#123456');
            expect(FILE_COLORS.shot).toBe('#123456');
            layers.restyle();
            expect(layers.styles).not.toBe(before);
            expect(layers.styles.flightPath.getStroke().getColor()).toBe('#123456');
            expect(layers.shotLayer.getStyle()).toBe(layers.styles.forCluster);
        } finally {
            html.style.setProperty('--ddb-map-shot', was);
        }
    // Imports the map's modules: slow on a loaded machine
    }, 30000);

    it('as an alpha: a #rrggbb token or a triplet token', async () => {
        const { tokenRgba } = await import('@/libs/colorScheme');
        expect(tokenRgba('--ddb-map-shot', 0.35)).toBe('rgba(77, 156, 240, 0.35)');
        expect(tokenRgba('--ddb-glass-rgb', 0.2)).toBe('rgba(255, 255, 255, 0.2)');
        expect(tokenRgba('--ddb-no-such-token', 0.2)).toBe('');
    });

    it('of the measurements are --ddb-measure-color, the default a measurement stores', async () => {
        const { MEASURE_COLOR } = await import('@/libs/map/mapUtils');
        expect(LIGHT.get('--ddb-measure-color').toLowerCase()).toBe(MEASURE_COLOR.toLowerCase());
        const control = readSource(path.resolve(__dirname, '../libs/map/controls'), 'measureControl.js');
        const selection = readSource(path.resolve(__dirname, '../libs/map/controls'), 'selectionControl.js');
        for (const source of [control, selection]) {
            expect(source).not.toMatch(/'(#[0-9a-f]{3,6}|rgba\(\d[^']*)'/i);
            expect(source).toMatch(/restyle\(\) \{/);
        }
    });

    it('are made again by the map when the scheme changes', () => {
        const core = readSource(path.resolve(__dirname, '../features/viewers/map'), 'MapCore.vue');
        expect(core).toMatch(/this\.stopColorScheme = onColorSchemeChange\(\(\) => this\.restyleCanvas\(\)\);/);
        expect(core).toMatch(/if \(this\.stopColorScheme\) this\.stopColorScheme\(\);/);
        const restyle = core.slice(core.indexOf('restyleCanvas: function'), core.indexOf('},', core.indexOf('restyleCanvas: function')));
        for (const part of ['fileLayers.restyle()', 'measureControls.restyle()', 'selectionControl.restyle()', 'map.render()']) {
            expect(restyle).toContain(part);
        }
    });
});

// ---- The text editor ----

describe('the text editor', () => {
    it('draws CodeMirror\'s highlight style with a token for each of its colours', async () => {
        const { CODE_COLOR_TOKENS, codeHighlightStyle } = await import('@/libs/codeEditorTheme');
        const { defaultHighlightStyle } = await import('@codemirror/language');
        const colours = defaultHighlightStyle.specs.map(spec => spec.color).filter(Boolean);
        for (const c of colours) expect(CODE_COLOR_TOKENS, c).toHaveProperty(c);
        expect(codeHighlightStyle.specs.map(spec => spec.color).filter(Boolean).every(c => c.startsWith('var(--ddb-'))).toBe(true);
        for (const token of new Set(Object.values(CODE_COLOR_TOKENS))) {
            const name = token.slice(4, -1);
            expect(LIGHT.has(name) && DARK.has(name), name).toBe(true);
        }
    });

    it('uses the editor theme of the tokens', () => {
        const dialog = readSource(path.resolve(__dirname, '../features/dataset/dialogs'), 'TextEditorDialog.vue');
        expect(dialog).toMatch(/syntaxHighlighting\(codeHighlightStyle\)/);
        expect(dialog).toMatch(/codeEditorTheme,/);
        expect(dialog).not.toMatch(/defaultHighlightStyle/);
    });
});
