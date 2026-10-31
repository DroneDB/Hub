/**
 * useMapSplitCompare - side-by-side comparison of the map's georasters. Each raster is clipped to its own vertical band; the N-1 dividers are the
 * `splitPositions` fractions (RasterSplitOverlay drags them). rasterLayers[0] is the
 * leftmost band; a placeholder row (no OpenLayers layer) keeps its band empty. Leaving the
 * mode, or dropping below two rasters, removes the clips.
 *
 *   const split = useMapSplitCompare({ map, rasterLayers, onChange: () => restyle() });
 */
import { ref, computed, watch, onScopeDispose } from 'vue';
import { unByKey } from 'ol/Observable';
import { getRenderPixel } from 'ol/render';
import { equalPositions } from '@/libs/compare/compareState';

/**
 * @param {object} ctx
 * @param {import('vue').Ref<any>} ctx.map             the OpenLayers map
 * @param {import('vue').Ref<{ name: string, olLayer: any, placeholder?: any }[]>} ctx.rasterLayers  top-first raster list
 * @param {() => void} [ctx.onChange]                    after entering or leaving the mode
 */
export function useMapSplitCompare({ map, rasterLayers, onChange = () => {} }) {
    const splitMode = ref(false);
    const splitPositions = ref([]);
    const canCompare = computed(() => rasterLayers.value.length >= 2);
    const splitBands = computed(() => rasterLayers.value.map(r => ({ name: r.name, placeholder: r.placeholder || null })));
    let keys = [];
    // The layers the clips were attached to
    let clippedLayers = [];

    function detach() {
        unByKey(keys);
        keys = [];
        clippedLayers = [];
    }

    /** Clip band i between positions[i-1] (or 0) and positions[i] (or 1) of the map width. */
    function attach() {
        detach();
        const positions = splitPositions.value;
        const layers = rasterLayers.value;
        // Dividers for another number of bands: the list is about to change, attach then
        if (positions.length !== layers.length - 1) return;
        clippedLayers = layers.map(r => r.olLayer);
        layers.forEach(({ olLayer }, i) => {
            if (!olLayer) return;
            const left = i === 0 ? 0 : positions[i - 1];
            const right = i === layers.length - 1 ? 1 : positions[i];
            // lifetime: paired (kept in keys, removed by detach)
            keys.push(olLayer.on('prerender', event => {
                const [w, h] = map.value.getSize();
                const corners = [[w * left, 0], [w * right, 0], [w * right, h], [w * left, h]]
                    .map(p => getRenderPixel(event, p));
                const ctx = event.context;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(...corners[0]);
                corners.slice(1).forEach(c => ctx.lineTo(...c));
                ctx.closePath();
                ctx.clip();
            }));
            // lifetime: paired (kept in keys, removed by detach)
            keys.push(olLayer.on('postrender', event => event.context.restore()));
        });
    }

    function render() {
        if (map.value) map.value.render();
    }

    /** @param {number[]} [positions]  the dividers; equal bands when missing or not for this many rasters */
    function enterSplitMode(positions) {
        const n = rasterLayers.value.length;
        if (n < 2) return;
        splitMode.value = true;
        splitPositions.value = Array.isArray(positions) && positions.length === n - 1 ? [...positions] : equalPositions(n);
        attach();
        onChange();
        render();
    }

    function exitSplitMode() {
        detach();
        splitMode.value = false;
        splitPositions.value = [];
        onChange();
        render();
    }

    function toggleSplit() {
        if (splitMode.value) exitSplitMode();
        else enterSplitMode();
    }

    /** @param {number[]} positions */
    function onSplitPositionsChange(positions) {
        splitPositions.value = positions;
        attach();
        render();
    }

    /**
     * Sets the mode and the dividers at once (a comparison's saved state).
     * @param {boolean} enabled @param {number[]} positions
     */
    function setSplit(enabled, positions) {
        if (!enabled) {
            if (splitMode.value) exitSplitMode();
            return;
        }
        if (!splitMode.value) {
            enterSplitMode(positions);
            return;
        }
        splitPositions.value = [...positions];
        attach();
        render();
    }

    watch(canCompare, ok => { if (!ok && splitMode.value) exitSplitMode(); });

    // New, removed or reordered layers (a rebuilt file list) get the clips of their bands:
    // a layer built while the mode is on would otherwise draw over the whole map
    watch(rasterLayers, layers => {
        if (!splitMode.value || layers.length < 2) return;
        const same = layers.length === clippedLayers.length && layers.every((r, i) => r.olLayer === clippedLayers[i]);
        if (same) return;
        if (splitPositions.value.length !== layers.length - 1) splitPositions.value = equalPositions(layers.length);
        attach();
        render();
    });
    onScopeDispose(detach);

    return { splitMode, splitPositions, splitBands, canCompare, enterSplitMode, exitSplitMode, toggleSplit, onSplitPositionsChange, setSplit };
}
