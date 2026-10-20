/**
 * HQ-01 guard rules: patterns the HQ refactor removes may not come back.
 *
 * Each guard lists the files that still use the pattern today. A file on an allow-list
 * gets the rule without that guard's entries; every other file gets all of them.
 * When a proposal removes a use, delete the file from the list (HQ-02..HQ-09);
 * the lists only shrink.
 */
const SCOPE = ['webapp/js/**/*.vue', 'webapp/js/composables/**/*.js'];

export const GUARDS = [
    {
        id: 'mixins',
        rule: 'no-restricted-syntax',
        entries: [{
            selector: "ExportDefaultDeclaration > ObjectExpression > Property[key.name='mixins']",
            message: 'Use a composable from setup(), not a mixin (HQ-06).'
        }],
        allow: [
            'webapp/js/features/admin/Tasks.vue',
            'webapp/js/features/dataset/TaskHistory.vue',
            'webapp/js/features/dataset/ViewDataset.vue',
            'webapp/js/features/dataset/dialogs/AlignDialog.vue',
            'webapp/js/features/dataset/dialogs/ExtractDialog.vue',
            'webapp/js/features/dataset/dialogs/ImportFromUrlDialog.vue',
            'webapp/js/features/dataset/dialogs/MergeMultispectralDialog.vue',
            'webapp/js/features/dataset/explorer/Explorer.vue',
            'webapp/js/features/dataset/explorer/FileBrowser.vue',
            'webapp/js/features/dataset/explorer/TableView.vue',
            'webapp/js/features/dataset/explorer/TreeNode.vue',
            'webapp/js/features/dataset/explorer/TreeView.vue',
            'webapp/js/features/datasets/ImportDatasetDialog.vue',
            'webapp/js/features/tasks/TasksTable.vue',
            'webapp/js/features/viewers/map/Map.vue',
            'webapp/js/features/viewers/map/PlantHealthPanel.vue',
            'webapp/js/features/viewers/map/SingleMap.vue',
            'webapp/js/layout/Header.vue'
        ]
    },
    {
        id: '$parent',
        rule: 'no-restricted-properties',
        entries: [{ property: '$parent', message: 'Pass data with props/emits, provide/inject or a store, not $parent (HQ-03/HQ-04).' }],
        allow: [
            'webapp/js/components/ContextMenu.vue',
            'webapp/js/components/Message.vue',
            'webapp/js/features/viewers/TabViewLoader.vue'
        ]
    },
    {
        id: 'storage',
        rule: 'no-restricted-globals',
        entries: [
            { name: 'localStorage', message: 'Use libs/preferences.js or usePreference() (HQ-02).' },
            { name: 'sessionStorage', message: 'Use libs/preferences.js (HQ-02).' }
        ],
        allow: [
            'webapp/js/composables/useMapBasemap.js',
            'webapp/js/features/dataset/ViewDataset.vue',
            'webapp/js/features/dataset/explorer/FileBrowser.vue',
            'webapp/js/features/viewers/map/Map.vue',
            'webapp/js/features/viewers/map/SingleMap.vue',
            'webapp/js/features/viewers/map/olMeasure.vue',
            'webapp/js/features/viewers/model/Nexus.vue',
            'webapp/js/features/viewers/pointcloud/Potree.vue',
            'webapp/js/features/viewers/unified/UnifiedViewer.vue'
        ]
    },
    {
        id: 'window-storage',
        rule: 'no-restricted-properties',
        entries: [
            { object: 'window', property: 'localStorage', message: 'Use libs/preferences.js or usePreference() (HQ-02).' },
            { object: 'window', property: 'sessionStorage', message: 'Use libs/preferences.js (HQ-02).' },
            { object: 'window', property: 'fetch', message: 'Use the Registry client (HQ-05).' }
        ],
        allow: [
            'webapp/js/composables/useClipboard.js',
            'webapp/js/features/viewers/splat/Splat.vue'
        ]
    },
    {
        id: 'network',
        rule: 'no-restricted-globals',
        entries: [
            { name: 'fetch', message: 'Use the Registry client (Dataset/SysApi methods, httpClient.fetchRaw) (HQ-05).' },
            { name: 'XMLHttpRequest', message: 'Use the Registry client (HQ-05).' }
        ],
        allow: [
            'webapp/js/composables/useDialogManager.js',
            'webapp/js/composables/useMvtLayer.js',
            'webapp/js/features/account/UploadDiagnostics.vue',
            'webapp/js/features/dataset/ViewDataset.vue',
            'webapp/js/features/viewers/map/MapSettingsDialog.vue',
            'webapp/js/features/viewers/map/RasterAnalysisControls.vue',
            'webapp/js/features/viewers/splat/Splat.vue'
        ]
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
        { files: SCOPE, rules: rulesFor() },
        ...[...exceptions].map(([file, ids]) => ({ files: [file], rules: rulesFor(ids) }))
    ];
}
