<template>
    <!-- No box of its own: its parts are items of the footer row the panel draws (.panel-footer-row), so the menu and the
         status take a row of their own above the button and the button stays at the end of the row -->
    <div ref="root" class="raster-export" data-testid="raster-export" @focusout="onFocusOut">
        <div v-if="open" class="export-menu" data-testid="raster-export-menu">
            <div :id="menuId" ref="list" role="menu" tabindex="-1" aria-label="Export" @keydown="onKey">
                <button type="button" role="menuitem" tabindex="-1" class="export-item" :class="{ 'is-disabled': wholeDisabled }"
                        :aria-disabled="wholeDisabled ? 'true' : undefined" :aria-describedby="wholeDescription"
                        :title="wholeDisabled ? `${wholeLabel}: ${wholeNote}` : wholeLabel" :aria-label="wholeLabel"
                        data-testid="raster-export-whole" @click="onWhole">
                    <i class="fas fa-download" aria-hidden="true" />
                    <!-- The name read out is the visible name, word for word, so that a user who speaks what they see finds the item -->
                    <span class="export-item-text">
                        <span class="export-item-name">{{ wholeLabel }}</span>
                        <span class="export-item-detail">{{ wholeDetail }}</span>
                        <!-- The reasons are text, not a tooltip: a keyboard user reads them at the item (FR-XC-22). Whatever turns
                             the item off says so here, a running export or a missing raster too, not only a refused size -->
                        <span v-if="wholeDisabled" :id="wholeReasonId" class="export-item-reason"
                              :data-testid="exporter.wholeReason.value ? 'raster-export-whole-reason' : 'raster-export-whole-unavailable'">
                            {{ exporter.wholeReason.value ? `${exporter.wholeReason.value}. Use Visible extent to export it in parts.` : wholeNote }}
                        </span>
                    </span>
                </button>
                <button type="button" role="menuitem" tabindex="-1" class="export-item" :class="{ 'is-disabled': extentDisabled }"
                        :aria-disabled="extentDisabled ? 'true' : undefined" :aria-describedby="extentDescription"
                        :title="extentDisabled ? `${EXPORT_EXTENT_LABEL}: ${extentNote}` : EXPORT_EXTENT_LABEL" :aria-label="EXPORT_EXTENT_LABEL"
                        data-testid="raster-export-extent" @click="onExtent">
                    <i class="fas fa-crop-simple" aria-hidden="true" />
                    <span class="export-item-text">
                        <span class="export-item-name">{{ EXPORT_EXTENT_LABEL }}</span>
                        <span class="export-item-detail">What the map shows now</span>
                        <span v-if="extentDisabled" :id="extentReasonId" class="export-item-reason"
                              :data-testid="exporter.extentReason.value ? 'raster-export-extent-reason' : 'raster-export-extent-unavailable'">
                            {{ exporter.extentReason.value
                                ? `${exporter.extentReason.value}${exporter.extentOverLimit.value ? '. Zoom in to export less.' : ''}` : extentNote }}
                        </span>
                    </span>
                </button>
            </div>
            <p :id="noteId" class="export-note" data-testid="raster-export-note">{{ note }}</p>
        </div>
        <!-- With the menu closed too: an export goes on, and fails, after the menu is shut. The live region of the status
             stays in the page when there is nothing to say, so that what appears in it is announced -->
        <div class="footer-status" :class="{ 'is-idle': !exporter.task.value && !exporter.error.value }">
            <HeavyTaskStatus :task="exporter.task.value" :error="exporter.error.value" label="Export" :phases="EXPORT_PHASES" cancellable
                             :cancelling="exporter.cancelling.value" @cancel="exporter.cancel" />
        </div>
        <button ref="trigger" type="button" class="panel-btn panel-btn--primary footer-btn footer-btn--end" aria-haspopup="menu"
                :aria-expanded="String(open)" :aria-controls="open ? menuId : undefined" title="Export the raster as a GeoTIFF"
                data-testid="raster-export-menu-btn" @click="toggle" @keydown="onKey">
            <i :class="exporter.running.value ? 'fas fa-spinner fa-spin' : 'fas fa-download'" aria-hidden="true" />
            <span class="footer-label">Export</span>
            <i :class="open ? 'fas fa-chevron-down' : 'fas fa-chevron-up'" aria-hidden="true" />
        </button>
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
 *
 * It is one Export button with a menu of the two exports, in the footer row of the panel: the button, the menu (a row of
 * its own above the button, in the flow of the footer, so that it never leaves the panel) and the status of the task are
 * parts of that row. An export that is off keeps its item in the menu, focusable (aria-disabled), with its reason as text.
 */
