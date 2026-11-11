<template>
    <IconField class="search-field" :data-owns-escape="model ? '' : undefined" @keydown.esc="onEscape">
        <InputIcon class="fa-solid fa-magnifying-glass" />
        <InputText ref="input" v-model="model" :size="size" :placeholder="placeholder || label" :aria-label="label" autocomplete="off"
                   fluid @keyup.enter="$emit('enter', model)" />
        <Button v-if="model" class="search-field-clear" icon="fa-solid fa-xmark" severity="secondary" text rounded size="small"
                title="Clear search" aria-label="Clear search" @click="clear" />
    </IconField>
</template>

<script setup>
/**
 * SearchField - the one search box of the Hub (FR-XC-20): the search icon, the field, and a
 * 'Clear search' button while the field is not empty. Escape empties the field (it is the field's key
 * while there is text, so a dialog that holds it stays open: useOverlay's data-owns-escape; with
 * nothing to clear the key goes to the dialog as usual). Clearing, by the button or by Escape,
 * emits `clear` after the model is emptied and keeps the focus in the field. Escape is the key of the
 * whole field, its Clear button too. `focus()` puts the focus in the field (an empty state's Clear search,
 * whose button goes with the query, hands the focus back here).
 *
 *   <SearchField v-model="searchQuery" label="Search users" />
 */
import { useTemplateRef } from 'vue';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';

defineOptions({ name: 'SearchField' });

const model = defineModel({ type: String, default: '' });
defineProps({
    /** The accessible name of the field, and its placeholder unless `placeholder` is given */
    label: { type: String, required: true },
    placeholder: { type: String, default: '' },
    /** 'small' | 'large' (PrimeVue's size of a field) */
    size: { type: String, default: undefined }
});
const emit = defineEmits(['clear', 'enter']);
const input = useTemplateRef('input');

/** @param {KeyboardEvent} e */
function onEscape(e) {
    if (!model.value) return;
    // The key is the field's: no dialog or menu around it takes it as well
    e.preventDefault();
    e.stopPropagation();
    clear();
}

function focus() {
    input.value?.$el?.focus();
}

function clear() {
    model.value = '';
    emit('clear');
    // The button leaves with the text: the focus stays in the field, not on the page
    focus();
}

defineExpose({ focus });
</script>

<style scoped>
.search-field {
    position: relative;
    min-width: 0;
}

/* Room for the button over the end of the field */
.search-field :deep(.p-inputtext) {
    padding-inline-end: 2.5rem;
}

.search-field-clear {
    position: absolute;
    top: 50%;
    inset-inline-end: 0.25rem;
    transform: translateY(-50%);
    width: 2rem;
    height: 2rem;
}
</style>
