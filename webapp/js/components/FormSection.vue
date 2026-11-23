<template>
    <AccordionPanel :value="value" class="form-section">
        <AccordionHeader :data-testid="headerTestid">
            <span class="form-section-header">
                <span class="form-section-title fw-semibold">{{ title }}</span>
                <small v-if="summary || $slots.summary" class="form-section-summary" :data-testid="summaryTestid">
                    <slot name="summary">{{ summary }}</slot>
                </small>
            </span>
        </AccordionHeader>
        <AccordionContent>
            <slot />
        </AccordionContent>
    </AccordionPanel>
</template>

<script setup>
/**
 * FormSection - a part of a form that folds away (a panel of a PrimeVue Accordion): a title, and under it one line
 * that sums up what the part holds, so that a closed part still says what is in it. The fields stay in the page when
 * the part is closed (the Accordion is not lazy): their checks still run.
 *
 *   <Accordion v-model:value="open" multiple>
 *       <FormSection value="style" title="Appearance" summary="Line 2 px"> ...fields... </FormSection>
 *   </Accordion>
 *
 * The `summary` slot takes what is more than text (a colour).
 */
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';

defineOptions({ name: 'FormSection' });

defineProps({
    /** The id of the part in the Accordion's value */
    value: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    headerTestid: { type: String, default: undefined },
    summaryTestid: { type: String, default: undefined }
});
</script>

<style scoped>
/* Tighter than PrimeVue's panels: a form has several, and its fields matter more than their headers */
.form-section :deep(.p-accordionheader) {
    padding: 0.6rem 0.9rem;
}

.form-section :deep(.p-accordioncontent-content) {
    padding: 0.9rem;
}

.form-section-header {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    text-align: left;
}

.form-section-summary {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ddb-text-muted);
    font-weight: 400;
}
</style>