import { computed, ref, useId } from 'vue';
import { useMenu } from '@/composables/useMenu';
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

const root = ref(null);
const trigger = ref(null);
const list = ref(null);
const menuId = useId();
const wholeReasonId = useId();
const extentReasonId = useId();
const noteId = useId();

// What the file is follows the style: ddb writes RGBA for a formula, and for a colormap on one band
const wholeLabel = computed(() => exportLabel(props.vizParams, { singleBand: props.singleBand }));
const note = computed(() => exportNote(props.vizParams, { singleBand: props.singleBand }));
// The name already says what the file is; the line under it says how much of the raster goes out
const wholeDetail = 'The whole file';

// aria-disabled, not disabled: an export that is off keeps its place in the menu and can be focused, to read why it is off
const { open, close, toggle, onKey, onFocusOut } = useMenu({
    root, trigger, list, isEnabled: item => item.getAttribute('aria-disabled') !== 'true'
});

const wholeDisabled = computed(() => !props.dataset || !props.filePath || exporter.running.value || !!exporter.wholeReason.value);
const extentDisabled = computed(() => !props.dataset || !props.filePath || exporter.running.value || !!exporter.extentReason.value);

// Why both exports are off when neither size is the reason: one export at a time, and nothing to export without a raster
const offReason = computed(() => {
    if (exporter.running.value) return 'An export is running';
    if (!props.dataset || !props.filePath) return 'No raster to export';
    return '';
});

// What a disabled item says now (its tooltip too): the size, the missing extent, the export that runs or the missing raster
const wholeNote = computed(() => exporter.wholeReason.value || offReason.value);
const extentNote = computed(() => exporter.extentReason.value || offReason.value);

// The visible reason of an item that is off is its description; the note says what the file is, for both
const wholeDescription = computed(() => (wholeDisabled.value ? `${wholeReasonId} ${noteId}` : noteId));
const extentDescription = computed(() => (extentDisabled.value ? `${extentReasonId} ${noteId}` : noteId));

// A click on an item that is off does nothing, and leaves the menu open with its reason
function onWhole() {
    if (wholeDisabled.value) return;
    close({ refocus: true });
    exporter.exportWhole();
}
function onExtent() {
    if (extentDisabled.value) return;
    close({ refocus: true });
    exporter.exportExtent();
}
</script>

<style scoped>
/* No box: the button, the menu and the status are items of the footer row of the panel */
.raster-export {
    display: contents;
}
/* A row of the footer of its own, above the button. In the flow, so that the footer grows upward inside its sticky place
   and the menu is never wider than the panel nor outside what scrolls; its text wraps */
.export-menu {
    flex: 0 0 100%;
    order: -2;
    min-width: 0;
    box-sizing: border-box;
    padding: 0.25rem;
    background: var(--panel-option-bg);
    border: 1px solid var(--panel-field-border);
    border-radius: 0.375rem;
}
/* With nothing to say the live region of the status stays in the page but takes no row of the footer (a row would add a gap) */
.footer-status.is-idle {
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
.export-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: 0;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--panel-text);
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
}
.export-item:hover,
.export-item:focus-visible {
    background: var(--panel-field-bg);
}
.export-item:focus-visible {
    outline: var(--ddb-focus-ring-width) solid var(--ddb-focus-ring-color);
    outline-offset: -2px;
}
.export-item > i {
    margin-top: 0.15rem;
    color: var(--panel-accent);
}
.export-item-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
}
.export-item-detail {
    margin-top: 0.1rem;
    font-size: 0.72rem;
    color: var(--panel-muted);
}
/* An item that is off is dimmed, its reason is not: that is what it is there to say */
.export-item.is-disabled {
    cursor: not-allowed;
}
.export-item.is-disabled > i,
.export-item.is-disabled .export-item-name,
.export-item.is-disabled .export-item-detail {
    opacity: 0.6;
}
.export-item-reason {
    margin-top: 0.2rem;
    font-size: 0.75rem;
    line-height: 1.3;
    color: var(--panel-warn-text);
}
.export-note {
    margin: 0.2rem 0 0;
    padding: 0.4rem 0.5rem 0.25rem;
    border-top: 1px solid var(--panel-line);
    font-size: 0.72rem;
    line-height: 1.3;
    color: var(--panel-muted);
}
</style>
