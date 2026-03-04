
// Bootstrap grid system and utilities only (no typography/colors - PrimeVue handles those)
import 'bootstrap/dist/css/bootstrap-grid.min.css';
import 'bootstrap/dist/css/bootstrap-utilities.min.css';

import '../css/app.scss';
import '../css/ol-controls.css';

// Font Awesome 6 icons (replaces Semantic UI icons)
import '@fortawesome/fontawesome-free/css/all.min.css';

import './libs/keyboard';
import './libs/mouse';
import './dynamic/web';

import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Lara from '@primevue/themes/lara';
import { definePreset } from '@primevue/themes';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import DialogService from 'primevue/dialogservice';
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

import { createAppRouter } from './router';

import reg from './libs/sharedRegistry';
import { queryParams, inIframe } from './libs/utils';

/* global __APP_PRODUCTION__ */
const isProduction = typeof __APP_PRODUCTION__ !== 'undefined' ? __APP_PRODUCTION__ : true;

window.addEventListener('load', function () {

    var params = queryParams(window.location);

    // Hide header if ?embed=1 is in URL
    const embed = !!params.embed || inIframe();

    const router = createAppRouter(embed);

    // Refresh auth tokens and load features before mounting Vue
    async function boot() {
        if (reg.ensureLoggedIn()) {
            try {
                await reg.refreshToken();
                reg.setAutoRefreshToken();
                await reg.loadFeatures();
            } catch (e) {
                console.log(e.message);
                if (e.status === 401) {
                    reg.clearCredentials();
                }
            }
        } else {
            reg.clearCredentials();
        }

        const app = createApp({
            template: '<router-view name="header" /><router-view name="content" />'
        });

        app.use(router);
        const DdbPreset = definePreset(Lara, {
            components: {
                dataview: {
                    root: {
                        borderWidth: '0'
                    }
                }
            },
            semantic: {
                primary: {
                    50:  '#e6edfd',
                    100: '#b3c6f9',
                    200: '#809ff5',
                    300: '#4d79f1',
                    400: '#2659ec',
                    500: '#0041E8',
                    600: '#003abd',
                    700: '#002d93',
                    800: '#002069',
                    900: '#00133f',
                    950: '#000a21'
                },
                colorScheme: {
                    light: {
                        primary: {
                            color: '#0041E8',
                            contrastColor: '#ffffff',
                            hoverColor: '#003abd',
                            activeColor: '#002d93'
                        },
                        highlight: {
                            background: '#e8f4ff',
                            focusBackground: '#d8e8f8',
                            color: '#0041E8',
                            focusColor: '#002d93'
                        }
                    }
                }
            }
        });

        app.use(PrimeVue, {
            theme: {
                preset: DdbPreset
            }
        });
        app.use(ConfirmationService);
        app.use(ToastService);
        app.use(DialogService);

        // Global properties (replaces Vue.prototype)
        app.config.globalProperties.$embed = params.embed ? true : false;

        // Global component registration
        app.component('RecycleScroller', RecycleScroller);

        app.config.errorHandler = function (err, vm, info) {
            // Catch unauthorized error globally
            if (err.message === "Unauthorized") {
                router.push({ name: "Login" }).catch(() => { });
            } else {
                throw err;
            }
        };

        app.mount("#app");

        document.getElementById("main-loading").style.display = 'none';
    }

    boot();
});
