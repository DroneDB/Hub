<template>
    <Teleport to="body">
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- the dialog takes its keys from the focus inside it: arrows, + - 0 and I; Escape is the overlay stack's -->
        <div v-if="visible" ref="overlay" v-focus-trap class="photo-lightbox-overlay" role="dialog" aria-modal="true"
             :aria-label="name || 'Photo'" tabindex="-1" @keydown="onKeydown">
            <div class="photo-lightbox-toolbar">
                <div class="photo-lightbox-title">
                    <span class="photo-lightbox-name">{{ name }}</span>
                    <span v-if="photos.length > 1" class="photo-lightbox-count">{{ index + 1 }} / {{ photos.length }}</span>
                </div>
                <div class="photo-lightbox-actions">
                    <button type="button" class="btn-reset photo-lightbox-action" title="Zoom out (-)" aria-label="Zoom out"
                            :disabled="!isZoomed" @click="zoom.zoomOut()">
                        <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true" />
                    </button>
                    <button type="button" class="btn-reset photo-lightbox-action photo-lightbox-zoom" title="Fit to screen (0)"
                            aria-label="Fit to screen" :disabled="!isZoomed" @click="zoom.reset()">
                        {{ zoomPercent }}
                    </button>
                    <button type="button" class="btn-reset photo-lightbox-action" title="Zoom in (+)" aria-label="Zoom in"
                            :disabled="scale >= maxScale" @click="zoom.zoomIn()">
                        <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
                    </button>
                    <button type="button" class="btn-reset photo-lightbox-action" :class="{ active: showInfo }" title="Information (I)"
                            aria-label="Information" :aria-pressed="showInfo" @click="showInfo = !showInfo">
                        <i class="fa-solid fa-circle-info" aria-hidden="true" />
                    </button>
                    <a class="photo-lightbox-action" :href="fullUrl" target="_blank" rel="noopener"
                       title="Open in new tab" aria-label="Open in new tab">
                        <i class="fa-solid fa-up-right-from-square" aria-hidden="true" />
                    </a>
                    <button type="button" class="btn-reset photo-lightbox-action" title="Close" aria-label="Close" data-autofocus
                            @click="$emit('close')">
                        <i class="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
            </div>
            <div v-if="thermalAvailable" class="photo-lightbox-thermal" role="group" aria-label="Thermal image">
                <label class="photo-lightbox-thermal-field" :for="thermalUnitId">
                    <span>Unit</span>
                    <select :id="thermalUnitId" v-model="thermalFormula" class="photo-lightbox-select" data-testid="thermal-unit">
                        <option v-for="option in THERMAL_UNIT_OPTIONS" :key="option.formula" :value="option.formula">{{ option.label }}</option>
                    </select>
                </label>
                <div class="photo-lightbox-thermal-field">
                    <span :id="thermalPaletteLabelId">Palette</span>
                    <ColormapDropdown v-model="thermalPalette" :colormaps="palettes" :aria-labelledby="thermalPaletteLabelId" />
                </div>
                <span class="photo-lightbox-thermal-range" data-testid="thermal-range">Range {{ thermalRangeText }}</span>
                <span class="photo-lightbox-thermal-readout" data-testid="thermal-readout">
                    <template v-if="thermalHover">
                        <span class="photo-lightbox-thermal-value">{{ thermalHover.text || 'No value' }}</span>
                        <span class="photo-lightbox-thermal-pixel">at {{ thermalHover.x }}, {{ thermalHover.y }}</span>
                    </template>
                    <template v-else>Move the pointer over the picture to read its temperature</template>
                </span>
            </div>
            <div v-else-if="thermalNotice" class="photo-lightbox-thermal" role="note" data-testid="thermal-notice">
                <i class="fa-solid fa-circle-info" aria-hidden="true" />
                <span>{{ thermalNotice }}</span>
            </div>
            <div class="photo-lightbox-body">
                <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -- a click on the empty space closes it; Escape and the Close button are the keyboard way; zoom has buttons and keys -->
                <div ref="stage" class="photo-lightbox-stage" role="presentation" :class="{ zoomed: isZoomed, dragging }"
                     @wheel.prevent="zoom.onWheel" @dblclick="zoom.onDoubleClick" @pointerdown="onStagePointerDown"
                     @pointermove="onStagePointerMove" @pointerleave="onStagePointerLeave" @pointerup="zoom.onPointerUp"
                     @pointercancel="zoom.onPointerUp" @click="onStageClick">
                    <img v-if="src" ref="img" :key="path" :src="src" :alt="name" class="photo-lightbox-image"
                         :width="photoWidth || undefined" :height="photoHeight || undefined" draggable="false"
                         :style="{ transform }" @load="onLoad" @error="onImageError">
                    <div v-if="loading && !failed" class="photo-lightbox-status" role="status">
                        <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> Loading
                    </div>
                    <div v-if="failed" class="photo-lightbox-status photo-lightbox-failed" role="alert">
                        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Could not load this photo.
                    </div>
                </div>
                <template v-if="photos.length > 1">
                    <button type="button" class="btn-reset photo-lightbox-nav photo-lightbox-prev" title="Previous photo (Left arrow)"
                            aria-label="Previous photo" @click="go(-1)">
                        <i class="fa-solid fa-chevron-left" aria-hidden="true" />
                    </button>
                    <button type="button" class="btn-reset photo-lightbox-nav photo-lightbox-next" title="Next photo (Right arrow)"
                            aria-label="Next photo" @click="go(1)">
                        <i class="fa-solid fa-chevron-right" aria-hidden="true" />
                    </button>
                </template>
                <div v-if="thermalLegend" class="photo-lightbox-legend">
                    <RasterLegend :rows="thermalLegend.rows" :styles="thermalLegend.styles" />
                </div>
                <div v-if="caption" class="photo-lightbox-caption">
                    <span v-if="caption.coords" class="photo-lightbox-coords">
                        <i class="fa-solid fa-location-dot me-1" aria-hidden="true" />{{ caption.coords }}
                    </span>
                    <span v-if="caption.altitude" class="photo-lightbox-altitude">
                        <i class="fa-solid fa-arrows-up-down me-1" aria-hidden="true" />{{ caption.altitude }}
                    </span>
                </div>
                <aside v-if="showInfo" class="photo-lightbox-info text-selectable" aria-label="Photo information">
                    <PropsTable v-if="properties" :key="path" :obj="properties" :preserve-order="true" />
                    <p v-else class="photo-lightbox-info-empty">No information on this photo.</p>
                </aside>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
