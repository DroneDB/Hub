import pluginVue from 'eslint-plugin-vue';
import js from '@eslint/js';
import globals from 'globals';
import pairedListeners from './eslint-rules/paired-listeners.mjs';

export default [
    {
        ignores: ['build/**', 'node_modules/**', 'webapp/js/vendor/**', 'webapp/public/**',
            'potree/**', 'nexus/**', 'photosphereviewer/**', 'wasm/**', 'stats.json']
    },
    js.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        files: ['webapp/**/*.{js,vue}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Loaded by <script> tags (lazy.js) or set by the server page
                THREE: 'readonly', Potree: 'readonly', $: 'readonly', proj4: 'readonly',
                NexusObject: 'readonly', PhotoSphereViewer: 'readonly', HubOptions: 'readonly'
            }
        },
        plugins: { hub: { rules: { 'paired-listeners': pairedListeners } } },
        rules: {
            'hub/paired-listeners': 'error'
        }
    },
    {
        // CommonJS modules shared with the Electron/Node build
        files: ['webapp/js/libs/ddb/**/*.js', 'webapp/js/dynamic/**/*.js', 'webapp/js/libs/map/olMeasurementConverter.js'],
        languageOptions: { globals: globals.commonjs }
    },
    {
        files: ['webapp/**/*.spec.js', 'webapp/**/*.test.js', 'test-setup.js'],
        languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.vitest } }
    },
    {
        files: ['*.js', '*.mjs', 'scripts/**/*.{js,mjs}', 'eslint-rules/**/*.mjs'],
        languageOptions: { globals: globals.node }
    },
    {
        rules: {
            // Enforce a space after the // or /* comment markers.
            // Exceptions: webpack chunk hints (/*! and /* webpackChunkName: */)
            // and eslint/flow directives.
            'spaced-comment': [
                'warn',
                'always',
                {
                    line: {
                        markers: ['/', '!', '#'],
                        exceptions: ['-', '=']
                    },
                    block: {
                        markers: ['!'],
                        exceptions: ['*'],
                        balanced: false
                    }
                }
            ]
        }
    }
];
