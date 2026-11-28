<template>
    <dl class="report-key-values">
        <div v-for="row in block.rows" :key="row.label" class="report-key-value">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
        </div>
    </dl>
</template>

<script setup>
/** A key/value block: the label and the text of each row (the text is already written by the model). */
defineProps({
    /** { rows: [{ label, value }] } */
    block: { type: Object, required: true }
});
</script>

<style scoped>
.report-key-values {
    display: grid;
    grid-template-columns: minmax(7rem, max-content) 1fr;
    gap: var(--ddb-spacing-xs) var(--ddb-spacing-md);
    margin: 0 0 var(--ddb-spacing-md);
}

.report-key-value {
    display: contents;
}

dt {
    color: var(--ddb-text-secondary);
    font-weight: normal;
}

dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
}
</style>
