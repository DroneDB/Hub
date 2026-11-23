<template>
    <span ref="root" class="menu-button" @focusout="onFocusOut">
        <Button ref="triggerButton" type="button" :severity="severity" outlined size="small" :disabled="disabled"
                aria-haspopup="menu" :aria-expanded="String(open)" :aria-controls="open ? menuId : undefined"
                :data-testid="testid" @click="toggle" @keydown="onKey">
            <i v-if="icon" :class="icon" aria-hidden="true" />
            <span>{{ label }}</span>
            <i :class="up ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="menu-button-chevron" aria-hidden="true" />
        </Button>
        <div v-if="open" :id="menuId" ref="list" class="menu-button-list" :class="{ 'menu-button-list--up': up, 'menu-button-list--end': alignEnd }"
             role="menu" tabindex="-1" :aria-label="label" @keydown="onKey">
            <button v-for="item in items" :key="item.key" type="button" role="menuitem" tabindex="-1" class="menu-button-item"
                    :class="{ danger: item.danger }" :disabled="item.disabled" :data-testid="`${testid}-${item.key}`" @click="pick(item)">
                <i v-if="item.icon" :class="item.icon" aria-hidden="true" />
                <span>{{ item.label }}</span>
            </button>
        </div>
    </span>
</template>

<script setup>
/**
 * MenuButton - a button with a label that opens a menu of actions, on the light surfaces of the pages and the dialogs
 * (OverlayMenu is the "more" button of the dark viewer toolbars). The keyboard is the menu button's of useMenu: Enter,
 * Space or the down arrow opens it on the first item, the arrows move, Escape closes it and gives the focus back.
 *
 *   <MenuButton label="Export" icon="fa-solid fa-download" up :items="[{ key: 'csv', label: 'CSV' }]" @select="key => ..." />
 *
 * `up` opens the menu above the button (a button at the bottom of a dialog), `alignEnd` makes it end at the right edge of
 * the button.
 */
import { ref, computed, useId } from 'vue';
import Button from 'primevue/button';
import { useMenu } from '@/composables/useMenu';

defineOptions({ name: 'MenuButton' });

defineProps({
    /** The text of the button, and the accessible name of its menu */
    label: { type: String, required: true },
    icon: { type: String, default: '' },
    /** The actions: { key, label, icon?, danger?, disabled? }; `danger` marks one that deletes */
    items: { type: Array, required: true },
    up: { type: Boolean, default: false },
    alignEnd: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    severity: { type: String, default: 'secondary' },
    testid: { type: String, default: 'menu-button' }
});
const emit = defineEmits(['select']);

const root = ref(null);
const triggerButton = ref(null);
// useMenu focuses and compares elements: the element of the PrimeVue button
const trigger = computed(() => triggerButton.value?.$el ?? null);
const list = ref(null);
const menuId = useId();

const { open, close, toggle, onKey, onFocusOut } = useMenu({
    root, trigger, list,
    itemSelector: '[role="menuitem"]:not(:disabled)'
});

function pick(item) {
    close({ refocus: true });
    emit('select', item.key);
}
</script>

<style scoped>
.menu-button {
    position: relative;
    display: inline-flex;
}

.menu-button :deep(.p-button) {
    gap: 0.4rem;
}

.menu-button-chevron {
    font-size: 0.7em;
}

.menu-button-list {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    max-height: 16rem;
    overflow-y: auto;
    padding: 0.25rem;
    background: var(--ddb-bg-surface);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    box-shadow: var(--ddb-shadow-md);
}

.menu-button-list--up {
    top: auto;
    bottom: calc(100% + 0.25rem);
}

.menu-button-list--end {
    left: auto;
    right: 0;
}

.menu-button-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2rem;
    padding: 0 0.6rem;
    border: none;
    border-radius: var(--ddb-radius-sm);
    background: transparent;
    color: var(--ddb-text);
    font-size: 0.85rem;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}

.menu-button-item:hover:not(:disabled),
.menu-button-item:focus-visible {
    background: var(--ddb-bg-hover);
}

.menu-button-item:disabled {
    opacity: 0.45;
    cursor: default;
}

.menu-button-item.danger {
    color: var(--ddb-danger);
}
</style>
