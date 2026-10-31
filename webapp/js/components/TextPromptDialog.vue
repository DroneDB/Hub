<template>
    <Window :title="title" modal fixed-size max-width="90%" size-class="dialog-sm" :confirm-label="confirmLabel"
            :confirm-disabled="!valid" @confirm="confirm" @close="emit('close', null)">
        <label v-if="label" :for="inputId" class="prompt-label">{{ label }}</label>
        <InputText :id="inputId" v-model="value" :maxlength="maxLength" :aria-label="label || title" data-autofocus fluid />
        <small class="prompt-hint">{{ hint }}</small>
    </Window>
</template>

<script setup>
/**
 * TextPromptDialog - asks for one line of text (a name). Closes with the trimmed text, or
 * null when cancelled.
 *
 *   const name = await dialogs.open(TextPromptDialog, { title: 'Save comparison', label: 'Name', maxLength: 100 });
 */
import { ref, computed, useId } from 'vue';
import InputText from 'primevue/inputtext';
import Window from '@/components/HubWindow.vue';

const props = defineProps({
    title: { type: String, required: true },
    label: { type: String, default: '' },
    initialValue: { type: String, default: '' },
    confirmLabel: { type: String, default: 'Save' },
    maxLength: { type: Number, default: 100 }
});
const emit = defineEmits(['close']);

const inputId = useId();
const value = ref(props.initialValue);
const trimmed = computed(() => value.value.trim());
const valid = computed(() => trimmed.value.length >= 1 && trimmed.value.length <= props.maxLength);
const hint = computed(() => `${trimmed.value.length} / ${props.maxLength}`);

function confirm() {
    if (valid.value) emit('close', trimmed.value);
}
</script>

<style scoped>
.prompt-label {
    display: block;
    margin-bottom: 0.35rem;
}

.prompt-hint {
    display: block;
    margin-top: 0.25rem;
    color: var(--ddb-text-muted);
}
</style>
