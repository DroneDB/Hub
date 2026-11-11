/**
 * useRasterLayers - the georaster list of the dataset map: the
 * rows of the opacity panel (top first, the reverse of the OpenLayers collection), the
 * global or per-layer opacity, reordering, and dimming of selected rasters.
 *
 * On the dataset map a lone raster has the one opacity control and always shows. In a view the
 * panel has a row for it as for any other (its own opacity and eye), so the rows decide whatever
 * their number (`perRow`).
 *
 *   const rasters = useRasterLayers({ group, vectorLayers, splitMode: () => ..., perRow: () => ... });
 *   rasters.syncRasterLayers(fileLayers.rasterSlots);
 */
import { ref, watch, markRaw } from 'vue';
import { isPlantHealthCapable } from '@/libs/entryTypes';
import { layerLabels } from '@/libs/map/layerLabels';
import { rasterLayerPath } from '@/libs/map/rasterLayers';

/**
 * @param {object} ctx
 * @param {import('vue').Ref<any>} ctx.group          the rasters' LayerGroup
 * @param {import('vue').Ref<any[]>} ctx.vectorLayers  redrawn on restyle (their style reads the selection)
 * @param {() => boolean} ctx.splitMode               split compare shows every raster opaque
 * @param {() => boolean} [ctx.perRow]                 the rows set opacity and visibility even for a lone raster (a view)
 */
export function useRasterLayers({ group, vectorLayers, splitMode, perRow = () => false }) {
    // [{ name, path, olLayer, opacity, visible, plantHealthCapable, placeholder }], top first; a
    // placeholder row (olLayer null) keeps the place of a raster that cannot be drawn
    const rasterLayerList = ref([]);
    const rasterOpacity = ref(1.0);
    const hasRasters = ref(false);

    /** Puts the group's layers in the order of the list (OL draws the last on top, the list is top first). */
    function applyListOrder(list) {
        const olLayers = group.value.getLayers();
        const wanted = [];
        for (let i = list.length - 1; i >= 0; i--) if (list[i].olLayer) wanted.push(list[i].olLayer);
        const current = olLayers.getArray();
        // Untouched when it is in order already: a reset of the collection redraws the rasters
        if (wanted.length === current.length && wanted.every((l, i) => l === current[i])) return;
        olLayers.clear();
        wanted.forEach(l => olLayers.push(l));
    }

    /**
     * Rebuilds the list from the raster slots (file order, the last drawn on top), keeping
     * each layer's opacity and visibility. Names are the file names, with enough of the folders
     * to tell apart files of the same name.
     * With `keepOrder` the rows that stay keep the order they have in the list (the user's) and
     * the new rows go on top of them, the last file highest; a view does without it, its
     * order is the one of its state.
     * @param {{ file: any, olLayer: any }[]} slots
     * @param {{ keepOrder?: boolean }} [options]
     */
    function syncRasterLayers(slots, { keepOrder = false } = {}) {
        const rows = slots.map(({ file, olLayer }) => ({
            path: file.entry ? file.entry.path : file.placeholder.path,
            file,
            olLayer
        }));
        const labels = layerLabels(rows.map(r => r.path));
        const previous = rasterLayerList.value;
        const built = rows.map(({ path, file, olLayer }) => {
            const existing = previous.find(r => r.path === path);
            return {
                name: labels.get(path) || path,
                path,
                // markRaw: a reactive proxy would break identity checks and slow OpenLayers
                olLayer: olLayer ? markRaw(olLayer) : null,
                opacity: existing ? existing.opacity : 1.0,
                visible: existing ? existing.visible !== false : true,
                plantHealthCapable: !!file.entry && isPlantHealthCapable(file.entry),
                placeholder: file.placeholder || null
            };
        });
        const newestFirst = built.reverse();
        if (!keepOrder) {
            rasterLayerList.value = newestFirst;
            return;
        }
        const byPath = new Map(newestFirst.map(r => [r.path, r]));
        const kept = previous.filter(r => byPath.has(r.path)).map(r => byPath.get(r.path));
        const keptPaths = new Set(kept.map(r => r.path));
        rasterLayerList.value = [...newestFirst.filter(r => !keptPaths.has(r.path)), ...kept];
        if (group.value) applyListOrder(rasterLayerList.value);
    }

    function handleRasterLayerReorder({ fromIndex, toIndex }) {
        const updated = [...rasterLayerList.value];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        rasterLayerList.value = updated;
        applyListOrder(updated);
    }

    /** Shows or hides a layer; its opacity value stays for when it shows again. */
    function toggleRasterLayerVisible(path) {
        rasterLayerList.value = rasterLayerList.value.map(r => (r.path === path ? { ...r, visible: !r.visible } : r));
    }

    function updateRastersOpacity() {
        if (!group.value) return;
        const rasters = group.value.getLayers();
        hasRasters.value = rasters.getLength() > 0;
        if (splitMode()) {
            // Every layer shows in split compare, whatever its row says; the row keeps its value
            rasters.forEach(layer => {
                layer.setOpacity(1);
                layer.setVisible(true);
            });
            return;
        }
        // The eye is in the panel of two rows or more (of any number in a view): the only layer of
        // the dataset map always shows, there would be no control to bring it back
        const perLayer = perRow() || rasterLayerList.value.length > 1;
        rasters.forEach(layer => {
            let opacity = rasterOpacity.value;
            let visible = true;
            if (perLayer) {
                // By path: the list holds proxied rows, identity is unreliable
                const path = rasterLayerPath(layer);
                const row = rasterLayerList.value.find(r => r.path === path);
                opacity = row ? row.opacity : 1.0;
                visible = row ? row.visible !== false : true;
            }
            // Dim selected layers slightly
            if (layer.file && layer.file.selected) opacity *= 0.8;
            layer.setOpacity(opacity);
            layer.setVisible(visible);
        });
        vectorLayers.value.forEach(layer => {
            if (layer.getSource()) layer.getSource().changed();
        });
    }

    watch(rasterOpacity, updateRastersOpacity);
    watch(rasterLayerList, updateRastersOpacity, { deep: true });

    return { rasterLayerList, rasterOpacity, hasRasters, syncRasterLayers, handleRasterLayerReorder, toggleRasterLayerVisible, updateRastersOpacity };
}
