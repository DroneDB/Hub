<template>
    <!-- Right clicks here are this list's: its menu stops them before the file browser's -->
    <div class="saved-views" data-no-file-shortcuts>
        <ContextMenu :items="menu" />
        <ul role="tree" aria-label="Saved views">
            <li role="treeitem" :aria-expanded="expanded" aria-selected="false">
                <button type="button" class="entry group" :aria-expanded="expanded" @click="expanded = !expanded" @contextmenu="current = null">
                    <i class="icon" :class="expanded ? 'fa-solid fa-caret-down' : 'fa-solid fa-caret-right'" aria-hidden="true" />
                    <i class="icon" :class="VIEWS_ICON" aria-hidden="true" />
                    <span class="text">Views</span>
                </button>
                <ul v-show="expanded" role="group">
                    <li v-for="v in views" :key="v.uid" role="treeitem" :aria-selected="current === v">
                        <button type="button" class="entry child" :class="{ selected: current === v }" :title="`${v.name} (double-click to open)`"
                                @click="current = v" @dblclick="open(v)" @keydown.enter.prevent="open(v)" @contextmenu="current = v">
                            <i class="icon fa-regular fa-map" aria-hidden="true" />
                            <span class="text">{{ v.name }}</span>
                        </button>
                    </li>
                </ul>
            </li>
        </ul>
    </div>
</template>

<script setup>
/**
 * SavedViews - the dataset's saved map views under the folder tree. They are not dataset
 * files: they open in the map (double click, Enter, Open) in a new tab and none of the file
 * operations apply to them; writers rename and delete them (the page does, `rename` /
 * `delete` events). Names are shown as text, whatever they contain.
 */
import { ref } from 'vue';
import { VIEWS_ICON } from '@/libs/icons';
import ContextMenu from './ContextMenu.vue';
import { savedViewUrl, absoluteUrl, openInNewTab } from '@/libs/views/viewLinks';
import { copyText } from '@/composables/useCopyText';
import { useNotify } from '@/composables/useNotify';

const props = defineProps({
    // [{ uid, name }] (libs/views/viewStore listViews), sorted by name
    views: { type: Array, required: true },
    dataset: { type: Object, required: true },
    canWrite: { type: Boolean, default: false }
});
const emit = defineEmits(['rename', 'delete']);
const notify = useNotify();

const expanded = ref(true);
// The view the menu acts on
const current = ref(null);

const open = v => openInNewTab(savedViewUrl(props.dataset, v.uid));
const has = () => !!current.value;

async function copyLink(v) {
    try {
        await copyText(absoluteUrl(savedViewUrl(props.dataset, v.uid)));
        notify.success('Link copied to the clipboard', { summary: v.name });
    } catch {
        notify.error('The link could not be copied', { summary: v.name });
    }
}

const menu = [
    { label: 'Open', icon: 'fa-regular fa-folder-open', isVisible: has, click: () => open(current.value) },
    { label: 'Copy Link', icon: 'fa-solid fa-link', isVisible: has, click: () => copyLink(current.value) },
    { type: 'separator', isVisible: () => has() && props.canWrite },
    { label: 'Rename', icon: 'fa-solid fa-pen', isVisible: () => has() && props.canWrite, click: () => emit('rename', current.value) },
    { label: 'Delete', icon: 'fa-solid fa-trash', isVisible: () => has() && props.canWrite, click: () => emit('delete', current.value) }
];
</script>

<style scoped>
.saved-views {
    border-top: var(--ddb-border-width) solid var(--ddb-border);
    padding: 0.25rem 0;
    user-select: none;

    ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }
}

.entry {
    display: block;
    width: 100%;
    padding: 0.25rem;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;

    &:hover {
        background: var(--ddb-bg-hover);
    }

    &:focus-visible,
    &.selected {
        background: var(--ddb-border);
    }

    &.child {
        padding-left: 1.75rem;
    }
}

.icon {
    display: inline-block;
    width: 1.3rem;
    margin-right: var(--ddb-spacing-xs);
    text-align: center;
}

.text {
    margin-left: 0.25rem;
}
</style>
