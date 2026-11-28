<template>
    <!-- The page's own h1 is the report name: the model's level 1 is the h2 of a section -->
    <component :is="tag" :id="block.anchor || undefined" :tabindex="block.anchor ? -1 : undefined" class="report-heading" :class="{ 'report-section-title': block.level === 1 }">
        {{ block.text }}
        <a v-if="block.anchor" class="report-heading-anchor" :href="`#${block.anchor}`" :aria-label="`Link to ${block.text}`">
            <i class="fa-solid fa-link" aria-hidden="true" />
        </a>
        <a v-if="block.viewerUrl" class="report-heading-viewer" :href="block.viewerUrl" target="_blank" rel="noopener">
            Open in viewer<span class="visually-hidden"> ({{ block.text }}, opens in a new tab)</span>
        </a>
    </component>
</template>

<script setup>
/**
 * A heading block: a section title, the subtitle of the cover, or the heading of an item page. An item's heading is the
 * anchor of the item (`#item-<id>`) and offers "Open in viewer" when it has a viewer address.
 */
import { computed } from 'vue';

const props = defineProps({
    /** { level: 1-3, text, anchor, viewerUrl } */
    block: { type: Object, required: true }
});

// The level of the block, one deeper: the report name is the page's h1
const tag = computed(() => `h${Math.min(props.block.level + 1, 6)}`);
</script>

<style scoped>
.report-heading {
    margin: var(--ddb-spacing-lg) 0 var(--ddb-spacing-sm);
    scroll-margin-top: var(--ddb-spacing-lg);
}

.report-section-title {
    margin-top: var(--ddb-spacing-xl);
    color: var(--report-primary, var(--ddb-primary));
    font-size: 1.6rem;
}

.report-section-title::after {
    content: '';
    display: block;
    width: 3rem;
    height: 4px;
    margin-top: var(--ddb-spacing-xs);
    border-radius: 2px;
    background: var(--report-accent, var(--ddb-primary));
}

.report-heading:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: 2px;
}

.report-heading-anchor,
.report-heading-viewer {
    margin-left: var(--ddb-spacing-sm);
    font-size: var(--ddb-font-size-sm);
    font-weight: normal;
}

.report-heading-anchor {
    opacity: 0.6;
}

.report-heading-anchor:hover,
.report-heading-anchor:focus-visible {
    opacity: 1;
}
</style>
