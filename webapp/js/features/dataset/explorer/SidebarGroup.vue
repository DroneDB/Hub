<template>
    <!-- Right clicks here are this list's: its menu stops them before the file browser's -->
    <div class="sidebar-group" data-no-file-shortcuts>
        <ContextMenu :items="menu" />
        <ul role="tree" :aria-label="ariaLabel">
            <li role="treeitem" :aria-expanded="expanded" aria-selected="false">
                <button type="button" class="entry group" :aria-expanded="expanded" @click="expanded = !expanded" @contextmenu="current = null">
                    <i class="icon" :class="expanded ? 'fa-solid fa-caret-down' : 'fa-solid fa-caret-right'" aria-hidden="true" />
                    <i class="icon" :class="icon" aria-hidden="true" />
                    <span class="text">{{ label }}</span>
                </button>
                <ul v-show="expanded" role="group">
                    <li v-for="item in items" :key="item[itemKey]" role="treeitem" :aria-selected="current === item">
                        <button type="button" class="entry child" :class="{ selected: current === item }" :title="itemTitle(item)"
                                @click="current = item" @dblclick="emit('open', item)" @keydown.enter.prevent="emit('open', item)" @contextmenu="current = item">
                            <i class="icon" :class="itemIcon(item)" aria-hidden="true" />
                            <span class="text">{{ item.name }}</span>
                        </button>
                    </li>
                    <li v-if="actionLabel" role="none">
                        <button type="button" class="entry child" data-testid="group-action" @click="emit('action')">
                            <i class="icon fa-solid fa-plus" aria-hidden="true" />
                            <span class="text">{{ actionLabel }}</span>
                        </button>
                    </li>
                </ul>
            </li>
        </ul>
    </div>
</template>

<script setup>
/**
 * SidebarGroup - a group of the dataset's own items under the folder tree (the saved views, the reports): a collapsible
 * heading and one row per item, in the order given. They are not dataset files: a double click or Enter opens one
 * (`open`), the `action` button adds one, and the menu (the page's ContextMenu items, which read `current`) offers what applies. Names are shown as
 * text, whatever they contain.
 */
import { ref } from 'vue';
import ContextMenu from './ContextMenu.vue';

defineProps({
    /** The text of the group's heading */
    label: { type: String, required: true },
    /** The name of the group for a screen reader */
    ariaLabel: { type: String, required: true },
    /** The glyph of the group */
    icon: { type: String, required: true },
    /** The items, each with a `name` (shown as text) */
    items: { type: Array, required: true },
    /** The property that tells the items apart */
    itemKey: { type: String, default: 'uid' },
    /** The glyph of an item, from the item */
    itemIcon: { type: Function, required: true },
    /** The tooltip of an item, from the item */
    itemTitle: { type: Function, required: true },
    /** The label of the button that adds an item (a new report), after the rows; none when it is not offered */
    actionLabel: { type: String, default: '' },
    /** The items of the menu (ContextMenu items; their `isVisible` and `click` read the item in `current`) */
    menu: { type: Array, required: true }
});
const emit = defineEmits(['open', 'action']);

const expanded = ref(true);
// The item the menu acts on
const current = defineModel('current', { type: Object, default: null });
</script>

<style scoped>
.sidebar-group {
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
