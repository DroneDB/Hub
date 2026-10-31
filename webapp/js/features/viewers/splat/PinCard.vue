<template>
    <article class="pin-card" aria-label="Pin">
        <header>
            <h3>{{ pin.title }}</h3>
            <button v-if="canWrite" class="card-action" title="Edit this pin" aria-label="Edit this pin" @click="emit('edit')">
                <i class="fa-solid fa-pen" />
            </button>
            <button class="card-action" title="Close" aria-label="Close" @click="emit('close')">
                <i class="fa-solid fa-xmark" />
            </button>
        </header>
        <img v-if="imageUrl" class="pin-image" :src="imageUrl" :alt="pin.title">
        <!-- eslint-disable-next-line vue/no-v-html -- Markdown rendered and sanitised by libs/markdown.js -->
        <div v-if="html" class="pin-text" v-html="html" />
        <small v-if="coordinates" class="pin-coordinates" title="Where the pin is">
            <i class="fa-solid fa-location-crosshairs" /> {{ coordinates }}
        </small>
        <a v-if="pin.link" class="pin-link" :href="pin.link" target="_blank" rel="noopener noreferrer">
            <i class="fa-solid fa-arrow-up-right-from-square" /> {{ pin.link }}
        </a>
    </article>
</template>

<script setup>
/**
 * PinCard - what a pin says: its title, the image from the dataset, the text (Markdown, rendered
 * and sanitised by the Markdown renderer of the Hub; an image in the text is not loaded, the
 * pin has its own), where it is on the Earth for a georeferenced splat, and its link, which opens
 * in another tab.
 */
import { computed } from 'vue';
import { renderMarkdown } from '@/libs/markdown';

const props = defineProps({
    /** @type {import('vue').PropType<import('./sceneData').Annotation>} */
    pin: { type: Object, required: true },
    /** The address of the pin's image, if it has one */
    imageUrl: { type: String, default: '' },
    canWrite: { type: Boolean, default: false },
    /** Where the pin is on the Earth (a georeferenced splat), already written; empty when it is not shown */
    coordinates: { type: String, default: '' }
});
const emit = defineEmits(['close', 'edit']);
const html = computed(() => renderMarkdown(props.pin.text, { allowImages: false }));
</script>

<style scoped>
.pin-card {
    pointer-events: auto;
    width: min(22rem, 90vw);
    max-height: 60vh;
    overflow-y: auto;
    padding: 0.6rem 0.75rem;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(255, 255, 255, 0.25);
    border-radius: var(--ddb-border-radius, 4px);
    color: var(--ddb-text-on-dark);
    text-align: left;
}

header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

h3 {
    flex: 1 1 auto;
    margin: 0;
    font-size: 1rem;
    overflow-wrap: anywhere;
}

.card-action {
    flex: 0 0 auto;
    width: 1.8rem;
    height: 1.8rem;
    border: none;
    border-radius: var(--ddb-border-radius, 4px);
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.card-action:hover {
    background: rgba(255, 255, 255, 0.15);
}

.pin-image {
    display: block;
    max-width: 100%;
    max-height: 12rem;
    margin: 0.5rem 0;
    border-radius: var(--ddb-border-radius, 4px);
}

.pin-text {
    margin-top: 0.4rem;
    font-size: var(--ddb-font-size-sm, 0.85rem);
    overflow-wrap: anywhere;
}

.pin-text :deep(p) {
    margin: 0 0 0.4rem;
}

.pin-text :deep(a),
.pin-link {
    color: var(--ddb-primary-200, #9cc4ff);
}

.pin-coordinates {
    display: block;
    margin-top: 0.4rem;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
}

.pin-link {
    display: block;
    margin-top: 0.4rem;
    font-size: var(--ddb-font-size-sm, 0.85rem);
    overflow-wrap: anywhere;
}
</style>
