<template>
    <Teleport :to="zones.topRight">
        <div class="ol-map-buttons ol-unselectable ol-control" style="order: -1">
            <button v-if="showBack" title="Back to Dataset" aria-label="Back to Dataset" @click="emit('back')">
                <i class="fa-solid fa-arrow-left" />
            </button>
            <button title="Reset View (H)" aria-label="Reset View" @click="emit('reset')">
                <i class="fa-solid fa-house" />
            </button>
            <button v-if="canFullscreen" title="Fullscreen (F11)" aria-label="Fullscreen" @click="emit('fullscreen')">
                <i class="fa-solid fa-expand" />
            </button>
            <template v-if="analysisEntry">
                <button :title="analysisTitle('Raster Analysis')" aria-label="Raster Analysis" :disabled="multiRaster"
                        data-testid="raster-analysis-toolbar-btn" @click="emit('analysis', 'rasterAnalysis')">
                    <i class="fa-solid fa-chart-area" />
                </button>
                <button :title="analysisTitle('Stockpile Volume')" aria-label="Stockpile Volume" :disabled="multiRaster"
                        data-testid="stockpile-toolbar-btn" @click="emit('analysis', 'stockpile')">
                    <i class="fa-solid fa-layer-group" />
                </button>
            </template>
        </div>
    </Teleport>
    <Teleport v-if="displayOptions" :to="zones.topCenter">
        <div class="ol-map-display-buttons ol-unselectable ol-control">
            <button title="Show direction and speed indicators" aria-label="Show direction and speed indicators"
                    :class="{ active: directionIndicators }" :aria-pressed="directionIndicators"
                    @click="emit('update:directionIndicators', !directionIndicators)">
                <i class="fa-solid fa-location-arrow" />
            </button>
            <button title="Show drone flight path" aria-label="Show drone flight path"
                    :class="{ active: flightPath }" :aria-pressed="flightPath" @click="emit('update:flightPath', !flightPath)">
                <i class="fa-solid fa-signs-post" />
            </button>
            <button :title="canCompare ? 'Compare georasters side by side' : 'Need at least 2 georasters to compare'"
                    aria-label="Compare georasters side by side" :disabled="!canCompare"
                    :class="{ active: splitMode }" :aria-pressed="splitMode" @click="emit('toggle-split')">
                <i class="fa-solid fa-table-columns" />
            </button>
        </div>
    </Teleport>
</template>

<script setup>
/**
 * The dataset map's own buttons,
 * teleported into the map's toolbar zones (libs/map/controlZones):
 * - top right: Back (single-file map), Reset view, Fullscreen, Raster Analysis, Stockpile;
 * - top center: direction indicators, flight path, split compare.
 */
import { computed } from 'vue';
import { supportsFullScreen } from '@/libs/utils';

const props = defineProps({
    /** Zones from createControlZones */
    zones: { type: Object, required: true },
    showBack: { type: Boolean, default: false },
    /** Display options row (hidden on the single-file map) */
    displayOptions: { type: Boolean, default: true },
    /** The entry the analysis tools open for; null hides them */
    analysisEntry: { type: Object, default: null },
    rasterCount: { type: Number, default: 0 },
    directionIndicators: { type: Boolean, default: false },
    flightPath: { type: Boolean, default: false },
    splitMode: { type: Boolean, default: false },
    canCompare: { type: Boolean, default: false }
});
const emit = defineEmits(['back', 'reset', 'fullscreen', 'analysis', 'update:directionIndicators', 'update:flightPath', 'toggle-split']);

const canFullscreen = supportsFullScreen();
// Raster Analysis and Stockpile Volume work on exactly one georaster
const multiRaster = computed(() => props.rasterCount > 1);
const analysisTitle = name => multiRaster.value
    ? `${name} - Requires a single georaster layer. Remove other layers or open the file individually.`
    : name;
</script>
