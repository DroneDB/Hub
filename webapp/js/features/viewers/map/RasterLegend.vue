<template>
    <div v-if="entries.length" class="raster-legend" data-testid="raster-legend">
        <figure v-for="entry in entries" :key="entry.path" class="legend-item" role="img" :aria-label="entry.label">
            <figcaption v-if="entries.length > 1" class="legend-name" :title="entry.name">{{ entry.name }}</figcaption>
            <span class="legend-bar" :style="{ background: entry.gradient }" data-testid="raster-legend-bar" />
            <span class="legend-ends" aria-hidden="true">
                <span data-testid="raster-legend-min">{{ entry.minText }}</span>
                <span data-testid="raster-legend-max">{{ entry.maxText }}</span>
            </span>
        </figure>
    </div>
</template>

<script setup>
/**
 * RasterLegend - the colour legend of the styled rasters of the map (FR-RAS-27, FR-XC-24): a colour bar with the two ends
 * of the rescale range and the unit of the raster, for every visible layer that has a colormap and a range. It is derived
 * from the style of the layers (`vizParams`, which saved views keep), so it has no state of its own and shows in saved views
 * and embeds. The bar is the gradient of the colormap picker, with hard stops for a discrete colormap; the numbers are
 * those of the raster value formatter. The unit of a layer without a thermal formula is read from its value info, once per
 * raster.
 */
import { computed, ref, watch } from 'vue';
import { legendLayers, legendEntry } from '@/libs/map/rasterLegend';
import { defaultVizParams } from '@/libs/map/defaultVizParams';

const props = defineProps({
    /** The layer list of the map, top first: { path, name, visible } */
    rows: { type: Array, default: () => [] },
    /** The style of each layer by path (the vizParams the tiles are drawn with) */
    styles: { type: Object, default: () => ({}) },
    /** The unit of each raster by path, where the map knows it already (it read the value info for the default style) */
    units: { type: Object, default: () => ({}) },
    /** The dataset, to read the unit of a raster from its value info when the map does not know it */
    dataset: { type: Object, default: null }
});

// The most legends the map shows at once: more would cover it
const MAX_LEGENDS = 3;

// The unit of each raster the map did not know, read once from its value info: undefined = not asked, null = could not be read
const read = ref(/** @type {Record<string, string|null>} */ ({}));
const asked = new Set();

const layers = computed(() => legendLayers(props.rows, props.styles).slice(0, MAX_LEGENDS));
const unitOf = (/** @type {string} */ path) => props.units[path] ?? read.value[path];
const entries = computed(() => layers.value.map(layer => legendEntry(layer, unitOf(layer.path))));

watch(layers, async list => {
    const dataset = props.dataset;
    if (!dataset) return;
    for (const layer of list) {
        // A thermal formula gives its own unit, and the map may know it already
        if (layer.formula || props.units[layer.path] !== undefined || asked.has(layer.path)) continue;
        asked.add(layer.path);
        try {
            const info = await dataset.getRasterValueInfo(layer.path);
            read.value = { ...read.value, [layer.path]: defaultVizParams(info).unit };
        } catch (e) {
            // The legend shows without a unit
            console.warn(`Failed to read the unit of ${layer.path}:`, e);
            read.value = { ...read.value, [layer.path]: null };
        }
    }
}, { immediate: true });
</script>

<style scoped>
/* Top left of the map, under the zoom buttons (--map-zoom-reserve) and out of the toolbar rail on the right
   (--map-rail-reserve), over the layers and under the controls and the analysis panels (--map-layer-bottom-panel) */
.raster-legend {
    position: absolute;
    top: var(--map-zoom-reserve);
    left: 0.5rem;
    z-index: var(--map-layer-bottom-panel);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    box-sizing: border-box;
    max-width: calc(100% - var(--map-rail-reserve) - 0.5rem);
    padding: 0.35rem 0.5rem;
    border-radius: 0.375rem;
    background: rgba(var(--ddb-shade-rgb), 0.6);
    color: var(--ddb-text-on-dark);
    font-size: 0.75rem;
    line-height: 1.2;
    pointer-events: none;
}

.legend-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 8rem;
    width: 12rem;
    max-width: 100%;
    margin: 0;
}

.legend-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(var(--ddb-glass-rgb), 0.8);
}

.legend-bar {
    display: block;
    height: 0.6rem;
    border-radius: 0.15rem;
    border: 1px solid rgba(var(--ddb-glass-rgb), 0.5);
}

.legend-ends {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
</style>
