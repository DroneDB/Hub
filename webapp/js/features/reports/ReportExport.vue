<template>
    <Button size="small" severity="secondary" icon="fa-solid fa-file-pdf" label="Download PDF" :disabled="busy" data-testid="report-download-pdf" @click="pdf.run('download')" />
    <Button v-if="canWrite" size="small" severity="secondary" icon="fa-solid fa-cloud-arrow-up" label="Publish PDF" :disabled="busy" data-testid="report-publish-pdf"
            @click="pdf.run('publish')" />
</template>

<script setup>
/**
 * The exports of a report (the `export` slot of its bar): Download PDF for anyone who can read it, Publish PDF for those
 * who can write. The code that makes the PDF loads when one is asked for; while one is made, both are disabled.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { useReportPdf } from './useReportPdf';

const props = defineProps({
    /** The report model the page shows */
    model: { type: Object, required: true },
    dataset: { type: Object, required: true },
    /** The uid of the report definition */
    uid: { type: String, required: true },
    canWrite: { type: Boolean, default: false },
    /** useDialogs() of the page */
    dialogs: { type: Object, required: true }
});

const pdf = useReportPdf({
    model: computed(() => props.model),
    dataset: props.dataset,
    uid: () => props.uid,
    canWrite: computed(() => props.canWrite),
    dialogs: props.dialogs
});
const busy = pdf.running;
</script>
