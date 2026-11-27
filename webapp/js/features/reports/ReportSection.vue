<template>
    <section class="report-section" :data-section="section.kind">
        <template v-for="(part, index) in parts" :key="index">
            <ReportCover v-if="part.type === 'cover'" :part="part" />
            <ReportItemCard v-else-if="part.type === 'item'" :part="part" />
            <ReportBlock v-else :block="part.block" />
        </template>
    </section>
</template>

<script setup>
/**
 * One section of the report model: its parts in order (libs/reports/reportParts): the cover is laid out as one, each
 * item page as a card, every other block on its own. The model's first block of a section is its heading, so the
 * section is named by it (the level of a heading is shifted by one under the page's h1).
 */
import { computed } from 'vue';
import { sectionParts } from '@/libs/reports/reportParts';
import ReportBlock from './ReportBlock.vue';
import ReportCover from './ReportCover.vue';
import ReportItemCard from './ReportItemCard.vue';

const props = defineProps({
    /** { kind, title, blocks } */
    section: { type: Object, required: true }
});

const parts = computed(() => sectionParts(props.section));
</script>

<style scoped>
.report-section {
    margin-bottom: var(--ddb-spacing-xl);
}
</style>
