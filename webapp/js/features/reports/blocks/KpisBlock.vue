<template>
    <ul class="report-kpis" data-block="kpis">
        <li v-for="tile in block.tiles" :key="tile.key" class="report-kpi" :class="`tone-${tile.tone}`">
            <span class="report-kpi-value">{{ tile.value }}</span>
            <span class="report-kpi-label">{{ tile.label }}</span>
            <span class="report-kpi-detail">{{ tile.detail }}</span>
        </li>
    </ul>
</template>

<script setup>
/**
 * The headline figures of a report as tiles: the number, its name and what it means. The tone colours the tile (the
 * neutral one takes the primary colour of the template); the name and the detail say the same in words.
 */
defineProps({
    /** { tiles: [{ key, label, value, detail, tone: 'neutral' | 'info' | 'alert' | 'done' }] } */
    block: { type: Object, required: true }
});
</script>

<style scoped>
.report-kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--ddb-spacing-sm);
    margin: 0 0 var(--ddb-spacing-lg);
    padding: 0;
    list-style: none;
}

.report-kpi {
    --tone: var(--report-primary, var(--ddb-primary));
    display: flex;
    flex-direction: column;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md) var(--ddb-spacing-md);
    border-top: 4px solid var(--tone);
    border-radius: var(--ddb-radius-sm);
    background: color-mix(in srgb, var(--tone) 9%, var(--ddb-bg));
}

.tone-info { --tone: var(--ddb-primary); }
.tone-alert { --tone: var(--ddb-danger); }
.tone-done { --tone: var(--ddb-success); }

.report-kpi-value {
    color: var(--tone);
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
}

.report-kpi-label {
    margin-top: var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-xs, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.report-kpi-detail {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-xs, 0.75rem);
}
</style>