/**
 * PhotoLightbox - a photo of a folder over the whole page, with zoom (FR-VWR-12).
 *
 * A dialog on an <img>, an overlay of the overlay stack (composables/useOverlay: the focus goes to
 * Close and stays inside, Escape closes it when it is the topmost overlay, the focus goes back to
 * the file that opened it). The folder's photos are a gallery: the arrows or the buttons go to the
 * previous and next one, and the Information panel follows the photo on show.
 *
 * Zoom: the wheel, a pinch, a double click or tap and the + and - buttons (composables/usePanZoom);
 * a zoomed photo is dragged, and the arrows pan it instead of changing the photo.
 *
 * The bitmap (FR-EXP-38): the size of the stage in device pixels, in the steps of FR-XC-32
 * (thumbnailRequestSize), never above the photo's long side. A photo that the step does not
 * shrink is the file itself (the inline download), and so is any photo once it is zoomed - when
 * the browser can decode the file (BROWSER_FORMATS). Other photos (a TIFF...) stay thumbnails:
 * the capped size, and the largest step once zoomed. A file or larger thumbnail that does not
 * load falls back to the preview.
 *
 * A radiometric picture (a thermal camera's R-JPEG, FR-RAS-15) has a thermal mode: the temperature under the pointer (a pixel
 * of its raw thermal grid, whatever the size of the bitmap on show), its range, the Unit (°C, K, °F, answered by ddb, D-022)
 * and a palette (thumb-ex with a colormap, with its legend); the Information panel lists its thermal fields. A thermal picture
 * without temperatures (no calibration: a DJI R-JPEG, whose raw values need DJI's own conversion) is shown as shot, with a
 * notice that says so.
 *
 *   <PhotoLightbox :dataset="dataset" :photos="[{ path, entry }]" v-model:index="i" @close="..." />
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, useId } from 'vue';
import ddb from 'ddb';
import PropsTable from '@/features/dataset/explorer/PropsTable.vue';
import { useOverlay, vFocusTrap } from '@/composables/useOverlay';
import { useEventListener } from '@/composables/useEventListener';
import { useThermalImage } from '@/composables/useThermalImage';
import { usePanZoom, MAX_SCALE } from '@/composables/usePanZoom';
import { usePreference } from '@/composables/usePreference';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { thumbnailRequestSize } from '@/libs/thumbnailQueue';
import { buildAllProperties, pointCoordinatesText } from '@/libs/propertiesUtils';
import { fixedLengthParts } from '@/libs/format';
import { pointLonLat } from '@/libs/ddb/pointGeom';
import { gridPixelAt, thermalPalettes, thermalFields } from '@/libs/thermalImage';
import { THERMAL_UNIT_OPTIONS } from '@/libs/map/rasterUnit';
import ColormapDropdown from '@/features/viewers/map/ColormapDropdown.vue';
import RasterLegend from '@/features/viewers/map/RasterLegend.vue';

const props = defineProps({
    visible: { type: Boolean, default: true },
    dataset: { type: Object, required: true },
    /** the photos of the gallery: { path: dataset path, entry } */
    photos: { type: Array, default: () => [] },
    /** the photo on show */
    index: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'update:index']);

