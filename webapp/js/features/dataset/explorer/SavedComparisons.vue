<template>
    <!-- Right clicks here are this list's: its menu stops them before the file browser's -->
    <div class="saved-comparisons" data-no-file-shortcuts>
        <ContextMenu :items="menu" />
        <ul role="tree" aria-label="Saved comparisons">
            <li role="treeitem" :aria-expanded="expanded" aria-selected="false">
                <button type="button" class="entry group" :aria-expanded="expanded" @click="expanded = !expanded" @contextmenu="current = null">
                    <i class="icon" :class="expanded ? 'fa-solid fa-caret-down' : 'fa-solid fa-caret-right'" aria-hidden="true" />
                    <i class="icon fa-solid fa-table-columns" aria-hidden="true" />
                    <span class="text">Comparisons</span>
                </button>
                <ul v-show="expanded" role="group">
                    <li v-for="c in comparisons" :key="c.uid" role="treeitem" :aria-selected="current === c">
                        <button type="button" class="entry child" :class="{ selected: current === c }" :title="`${c.name} (double-click to open)`"
                                @click="current = c" @dblclick="open(c)" @keydown.enter.prevent="open(c)" @contextmenu="current = c">
                            <i class="icon fa-regular fa-map" aria-hidden="true" />
                            <span class="text">{{ c.name }}</span>
                        </button>
                    </li>
                </ul>
            </li>
        </ul>
    </div>
</template>

<script setup>
/**
 * SavedComparisons - the dataset's saved comparisons under the folder tree. They are not
 * dataset files: they open in the compare view (double click, Enter, Open) and none of the
 * file operations apply to them; writers rename and delete them (the page does, `rename` /
 * `delete` events).
 */
import { ref } from 'vue';
import ContextMenu from './ContextMenu.vue';
import { compareUrl, absoluteUrl, openCompare } from '@/libs/compare/compareLinks';
import { copyText } from '@/composables/useCopyText';
import { useNotify } from '@/composables/useNotify';

const props = defineProps({
    // [{ uid, name }] (libs/compare/comparisonStore savedComparisons)
    comparisons: { type: Array, required: true },
    dataset: { type: Object, required: true },
    canWrite: { type: Boolean, default: false }
});
const emit = defineEmits(['rename', 'delete']);
const notify = useNotify();

const expanded = ref(true);
// The comparison the menu acts on
const current = ref(null);

const open = c => openCompare(props.dataset, { uid: c.uid });
const has = () => !!current.value;

async function copyLink(c) {
    try {
        await copyText(absoluteUrl(compareUrl(props.dataset, { uid: c.uid })));
        notify.success('Link copied to the clipboard', { summary: c.name });
    } catch {
        notify.error('The link could not be copied', { summary: c.name });
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
.saved-comparisons {
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
