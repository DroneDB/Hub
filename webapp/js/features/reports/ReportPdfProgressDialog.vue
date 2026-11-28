<template>
    <Window id="reportPdfProgress" :title="title" modal fixed-size size-class="dialog-xs" :busy="busy" @close="emit('close', 'cancel')">
        <div class="pdf-progress">
            <p class="pdf-progress-text" role="status" aria-live="polite">{{ text }}</p>
            <ProgressBar v-if="busy" mode="indeterminate" :aria-label="text" />
            <ProgressBar v-else :value="percent" :show-value="false" :aria-label="text" />
        </div>
        <template #footer>
            <Button label="Cancel" severity="secondary" :disabled="busy" data-cancel @click="emit('close', 'cancel')" />
        </template>
    </Window>
</template>

<script setup>
/**
 * The progress of the PDF of a report: the items rendered out of all of them, and Cancel (also the close button and
 * Escape), which stops the work. While the PDF is written to the dataset (`writing`) or its pages are laid out (`laying`)
 * a cancel cannot stop it, so none is offered: Cancel is disabled and the close button and Escape do nothing. The page closes it with 'done' at the end.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import Window from '@/components/HubWindow.vue';

const props = defineProps({
    /** 'download' | 'publish' */
    mode: { type: String, default: 'download' },
    done: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    /** The PDF is made and is being written to the dataset */
    writing: { type: Boolean, default: false },
    /** The library is laying out the pages: the page is busy until it is done, and a cancel cannot stop it */
    laying: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);

const title = computed(() => (props.mode === 'publish' ? 'Publishing the PDF' : 'Making the PDF'));
/** Neither writing the file nor laying out the pages can be stopped */
const busy = computed(() => props.writing || props.laying);
const text = computed(() => {
    if (props.laying) return 'Laying out the pages. This cannot be cancelled and may take a while';
    if (props.writing) return 'Writing the PDF to the dataset';
    return props.total ? `Rendered ${props.done} of ${props.total}` : 'Preparing the PDF';
});
const percent = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0));
</script>

<style scoped>
.pdf-progress {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
}

.pdf-progress-text {
    margin: 0;
}
</style>
