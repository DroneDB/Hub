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
                <tr v-for="row in block.rows" :key="row.itemId || row.cells.path || row.cells.name">
                    <template v-for="(column, index) in block.columns" :key="column.key">
                        <th v-if="index === 0" scope="row" :class="`align-${column.align}`">
                            <a v-if="row.anchor" :href="row.anchor">{{ row.cells[column.key] }}</a>
                            <template v-else>{{ row.cells[column.key] }}</template>
                        </th>
                        <td v-else :class="`align-${column.align}`">
                            {{ row.cells[column.key] }}
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
defineProps({
    /** { title, columns: [{ key, label, align }], rows: [{ itemId, anchor, cells, note }] } */
    block: { type: Object, required: true }
});
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
    font-weight: 600;
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
    background: var(--ddb-bg-subtle);
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
