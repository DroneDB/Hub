<template>
    <SidebarGroup v-model:current="current" class="saved-views" label="Views" aria-label="Saved views" :icon="VIEWS_ICON" :items="views" :menu="menu" :info="SAVED_VIEWS_INFO"
                  :empty-text="canWrite ? EMPTY_TEXT : ''"
                  :item-icon="() => 'fa-regular fa-map'" :item-title="v => `${v.name} (double-click to open)`" @open="open" />
</template>

<script setup>
/**
 * SavedViews - the dataset's saved map views under the folder tree; a writer sees the group with none, and how to make one. They are not dataset
 * files: they open in the map (double click, Enter, Open) in a new tab and none of the file
 * operations apply to them; writers rename and delete them (the page does, `rename` /
 * `delete` events). Names are shown as text, whatever they contain. The (i) button of the heading explains views.
 */
import { ref } from 'vue';
import { VIEWS_ICON } from '@/libs/glyphs';
import { SAVED_VIEWS_INFO } from '@/libs/datasetGroupInfo';
import SidebarGroup from './SidebarGroup.vue';
import { savedViewUrl, absoluteUrl, openInNewTab } from '@/libs/views/viewLinks';
import { copyLinkWithNotice } from '@/composables/useCopyText';
import { useNotify } from '@/composables/useNotify';

const props = defineProps({
    // [{ uid, name }] (libs/views/viewStore listViews), sorted by name
    views: { type: Array, required: true },
    dataset: { type: Object, required: true },
    canWrite: { type: Boolean, default: false }
});
const emit = defineEmits(['rename', 'delete']);

// How a view is made, for a writer of a dataset that has none
const EMPTY_TEXT = 'No saved views yet. Open a file on the map and use Save view, or use Save as view on the Map tab. A new report can save one too.';
const notify = useNotify();

// The view the menu acts on
const current = ref(null);

const open = v => openInNewTab(savedViewUrl(props.dataset, v.uid));
const has = () => !!current.value;

const copyLink = v => copyLinkWithNotice(absoluteUrl(savedViewUrl(props.dataset, v.uid)), notify, v.name);

const menu = [
    { label: 'Open', icon: 'fa-regular fa-folder-open', isVisible: has, click: () => open(current.value) },
    { label: 'Copy Link', icon: 'fa-solid fa-link', isVisible: has, click: () => copyLink(current.value) },
    { type: 'separator', isVisible: () => has() && props.canWrite },
    { label: 'Rename', icon: 'fa-solid fa-pen', isVisible: () => has() && props.canWrite, click: () => emit('rename', current.value) },
    { label: 'Delete', icon: 'fa-solid fa-trash', isVisible: () => has() && props.canWrite, click: () => emit('delete', current.value) }
];
</script>
