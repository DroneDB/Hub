/**
 * useRasterLayers - the georaster list of the dataset map: the
 * rows of the opacity panel (top first, the reverse of the OpenLayers collection), the
 * global or per-layer opacity, reordering, and dimming of selected rasters.
 *
 *   const rasters = useRasterLayers({ group, vectorLayers, splitMode: () => ..., displayName });
 */
import { ref, watch, markRaw } from 'vue';
import ddb from 'ddb';
import { isPlantHealthCapable } from '@/libs/entryTypes';

/**
 * @param {object} ctx
 * @param {import('vue').Ref<any>} ctx.group          the rasters' LayerGroup
 * @param {import('vue').Ref<any[]>} ctx.vectorLayers  redrawn on restyle (their style reads the selection)
 * @param {() => boolean} ctx.splitMode               split compare shows every raster opaque
 * @param {(layer: any) => string} ctx.displayName
 */
export function useRasterLayers({ group, vectorLayers, splitMode, displayName }) {
    // [{ name, path, olLayer, opacity, plantHealthCapable }], top first
    const rasterLayerList = ref([]);
    const rasterOpacity = ref(1.0);
    const hasRasters = ref(false);

    /** Rebuilds the list from the layer group, keeping each layer's opacity. */
    function syncRasterLayers() {
        const list = [];
        group.value.getLayers().forEach(olLayer => {
            if (!olLayer.file) return;
            const entryPath = olLayer.file.entry && olLayer.file.entry.path;
            const name = displayName(olLayer) || (entryPath ? ddb.pathutils.basename(entryPath) : '');
            const path = entryPath || name;
            const existing = rasterLayerList.value.find(r => r.path === path);
            list.push({
                name,
                path,
                // markRaw: a reactive proxy would break identity checks and slow OpenLayers
                olLayer: markRaw(olLayer),
                opacity: existing ? existing.opacity : 1.0,
                plantHealthCapable: isPlantHealthCapable(olLayer.file?.entry)
            });
        });
        rasterLayerList.value = list.reverse();
    }

    function handleRasterLayerReorder({ fromIndex, toIndex }) {
        const updated = [...rasterLayerList.value];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        rasterLayerList.value = updated;
        // The OL collection is the reverse of the list (OL draws the last on top)
        const olLayers = group.value.getLayers();
        olLayers.clear();
        for (let i = updated.length - 1; i >= 0; i--) olLayers.push(updated[i].olLayer);
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
