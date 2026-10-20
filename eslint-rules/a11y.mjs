/**
 * HQ-01: eslint-plugin-vuejs-accessibility's recommended rules, as errors.
 * The files that had findings on 2026-10-20 are listed below and get the rules off;
 * HQ-10 fixes them and empties the list (it only shrinks).
 */
import vueA11y from 'eslint-plugin-vuejs-accessibility';

const recommended = vueA11y.configs['flat/recommended'].find(c => c.rules).rules;
const RULES = {
    ...Object.fromEntries(Object.keys(recommended).map(r => [r, 'error'])),
    // A label is associated by nesting OR by `for`/`id`; the default demands both
    'vuejs-accessibility/label-has-for': ['error', { required: { some: ['nesting', 'id'] } }]
};

// 284 findings in 65 files on 2026-10-20 (label-has-for 128, form-control-has-label 60,
// no-static-element-interactions 44, click-events-have-key-events 31, others 21)
export const A11Y_PENDING = [
    'webapp/js/components/AnnotationPropertiesDialog.vue',
    'webapp/js/components/BandSelector.vue',
    'webapp/js/components/ColormapDropdown.vue',
    'webapp/js/components/FolderPicker.vue',
    'webapp/js/components/HistogramChart.vue',
    'webapp/js/components/HubUpdateNoticeDialog.vue',
    'webapp/js/components/OdxOptionRow.vue',
    'webapp/js/components/OdxOptionsEditor.vue',
    'webapp/js/components/TabSwitcher.vue',
    'webapp/js/features/account/Account.vue',
    'webapp/js/features/account/ChangePwdDialog.vue',
    'webapp/js/features/account/UploadDiagnostics.vue',
    'webapp/js/features/admin/AddUserDialog.vue',
    'webapp/js/features/admin/ChangePasswordDialog.vue',
    'webapp/js/features/admin/CreateOrganizationDialog.vue',
    'webapp/js/features/admin/EditUserDialog.vue',
    'webapp/js/features/admin/OrganizationManagementDialog.vue',
    'webapp/js/features/admin/OrganizationsDialog.vue',
    'webapp/js/features/admin/RoleManagementDialog.vue',
    'webapp/js/features/admin/Tasks.vue',
    'webapp/js/features/admin/Users.vue',
    'webapp/js/features/dataset/ShareEmbed.vue',
    'webapp/js/features/dataset/TaskHistory.vue',
    'webapp/js/features/dataset/VideoLightbox.vue',
    'webapp/js/features/dataset/ViewDataset.vue',
    'webapp/js/features/dataset/dialogs/AlignDialog.vue',
    'webapp/js/features/dataset/dialogs/ExtractDialog.vue',
    'webapp/js/features/dataset/dialogs/ImportFromUrlDialog.vue',
    'webapp/js/features/dataset/dialogs/MergeMultispectralDialog.vue',
    'webapp/js/features/dataset/dialogs/SettingsDialog.vue',
    'webapp/js/features/dataset/dialogs/TextEditorDialog.vue',
    'webapp/js/features/dataset/dialogs/TransferDialog.vue',
    'webapp/js/features/dataset/explorer/DetailPanel.vue',
    'webapp/js/features/dataset/explorer/Explorer.vue',
    'webapp/js/features/dataset/explorer/FileBrowser.vue',
    'webapp/js/features/dataset/explorer/TableView.vue',
    'webapp/js/features/dataset/explorer/Thumbnail.vue',
    'webapp/js/features/dataset/explorer/TreeNode.vue',
    'webapp/js/features/dataset/explorer/TreeView.vue',
    'webapp/js/features/datasets/DatasetDialog.vue',
    'webapp/js/features/datasets/Datasets.vue',
    'webapp/js/features/datasets/ImportDatasetDialog.vue',
    'webapp/js/features/organizations/OrganizationDialog.vue',
    'webapp/js/features/organizations/OrganizationMembersDialog.vue',
    'webapp/js/features/organizations/Organizations.vue',
    'webapp/js/features/upload/Upload.vue',
    'webapp/js/features/viewers/map/ContourOptionsDialog.vue',
    'webapp/js/features/viewers/map/Map.vue',
    'webapp/js/features/viewers/map/MapSettingsDialog.vue',
    'webapp/js/features/viewers/map/MeasurementGroupDialog.vue',
    'webapp/js/features/viewers/map/MeasurementListDialog.vue',
    'webapp/js/features/viewers/map/MeasurementPropertiesDialog.vue',
    'webapp/js/features/viewers/map/PdfViewerDialog.vue',
    'webapp/js/features/viewers/map/PlantHealthPanel.vue',
    'webapp/js/features/viewers/map/PointAnnotationDialog.vue',
    'webapp/js/features/viewers/map/RasterAnalysisControls.vue',
    'webapp/js/features/viewers/map/RasterProfileChart.vue',
    'webapp/js/features/viewers/map/SingleMap.vue',
    'webapp/js/features/viewers/map/StockpileVolumePanel.vue',
    'webapp/js/features/viewers/markdown/Markdown.vue',
    'webapp/js/features/viewers/model/Nexus.vue',
    'webapp/js/features/viewers/splat/CameraManager.vue',
    'webapp/js/features/viewers/splat/Splat.vue',
    'webapp/js/features/viewers/unified/UnifiedViewer.vue',
    'webapp/js/layout/Header.vue'
];

export function a11yConfigs() {
    return [
        { files: ['webapp/js/**/*.vue'], plugins: { 'vuejs-accessibility': vueA11y }, rules: RULES },
        ...(A11Y_PENDING.length ? [{ files: A11Y_PENDING, rules: Object.fromEntries(Object.keys(RULES).map(r => [r, 'off'])) }] : [])
    ];
}
