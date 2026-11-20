<template>
    <div class="raster-export section" data-testid="raster-export">
        <div class="export-head">
            <span :id="labelId" class="section-label">Export</span>
            <!-- On a phone the note folds behind this button, so that the footer of the sheet leaves room for the form
                 (U-415); the label of the Export button says what the file is too -->
            <button type="button" class="info-icon-btn export-note-toggle" :aria-expanded="String(noteOpen)" :aria-controls="noteId"
                    :title="noteToggleLabel" :aria-label="noteToggleLabel" data-testid="raster-export-note-toggle"
                    @click="noteOpen = !noteOpen">
                <i class="fas fa-circle-info" aria-hidden="true" />
            </button>
        </div>
        <div class="export-actions" role="group" :aria-labelledby="labelId">
            <div class="export-choice">
                <button type="button" class="panel-btn action-btn" :class="{ 'is-disabled': wholeDisabled }"
                        :aria-disabled="wholeDisabled ? 'true' : undefined" :aria-describedby="wholeDescription"
                        :title="wholeDisabled ? `${wholeLabel}: ${wholeNote}` : wholeLabel" :aria-label="wholeLabel"
                        data-testid="raster-export-whole" @click="onWhole">
                    <i :class="exporter.running.value && !exporter.refusedExtent.value ? 'fas fa-spinner fa-spin' : 'fas fa-download'" aria-hidden="true" />
                    <span class="action-label">Export</span>
                </button>
            </div>
            <div class="export-choice">
                <button type="button" class="panel-btn action-btn" :class="{ 'is-disabled': extentDisabled }"
                        :aria-disabled="extentDisabled ? 'true' : undefined" :aria-describedby="extentDescription"
                        :title="extentDisabled ? `${EXPORT_EXTENT_LABEL}: ${extentNote}` : EXPORT_EXTENT_LABEL" :aria-label="EXPORT_EXTENT_LABEL"
                        data-testid="raster-export-extent" @click="onExtent">
                    <i :class="exporter.running.value && exporter.refusedExtent.value ? 'fas fa-spinner fa-spin' : 'fas fa-crop-simple'" aria-hidden="true" />
                    <span class="action-label">Visible extent</span>
                </button>
            </div>
        </div>
        <!-- The reasons are text, not a tooltip: a keyboard user reads them at the button (FR-XC-22) -->
        <p v-if="exporter.wholeReason.value" :id="wholeReasonId" class="export-reason" data-testid="raster-export-whole-reason">
            {{ exporter.wholeReason.value }}. Use Visible extent to export it in parts.
        </p>
        <p v-if="exporter.extentReason.value" :id="extentReasonId" class="export-reason" data-testid="raster-export-extent-reason">
            {{ exporter.extentReason.value }}{{ exporter.extentOverLimit.value ? '. Zoom in to export less.' : '' }}
        </p>
        <p :id="noteId" class="export-note" :class="{ 'is-open': noteOpen }" data-testid="raster-export-note">{{ note }}</p>
        <HeavyTaskStatus :task="exporter.task.value" :error="exporter.error.value" label="Export" :phases="EXPORT_PHASES" cancellable
                         :cancelling="exporter.cancelling.value" @cancel="exporter.cancel" />
        <DialogHost :dialogs="dialogs" />
    </div>
</template>

<script setup>
/**
 * RasterExportButton - the one export control of Raster Analysis and Plant Health (FR-RAS-16, FR-XC-24, D-023): it exports the
 * styled raster as the `raster-export` task, with the state, the progress and the Cancel of HeavyTaskStatus (FR-PRC-15,
 * FR-XC-15), and a toast and the download when the file is ready. 'Visible extent' exports the window of the map at the
 * native resolution of the raster, so a raster over the limit goes out in parts. An export that is refused for its size
 * stays a button that can be focused, with the reason as visible text (FR-XC-22: 'Too large to export: about 9.3 GB >
 * 1 GB limit'); the size and the limit are those of the Registry (value info). 'Visible extent' is disabled the same way
 * while the estimate of a new extent is read ('Checking size…'). The label says what the file is and follows the style
 * (FR-RAS-26): a styled RGBA picture when there is a formula, or a colormap on one band, the bands scaled to 8 bits
 * otherwise (the rule of ddb), never the values.
 */
