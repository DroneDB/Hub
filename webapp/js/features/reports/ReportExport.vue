<template>
    <Button ref="downloadButton" size="small" severity="secondary" icon="fa-solid fa-file-pdf" label="Download PDF" :disabled="busy" data-testid="report-download-pdf"
            @click="run('download')" />
    <Button v-if="canWrite" ref="publishButton" size="small" severity="secondary" icon="fa-solid fa-cloud-arrow-up" label="Publish PDF" :disabled="busy"
            data-testid="report-publish-pdf" @click="run('publish')" />
</template>

<script setup>
/**
 * The exports of a report (the `export` slot of its bar): Download PDF for anyone who can read it, Publish PDF for those
 * who can write. The code that makes the PDF loads when one is asked for; while one is made, both are disabled.
 *
 * The button that started the PDF gets the focus back once it is enabled again: it is disabled while the progress
 * dialog is shown, so the dialog cannot give the focus back to it when it closes (Cancel, Escape, the end of the PDF)
 * and leaves it on the page's h1. A control the user went to meanwhile keeps it.
 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import { focusLeftToPage } from '@/composables/useOverlay';
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

const downloadButton = ref(null);
const publishButton = ref(null);
/** The button that started the PDF that is made. @type {import('vue').Ref<any> | null} */
let invoker = null;

/** @param {'download' | 'publish'} mode */
function run(mode) {
    invoker = mode === 'publish' ? publishButton : downloadButton;
    pdf.run(mode);
}

// After the render that enables the buttons again
watch(busy, running => {
    if (running || !invoker) return;
    const button = invoker.value?.$el;
    invoker = null;
    if (button instanceof HTMLElement && button.isConnected && focusLeftToPage()) button.focus({ preventScroll: true });
}, { flush: 'post' });
</script>
