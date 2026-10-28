/**
 * useRasterLayers - the georaster list of the dataset map: the
 * rows of the opacity panel (top first, the reverse of the OpenLayers collection), the
 * global or per-layer opacity, reordering, and dimming of selected rasters.
 *
 *   const rasters = useRasterLayers({ group, vectorLayers, splitMode: () => ... });
 *   rasters.syncRasterLayers(fileLayers.rasterSlots);
 */
import { ref, watch, markRaw } from 'vue';
import { isPlantHealthCapable } from '@/libs/entryTypes';
import { layerLabels } from '@/libs/map/layerLabels';

/**
 * @param {object} ctx
 * @param {import('vue').Ref<any>} ctx.group          the rasters' LayerGroup
 * @param {import('vue').Ref<any[]>} ctx.vectorLayers  redrawn on restyle (their style reads the selection)
 * @param {() => boolean} ctx.splitMode               split compare shows every raster opaque
 */
export function useRasterLayers({ group, vectorLayers, splitMode }) {
    // [{ name, path, olLayer, opacity, plantHealthCapable, placeholder }], top first; a placeholder
    // row (olLayer null) keeps the place of a raster that cannot be drawn
    const rasterLayerList = ref([]);
    const rasterOpacity = ref(1.0);
    const hasRasters = ref(false);

    /**
     * Rebuilds the list from the raster slots (file order, the last drawn on top), keeping
     * each layer's opacity. Names are the file names, with enough of the folders to tell
     * apart files of the same name.
     * @param {{ file: any, olLayer: any }[]} slots
     */
    function syncRasterLayers(slots) {
        const rows = slots.map(({ file, olLayer }) => ({
            path: file.entry ? file.entry.path : file.placeholder.path,
            file,
            olLayer
        }));
        const labels = layerLabels(rows.map(r => r.path));
        rasterLayerList.value = rows.map(({ path, file, olLayer }) => {
            const existing = rasterLayerList.value.find(r => r.path === path);
            return {
                name: labels.get(path) || path,
                path,
                // markRaw: a reactive proxy would break identity checks and slow OpenLayers
                olLayer: olLayer ? markRaw(olLayer) : null,
                opacity: existing ? existing.opacity : 1.0,
                plantHealthCapable: !!file.entry && isPlantHealthCapable(file.entry),
                placeholder: file.placeholder || null
            };
        }).reverse();
    }

    function handleRasterLayerReorder({ fromIndex, toIndex }) {
        const updated = [...rasterLayerList.value];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        rasterLayerList.value = updated;
        // The OL collection is the reverse of the list (OL draws the last on top)
        const olLayers = group.value.getLayers();
        olLayers.clear();
        for (let i = updated.length - 1; i >= 0; i--) if (updated[i].olLayer) olLayers.push(updated[i].olLayer);
    }

    function updateRastersOpacity() {
        if (!group.value) return;
        const rasters = group.value.getLayers();
        hasRasters.value = rasters.getLength() > 0;
        if (splitMode()) {
            rasters.forEach(layer => layer.setOpacity(1));
            return;
        }
        const perLayer = rasterLayerList.value.length > 1;
        rasters.forEach(layer => {
            let opacity = rasterOpacity.value;
            if (perLayer) {
                // By path: the list holds proxied rows, identity is unreliable
                const path = layer.file && layer.file.entry ? layer.file.entry.path : null;
                const row = rasterLayerList.value.find(r => r.path === path);
                opacity = row ? row.opacity : 1.0;
            }
            // Dim selected layers slightly
            if (layer.file && layer.file.selected) opacity *= 0.8;
            layer.setOpacity(opacity);
        });
        vectorLayers.value.forEach(layer => {
            if (layer.getSource()) layer.getSource().changed();
        });
    }

    watch(rasterOpacity, updateRastersOpacity);
    watch(rasterLayerList, updateRastersOpacity, { deep: true });

    return { rasterLayerList, rasterOpacity, hasRasters, syncRasterLayers, handleRasterLayerReorder, updateRastersOpacity };
}
