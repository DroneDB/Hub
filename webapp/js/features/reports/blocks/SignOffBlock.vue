<template>
    <div class="report-sign-off">
        <p v-if="block.preparedBy" class="report-sign-off-by">Prepared by {{ block.preparedBy }}</p>
        <div class="report-sign-off-lines">
            <div v-for="line in block.lines" :key="line.label" class="report-sign-off-line">
                <span class="report-sign-off-rule" />
                <span>{{ line.label }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
/** The sign-off block: the lines a reader fills in on paper (name, signature, date). */
defineProps({
    /** { preparedBy, lines: [{ label }] } */
    block: { type: Object, required: true }
});
</script>

<style scoped>
.report-sign-off-lines {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-lg);
}

.report-sign-off-line {
    flex: 1 1 9rem;
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
}

.report-sign-off-rule {
    height: 2rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-text-secondary);
}
</style>
