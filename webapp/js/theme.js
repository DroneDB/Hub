// @ts-check
/** The Hub's PrimeVue theme: Lara with the DroneDB blue (HQ-04, moved out of main.js). */
import Lara from '@primevue/themes/lara';
import { definePreset } from '@primevue/themes';

export const DdbPreset = definePreset(Lara, {
    components: {
        dataview: {
            root: {
                borderWidth: '0'
            }
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
                    color: '#0070e0',
                    focusColor: '#004a95'
                }
            }
        }
    }
});

/** PrimeVue options for every Vue app the Hub creates. */
export const primeVueOptions = {
    theme: {
        preset: DdbPreset,
        options: {
            darkModeSelector: false
        }
    }
};
