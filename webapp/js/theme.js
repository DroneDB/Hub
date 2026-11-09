// @ts-check
/**
 * The Hub's PrimeVue theme: Lara with the DroneDB blue, in a light and a dark scheme (FR-XC-21).
 * Every colour block has both (`colorScheme.light` and `colorScheme.dark`, theme.spec.js holds it):
 * the dark one applies under the class that libs/colorScheme.js puts on <html>.
 */
import Lara from '@primevue/themes/lara';
import { definePreset } from '@primevue/themes';
import { DARK_CLASS } from '@/libs/colorScheme';
import { FOCUS_RING, PRIMARY } from '@/libs/palette';

// The tint of a selected row that has focus or is pressed: a quarter of shade 100 in shade 50
// (css/_variables.scss writes the same recipe for --ddb-selected-active-bg)
const SELECTED_ACTIVE = `color-mix(in srgb, ${PRIMARY[100]} 25%, ${PRIMARY[50]})`;

// One focus ring (FR-NAV-05): the outline of the semantic focusRing (FOCUS_RING of libs/palette.js,
// which css/_variables.scss copies for the stylesheets), not Lara's light halo of each component,
// which is about 2:1 on white. RING puts a component back on it where Lara gives it a ring of its own.
const RING = { color: '{focus.ring.color}', shadow: 'none' };
// Rows, tabs and headers sit in boxes that clip what lies outside them (Lara draws their ring as an
// inset shadow): the outline goes inside their edge
const INSET_RING = { offset: `-${FOCUS_RING.width}` };

// Lara's solid severities (500 shades) put white text below 4.5:1; the 700 shades pass. In the dark
// scheme the fills are the 400 shades with the 950 shade as text, as Lara's dark scheme draws them.
const solid = c => ({
    background: `{${c}.700}`, hoverBackground: `{${c}.800}`, activeBackground: `{${c}.900}`,
    borderColor: `{${c}.700}`, hoverBorderColor: `{${c}.800}`, activeBorderColor: `{${c}.900}`,
    focusRing: RING
});
const solidDark = c => ({
    background: `{${c}.400}`, hoverBackground: `{${c}.300}`, activeBackground: `{${c}.200}`,
    borderColor: `{${c}.400}`, hoverBorderColor: `{${c}.300}`, activeBorderColor: `{${c}.200}`,
    color: `{${c}.950}`, hoverColor: `{${c}.950}`, activeColor: `{${c}.950}`,
    focusRing: RING
});
const SEVERITIES = { success: 'green', help: 'purple', danger: 'red' };
const each = make => Object.fromEntries(Object.entries(SEVERITIES).map(([s, c]) => [s, make(c)]));
// The button severities the Hub does not recolour still take the one ring
const ringOnly = { primary: { focusRing: RING }, secondary: { focusRing: RING }, contrast: { focusRing: RING } };

// "info" is not a second blue: it is the brand blue, so a button, a tag and a message about
// the same thing never come out as different blues. The solid shades are the primary ones
// (white on primary.500 is 4.78:1; in the dark scheme dark text on primary.400, 5.3:1).
const infoSolid = {
    background: '{primary.color}', hoverBackground: '{primary.hover.color}', activeBackground: '{primary.active.color}',
    borderColor: '{primary.color}', hoverBorderColor: '{primary.hover.color}', activeBorderColor: '{primary.active.color}',
    color: '{primary.contrast.color}', hoverColor: '{primary.contrast.color}', activeColor: '{primary.contrast.color}',
    focusRing: RING
};
const infoOutlined = {
    hoverBackground: '{primary.50}', activeBackground: '{primary.100}', borderColor: '{primary.200}', color: '{primary.color}'
};
const infoText = { hoverBackground: '{primary.50}', activeBackground: '{primary.100}', color: '{primary.color}' };
const DARK_HOVER = 'color-mix(in srgb, {primary.400}, transparent 96%)';
const DARK_ACTIVE = 'color-mix(in srgb, {primary.400}, transparent 84%)';
const infoOutlinedDark = { hoverBackground: DARK_HOVER, activeBackground: DARK_ACTIVE, borderColor: '{primary.600}', color: '{primary.color}' };
const infoTextDark = { hoverBackground: DARK_HOVER, activeBackground: DARK_ACTIVE, color: '{primary.color}' };

// Lara's outlined secondary (surface.500 text on a surface.200 border) reads as disabled next to a
// select button or a field: it takes their border (form.field.border.color is surface.300, in the
// dark scheme surface.600) and text dark (in the dark scheme light) enough
const secondaryOutlined = {
    hoverBackground: '{surface.50}', activeBackground: '{surface.100}', borderColor: '{surface.300}', color: '{surface.700}'
};
const secondaryOutlinedDark = {
    hoverBackground: '{surface.800}', activeBackground: '{surface.700}', borderColor: '{surface.600}', color: '{surface.200}'
};

