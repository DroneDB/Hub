<template>
    <div v-if="percent !== null" class="load-progress">
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="percent">
            <div class="progress-fill" :style="{ width: percent + '%' }" />
        </div>
        <p class="progress-text">{{ percent }}%</p>
    </div>
</template>

<script setup>
/**
 * LoadProgress - the progress bar of a viewer that loads a file: a thin bar and the percentage under
 * the spinner of the loading indicator. Nothing is shown while the size of the load is not known.
 *
 *   <LoadingSpinner :label="text" />
 *   <LoadProgress :progress="progress" />       // 0..1, or null when not known
 */
import { computed } from 'vue';

const props = defineProps({
    /** Fraction loaded (0 to 1); null when the total is not known */
    progress: { type: Number, default: null }
});

const percent = computed(() => (props.progress === null || !Number.isFinite(props.progress)
    ? null
    : Math.round(Math.min(1, Math.max(0, props.progress)) * 100)));
</script>

<style scoped>
.progress-track {
    width: 12rem;
    height: 0.4rem;
    margin: 0.5rem auto 0;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 0.2rem;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: var(--ddb-primary);
    transition: width 0.2s ease;
}

.progress-text {
    margin: 0.25rem 0 0;
    font-size: 0.85em;
}
</style>