// The photo formats a browser shows in an <img>: the others are shown as thumbnails
const BROWSER_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp']);

const overlay = ref(null);
const stage = ref(null);
const img = ref(null);
const showInfo = ref(false);
const loading = ref(true);
const failed = ref(false);
// The photo was zoomed: from then on it is shown as the file, even back at the fit
const fullWanted = ref(false);
// The file (or the larger thumbnail) did not load: the preview stays
const fullFailed = ref(false);
const stageSize = ref({ w: 0, h: 0 });
const pixelRatio = ref(1);
const units = usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);
// The palette did not load (the thermal rendering is not there): the picture as shot stays
const paletteFailed = ref(false);
const thermalUnitId = useId();
const thermalPaletteLabelId = useId();
const palettes = thermalPalettes();

useOverlay({
    active: () => props.visible,
    container: () => overlay.value,
    onEscape: e => { e.preventDefault(); emit('close'); },
    autoFocus: true,
    modal: true
});

const zoom = usePanZoom({ element: () => stage.value });
const { scale, transform, isZoomed, dragging } = zoom;
const maxScale = MAX_SCALE;
const zoomPercent = computed(() => `${Math.round(scale.value * 100)}%`);

const photo = computed(() => props.photos[props.index] || null);
const path = computed(() => photo.value?.path || '');
const entry = computed(() => photo.value?.entry || null);
const name = computed(() => (path.value ? ddb.pathutils.basename(path.value) : ''));
const photoWidth = computed(() => Number(entry.value?.properties?.width) || 0);
const photoHeight = computed(() => Number(entry.value?.properties?.height) || 0);
const longSide = computed(() => Math.max(photoWidth.value, photoHeight.value));

// The thermal mode of a radiometric picture (FR-RAS-15)
const thermal = useThermalImage({ dataset: props.dataset, path: () => path.value, entry: () => entry.value });
const {
    formula: thermalFormula, palette: thermalPalette, activePalette: thermalActivePalette, info: thermalInfo,
    hover: thermalHover, available: thermalAvailable, notice: thermalNotice, rangeText: thermalRangeText,
    legendStyle: thermalLegendStyle
} = thermal;
// The legend of the palette on show, in the shape RasterLegend takes
const thermalLegend = computed(() => (thermalLegendStyle.value
    ? { rows: [{ path: path.value, name: name.value, visible: true }], styles: { [path.value]: thermalLegendStyle.value } }
    : null));

const fullUrl = computed(() => (path.value ? props.dataset.downloadUrl(path.value, { inline: true }) : ''));
const decodable = computed(() => BROWSER_FORMATS.has(ddb.pathutils.extname(path.value).slice(1).toLowerCase()));
// The stage in device pixels, in the steps of FR-XC-32, capped at the photo's long side
const previewSize = computed(() =>
    thumbnailRequestSize(Math.max(stageSize.value.w, stageSize.value.h), pixelRatio.value, longSide.value));
const previewUrl = computed(() => (path.value ? props.dataset.thumbUrl(path.value, previewSize.value) : ''));
// A photo the step would not shrink is the file itself
const previewIsFull = computed(() => longSide.value > 0 && previewSize.value >= longSide.value);
// More than the preview: the file, or for a format the browser cannot show the largest step, capped at the photo
const fullSrc = computed(() => (decodable.value
    ? fullUrl.value
    : props.dataset.thumbUrl(path.value, thumbnailRequestSize(Number.POSITIVE_INFINITY, 1, longSide.value))));
// The thermal rendering of the picture (thumb-ex): its temperatures in the unit and the palette chosen, in the steps of
// FR-XC-32 like the preview; zoomed, the largest step (the file itself has no palette)
const usesPalette = computed(() => !!thermalActivePalette.value && !paletteFailed.value);
const paletteSize = computed(() => (fullWanted.value
    ? thumbnailRequestSize(Number.POSITIVE_INFINITY, 1, longSide.value)
    : previewSize.value));
const paletteSrc = computed(() => (path.value
    ? props.dataset.thumbExUrl(path.value, paletteSize.value, { formula: thermalFormula.value, colormap: thermalActivePalette.value })
    : ''));
