<template>
    <div class="copyable-coordinates">
        <span :id="labelId" class="d-block mb-1 fw-semibold">{{ label }}</span>
        <div class="coords-row" role="group" :aria-labelledby="labelId">
            <code class="coords-text">{{ text }}</code>
            <Button type="button" severity="secondary" text size="small" :icon="copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'"
                    :title="copyLabel" :aria-label="copyLabel" :disabled="!copyable" @click="copy(copyable)" />
        </div>
    </div>
</template>

<script setup>
/**
 * The read-only coordinates of an annotation in its properties dialog (the 3D viewer's), with a button that copies
 * them: `copyText` when what is pasted elsewhere differs from what is shown (a number without its grouping commas),
 * else the text shown.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { useCopyText } from '@/composables/useCopyText';

const props = defineProps({
    /** id of the label, which names the group */
    labelId: { type: String, required: true },
    label: { type: String, default: 'Coordinates' },
    text: { type: String, required: true },
    copyText: { type: String, default: '' }
});

const { copy, copied } = useCopyText({ resetMs: 1500 });
const copyable = computed(() => props.copyText || props.text);
const copyLabel = computed(() => (copied.value ? 'Copied!' : 'Copy coordinates'));
</script>

<style scoped>
.coords-row {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-xs) var(--ddb-spacing-xs) var(--ddb-spacing-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background-color: var(--ddb-bg-subtle);
}

.coords-text {
    flex: 1;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text);
    word-break: break-all;
}
</style>