import { computed, ref, useId } from 'vue';
import HeavyTaskStatus from '@/components/HeavyTaskStatus.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useRasterExport } from '@/composables/useRasterExport';
import { exportLabel, exportNote, EXPORT_EXTENT_LABEL, EXPORT_PHASES } from '@/libs/map/rasterExport';

defineOptions({ name: 'RasterExportButton' });

const props = defineProps({
    /** The ddb Dataset */
    dataset: { type: Object, default: null },
    /** The raster */
    filePath: { type: String, default: null },
    /** The style of the layer: what the export draws (the panel's vizParams) */
    vizParams: { type: Object, default: () => ({}) },
    /** The visible extent of the map in WGS 84 (minLon, minLat, maxLon, maxLat), null while it is not known */
    bbox: { type: Array, default: null },
    /** The raster has one data band (a DEM): a colormap on it makes the styled image, as ddb exports it */
    singleBand: { type: Boolean, default: false },
    /** The value info the panel already has: its estimate and limit are used instead of reading them again */
    info: { type: Object, default: null },
    /** Read the value info of the raster when `info` has no estimate (false for a panel whose info is the value info) */
    readEstimate: { type: Boolean, default: true }
});

const dialogs = useDialogs();
const exporter = useRasterExport({
    dataset: () => props.dataset, path: () => props.filePath, vizParams: () => props.vizParams,
    bbox: () => /** @type {number[] | null} */ (props.bbox), info: () => props.info, readEstimate: props.readEstimate, dialogs
});

const labelId = useId();
const wholeReasonId = useId();
const extentReasonId = useId();
const noteId = useId();

// What the file is follows the style: ddb writes RGBA for a formula, and for a colormap on one band
const wholeLabel = computed(() => exportLabel(props.vizParams, { singleBand: props.singleBand }));
const note = computed(() => exportNote(props.vizParams, { singleBand: props.singleBand }));
// The note shown on a phone, where it is folded by default (on a wider screen it is always shown, the button is hidden)
const noteOpen = ref(false);
const noteToggleLabel = computed(() => (noteOpen.value ? 'Hide what the export writes' : 'What the export writes'));

const wholeDisabled = computed(() => !props.dataset || !props.filePath || exporter.running.value || !!exporter.wholeReason.value);
const extentDisabled = computed(() => !props.dataset || !props.filePath || exporter.running.value || !!exporter.extentReason.value);

// What a disabled button says now (its tooltip too): the size, the missing extent, or the export that runs
const wholeNote = computed(() => exporter.wholeReason.value || (exporter.running.value ? 'An export is running' : ''));
const extentNote = computed(() => exporter.extentReason.value || (exporter.running.value ? 'An export is running' : ''));

// The visible reason is the description of the button; the note says what the file is, for both
const wholeDescription = computed(() => (exporter.wholeReason.value ? `${wholeReasonId} ${noteId}` : noteId));
const extentDescription = computed(() => (exporter.extentReason.value ? `${extentReasonId} ${noteId}` : noteId));

// aria-disabled, not disabled: the button keeps its place in the tab order, a click on it does nothing
function onWhole() {
    if (wholeDisabled.value) return;
    exporter.exportWhole();
}
function onExtent() {
    if (extentDisabled.value) return;
    exporter.exportExtent();
}
</script>

<style scoped>
.export-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.4rem;
    margin-top: 0.4rem;
}
.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.export-reason {
    margin: 0.4rem 0 0;
    font-size: 0.75rem;
    line-height: 1.3;
    color: var(--panel-warn-text);
}
.export-note {
    margin: 0.4rem 0 0;
    font-size: 0.7rem;
    line-height: 1.3;
    color: var(--panel-text-soft);
}
.export-note-toggle {
    display: none;
}
/* The phone sheet (the breakpoint of css/_analysis-panel.scss): the note, two lines under the buttons of a footer that
   stays in view, folds behind an info button next to the label; folded it is still the description of the buttons
   (visually hidden, not display: none) */
@media (max-width: 767.98px) {
    .export-head {
        display: flex;
        align-items: center;
    }
    .export-head .section-label {
        margin-bottom: 0;
    }
    .export-note-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5rem;
        min-height: 1.5rem;
    }
    .export-note:not(.is-open) {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
}
</style>
