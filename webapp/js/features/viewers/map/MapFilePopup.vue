<template>
    <div v-show="popup.kind" ref="element" class="image-popup" :class="{ dragging }">
        <div class="image-popup-header" title="Drag to move" @pointerdown="startDrag">
            <span class="image-popup-title">{{ popup.name }}</span>
            <div class="image-popup-actions">
                <a v-if="popup.kind === 'image'" :href="popup.openUrl" target="_blank" class="image-popup-btn"
                   title="Open in new tab" aria-label="Open in new tab">
                    <i style="margin: 0; height: auto" class="fa-solid fa-image" />
                </a>
                <a :href="popup.downloadUrl" download class="image-popup-btn" title="Download" aria-label="Download">
                    <i style="margin: 0; height: auto" class="fa-solid fa-download" />
                </a>
                <button v-if="popup.kind === 'video'" class="image-popup-btn" title="Play video" aria-label="Play video" @click="play">
                    <i style="margin: 0; height: auto" class="fa-solid fa-play" />
                </button>
                <button class="image-popup-btn image-popup-close" title="Close" aria-label="Close" @click="close">
                    <i style="margin: 0; height: auto" class="fa-solid fa-xmark" />
                </button>
            </div>
        </div>
        <div v-if="popup.kind === 'image'" class="image-popup-body">
            <LoadingSpinner v-if="popup.loading" class="image-popup-loading" />
            <img v-show="!popup.loading && popup.thumbnail" :src="popup.thumbnail" :alt="popup.name"
                 class="image-popup-img" @load="onThumbnailLoad" @error="onThumbnailError">
        </div>
        <div v-else class="image-popup-body image-popup-video-info">
            <i class="fa-solid fa-film video-popup-icon" />
            <div class="video-popup-details">
                <div v-if="popup.resolution" class="video-popup-row">{{ popup.resolution }}</div>
                <div v-if="popup.date" class="video-popup-row">{{ popup.date }}</div>
            </div>
        </div>
        <div v-if="popup.coords" class="image-popup-footer">
            <span class="image-popup-coords" :title="popup.coords">{{ popup.coords }}</span>
            <button class="image-popup-btn image-popup-copy" :title="copied ? 'Copied!' : 'Copy coordinates'"
                    :aria-label="copied ? 'Copied!' : 'Copy coordinates'" @click="copy(popup.coords)">
                <i style="margin: 0" :class="copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'" />
            </button>
        </div>
    </div>
</template>

<script setup>
/**
 * The popup over a clicked photo or video on the dataset map:
 * name, thumbnail or video details, open/download/play, and the coordinates with a copy
 * button. One popup at a time, on one OpenLayers overlay owned by this component.
 * Dragging the header moves the popup away from its point: the drag changes the overlay's
 * offset, so the popup still follows the point when the map pans or zooms.
 *
 *   <MapFilePopup ref="popup" :map="map" @open-item="..." />   then popup.show(file, coordinate)
 * and popup.closeUnlessIn(files) when the map shows other files.
 */
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { reactive, ref, nextTick, onBeforeUnmount } from 'vue';
import Overlay from 'ol/Overlay';
import { pointLonLat } from '@/libs/ddb/pointGeom';
import ddb from 'ddb';
import { thumbs } from 'ddb';
import { hasThumbnail } from '@/libs/entryTypeCapabilities';
import { useCopyText } from '@/composables/useCopyText';
import { useTimeout } from '@/composables/useTimers';
import { shouldRetry, retryDelayMs, stripRetryParam } from '@/libs/build/thumbRetryPolicy';

const props = defineProps({
    /** The OpenLayers map (the overlay is added on first show) */
    map: { type: Object, default: null }
});
const emit = defineEmits(['openItem']);

const element = ref(null);
const { copy, copied } = useCopyText();
const empty = () => ({
    kind: null, file: null, name: '', coords: '', downloadUrl: '',
    openUrl: '', thumbnail: null, loading: false, retry: 0,
    resolution: '', date: ''
});
const popup = reactive(empty());
let overlay = null;
let retryTimer = null;

// Where the popup sits from its point before it is dragged, in pixels
const DEFAULT_OFFSET = [150, -150];
const dragging = ref(false);
const PAN = { animation: { duration: 250 } };

function clearRetry() {
    if (retryTimer) retryTimer.clear();
    retryTimer = null;
}

/** "lat, lon" of a point entry, or '' */
function entryCoords(entry) {
    const coords = pointLonLat(entry.point_geom);
    return coords ? `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}` : '';
}

/**
 * Shows the popup of a GEOIMAGE or GEOVIDEO explorer item at a map coordinate.
 * @param {{ path: string, entry: any }} file
 * @param {number[]} coordinate
 */
function show(file, coordinate) {
    clearRetry();
    const [dataset, path] = ddb.utils.datasetPathFromUri(file.path);
    const props_ = file.entry.properties || {};
    const isVideo = file.entry.type === ddb.entry.type.GEOVIDEO;
    Object.assign(popup, empty(), {
        kind: isVideo ? 'video' : 'image',
        file,
        name: ddb.pathutils.basename(file.entry.path),
        coords: entryCoords(file.entry),
        downloadUrl: dataset.downloadUrl(path),
        openUrl: isVideo ? '' : dataset.downloadUrl(path, { inline: true }),
        loading: !isVideo,
        resolution: props_.width && props_.height ? `${props_.width} x ${props_.height}` : '',
        date: props_.captureTime ? new Date(props_.captureTime).toLocaleString() : ''
    });
    copied.value = false;

    nextTick(() => {
        // Set after the tick so v-show hides the previous image while this one loads
        if (!isVideo) {
            if (hasThumbnail(file.entry.type)) popup.thumbnail = thumbs.fetch(file.path, 512, file.entry.hash);
            else popup.loading = false;
        }
        if (!overlay && props.map) {
            overlay = new Overlay({
                element: element.value,
                autoPan: PAN,
                offset: DEFAULT_OFFSET,
                positioning: 'bottom-left'
            });
            props.map.addOverlay(overlay);
        }
        if (overlay) {
            overlay.setOffset(DEFAULT_OFFSET);
            overlay.setPosition(coordinate);
        }
    });
}

