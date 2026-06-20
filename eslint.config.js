import pluginVue from 'eslint-plugin-vue';
import js from '@eslint/js';

export default [
    js.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
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
