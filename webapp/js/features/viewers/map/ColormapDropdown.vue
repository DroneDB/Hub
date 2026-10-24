<template>
    <div ref="root" class="colormap-dropdown">
        <button :id="inputId" ref="trigger" class="colormap-trigger" type="button"
                aria-haspopup="listbox" :aria-expanded="open" :aria-controls="menuId"
                :aria-labelledby="ariaLabelledby" @click="toggleOpen" @keydown="onTriggerKey">
            <span v-if="selectedItem" class="colormap-preview" :style="gradientStyle(selectedItem.colors)" />
            <span class="colormap-label">{{ selectedItem ? selectedItem.name : 'Select...' }}</span>
            <i class="fas fa-chevron-down colormap-arrow" aria-hidden="true" />
        </button>
        <ul v-if="open" :id="menuId" ref="menu" class="colormap-menu" role="listbox" tabindex="-1"
            :aria-labelledby="ariaLabelledby" :aria-activedescendant="optionId(active)"
            @keydown="onMenuKey">
            <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -- the listbox owns the keyboard and points here with aria-activedescendant -->
            <li v-for="(cm, idx) in items" :id="optionId(idx)" :key="cm.id"
                class="colormap-option" role="option" tabindex="-1"
                :class="{ selected: cm.id === modelValue, active: idx === active }"
                :aria-selected="cm.id === modelValue"
                @click="select(cm)" @mousemove="active = idx">
                <span class="colormap-preview" :style="gradientStyle(cm.colors)" />
                <span class="colormap-label">{{ cm.name }}</span>
            </li>
        </ul>
    </div>
</template>

<script setup>
/**
 * ColormapDropdown - colormap picker with gradient preview swatches (a native select
 * cannot draw them). Keyboard follows the select-only combobox pattern: arrows open the
 * list and move, Enter/Space pick, Escape and Tab close.
 *
 *   <label id="cm-label" for="cm">Colormap</label>
 *   <ColormapDropdown v-model="colormap" :colormaps="list" input-id="cm" aria-labelledby="cm-label" />
 */
import { computed, nextTick, ref, useId } from 'vue';
import { useEventListener } from '@/composables/useEventListener';

const props = defineProps({
    /** ID of the selected colormap */
    modelValue: { type: String, default: '' },
    /** { id, name, colors } descriptors, or plain names */
    colormaps: { type: Array, default: () => [] },
    inputId: { type: String, default: undefined },
    ariaLabelledby: { type: String, default: undefined }
});

const emit = defineEmits(['update:modelValue']);

const root = ref(null);
const trigger = ref(null);
const menu = ref(null);
const open = ref(false);
const active = ref(-1);
const menuId = useId();

const items = computed(() => props.colormaps.map(cm =>
    typeof cm === 'string' ? { id: cm, name: cm, colors: [] } : cm));
const selectedIndex = computed(() => items.value.findIndex(cm => cm.id === props.modelValue));
const selectedItem = computed(() => items.value[selectedIndex.value] || null);

const optionId = idx => (idx >= 0 ? `${menuId}-${idx}` : undefined);

function gradientStyle(colors) {
    if (!colors || colors.length === 0) return {};
    return { background: `linear-gradient(to right, ${colors.join(', ')})` };
}

async function show() {
    open.value = true;
    active.value = Math.max(0, selectedIndex.value);
    await nextTick();
    menu.value?.focus();
    menu.value?.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' });
}

function close(refocus = false) {
    open.value = false;
    if (refocus) trigger.value?.focus();
}

function toggleOpen() {
    if (open.value) close();
    else show();
}

function select(cm) {
    close(true);
    emit('update:modelValue', cm.id);
}

function onTriggerKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show();
    }
}

function move(idx) {
    active.value = Math.min(Math.max(idx, 0), items.value.length - 1);
    nextTick(() => menu.value?.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' }));
}

function onMenuKey(e) {
    const keys = {
        ArrowDown: () => move(active.value + 1),
        ArrowUp: () => move(active.value - 1),
        Home: () => move(0),
        End: () => move(items.value.length - 1),
        Enter: () => items.value[active.value] && select(items.value[active.value]),
        ' ': () => items.value[active.value] && select(items.value[active.value]),
        Escape: () => close(true)
    };
    const action = keys[e.key];
    if (!action) {
        if (e.key === 'Tab') close();
        return;
    }
    // Escape here closes the list, not the dialog around it
    e.preventDefault();
    e.stopPropagation();
    action();
}

useEventListener(document, 'click', e => {
    if (open.value && root.value && !root.value.contains(e.target)) close();
});
</script>

<style scoped>
.colormap-dropdown {
    position: relative;
    width: 100%;
}

.colormap-trigger {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: var(--panel-text);
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
}

.colormap-trigger:focus-visible {
    outline: none;
    border-color: rgba(76, 175, 80, 0.6);
}

.colormap-arrow {
    margin-left: auto;
    font-size: 0.6rem;
    color: var(--panel-muted);
}

.colormap-menu {
    list-style: none;
    padding: 0;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    background: var(--panel-option-bg);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 0.25rem;
    margin-top: 2px;
    max-height: 12rem;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

.colormap-option {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.4rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--panel-text);
}

.colormap-option:hover,
.colormap-option.active {
    background: rgba(255,255,255,0.1);
}

.colormap-option.selected {
    background: rgba(76, 175, 80, 0.25);
}

.colormap-preview {
    display: inline-block;
    width: 3rem;
    min-width: 3rem;
    height: 0.7rem;
    border-radius: 2px;
}

.colormap-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
