<template>
    <figure class="report-figure" :aria-busy="busy ? 'true' : undefined">
        <!-- The image once the renderer has drawn it, with the alternative text; until then (and when it cannot) the icon stands for it -->
        <div v-if="image" class="report-figure-frame has-image">
            <img class="report-figure-image" :src="image" :alt="label" @error="$emit('imageError')">
        </div>
        <div v-else class="report-figure-frame" role="img" :aria-label="label">
            <i :class="icon" aria-hidden="true" />
        </div>
        <figcaption>{{ caption || label }}</figcaption>
        <p v-if="error" class="report-figure-error" role="alert">
            {{ error }}
            <Button v-if="retryable" label="Retry" size="small" severity="secondary" text @click="$emit('retry')" />
        </p>
    </figure>
</template>

<script setup>
/**
 * The frame of a figure of the report (a map snapshot, a chart, a 3D capture): its alternative text, its caption and the
 * image the renderer of the block drew (an icon stands for it until then, and when it could not). The renderers decide
 * what the image is; the frame is the same for all of them.
 */
import Button from 'primevue/button';

defineProps({
    /** The alternative text: what the figure shows */
    label: { type: String, required: true },
    /** The caption under it; the label when none */
    caption: { type: String, default: '' },
    icon: { type: String, required: true },
    /** The address of the image, once there is one */
    image: { type: String, default: '' },
    /** Why the figure could not be drawn, said under it */
    error: { type: String, default: '' },
    /** The error can be tried again (a Retry button) */
    retryable: { type: Boolean, default: false },
    /** The image is being drawn */
    busy: { type: Boolean, default: false }
});

defineEmits(['retry', 'imageError']);
</script>

<style scoped>
.report-figure {
    margin: 0 0 var(--ddb-spacing-md);
}

.report-figure-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 40rem;
    min-height: 8rem;
    border: var(--ddb-border-width) dashed var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-subtle);
    color: var(--ddb-text-secondary);
    font-size: 2rem;
}

.report-figure-frame.has-image {
    display: block;
    min-height: 0;
    border-style: solid;
    background: var(--ddb-bg);
    overflow: hidden;
}

.report-figure-image {
    display: block;
    width: 100%;
    height: auto;
}

figcaption {
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
}

.report-figure-error {
    margin: var(--ddb-spacing-xs) 0 0;
    font-size: var(--ddb-font-size-sm);
}
</style>