// Text in a warning colour is --ddb-warning-text (css/_variables.scss), with its light and dark
// values: the one warning text of the Hub, so no shade of yellow here stands in for it
const WARNING_TEXT = 'var(--ddb-warning-text)';

// "warn" is yellow, as Lara's warning messages and toasts already are: its orange, darkened for
// white text, read as a second red next to danger. Yellow takes dark text (yellow.950 on
// yellow.400 is 9.5:1, on yellow.600 5.0:1), in both schemes.
const warnSolid = {
    background: '{yellow.400}', hoverBackground: '{yellow.500}', activeBackground: '{yellow.600}',
    borderColor: '{yellow.400}', hoverBorderColor: '{yellow.500}', activeBorderColor: '{yellow.600}',
    color: '{yellow.950}', hoverColor: '{yellow.950}', activeColor: '{yellow.950}',
    focusRing: RING
};
const warnOutlined = { hoverBackground: '{yellow.50}', activeBackground: '{yellow.100}', borderColor: '{yellow.300}', color: WARNING_TEXT };
const warnText = { hoverBackground: '{yellow.50}', activeBackground: '{yellow.100}', color: WARNING_TEXT };
const YELLOW_DARK_HOVER = 'color-mix(in srgb, {yellow.400}, transparent 96%)';
const YELLOW_DARK_ACTIVE = 'color-mix(in srgb, {yellow.400}, transparent 84%)';
const warnOutlinedDark = { hoverBackground: YELLOW_DARK_HOVER, activeBackground: YELLOW_DARK_ACTIVE, borderColor: '{yellow.700}', color: WARNING_TEXT };
const warnTextDark = { hoverBackground: YELLOW_DARK_HOVER, activeBackground: YELLOW_DARK_ACTIVE, color: WARNING_TEXT };
const warnTag = { background: '{yellow.400}', color: '{yellow.950}' };

// Messages, toasts and inline messages: a tint of the severity with text in a shade that passes
// 4.5:1 on it (js/specs/colorTokens.spec.js). Lara's 600 shades do not: primary.500 gives 4.2:1,
// red.600 4.4:1, green.600 3.1:1, yellow.600 2.8:1. Info is the brand blue.
const MESSAGE_HUES = { info: 'primary', success: 'green', warn: 'yellow', error: 'red' };
const MESSAGE_TEXT = {
    light: { info: '{primary.700}', success: '{green.700}', warn: WARNING_TEXT, error: '{red.700}' },
    dark: { info: '{primary.200}', success: '{green.300}', warn: WARNING_TEXT, error: '{red.300}' }
};
/** @typedef {'light'|'dark'} Scheme */
/** @param {Scheme} scheme @param {string} hue */
const messageTint = (scheme, hue) => (scheme === 'light'
    ? `color-mix(in srgb, {${hue}.50}, transparent 5%)`
    : `color-mix(in srgb, {${hue}.500}, transparent 84%)`);
/** @param {Scheme} scheme @param {string} hue */
const closeButton = (scheme, hue) => ({ hoverBackground: scheme === 'light' ? `{${hue}.100}` : 'rgba(255, 255, 255, 0.05)', focusRing: RING });
/** @param {(hue: string, text: string) => object} make @param {Scheme} scheme */
const bySeverity = (make, scheme) => Object.fromEntries(Object.entries(MESSAGE_HUES)
    .map(([severity, hue]) => [severity, make(hue, MESSAGE_TEXT[scheme][severity])]));
const otherCloseButtons = { secondary: { closeButton: { focusRing: RING } }, contrast: { closeButton: { focusRing: RING } } };

/** @param {Scheme} scheme */
const message = scheme => ({
    ...bySeverity((hue, text) => ({
        background: messageTint(scheme, hue), color: text,
        outlined: { color: text, borderColor: text }, simple: { color: text },
        closeButton: closeButton(scheme, hue)
    }), scheme),
    ...otherCloseButtons
});
/** @param {Scheme} scheme */
const inlineMessage = scheme => bySeverity((hue, text) => ({
    background: messageTint(scheme, hue), borderColor: messageTint(scheme, hue), color: text
}), scheme);
/** @param {Scheme} scheme */
const toast = scheme => ({
    ...bySeverity((hue, text) => ({
        background: messageTint(scheme, hue), color: text,
        borderColor: scheme === 'light' ? `{${hue}.500}` : `color-mix(in srgb, {${hue}.700}, transparent 64%)`,
        closeButton: closeButton(scheme, hue)
    }), scheme),
    ...otherCloseButtons
});

