// @ts-check
/** The Hub's PrimeVue theme: Lara with the DroneDB blue. */
import Lara from '@primevue/themes/lara';
import { definePreset } from '@primevue/themes';
import { PRIMARY } from '@/libs/palette';

// The tint of a selected row that has focus or is pressed: a quarter of shade 100 in shade 50
// (css/_variables.scss writes the same recipe for --ddb-selected-active-bg)
const SELECTED_ACTIVE = `color-mix(in srgb, ${PRIMARY[100]} 25%, ${PRIMARY[50]})`;

// Lara's solid severities (500 shades) put white text below 4.5:1; the 700 shades pass
const solid = c => ({
    background: `{${c}.700}`, hoverBackground: `{${c}.800}`, activeBackground: `{${c}.900}`,
    borderColor: `{${c}.700}`, hoverBorderColor: `{${c}.800}`, activeBorderColor: `{${c}.900}`
});
const SEVERITIES = { success: 'green', warn: 'orange', help: 'purple', danger: 'red' };
const each = make => Object.fromEntries(Object.entries(SEVERITIES).map(([s, c]) => [s, make(c)]));

// "info" is not a second blue: it is the brand blue, so a button, a tag and a message about
// the same thing never come out as different blues. The solid shades are the primary ones
// (white on primary.500 is 4.78:1).
const infoSolid = {
    background: '{primary.color}', hoverBackground: '{primary.hover.color}', activeBackground: '{primary.active.color}',
    borderColor: '{primary.color}', hoverBorderColor: '{primary.hover.color}', activeBorderColor: '{primary.active.color}',
    focusRing: { shadow: '0 0 0 0.2rem {primary.200}' }
};
const infoOutlined = {
    hoverBackground: '{primary.50}', activeBackground: '{primary.100}', borderColor: '{primary.200}', color: '{primary.color}'
};
const infoText = { hoverBackground: '{primary.50}', activeBackground: '{primary.100}', color: '{primary.color}' };

// Messages, toasts and inline messages: primary tints with primary.700 text (7.7:1 on the tint;
// primary.500 would give 4.2:1)
const infoMessage = {
    background: 'color-mix(in srgb, {primary.50}, transparent 5%)',
    color: '{primary.700}',
    closeButton: { hoverBackground: '{primary.100}', focusRing: { shadow: '0 0 0 0.2rem {primary.200}' } }
};

const DdbPreset = definePreset(Lara, {
    components: {
        dataview: {
            root: {
                borderWidth: '0'
            }
        },
        button: {
            colorScheme: {
                light: {
                    root: { ...each(solid), info: infoSolid },
                    outlined: { info: infoOutlined },
                    text: { info: infoText }
                }
            }
        },
        tag: {
            colorScheme: { light: { ...each(c => ({ background: `{${c}.700}` })), info: { background: '{primary.color}' } } }
        },
        badge: {
            colorScheme: { light: { info: { background: '{primary.color}' } } }
        },
        message: {
            colorScheme: {
                light: {
                    info: {
                        ...infoMessage,
                        outlined: { color: '{primary.700}', borderColor: '{primary.700}' },
                        simple: { color: '{primary.700}' }
                    }
                }
            }
        },
        inlinemessage: {
            colorScheme: { light: { info: { ...infoMessage, borderColor: infoMessage.background } } }
        },
        toast: {
            colorScheme: { light: { info: { ...infoMessage, borderColor: '{primary.500}' } } }
        }
    },
    semantic: {
        primary: PRIMARY,
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
                }
            }
        }
    }
});

/** PrimeVue options for every Vue app the Hub creates. */
export const primeVueOptions = {
    pt: {
        // Password puts popup attributes on its input although the Hub never shows the
        // strength popup (feedback off): a password field is not a combobox (axe aria-allowed-attr)
        password: { pcInputText: { root: { 'aria-expanded': null, 'aria-haspopup': null } } }
    },
    theme: {
        preset: DdbPreset,
        options: {
            darkModeSelector: false
        }
    }
};
