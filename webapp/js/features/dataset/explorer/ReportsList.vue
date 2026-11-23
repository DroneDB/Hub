<template>
    <SidebarGroup v-model:current="current" label="Reports" aria-label="Reports" :icon="REPORT_ICON" item-key="key" :items="rows" :menu="menu" :info="REPORTS_INFO"
                  :item-icon="r => r.unreadable ? 'fa-solid fa-triangle-exclamation' : REPORT_ICON"
                  :item-title="r => r.unreadable ? `${r.name} cannot be read: ${r.error}` : `${r.name} (double-click to open)`" :action-label="canWrite ? 'New report' : ''"
                  @open="open" @action="emit('new')" />
</template>

<script setup>
/**
 * ReportsList - the dataset's reports under the folder tree, next to the saved views. They are not dataset files: a
 * report opens (double click, Enter, Open) in a new tab, whoever can read the dataset can copy its link, and writers
 * edit, duplicate and delete it, and make a new one (the page does: `new`, `edit`, `duplicate`, `delete` events). A stored report that cannot be
 * read is listed as unreadable, and a writer can delete it. Names are shown as text, whatever they contain. The (i) button of the heading explains reports.
 */
import { computed, ref } from 'vue';
import { REPORT_ICON } from '@/libs/glyphs';
import { REPORTS_INFO } from '@/libs/datasetGroupInfo';
import SidebarGroup from './SidebarGroup.vue';
import { reportUrl, absoluteUrl, openInNewTab } from '@/libs/views/viewLinks';
import { copyLinkWithNotice } from '@/composables/useCopyText';
import { useNotify } from '@/composables/useNotify';

const props = defineProps({
    // The reports (libs/reports/reportStore listReports: { id, uid, name, data }), sorted by name
    reports: { type: Array, required: true },
    // The stored items that cannot be shown as a report: { id, uid, name, error }
    unreadable: { type: Array, default: () => [] },
    dataset: { type: Object, required: true },
    canWrite: { type: Boolean, default: false }
});
const emit = defineEmits(['new', 'edit', 'duplicate', 'delete']);
const notify = useNotify();

// The rows: the reports, then the unreadable ones (each named by what is known of it)
const rows = computed(() => [
    ...props.reports.map(r => ({ ...r, key: r.uid })),
    ...props.unreadable.map(u => ({ ...u, name: u.name || 'Report that cannot be read', key: `unreadable-${u.id}`, unreadable: true }))
]);

// The report the menu acts on
const current = ref(null);

const open = r => { if (!r.unreadable) openInNewTab(reportUrl(props.dataset, r.uid)); };
const has = () => !!current.value && !current.value.unreadable;
const writable = () => !!current.value && props.canWrite;
// A report of a later version is not edited or copied here: what this version does not know of it would be lost
const editable = () => writable() && has() && !current.value.newerVersion;

const copyLink = r => copyLinkWithNotice(absoluteUrl(reportUrl(props.dataset, r.uid)), notify, r.name);

const menu = [
    { label: 'Open', icon: 'fa-regular fa-folder-open', isVisible: has, click: () => open(current.value) },
    { label: 'Copy Link', icon: 'fa-solid fa-link', isVisible: has, click: () => copyLink(current.value) },
    { type: 'separator', isVisible: writable },
    { label: 'Edit', icon: 'fa-solid fa-pen', isVisible: editable, click: () => emit('edit', current.value) },
    { label: 'Duplicate', icon: 'fa-regular fa-copy', isVisible: editable, click: () => emit('duplicate', current.value) },
    { label: 'Delete', icon: 'fa-solid fa-trash', isVisible: writable, click: () => emit('delete', current.value) }
];
</script>