const DdbPreset = definePreset(Lara, {
    components: {
        dataview: {
            root: {
                borderWidth: '0'
            }
        },
        accordion: { header: { focusRing: INSET_RING } },
        datatable: { headerCell: { focusRing: INSET_RING }, row: { focusRing: INSET_RING } },
        tabs: { tab: { focusRing: INSET_RING }, tabpanel: { focusRing: INSET_RING }, navButton: { focusRing: INSET_RING } },
        tree: { node: { focusRing: INSET_RING } },
        treetable: { headerCell: { focusRing: INSET_RING }, row: { focusRing: INSET_RING } },
        imagecompare: { handle: { focusRing: { color: RING.color } } },
        button: {
            colorScheme: {
                light: {
                    root: { ...ringOnly, ...each(solid), info: infoSolid, warn: warnSolid },
                    outlined: { secondary: secondaryOutlined, info: infoOutlined, warn: warnOutlined },
                    text: { info: infoText, warn: warnText }
                },
                dark: {
                    root: { ...ringOnly, ...each(solidDark), info: infoSolid, warn: warnSolid },
                    outlined: { secondary: secondaryOutlinedDark, info: infoOutlinedDark, warn: warnOutlinedDark },
                    text: { info: infoTextDark, warn: warnTextDark }
                }
            }
        },
        tag: {
            colorScheme: {
                light: { ...each(c => ({ background: `{${c}.700}` })), info: { background: '{primary.color}' }, warn: warnTag },
                dark: {
                    ...each(c => ({ background: `{${c}.400}`, color: `{${c}.950}` })),
                    info: { background: '{primary.color}', color: '{primary.contrast.color}' },
                    warn: warnTag
                }
            }
        },
        badge: {
            colorScheme: {
                light: { info: { background: '{primary.color}' }, warn: warnTag },
                dark: { info: { background: '{primary.color}', color: '{primary.contrast.color}' }, warn: warnTag }
            }
        },
        message: {
            colorScheme: { light: message('light'), dark: message('dark') }
        },
        inlinemessage: {
            colorScheme: { light: inlineMessage('light'), dark: inlineMessage('dark') }
        },
        toast: {
            colorScheme: { light: toast('light'), dark: toast('dark') }
        }
    },
    semantic: {
        primary: PRIMARY,
        // Its colour is in each scheme below
        focusRing: { width: FOCUS_RING.width, style: 'solid', offset: FOCUS_RING.offset },
        colorScheme: {
            light: {
                primary: {
                    color: PRIMARY[500],
                    contrastColor: '#ffffff',
                    hoverColor: PRIMARY[600],
                    activeColor: PRIMARY[700]
                },
                highlight: {
                    background: PRIMARY[50],
                    focusBackground: SELECTED_ACTIVE,
                    color: PRIMARY[600],
                    focusColor: PRIMARY[700]
                },
                focusRing: { color: FOCUS_RING.light.color, shadow: 'none' }
            },
            // Shade 400 with dark text, as Lara's dark scheme (5.3:1); the highlight is Lara's
            // (css/_variables.scss writes the same recipe for --ddb-selected-bg in the dark theme)
            dark: {
                primary: {
                    color: PRIMARY[400],
                    contrastColor: '{surface.950}',
                    hoverColor: PRIMARY[300],
                    activeColor: PRIMARY[200]
                },
                highlight: {
                    background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
                    focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
                    color: 'rgba(255, 255, 255, 0.87)',
                    focusColor: 'rgba(255, 255, 255, 0.87)'
                },
                focusRing: { color: FOCUS_RING.dark.color, shadow: 'none' }
            }
        }
    }
});

/** PrimeVue options for every Vue app the Hub creates. */
export const primeVueOptions = {
    pt: {
        // Password puts popup attributes on its input although the Hub never shows the
        // strength popup (feedback off): a password field is not a combobox (axe aria-allowed-attr)
        password: { pcInputText: { root: { 'aria-expanded': null, 'aria-haspopup': null } } },
        // The icon font's glyph is not part of the name of a button or a menu item (" Save"):
        // its label or aria-label is
        button: { icon: { 'aria-hidden': 'true' } },
        menu: { itemIcon: { 'aria-hidden': 'true' } },
        contextmenu: { itemIcon: { 'aria-hidden': 'true' } }
    },
    theme: {
        preset: DdbPreset,
        options: {
            // The dark scheme: the class on <html> (libs/colorScheme.js), not the media query, so
            // the Appearance preference can override the system
            darkModeSelector: `.${DARK_CLASS}`
        }
    }
};
