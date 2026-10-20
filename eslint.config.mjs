import pluginVue from 'eslint-plugin-vue';
import js from '@eslint/js';
import globals from 'globals';
import pairedListeners from './eslint-rules/paired-listeners.mjs';
import { guardConfigs } from './eslint-rules/guards.mjs';
import { a11yConfigs } from './eslint-rules/a11y.mjs';

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
            'hub/paired-listeners': 'error',
            // SFC templates are case-sensitive: <Button> (PrimeVue) is not <button>
            'vue/no-reserved-component-names': ['error', { htmlElementCaseSensitive: true }],
            // House style: 4-space template indent (.editorconfig). Line layout is left to the
            // author: these rules only move attributes and tags between lines.
            'vue/html-indent': ['warn', 4],
            'vue/max-attributes-per-line': 'off',
            'vue/first-attribute-linebreak': 'off',
            'vue/html-closing-bracket-newline': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/multiline-html-element-content-newline': 'off',
            // Listener names follow the attribute rule (kebab-case in templates)
            'vue/v-on-event-hyphenation': ['warn', 'always', { autofix: true }]
        }
    },
    // HQ-01: mixins, $parent, raw storage and raw network calls may not spread
    ...guardConfigs(),
    // HQ-01/HQ-10: accessibility rules; files with findings today are listed in a11y.mjs
    ...a11yConfigs(),
    {
        // CommonJS modules shared with the Electron/Node build
        files: ['webapp/js/libs/ddb/**/*.js', 'webapp/js/dynamic/**/*.js', 'webapp/js/libs/map/olMeasurementConverter.js'],
        languageOptions: { globals: globals.commonjs }
    },
    {
        files: ['webapp/**/*.spec.js', 'webapp/**/*.test.js', 'test-setup.js'],
        languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.vitest } },
        // Specs declare small throw-away components next to the one under test
        rules: { 'vue/one-component-per-file': 'off' }
    },
    {
        // Browser smoke suite (Node + Playwright; page functions run in the browser)
        files: ['e2e/**/*.mjs'],
        languageOptions: { globals: { ...globals.node, ...globals.browser } }
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
