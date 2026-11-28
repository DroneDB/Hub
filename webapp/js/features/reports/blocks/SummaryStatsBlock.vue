<template>
    <div class="report-summary">
        <p class="report-summary-total">{{ block.headline }}</p>

        <template v-if="block.totals.length">
            <h3 class="report-summary-title">Totals</h3>
            <dl class="report-summary-totals">
                <div v-for="total in block.totals" :key="total.label" class="report-summary-tile">
                    <dt>{{ total.label }}</dt>
                    <dd>
                        <span class="report-summary-value">{{ total.text }}</span>
                        <span v-if="total.partsText" class="report-summary-parts">{{ total.partsText }}</span>
                    </dd>
                </div>
            </dl>
        </template>

        <h3 v-if="block.groups.length" class="report-summary-title">Breakdown</h3>
        <div v-if="block.chart === 'donuts'" class="report-summary-donuts">
            <SummaryDonut v-for="group in block.groups" :key="group.key" :group="group" />
        </div>
        <div v-else class="report-summary-counts">
            <section v-for="group in block.groups" :key="group.key" class="report-summary-group">
                <h4 class="report-summary-group-title">{{ group.title }}</h4>
                <ul>
                    <li v-for="count in group.counts" :key="count.key" class="report-summary-bar">
                        <span class="report-summary-bar-label">{{ count.label }}</span>
                        <span class="report-summary-bar-track" aria-hidden="true">
                            <span class="report-summary-bar-fill" :style="{ width: barWidth(group, count), background: count.colour || undefined }" />
                        </span>
                        <span class="report-summary-bar-count">{{ count.count }}</span>
                    </li>
                </ul>
            </section>
        </div>
    </div>
</template>

<script setup>
/**
 * The summary block: how many items there are (overdue ones apart), the totals the items add up to as tiles, and the
 * counts by kind, category, severity and status in the chart the template chose: bars, each as long as its count is of
 * the largest of its group, or a donut per group (SummaryDonut). Each count is in the colour of what it counts and says
 * its name and its number: no meaning is carried by colour alone. Every text, the titles of the groups too, is the
 * model's, so the PDF writes the same.
 */
import SummaryDonut from './SummaryDonut.vue';

defineProps({
    /** { chart, total, overdue, headline, totals, groups: [{ key, title, middle, counts: [{ key, label, count, share, colour }] }] } */
    block: { type: Object, required: true }
});

/** @param {{ counts: { count: number }[] }} group @param {{ count: number }} count */
function barWidth(group, count) {
    const max = Math.max(...group.counts.map(c => c.count), 0);
    return max ? `${Math.max(2, (count.count / max) * 100)}%` : '0';
}
</script>

<style scoped>
.report-summary {
    margin-bottom: var(--ddb-spacing-md);
}

.report-summary-total {
    font-weight: 600;
}

.report-summary-title {
    margin: var(--ddb-spacing-md) 0 var(--ddb-spacing-sm);
    color: var(--report-primary, var(--ddb-primary));
    font-size: var(--ddb-font-size-base, 1rem);
}

.report-summary-totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--ddb-spacing-sm);
    margin: 0;
}

.report-summary-tile {
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-top: 4px solid var(--report-accent, var(--ddb-primary));
    border-radius: var(--ddb-radius-sm);
    background: color-mix(in srgb, var(--report-accent, var(--ddb-primary)) 10%, var(--ddb-bg));
}

dt {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-xs, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

dd {
    display: flex;
    flex-direction: column;
    margin: 0;
}

.report-summary-value {
    font-size: 1.25rem;
    font-weight: 700;
}

.report-summary-parts {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-xs, 0.75rem);
}

.report-summary-counts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--ddb-spacing-md) var(--ddb-spacing-xl);
}

.report-summary-donuts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: var(--ddb-spacing-lg) var(--ddb-spacing-xl);
}

.report-summary-group-title {
    margin: 0 0 var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-sm);
    font-weight: 700;
}

ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.report-summary-bar {
    display: grid;
    grid-template-columns: minmax(5rem, 40%) 1fr 2rem;
    gap: var(--ddb-spacing-sm);
    align-items: center;
    font-size: var(--ddb-font-size-sm);
}

.report-summary-bar-track {
    height: 0.5rem;
    border-radius: 999px;
    background: var(--ddb-bg-subtle);
    overflow: hidden;
}

.report-summary-bar-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--ddb-text-secondary);
}

.report-summary-bar-count {
    font-weight: 700;
    text-align: right;
}
</style>
