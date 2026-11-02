<template>
    <Teleport :to="zones.topRight">
        <div class="ol-map-buttons ol-unselectable ol-control" style="order: -1">
            <button v-if="showBack && !embed" title="Back to Dataset" aria-label="Back to Dataset" @click="emit('back')">
                <i class="fa-solid fa-arrow-left" />
            </button>
            <button title="Reset View (H)" aria-label="Reset View" @click="emit('reset')">
                <i class="fa-solid fa-house" />
            </button>
            <button v-if="canFullscreen" title="Fullscreen (F11)" aria-label="Fullscreen" @click="emit('fullscreen')">
                <i class="fa-solid fa-expand" />
            </button>
            <!-- data-map-link-toggle: the map link panel leaves a press on this button to the button -->
            <button v-if="copyLink && !embed" title="Copy link" aria-label="Copy link" data-map-link-toggle
                    data-testid="copy-link-toolbar-btn" @click="emit('copy-link')">
                <i class="fa-solid fa-link" />
            </button>
            <template v-if="analysisEntry">
                <button :title="analysisTitle('Raster Analysis')" aria-label="Raster Analysis" :disabled="splitMode"
                        data-testid="raster-analysis-toolbar-btn" @click="emit('analysis', 'rasterAnalysis')">
                    <i class="fa-solid fa-chart-area" />
                </button>
                <button :title="analysisTitle('Stockpile Volume')" aria-label="Stockpile Volume" :disabled="splitMode"
                        data-testid="stockpile-toolbar-btn" @click="emit('analysis', 'stockpile')">
                    <i class="fa-solid fa-layer-group" />
                </button>
            </template>
        </div>
    </Teleport>
    <Teleport v-if="displayOptions || showCompare" :to="zones.topCenter">
        <div class="ol-map-display-buttons ol-unselectable ol-control">
            <button v-if="displayOptions" title="Show direction and speed indicators" aria-label="Show direction and speed indicators"
                    :class="{ active: directionIndicators }" :aria-pressed="directionIndicators"
                    @click="emit('update:directionIndicators', !directionIndicators)">
                <i class="fa-solid fa-location-arrow" />
            </button>
            <button v-if="displayOptions" title="Show drone flight path" aria-label="Show drone flight path"
                    :class="{ active: flightPath }" :aria-pressed="flightPath" @click="emit('update:flightPath', !flightPath)">
                <i class="fa-solid fa-signs-post" />
            </button>
            <button v-if="showCompare" :title="compareLabel" :aria-label="compareLabel"
                    :class="{ active: splitMode }" :aria-pressed="splitMode" @click="emit(canCompare ? 'toggle-split' : 'compare-to')">
                <i class="fa-solid fa-table-columns" />
            </button>
        </div>
    </Teleport>
</template>

<script setup>
/**
 * The dataset map's own buttons,
 * teleported into the map's toolbar zones (libs/map/controlZones):
 * - top right: Back and Copy link (single-file map; an embedded map has neither: it has no Hub
 *   to go back to and its address is the host page's), Reset view, Fullscreen, Raster Analysis, Stockpile;
 * - top center: direction indicators and flight path (display options), compare: with two
 *   georasters or more it splits the map between them, with one it asks for another to compare to.
 */
import { computed, inject } from 'vue';
import { supportsFullScreen } from '@/libs/utils';

const props = defineProps({
    /** Zones from createControlZones */
    zones: { type: Object, required: true },
    showBack: { type: Boolean, default: false },
    /** The Copy link button (single-file map) */
    copyLink: { type: Boolean, default: false },
    /** Direction indicators and flight path (hidden on the single-file map) */
    displayOptions: { type: Boolean, default: true },
    /** The compare button, shown while the map has a georaster */
    splitToggle: { type: Boolean, default: true },
    /** An entry the analysis tools work on (the map has one to choose); null hides them */
    analysisEntry: { type: Object, default: null },
    /** The georasters on the map: the compare button needs one */
    rasterCount: { type: Number, default: 0 },
    directionIndicators: { type: Boolean, default: false },
    flightPath: { type: Boolean, default: false },
    splitMode: { type: Boolean, default: false },
    /** Two georasters or more: the button splits the map between them */
    canCompare: { type: Boolean, default: false }
});
const emit = defineEmits(['back', 'reset', 'fullscreen', 'copy-link', 'analysis', 'update:directionIndicators', 'update:flightPath', 'toggle-split', 'compare-to']);

const canFullscreen = supportsFullScreen();
// Provided by the app: true on a map embedded in another page
const embed = inject('embed', false);
// No georaster: nothing to compare, no button. An embedded map only views what it was given:
// it splits the georasters it has, but does not pick another one to compare to.
const showCompare = computed(() => props.splitToggle && props.rasterCount > 0 && (props.canCompare || !embed));
const compareLabel = computed(() => (props.canCompare ? 'Compare georasters side by side' : 'Compare to another georaster'));
// Split compare draws every raster opaque, which the tools cannot work with
const analysisTitle = name => (props.splitMode ? `${name} - Turn off split compare to use this tool` : name);
</script>
