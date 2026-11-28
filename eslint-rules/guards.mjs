/**
 * Guard rules: patterns the Hub has moved away from may not come back.
 *
 * Each guard lists the files that still use the pattern today. A file on an allow-list
 * gets the rule without that guard's entries; every other file gets all of them.
 * When a file stops using a pattern, delete it from the list;
 * the lists only shrink.
 */
const SCOPE = ['webapp/js/**/*.vue', 'webapp/js/composables/**/*.js'];
// Specs read and write the storage and the network to set a case up
const SPECS = ['**/*.spec.js', '**/*.test.js'];

export const GUARDS = [
    {
        id: 'mixins',
        rule: 'no-restricted-syntax',
        entries: [
            {
                // `export default { mixins }`, `defineComponent({ mixins })` (exported or not) and `app.mixin(...)`
                selector: "Property:matches([key.name='mixins'], [key.value='mixins']):matches("
                    + "ExportDefaultDeclaration > ObjectExpression > *, CallExpression[callee.name='defineComponent'] > ObjectExpression > *)",
                message: 'Use a composable from setup(), not a mixin.'
            },
            {
                selector: "CallExpression[callee.property.name='mixin']",
                message: 'Use a composable from setup(), not a global mixin.'
            }
        ],
        allow: []
    },
    {
        id: '$parent',
        rule: 'no-restricted-properties',
        entries: [{ property: '$parent', message: 'Pass data with props/emits, provide/inject or a store, not $parent.' }],
        allow: []
    },
    {
        // Templates are not covered by no-restricted-properties
        id: 'template-$parent',
        rule: 'vue/no-restricted-syntax',
        entries: [{
            selector: "Identifier[name='$parent']",
            message: 'Pass data with props/emits, provide/inject or a store, not $parent.'
        }],
        allow: []
    },
    {
        id: 'storage',
        rule: 'no-restricted-globals',
        entries: [
            { name: 'localStorage', message: 'Use libs/preferences.js or usePreference().' },
            { name: 'sessionStorage', message: 'Use libs/preferences.js.' }
        ],
        allow: []
    },
    {
        id: 'window-storage',
        rule: 'no-restricted-properties',
        entries: [
            { object: 'window', property: 'localStorage', message: 'Use libs/preferences.js or usePreference().' },
            { object: 'window', property: 'sessionStorage', message: 'Use libs/preferences.js.' },
            { object: 'window', property: 'fetch', message: 'Use the Registry client.' },
            ...['globalThis', 'self'].flatMap(object => [
                { object, property: 'localStorage', message: 'Use libs/preferences.js or usePreference().' },
                { object, property: 'sessionStorage', message: 'Use libs/preferences.js.' },
                { object, property: 'fetch', message: 'Use the Registry client.' }
            ])
        ],
        allow: []
    },
    {
        id: 'network',
        rule: 'no-restricted-globals',
        entries: [
            { name: 'fetch', message: 'Use the Registry client (Dataset/SysApi methods, httpClient.fetchRaw).' },
            { name: 'XMLHttpRequest', message: 'Use the Registry client.' }
        ],
        allow: []
    }
];

const rulesFor = (exclude = new Set()) => {
    const byRule = {};
    for (const g of GUARDS) {
        byRule[g.rule] ??= [];
        if (!exclude.has(g.id)) byRule[g.rule].push(...g.entries);
    }
    return Object.fromEntries(Object.entries(byRule).map(([rule, entries]) =>
        [rule, entries.length ? ['error', ...entries] : 'off']));
};

/** Flat-config objects: the guards for every component and composable, then the allow-lists. */
export function guardConfigs() {
    const exceptions = new Map();
    for (const g of GUARDS) for (const f of g.allow) {
        if (!exceptions.has(f)) exceptions.set(f, new Set());
        exceptions.get(f).add(g.id);
    }
    return [
        { files: SCOPE, ignores: SPECS, rules: rulesFor() },
        ...[...exceptions].map(([file, ids]) => ({ files: [file], ignores: SPECS, rules: rulesFor(ids) }))
    ];
}