const src = computed(() => {
    if (!path.value) return '';
    if (usesPalette.value) return paletteSrc.value;
    if ((fullWanted.value || previewIsFull.value) && !fullFailed.value) return fullSrc.value;
    return previewUrl.value;
});

// The properties of the photo and, for a radiometric picture, its thermal fields: the sensor, the range, the emissivity and the
// distance it was set to
const properties = computed(() => {
    const all = photo.value ? buildAllProperties(photo.value, units.value) : null;
    const fields = all && thermalAvailable.value ? thermalFields(entry.value, thermalInfo.value, units.value) : null;
    return fields ? { ...all, thermal: fields } : all;
});

// The place of the photo over the picture: latitude and longitude, the altitude in the user's units
const caption = computed(() => {
    const point = entry.value?.point_geom;
    const c = pointLonLat(point);
    if (!c) return null;
    const coords = pointCoordinatesText({ type: 'Point', coordinates: [c[0], c[1]] });
    const altitude = typeof c[2] === 'number' && c[2] !== 0 ? fixedLengthParts(c[2], units.value, 1).text : null;
    return { coords, altitude };
});

function measure() {
    const el = stage.value;
    const w = el?.clientWidth || window.innerWidth;
    const h = el?.clientHeight || window.innerHeight;
    stageSize.value = { w, h };
    pixelRatio.value = globalThis.devicePixelRatio || 1;
    zoom.setBounds(w, h, img.value?.offsetWidth || 0, img.value?.offsetHeight || 0);
}

function onLoad() {
    loading.value = false;
    failed.value = false;
    measure();
}

function onImageError() {
    // The thermal rendering did not load: the picture as shot
    if (usesPalette.value) {
        paletteFailed.value = true;
        return;
    }
    // The file did not load (a format or a size the browser refuses): the preview instead
    if (!fullFailed.value && src.value !== previewUrl.value) {
        fullFailed.value = true;
        return;
    }
    loading.value = false;
    failed.value = true;
}

function go(step) {
    const n = props.photos.length;
    if (n > 1) emit('update:index', (props.index + step + n) % n);
}

// The temperature under the pointer: the pixel of the raw thermal grid at the pointer, from the box the picture is drawn in
// (zoom included), so it holds at any size of the bitmap on show (FR-XC-32)
function onStagePointerMove(e) {
    zoom.onPointerMove(e);
    if (!thermalAvailable.value || dragging.value || !img.value) return;
    const grid = { width: Number(thermalInfo.value?.width), height: Number(thermalInfo.value?.height) };
    thermal.pointerAt(gridPixelAt({ x: e.clientX, y: e.clientY }, img.value.getBoundingClientRect(), grid));
}

function onStagePointerLeave() {
    thermal.pointerAt(null);
}

// The empty space around the photo closes it: a click pressed and released there, at the fit. Not a
// click on the photo (its double click zooms), not the end of a drag or a pinch, and not a press on
// a zoomed photo, which is a grab of it.
let pressOnBackground = false;

function onStagePointerDown(e) {
    pressOnBackground = e.target === stage.value && !isZoomed.value && e.isPrimary !== false;
    zoom.onPointerDown(e);
}

function onStageClick(e) {
    const close = pressOnBackground && e.target === stage.value && !zoom.wasGesture();
    pressOnBackground = false;
    if (close) emit('close');
}

const PAN_STEP = 80;

function onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // The information panel keeps its keys
    if (e.target instanceof Element && e.target.closest('.photo-lightbox-info')) return;
    const zoomed = isZoomed.value;
    switch (e.key) {
        case 'ArrowLeft': zoomed ? zoom.panBy(PAN_STEP, 0) : go(-1); break;
        case 'ArrowRight': zoomed ? zoom.panBy(-PAN_STEP, 0) : go(1); break;
        case 'ArrowUp': if (!zoomed) return; zoom.panBy(0, PAN_STEP); break;
        case 'ArrowDown': if (!zoomed) return; zoom.panBy(0, -PAN_STEP); break;
        case '+': case '=': zoom.zoomIn(); break;
        case '-': case '_': zoom.zoomOut(); break;
        case '0': zoom.reset(); break;
        case 'i': case 'I': showInfo.value = !showInfo.value; break;
        default: return;
    }
    e.preventDefault();
}

watch(isZoomed, z => { if (z) fullWanted.value = true; });
watch([thermalPalette, thermalFormula], () => { paletteFailed.value = false; });

// Another photo: back to the fit, with its preview
watch(path, () => {
    zoom.reset();
    paletteFailed.value = false;
    fullWanted.value = false;
    fullFailed.value = false;
    loading.value = true;
    failed.value = false;
});
watch(src, () => { loading.value = true; });

