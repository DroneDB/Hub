<template>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown (markdown-it, then DOMPurify) -->
    <div class="report-markdown" v-html="html" />
</template>

<script setup>
/**
 * A markdown block: the notes of the report, the disclaimer of its template, the description of an item. The text is
 * the user's (an editor's, an organization administrator's): it goes through the one markdown path (markdown-it, then
 * DOMPurify), with no image from a host the Hub does not control, and links to web pages only, in a new tab.
 */
import { computed } from 'vue';
import { renderMarkdown } from '@/libs/markdown';

const props = defineProps({
    /** { text } */
    block: { type: Object, required: true }
});

const html = computed(() => renderMarkdown(props.block.text, { allowImages: false }));
</script>

<style scoped>
.report-markdown {
    margin-bottom: var(--ddb-spacing-md);
    overflow-wrap: anywhere;
}

.report-markdown :deep(:first-child) {
    margin-top: 0;
}

.report-markdown :deep(:last-child) {
    margin-bottom: 0;
}
</style>
