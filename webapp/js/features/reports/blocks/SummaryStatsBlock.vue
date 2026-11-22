<template>
    <div class="report-summary">
        <p class="report-summary-total">{{ block.total.text }}<span v-if="block.overdue.count"> ({{ block.overdue.text }} overdue)</span></p>

        <dl v-if="block.totals.length" class="report-summary-totals">
            <div v-for="total in block.totals" :key="total.label" class="report-summary-total-row">
                <dt>{{ total.label }}</dt>
                <dd>
                    {{ total.text }}
                    <span v-if="total.parts.length > 1" class="report-summary-parts">
                        ({{ total.parts.map(part => `${part.text} ${part.tag}`).join(', ') }})
                    </span>
                </dd>
            </div>
        </dl>

        <div class="report-summary-counts">
            <section v-for="group in groups" :key="group.title" class="report-summary-group">
                <h3 class="report-summary-group-title">{{ group.title }}</h3>
                <ul>
                    <li v-for="count in group.counts" :key="count.key">{{ count.label }}: {{ count.count }}</li>
                </ul>
            </section>
        </div>
    </div>
</template>

<script setup>
/**
 * The summary block: how many items there are (overdue ones apart), the totals the items add up to, and the counts by
 * kind, category, severity and status. A count says its name: no meaning is carried by colour.
 */
import { computed } from 'vue';

const props = defineProps({
    /** { total, overdue, totals, byKind, byCategory, bySeverity, byStatus } */
    block: { type: Object, required: true }
});

const groups = computed(() => [
    { title: 'By kind', counts: props.block.byKind },
    { title: 'By category', counts: props.block.byCategory },
    { title: 'By severity', counts: props.block.bySeverity },
    { title: 'By status', counts: props.block.byStatus }
].filter(group => group.counts.length));
</script>

<style scoped>
.report-summary {
    margin-bottom: var(--ddb-spacing-md);
}

.report-summary-total {
    font-weight: 600;
}

.report-summary-totals {
    margin: 0 0 var(--ddb-spacing-md);
}

.report-summary-total-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-sm);
}

dt {
    min-width: 8rem;
    color: var(--ddb-text-secondary);
    font-weight: normal;
}

dd {
    margin: 0;
}

.report-summary-parts {
    color: var(--ddb-text-secondary);
}

.report-summary-counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-lg);
}

.report-summary-group-title {
    margin: 0 0 var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-base, 1rem);
    font-weight: 600;
}

ul {
    margin: 0;
    padding-left: var(--ddb-spacing-lg);
}
</style>