function close() {
    clearRetry();
    Object.assign(popup, empty());
    copied.value = false;
    if (overlay) overlay.setPosition(undefined);
}

/**
 * Closes the popup unless its file is one of `files`: the map now shows other files (another
 * folder), and the popup of a photo it no longer shows stays over the map otherwise.
 * @param {{ path: string }[]} files
 * @returns {boolean} whether it closed
 */
function closeUnlessIn(files) {
    if (!popup.file || files.some(f => f.path === popup.file.path)) return false;
    close();
    return true;
}

function play() {
    const file = popup.file;
    close();
    if (file) emit('openItem', file);
}

/** A pointer position kept inside the map, so the header cannot be dragged out of reach */
function clampToMap(x, y) {
    const box = props.map.getViewport().getBoundingClientRect();
    return [Math.min(Math.max(x, box.left), box.right), Math.min(Math.max(y, box.top), box.bottom)];
}

// Header drag: the buttons in it keep their clicks
function startDrag(event) {
    if (!overlay || event.button !== 0 || event.target.closest('a, button')) return;
    event.preventDefault();
    const header = event.currentTarget;
    const [startX, startY] = clampToMap(event.clientX, event.clientY);
    const [offsetX, offsetY] = overlay.getOffset();
    dragging.value = true;

    const move = e => {
        const [x, y] = clampToMap(e.clientX, e.clientY);
        overlay.setOffset([offsetX + x - startX, offsetY + y - startY]);
    };
    const stop = e => {
        dragging.value = false;
        if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', stop);
        header.removeEventListener('pointercancel', stop);
    };
    header.setPointerCapture(event.pointerId);
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', stop);
    header.addEventListener('pointercancel', stop);
}

// The thumbnail grows the popup upwards after the map panned it into view: pan again, so
// its header does not end under whatever covers the top of the map
function onThumbnailLoad() {
    popup.loading = false;
    nextTick(() => { if (overlay && overlay.getPosition()) overlay.panIntoView(PAN); });
}

// Thumbnail failed: bounded retry with the shared policy, then name and download only
function onThumbnailError() {
    if (popup.thumbnail && popup.thumbnail.startsWith('/orgs') && shouldRetry(popup.retry)) {
        clearRetry();
        const next = popup.retry + 1;
        retryTimer = useTimeout(() => {
            // A fresh &retry=N busts the browser's cache of the failed response
            popup.thumbnail = `${stripRetryParam(popup.thumbnail)}&retry=${next}`;
            popup.retry = next;
        }, retryDelayMs(popup.retry));
        return;
    }
    clearRetry();
    popup.loading = false;
    popup.thumbnail = null;
}

onBeforeUnmount(() => {
    clearRetry();
    if (overlay && props.map) props.map.removeOverlay(overlay);
    overlay = null;
});

defineExpose({ show, close, closeUnlessIn });
</script>

<style scoped>
.image-popup {
    background: white;
    border-radius: var(--ddb-radius-md);
    box-shadow: var(--ddb-shadow-md);
    min-width: min(16.25rem, calc(100vw - 2rem));
    max-width: min(20rem, calc(100vw - 2rem));
    overflow: hidden;
    z-index: 1001;
    font-family: inherit;
}

.image-popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    background: var(--ddb-bg-subtle);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border-separator);
    cursor: grab;
    user-select: none;
    touch-action: none;
}

.image-popup.dragging .image-popup-header {
    cursor: grabbing;
}

.image-popup-title {
    font-size: var(--ddb-font-size-base);
    font-weight: 600;
    color: var(--ddb-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 10rem;
}

.image-popup-actions {
    display: flex;
    gap: var(--ddb-spacing-xs);
    align-items: center;
}

.image-popup-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
    border-radius: var(--ddb-radius-sm);
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-base);
    display: flex;
    align-items: center;
    text-decoration: none;
}

.image-popup-btn:hover {
    background: var(--ddb-border-separator);
    color: var(--ddb-text);
}

.image-popup-close:hover {
    background: var(--ddb-danger-bg);
    color: var(--ddb-danger);
}

.image-popup-body {
    padding: var(--ddb-spacing-sm);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 6.25rem;
}

.image-popup-img {
    max-width: 100%;
    max-height: 15rem;
    border-radius: var(--ddb-radius-sm);
    object-fit: contain;
}

.image-popup-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 6.25rem;
    font-size: var(--ddb-font-size-lg);
    color: var(--ddb-text-muted);
}

.image-popup-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-top: var(--ddb-border-width) solid var(--ddb-border-separator);
    background: var(--ddb-bg-light);
    border-radius: 0 0 var(--ddb-radius-md) var(--ddb-radius-md);
}

.image-popup-coords {
    font-size: var(--ddb-font-size-sm);
    font-family: monospace;
    color: var(--ddb-text-secondary);
    user-select: all;
    cursor: text;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.image-popup-copy {
    flex-shrink: 0;
    margin-left: var(--ddb-spacing-sm);
}

.image-popup-copy .icon.check {
    color: var(--ddb-success);
}

.image-popup-video-info {
    gap: var(--ddb-spacing-sm);
    min-height: 4rem;
}

.video-popup-icon {
    font-size: 1.75rem;
    color: var(--ddb-text-muted);
    flex-shrink: 0;
}

.video-popup-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.video-popup-row {
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}
</style>
