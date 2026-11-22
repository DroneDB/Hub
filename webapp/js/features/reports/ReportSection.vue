<template>
    <section class="report-section" :data-section="section.kind">
        <template v-for="(block, index) in section.blocks" :key="index">
            <ReportBlock :block="block" :item-name="itemNameAt(index)" />
        </template>
    </section>
</template>

<script setup>
/**
 * One section of the report model: its blocks in order. The model's first block of a section is its heading, so the
 * section is named by it (the level of a heading is shifted by one under the page's h1).
 */
import ReportBlock from './ReportBlock.vue';

const props = defineProps({
    /** { kind, title, blocks } */
    section: { type: Object, required: true }
});

/** The text of the last heading before a block: the name of the item whose page it is on. @param {number} index */
function itemNameAt(index) {
    for (let i = index - 1; i >= 0; i--) {
        const block = props.section.blocks[i];
        if (block.type === 'heading' && block.itemId) return block.text;
    }
    return '';
}
</script>

<style scoped>
.report-section {
    margin-bottom: var(--ddb-spacing-xl);
}
</style>
