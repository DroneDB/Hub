<template>
    <!-- The table scrolls inside its own region, so the page has no horizontal scroll at 360 px -->
    <div class="report-table-scroll" role="region" :aria-label="block.title" tabindex="0">
        <table class="report-table">
            <caption>{{ block.title }}</caption>
            <thead>
                <tr>
                    <th v-for="column in block.columns" :key="column.key" scope="col" :class="`align-${column.align}`">{{ column.label }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                    <template v-for="(column, index) in block.columns" :key="column.key">
                        <th v-if="index === 0" scope="row" :class="`align-${column.align}`">
                            <a v-if="row.anchor" :href="row.anchor">{{ row.cells[column.key] }}</a>
                            <template v-else>{{ row.cells[column.key] }}</template>
                        </th>
                        <td v-else :class="[`align-${column.align}`, markClass(row, column.key)]">
                            <span v-if="hasSwatch(row, column.key)" class="report-swatch" :style="{ background: row.marks[column.key] }" aria-hidden="true" />
                            <span v-if="isPill(row, column.key)" class="report-status-pill" :style="pillStyle(row)">{{ row.cells[column.key] }}</span>
                            <template v-else>{{ row.cells[column.key] }}</template>
                            <span v-if="row.note && column.key === 'name'" class="report-row-note">({{ row.note }})</span>
                        </td>
                    </template>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup>
/**
 * A table block: the first column names the row (a link to the item's page when it has an anchor), the others are its
 * values. The text of every cell is the model's.
 */
import { softBadge } from '@/libs/reports/reportStyling';

defineProps({
    /** { title, columns: [{ key, label, align }], rows: [{ itemId, anchor, cells, note, marks }] } */
    block: { type: Object, required: true }
});

// A category or severity has a square of its colour before its name; a status is a pill: its colour as a light fill with
// a darker text, which reads on a dark page too (the colour alone does not), and red and bold when the item is overdue
// (its text says "overdue" too)
/** @param {any} row @param {string} key */
const hasSwatch = (row, key) => (key === 'category' || key === 'severity') && !!row.marks?.[key];
/** @param {any} row @param {string} key */
const markClass = (row, key) => (key === 'status' && row.marks?.status ? (row.marks.overdue ? 'report-status overdue' : 'report-status') : '');
/** A status that is not overdue is the pill. @param {any} row @param {string} key */
const isPill = (row, key) => key === 'status' && !!row.marks?.status && !row.marks.overdue;
/** @param {any} row */
const pillStyle = row => {
    const { fill, text } = softBadge(row.marks.status);
    return { background: fill, color: text };
};
</script>

<style scoped>
.report-table-scroll {
    max-width: 100%;
    margin-bottom: var(--ddb-spacing-md);
    overflow-x: auto;
}

.report-table {
    width: 100%;
    border-collapse: collapse;
}

caption {
    padding: var(--ddb-spacing-xs) 0;
    color: var(--report-primary, var(--ddb-primary));
    font-weight: 700;
    text-align: left;
}

th,
td {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
}

thead th {
    background: var(--report-primary, var(--ddb-primary));
    color: var(--report-on-primary, var(--ddb-text-on-color));
    font-size: var(--ddb-font-size-sm);
}

tbody tr:nth-child(even) {
    background: var(--ddb-bg-subtle);
}

tbody th a {
    font-weight: 700;
}

.report-swatch {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    margin-right: 0.3rem;
    border-radius: 2px;
}

.report-status {
    font-weight: 600;
}

.report-status-pill {
    display: inline-block;
    padding: 0 0.5rem;
    border-radius: 999px;
}

.report-status.overdue {
    color: var(--ddb-danger);
    font-weight: 700;
}

tbody th {
    font-weight: normal;
}

.align-right {
    text-align: right;
}

.report-row-note {
    color: var(--ddb-text-secondary);
}
</style>
