// @ts-check
/** The Hub's PrimeVue theme: Lara with the DroneDB blue (HQ-04, moved out of main.js). */
import Lara from '@primevue/themes/lara';
import { definePreset } from '@primevue/themes';

// Lara's solid severities (500 shades) put white text below 4.5:1; the 700 shades pass (HQ-10)
const solid = c => ({
    background: `{${c}.700}`, hoverBackground: `{${c}.800}`, activeBackground: `{${c}.900}`,
    borderColor: `{${c}.700}`, hoverBorderColor: `{${c}.800}`, activeBorderColor: `{${c}.900}`
});
const SEVERITIES = { success: 'green', info: 'sky', warn: 'orange', help: 'purple', danger: 'red' };
const each = make => Object.fromEntries(Object.entries(SEVERITIES).map(([s, c]) => [s, make(c)]));

export const DdbPreset = definePreset(Lara, {
    components: {
        dataview: {
            root: {
                borderWidth: '0'
            }
        },
        button: {
            colorScheme: { light: { root: each(solid) } }
        },
        tag: {
            colorScheme: { light: each(c => ({ background: `{${c}.700}` })) }
        }
    },
    semantic: {
        primary: {
            50: '#e6f1fd',
            100: '#b3d5f9',
            200: '#80b8f5',
            300: '#4d9cf0',
            400: '#2685e8',
            500: '#0070e0',
            600: '#0060bf',
            700: '#004a95',
            800: '#00356b',
            900: '#001f40',
            950: '#001122'
        },
        colorScheme: {
            light: {
                primary: {
                    color: '#0070e0',
                    contrastColor: '#ffffff',
                    hoverColor: '#0060bf',
                    activeColor: '#004a95'
                },
                highlight: {
                    background: '#e8f4ff',
                    focusBackground: '#d8e8f8',
                    color: '#0060bf',
                    focusColor: '#004a95'
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
