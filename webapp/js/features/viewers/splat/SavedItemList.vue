<template>
    <p v-if="!items.length" class="empty">
        {{ emptyText }}
    </p>

    <ul v-else class="saved-list">
        <li v-for="(item, i) in items" :key="item.id" class="saved-row" :class="{ active: i === activeIndex }">
            <span class="idx" :title="indexTitle(i)">{{ i + 1 }}</span>
            <input class="name" type="text" :value="item[nameKey]" :aria-label="`Name of ${noun} ${i + 1}`" :readonly="!canWrite"
                   @change="emit('rename', { index: i, name: $event.target.value.trim() })">
            <div class="actions">
                <button class="act" :title="gotoTitle" :aria-label="gotoTitle" @click="emit('goto', i)">
                    <i class="fa-solid fa-eye" />
                </button>
                <button v-if="canWrite && updateTitle" class="act" :title="updateTitle" :aria-label="updateTitle" @click="emit('update', i)">
                    <i class="fa-solid fa-camera-rotate" />
                </button>
                <button v-if="canWrite" class="act" :disabled="i === 0" title="Move up" aria-label="Move up"
                        @click="emit('move', { index: i, dir: -1 })">
                    <i class="fa-solid fa-arrow-up" />
                </button>
                <button v-if="canWrite" class="act" :disabled="i === items.length - 1" title="Move down" aria-label="Move down"
                        @click="emit('move', { index: i, dir: 1 })">
                    <i class="fa-solid fa-arrow-down" />
                </button>
                <button v-if="canWrite" class="act danger" :title="`Remove this ${noun}`" :aria-label="`Remove this ${noun}`"
                        @click="emit('delete', i)">
                    <i class="fa-solid fa-trash" />
                </button>
            </div>
        </li>
    </ul>
</template>

<script setup>
/**
 * SavedItemList - the list the splat viewer keeps of what the user saves with a splat (camera
 * views, pins): a number, a name that can be edited, and the actions to go to an item, replace its
 * view with the current one, move it and remove it. The editing actions are for those who can write.
 * The list does not change anything: it says what the user asked for and its owner does it.
 */
defineProps({
    items: { type: Array, required: true },
    /** The field of an item that names it */
    nameKey: { type: String, default: 'name' },
    activeIndex: { type: Number, default: null },
    canWrite: { type: Boolean, default: false },
    /** What an item is, for the labels of the controls ("view", "pin") */
    noun: { type: String, default: 'view' },
    emptyText: { type: String, default: '' },
    gotoTitle: { type: String, default: 'Go to this view' },
    /** The title of the "replace with the current view" action; none, no action */
    updateTitle: { type: String, default: '' },
    /** What the number of an item says (a tooltip) @type {(index: number) => string | null} */
    indexTitle: { type: Function, default: () => null }
});
const emit = defineEmits(['goto', 'update', 'move', 'delete', 'rename']);
</script>

<style scoped>
.empty {
    color: var(--ddb-text-muted);
    text-align: center;
    margin: var(--ddb-spacing-md) 0;
}

.saved-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 50vh;
    overflow-y: auto;
}

.saved-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.15rem;
    border-bottom: 1px solid var(--ddb-border);
}

.saved-row.active {
    background: var(--ddb-bg-hover);
    border-radius: var(--ddb-radius-sm);
}

.idx {
    flex: 0 0 1.4rem;
    text-align: center;
    font-weight: 600;
    color: var(--ddb-text-muted);
}

.name {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
}

.name[readonly] {
    background: transparent;
    border-color: transparent;
}

.actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.15rem;
}

.act {
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: var(--ddb-radius-sm);
    background: transparent;
    color: var(--ddb-text);
    cursor: pointer;
}

.act:hover:not(:disabled) {
    background: var(--ddb-bg-hover);
}

.act:disabled {
    opacity: 0.35;
    cursor: default;
}

.act.danger:hover {
    color: var(--ddb-danger);
}
</style>
