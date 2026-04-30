
// Bootstrap grid system and utilities only (no typography/colors - PrimeVue handles those)
import 'bootstrap/dist/css/bootstrap-grid.min.css';
import 'bootstrap/dist/css/bootstrap-utilities.min.css';

import '../css/app.scss';
import '../css/ol-controls.css';

// Font Awesome 6 icons
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

import reg from '@/libs/api/sharedRegistry';
import { queryParams, inIframe } from '@/libs/utils';
import {
    checkAndHandleUpdate,
    consumePendingUpdateNotice
} from '@/libs/hubUpdateChecker';
import HubUpdateNoticeDialog from '@/components/HubUpdateNoticeDialog.vue';

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
            } catch (e) {
                console.log(e.message);
                if (e.status === 401) {
                    reg.clearCredentials();
                }
            }
        } else {
            reg.clearCredentials();
        }

        // Always load features (the endpoint is anonymous): this populates
        // feature flags AND applies Hub branding (window.HubOptions, page
        // title, favicon links) so the Login page renders the configured
        // logo / app name as well.
        let features = null;
        try {
            features = await reg.loadFeatures();
        } catch (e) {
            console.log(e.message);
        }

        // Detect a server-side Hub upgrade/downgrade. If the version on the
        // server differs from the bundle's __HUB_VERSION__, persist a notice
        // and force a hard reload (server already sets Cache-Control: no-cache
        // on index.html, so the new build is fetched). Skipped in embed mode
        // and in development.
        if (
            checkAndHandleUpdate(features ? features.hubVersion : null, {
                isEmbed: embed,
                isProduction
            })
        ) {
            // A reload is in progress: stop the bootstrap to avoid mounting
            // the SPA against a soon-to-be-replaced document.
            return;
        }

        // If the previous session triggered a reload because of an update,
        // surface a one-shot dialog now (versions match again at this point).
        const updateNotice = consumePendingUpdateNotice();

        const app = createApp({
            components: { HubUpdateNoticeDialog },
            data() {
                return {
                    hubUpdateNotice: updateNotice,
                    hubVersion: features ? features.hubVersion : null,
                    registryVersion: features ? features.registryVersion : null,
                    ddbVersion: features ? features.ddbVersion : null
                };
            },
            methods: {
                onHubUpdateDismissed() {
                    this.hubUpdateNotice = null;
                }
            },
            template:
                '<router-view name="header" />' +
                '<router-view name="content" />' +
                '<HubUpdateNoticeDialog v-if="hubUpdateNotice"' +
                '   :notice="hubUpdateNotice"' +
                '   :hub-version="hubVersion"' +
                '   :registry-version="registryVersion"' +
                '   :ddb-version="ddbVersion"' +
                '   @close="onHubUpdateDismissed" />'
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
                    50:  '#e6f1fd',
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

        app.use(PrimeVue, {
            theme: {
                preset: DdbPreset,
                options: {
                    darkModeSelector: false
                }
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