// The stage changes with the window and with the information panel
/** @type {ResizeObserver | null} */
let observer = null;
watch(stage, el => {
    if (observer) observer.disconnect();
    observer = null;
    if (!el) return;
    measure();
    if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(el);
    }
}, { flush: 'post' });
onMounted(() => nextTick(measure));
onBeforeUnmount(() => { if (observer) observer.disconnect(); });
useEventListener(window, 'resize', measure);
</script>

<style scoped>
.photo-lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(var(--ddb-shade-rgb), 0.92);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    outline: none;
    color: var(--ddb-text-on-dark);
}

.photo-lightbox-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: rgba(var(--ddb-shade-rgb), 0.4);
}

.photo-lightbox-title {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
    margin-right: 12px;
}

.photo-lightbox-name {
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.photo-lightbox-count {
    font-size: 0.85rem;
    opacity: 0.8;
    white-space: nowrap;
}

.photo-lightbox-actions {
    display: flex;
    gap: 4px;
    align-items: center;
}

.photo-lightbox-action {
    color: var(--ddb-text-on-dark);
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 4px;
    text-decoration: none;
    line-height: 1;
}

.photo-lightbox-action:hover:not(:disabled),
.photo-lightbox-action.active {
    background: rgba(var(--ddb-glass-rgb), 0.15);
}

.photo-lightbox-action:disabled {
    opacity: 0.4;
    cursor: default;
}

.photo-lightbox-zoom {
    min-width: 4.2em;
    font-variant-numeric: tabular-nums;
}

.photo-lightbox-thermal {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 6px 16px;
    background: rgba(var(--ddb-shade-rgb), 0.4);
    font-size: 0.85rem;
}

.photo-lightbox-thermal-field {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
}

.photo-lightbox-select {
    color: var(--ddb-text);
    background: var(--ddb-bg-surface);
    border: 1px solid var(--ddb-border, rgba(var(--ddb-glass-rgb), 0.2));
    border-radius: 4px;
    padding: 2px 6px;
}

.photo-lightbox-thermal-range,
.photo-lightbox-thermal-readout {
    font-variant-numeric: tabular-nums;
}

.photo-lightbox-thermal-readout {
    margin-left: auto;
}

.photo-lightbox-thermal-value {
    font-weight: 600;
    margin-right: 6px;
}

.photo-lightbox-thermal-pixel {
    opacity: 0.8;
}

.photo-lightbox-legend {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1;
}

/* The legend of the map is placed by the map's own reserves: here it flows in its box */
.photo-lightbox-legend :deep(.raster-legend) {
    position: static;
    max-width: none;
}

.photo-lightbox-body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
}

.photo-lightbox-stage {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    touch-action: none;
    user-select: none;
}

.photo-lightbox-stage.zoomed {
    cursor: grab;
}

.photo-lightbox-stage.dragging {
    cursor: grabbing;
}

/* Fits in ~90% of the stage with its aspect kept; the zoom scales it from its centre */
.photo-lightbox-image {
    max-width: 90%;
    max-height: 90%;
    width: auto;
    height: auto;
    object-fit: contain;
    transform-origin: center;
    will-change: transform;
    -webkit-user-drag: none;
}

.photo-lightbox-status {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 8px 14px;
    border-radius: 6px;
    background: rgba(var(--ddb-shade-rgb), 0.6);
    pointer-events: none;
}

.photo-lightbox-failed {
    background: var(--ddb-viewer-btn-danger);
}

.photo-lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ddb-text-on-dark);
    background: rgba(var(--ddb-shade-rgb), 0.45);
    width: 44px;
    height: 64px;
    border-radius: 6px;
    cursor: pointer;
    z-index: 1;
}

.photo-lightbox-nav:hover {
    background: rgba(var(--ddb-shade-rgb), 0.7);
}

.photo-lightbox-prev {
    left: 12px;
}

.photo-lightbox-next {
    right: 12px;
}

.photo-lightbox-caption {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 16px;
    max-width: 90%;
    padding: 6px 14px;
    border-radius: 8px;
    background: var(--ddb-overlay-bg);
    white-space: nowrap;
    pointer-events: none;
    z-index: 1;
}

.photo-lightbox-info {
    width: min(420px, 40%);
    overflow: auto;
    padding: 12px;
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
    border-left: 1px solid var(--ddb-border, rgba(var(--ddb-glass-rgb), 0.2));
    z-index: 2;
}

.photo-lightbox-info-empty {
    margin: 0;
    opacity: 0.8;
}
</style>
