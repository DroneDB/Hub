/**
 * useMapComparison - MapCore under a comparison (the compare view): the comparison state is
 * the parent's, the map shows it and reports what the user changes in it.
 *
 * - The parent's state is applied to the map: layer opacity, plant-health parameters, split
 *   mode and dividers, view and basemap. The layers themselves and their order come from the
 *   `files` the parent derives from the same state.
 * - Every change the user makes on the map (opacity, reorder, split, dividers, plant health,
 *   pan and zoom, basemap) is emitted as the complete new state (`update:comparison`); the
 *   parent applies its layer rules and passes the result back.
 *
 * The map's own controls keep working as on any map: this binding only translates between
 * them and the state, both ways, and never emits a state that matches the parent's.
 *
 *   const binding = useMapComparison({ comparison: () => props.comparison, emit, ...features });
 */
import { watch, onScopeDispose } from 'vue';
import { unByKey } from 'ol/Observable';
import { STATE_VERSION, sameState, sameView } from '@/libs/compare/compareState';
import { sameVizParams } from '@/libs/map/rasterLayers';

/** @param {any} view  an OpenLayers View */
function viewState(view) {
    const center = view.getCenter();
    const zoom = view.getZoom();
    if (!center || zoom === undefined) return null;
    return { center: [center[0], center[1]], zoom, rotation: view.getRotation() };
}

/**
 * @param {object} ctx
 * @param {() => any} ctx.comparison                 the parent's state, null on other maps
 * @param {(event: string, ...args: any[]) => void} ctx.emit
 * @param {import('vue').Ref<any>} ctx.map
 * @param {import('vue').Ref<any[]>} ctx.rasterLayerList   top-first rows (useRasterLayers)
 * @param {import('vue').Ref<number>} ctx.rasterOpacity     the opacity of a lone raster
 * @param {import('vue').Ref<boolean>} ctx.splitMode
 * @param {import('vue').Ref<number[]>} ctx.splitPositions
 * @param {(enabled: boolean, positions: number[]) => void} ctx.setSplit
 * @param {import('vue').Ref<Record<string, any>>} ctx.vizParamsByPath
 * @param {() => void} ctx.refreshRasterLayers
 * @param {import('vue').Ref<string>} ctx.selectedBasemap
 */
export function useMapComparison(ctx) {
    const { comparison, emit, map, rasterLayerList, rasterOpacity, splitMode, splitPositions, setSplit, vizParamsByPath, refreshRasterLayers, selectedBasemap } = ctx;
    let moveKey = null;
    let shownPaths = '';

    /** The state the map shows now. */
    function currentState() {
        const target = comparison();
        const hashes = new Map(target.layers.map(l => [l.path, l.hash]));
        const rows = rasterLayerList.value;
        const view = map.value ? viewState(map.value.getView()) : null;
        return {
            v: STATE_VERSION,
            layers: rows.map(r => {
                const viz = vizParamsByPath.value[r.path];
                return {
                    path: r.path,
                    hash: hashes.get(r.path) ?? '',
                    opacity: rows.length === 1 ? rasterOpacity.value : r.opacity,
                    vizParams: viz && Object.keys(viz).length ? { ...viz } : null
                };
            }),
            split: { enabled: splitMode.value, positions: splitMode.value ? [...splitPositions.value] : [] },
            view: view || target.view,
            display: { basemap: selectedBasemap.value || null }
        };
    }

    // The map has caught up with the state's layers (a layer added or removed by the parent
    // shows after the file list is rebuilt): before that, what it shows is not a state
    function caughtUp(target) {
        const rows = rasterLayerList.value;
        if (rows.length !== target.layers.length) return false;
        const paths = new Set(target.layers.map(l => l.path));
        if (!rows.every(r => paths.has(r.path))) return false;
        return !splitMode.value || splitPositions.value.length === rows.length - 1;
    }

    function reportChange() {
        const target = comparison();
        if (!target || !caughtUp(target)) return;
        const current = currentState();
        if (!sameState(current, target)) emit('update:comparison', current);
    }

    function applyLayers(target) {
        const byPath = new Map(target.layers.map(l => [l.path, l]));
        const rows = rasterLayerList.value;
        if (rows.length === 1 && byPath.has(rows[0].path)) rasterOpacity.value = byPath.get(rows[0].path).opacity;
        if (rows.some(r => byPath.has(r.path) && byPath.get(r.path).opacity !== r.opacity)) {
            rasterLayerList.value = rows.map(r => (byPath.has(r.path) ? { ...r, opacity: byPath.get(r.path).opacity } : r));
        }

        const viz = { ...vizParamsByPath.value };
        let vizChanged = false;
        for (const l of target.layers) {
            if (sameVizParams(viz[l.path], l.vizParams)) continue;
            if (l.vizParams) viz[l.path] = { ...l.vizParams };
            else delete viz[l.path];
            vizChanged = true;
        }
        if (vizChanged) {
            vizParamsByPath.value = viz;
            refreshRasterLayers();
        }

        if (rows.length === target.layers.length) {
            const { enabled, positions } = target.split;
            const same = enabled === splitMode.value && positions.length === splitPositions.value.length
                && positions.every((p, i) => Math.abs(p - splitPositions.value[i]) < 1e-9);
            if (!same) setSplit(enabled, positions);
        }
    }

    function applyView(target) {
        const view = map.value && map.value.getView();
        if (!view || !target.view) return;
        const current = viewState(view);
        if (current && sameView(current, target.view)) return;
        view.setCenter(target.view.center);
        view.setZoom(target.view.zoom);
        view.setRotation(target.view.rotation);
    }

    function apply() {
        const target = comparison();
        if (!target) return;
        applyLayers(target);
        applyView(target);
        if (target.display.basemap && target.display.basemap !== selectedBasemap.value) selectedBasemap.value = target.display.basemap;
    }

    watch(comparison, apply);

    // A rebuilt layer list with other files: the parent changed the layers, its state applies
    // to the new ones; a reorder or an opacity change is the user's
    watch(rasterLayerList, rows => {
        if (!comparison()) return;
        const paths = rows.map(r => r.path).sort().join('\n');
        if (paths !== shownPaths) {
            shownPaths = paths;
            apply();
        }
        reportChange();
    });
    watch([rasterOpacity, splitMode, splitPositions, vizParamsByPath, selectedBasemap], reportChange);

    watch(map, m => {
        unByKey(moveKey);
        moveKey = null;
        if (!m || !comparison()) return;
        apply();
        // lifetime: paired (removed when the map changes and with the owner)
        moveKey = m.on('moveend', reportChange);
    });
    onScopeDispose(() => unByKey(moveKey));

    return { applyComparison: apply };
}
