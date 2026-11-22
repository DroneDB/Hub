<template>
    <figure class="report-figure">
        <div class="report-figure-frame" role="img" :aria-label="label">
            <i :class="icon" aria-hidden="true" />
        </div>
        <figcaption>{{ caption || label }}</figcaption>
    </figure>
</template>

<script setup>
/**
 * The frame of a figure of the report (a map snapshot, a chart, a 3D capture): its alternative text, its caption and,
 * until the renderer of the block draws into it, an icon. The renderers replace the frame's content, not the frame.
 */
defineProps({
    /** The alternative text: what the figure shows */
    label: { type: String, required: true },
    /** The caption under it; the label when none */
    caption: { type: String, default: '' },
    icon: { type: String, required: true }
});
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

figcaption {
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
}
</style>
