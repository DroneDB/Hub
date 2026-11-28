<template>
    <section class="report-donut">
        <h4 class="report-donut-title">{{ group.title }}</h4>
        <svg class="report-donut-ring" :viewBox="`0 0 ${geometry.size} ${geometry.size}`" aria-hidden="true">
            <path v-for="slice in geometry.slices" :key="slice.key" :d="slice.d" :fill="slice.colour" fill-rule="evenodd" :stroke-width="gap" stroke-linejoin="round">
                <title>{{ slice.title }}</title>
            </path>
            <text :x="geometry.centre.x" :y="geometry.centre.y + 4" text-anchor="middle" class="report-donut-number">{{ group.middle.number }}</text>
            <text :x="geometry.centre.x" :y="geometry.centre.y + 19" text-anchor="middle" class="report-donut-word">{{ group.middle.word }}</text>
        </svg>
        <ul class="report-donut-legend">
            <li v-for="count in group.counts" :key="count.key">
                <span class="report-donut-swatch" :style="{ background: count.colour }" aria-hidden="true" />
                <span class="report-donut-label">{{ count.label }}</span>
                <span class="report-donut-count">{{ count.count }}</span>
                <span class="report-donut-share">{{ count.share }}</span>
            </li>
        </ul>
    </section>
</template>

<script setup>
/**
 * A group of counts of the summary as a donut: a slice per count in the colour of what it counts, the number of items
 * of the group in the hole, and a legend beside it with the name, the count and the share of each, so that nothing is
 * read from the size of a slice or its colour alone. The ring is the one the PDF draws (donutGeometry).
 */
import { computed } from 'vue';
import { DONUT_GAP, donutGeometry } from '@/libs/reports/donutChart';

const props = defineProps({
    /** { key, title, middle: { number, word }, counts: [{ key, label, count, share, colour }] } */
    group: { type: Object, required: true }
});

const gap = DONUT_GAP;
const geometry = computed(() => donutGeometry(props.group.counts));
</script>

<style scoped>
.report-donut {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: var(--ddb-spacing-md);
    align-items: center;
    /* The title on top whatever the height of the row of groups */
    align-content: start;
    min-width: 0;
}

.report-donut-title {
    grid-column: 1 / -1;
    margin: 0 0 var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-sm);
    font-weight: 700;
}

.report-donut-ring {
    display: block;
    width: 7rem;
    height: 7rem;
}

.report-donut-ring path {
    stroke: var(--ddb-bg);
}

.report-donut-number {
    fill: var(--ddb-text);
    font-family: inherit;
    font-size: 22px;
    font-weight: 700;
}

.report-donut-word {
    fill: var(--ddb-text-secondary);
    font-family: inherit;
    font-size: 11px;
}

.report-donut-legend {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
}

.report-donut-legend li {
    display: grid;
    grid-template-columns: 0.625rem minmax(0, 1fr) 1.75rem 2.75rem;
    gap: var(--ddb-spacing-sm);
    align-items: center;
    font-size: var(--ddb-font-size-sm);
}

.report-donut-swatch {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 3px;
}

.report-donut-label {
    overflow-wrap: break-word;
}

.report-donut-count {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
}

.report-donut-share {
    color: var(--ddb-text-secondary);
    font-variant-numeric: tabular-nums;
    text-align: right;
}

@media (max-width: 22rem) {
    .report-donut {
        grid-template-columns: 1fr;
        row-gap: var(--ddb-spacing-sm);
    }
}
</style>
