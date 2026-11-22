<template>
    <PrimeMessage :severity="block.tone === 'warning' ? 'warn' : 'info'" :closable="false" class="report-note" :role="block.tone === 'warning' ? 'alert' : 'status'">
        {{ block.text }}
    </PrimeMessage>
</template>

<script setup>
/** A note block: a line the report says about itself ("No items match the filter"), a warning where something is wrong. */
import PrimeMessage from 'primevue/message';

defineProps({
    /** { tone: 'info' | 'warning', text } */
    block: { type: Object, required: true }
});
</script>

<style scoped>
.report-note {
    margin-bottom: var(--ddb-spacing-md);
}
</style>
