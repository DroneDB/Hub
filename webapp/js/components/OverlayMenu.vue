<template>
    <span ref="root" class="overlay-menu" @focusout="onFocusOut">
        <button ref="trigger" type="button" :title="label" :aria-label="label" aria-haspopup="menu" :aria-expanded="String(open)" :aria-controls="menuId"
                data-testid="overlay-menu-button" @click="toggle" @keydown="onKey">
            <i class="fa-solid fa-ellipsis-vertical" />
        </button>
        <div v-if="open" :id="menuId" ref="list" class="menu-list" :class="{ 'align-end': alignEnd }" role="menu" tabindex="-1" :aria-label="label" @keydown="onKey">
            <button v-for="item in items" :key="item.key" type="button" role="menuitem" tabindex="-1" class="menu-item" :class="{ danger: item.danger }"
                    :disabled="item.disabled" :data-testid="`overlay-menu-${item.key}`" @click="pick(item)">
                <i v-if="item.icon" :class="item.icon" />
                <span>{{ item.label }}</span>
            </button>
        </div>
    </span>
</template>

<script setup>
/**
 * The "more" button of a toolbar over a dark 3D view, with the menu it opens: the actions that are used too seldom for
 * a button of their own (deleting what was saved). The menu is part of the toolbar, not of the page, so it shows in
 * fullscreen too, where only the viewer is drawn. It opens under the button, to the side that has the room.
 *
 * Keyboard: Enter or Space on the button opens it with the first item focused, the arrows move between the items,
 * Escape closes it and gives the focus back to the button, Tab leaves and closes it. A click outside closes it.
 */
import { ref, useId } from 'vue';
import { useMenu } from '@/composables/useMenu';

defineProps({
    /** The accessible name of the button and of its menu */
    label: { type: String, required: true },
    /** The actions: { key, label, icon?, danger?, disabled? }; `danger` marks one that deletes */
    items: { type: Array, required: true }
});
const emit = defineEmits(['select']);

// About as wide as a menu gets (its longest action on one line): decides the side it opens to
const MENU_WIDTH_PX = 260;

const root = ref(null);
const trigger = ref(null);
const list = ref(null);
// The menu ends at the right edge of the button: the button is too near the right edge of the window to start one there
const alignEnd = ref(false);
const menuId = useId();

// An action that is off is a real `disabled` button here: it cannot be focused, so the arrows leave it out
const { open, close, toggle, onKey, onFocusOut } = useMenu({
    root, trigger, list,
    itemSelector: '[role="menuitem"]:not(:disabled)',
    beforeOpen() {
        const left = trigger.value?.getBoundingClientRect().left ?? 0;
        alignEnd.value = left + MENU_WIDTH_PX > window.innerWidth;
    }
});

function pick(item) {
    close({ refocus: true });
    emit('select', item.key);
}
</script>

<style scoped lang="scss">
@use '../../css/overlay-button' as *;

.overlay-menu {
    position: relative;
    display: inline-flex;
}

.menu-list {
    @include overlay-surface;

    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 12rem;
    padding: 0.25rem;
    // More opaque than the bar: its text lies over the view, not beside it
    background: rgba(var(--ddb-shade-rgb), 0.85);
}

.menu-list.align-end {
    left: auto;
    right: 0;
}

.menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2.25rem;
    padding: 0 0.6rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: var(--ddb-font-size-sm, 0.8rem);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    // Dark in both themes: the keyboard focus ring of the dark surfaces
    --ddb-focus-ring-color: var(--ddb-focus-ring-on-dark);

    &:hover:not(:disabled),
    &:focus-visible {
        background: rgba(var(--ddb-glass-rgb), 0.15);
    }

    &:disabled {
        opacity: 0.4;
        cursor: default;
    }

    // An action that deletes: its icon is red; the text stays readable over any view
    &.danger i {
        color: var(--ddb-viewer-btn-danger);
    }
}
</style>
