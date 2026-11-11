<template>
    <span v-if="inline" class="loading-spinner inline" role="status">
        <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
        <span v-if="label">{{ label }}</span>
        <span v-else class="visually-hidden">Loading</span>
    </span>
    <div v-else class="loading-spinner" :class="size" role="status">
        <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
        <p v-if="label">{{ label }}</p>
        <span v-else class="visually-hidden">Loading</span>
    </div>
</template>

<script setup>
/**
 * LoadingSpinner - the one "loading" indicator:
 * a centered block, or inline next to text. Announced to screen readers.
 *
 *   <LoadingSpinner v-if="loading" />
 *   <LoadingSpinner v-if="loading" size="lg" label="Loading configuration..." />
 *   <LoadingSpinner inline label="Validating..." />
 */
defineProps({
    label: { type: String, default: '' },
    /** Block size: 'md' or 'lg' */
    size: { type: String, default: 'md' },
    inline: { type: Boolean, default: false }
});
</script>

<style scoped>
.loading-spinner {
    text-align: center;
    padding: 0.75rem;
}

.loading-spinner.lg {
    padding: 3rem 0;
    font-size: 2em;
}

.loading-spinner.lg p {
    font-size: 0.5em;
    margin-top: 0.5rem;
}

.loading-spinner p {
    margin: 0.5rem 0 0;
}

.loading-spinner.inline {
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}
</style>
