<template>
    <Window id="reportPdfProgress" :title="title" modal fixed-size size-class="dialog-xs" @close="emit('close', 'cancel')">
        <div class="pdf-progress">
            <p class="pdf-progress-text" role="status" aria-live="polite">{{ text }}</p>
            <ProgressBar :value="percent" :show-value="false" :aria-label="text" />
        </div>
        <template #footer>
            <Button label="Cancel" severity="secondary" data-cancel @click="emit('close', 'cancel')" />
        </template>
    </Window>
</template>

<script setup>
/**
 * The progress of the PDF of a report: the items rendered out of all of them, and Cancel (also the close button and
 * Escape), which stops the work. The page closes it with 'done' when the PDF is made.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import Window from '@/components/HubWindow.vue';

const props = defineProps({
    /** 'download' | 'publish' */
    mode: { type: String, default: 'download' },
    done: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
});
const emit = defineEmits(['close']);

const title = computed(() => (props.mode === 'publish' ? 'Publishing the PDF' : 'Making the PDF'));
const text = computed(() => (props.total ? `Rendered ${props.done} of ${props.total}` : 'Preparing the PDF'));
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
