/**
 * useMapSplitCompare - side-by-side comparison of the map's georasters (HQ-07, out of
 * Map.vue). Each raster is clipped to its own vertical band; the N-1 dividers are the
 * `splitPositions` fractions (RasterSplitOverlay drags them). rasterLayers[0] is the
 * leftmost band. Leaving the mode, or dropping below two rasters, removes the clips.
 *
 *   const split = useMapSplitCompare({ map, rasterLayers, onChange: () => restyle() });
 */
import { ref, computed, watch, onScopeDispose } from 'vue';
import { unByKey } from 'ol/Observable';
import { getRenderPixel } from 'ol/render';

/**
 * @param {object} ctx
 * @param {import('vue').Ref<any>} ctx.map             the OpenLayers map
 * @param {import('vue').Ref<{ name: string, olLayer: any }[]>} ctx.rasterLayers  top-first raster list
 * @param {() => void} [ctx.onChange]                    after entering or leaving the mode
 */
export function useMapSplitCompare({ map, rasterLayers, onChange = () => {} }) {
    const splitMode = ref(false);
    const splitPositions = ref([]);
    const canCompare = computed(() => rasterLayers.value.length >= 2);
    const splitBands = computed(() => rasterLayers.value.map(r => r.name));
    let keys = [];

    function detach() {
        unByKey(keys);
        keys = [];
    }

    /** Clip band i between positions[i-1] (or 0) and positions[i] (or 1) of the map width. */
    function attach() {
        detach();
        const positions = splitPositions.value;
        const layers = rasterLayers.value;
        layers.forEach(({ olLayer }, i) => {
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

    function enterSplitMode() {
        const n = rasterLayers.value.length;
        if (n < 2) return;
        splitMode.value = true;
        // Equidistant dividers
        splitPositions.value = Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
        attach();
        onChange();
        map.value.render();
    }

    function exitSplitMode() {
        detach();
        splitMode.value = false;
        splitPositions.value = [];
        onChange();
        if (map.value) map.value.render();
    }

    function toggleSplit() {
        if (splitMode.value) exitSplitMode();
        else enterSplitMode();
    }

    /** @param {number[]} positions */
    function onSplitPositionsChange(positions) {
        splitPositions.value = positions;
        attach();
        map.value.render();
    }

    watch(canCompare, ok => { if (!ok && splitMode.value) exitSplitMode(); });
    onScopeDispose(detach);

    return { splitMode, splitPositions, splitBands, canCompare, enterSplitMode, exitSplitMode, toggleSplit, onSplitPositionsChange };
}
