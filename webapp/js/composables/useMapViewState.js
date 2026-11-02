// @ts-check
/**
 * useMapViewState - MapCore under a view (the map viewer): the view state is the parent's, the
 * map shows it and reports what the user changes in it.
 *
 * - The parent's state is applied to the map: the opacity, visibility and plant-health parameters
 *   of every layer, the split mode and dividers, the map position, the basemap and the elevation
 *   model of the analysis tools. The layers themselves and their order come from the `files` the
 *   parent derives from the same state (the rows of the layer list follow them), so the order is
 *   never applied here.
 * - Every change the user makes on the map (opacity, visibility, reorder, split, dividers, plant
 *   health, pan and zoom, basemap, elevation model) is emitted as the complete new state
 *   (`update:view`); the parent applies its rules and passes the result back. A pan is reported
 *   too: the parent keeps the position of the map but does not count it as a change.
 *
 * Hashes and the base file always come from the parent's state: the parent owns them, the map
 * only knows the files it draws.
 *
 * The map's own controls keep working as on any map: this binding only translates between them
 * and the state, both ways, and never emits a state that matches the parent's. Nothing is
 * reported before the map shows the state's layers: until then what it shows is not a state.
 *
 *   const binding = useMapViewState({ view: () => props.view, emit, ...features });
 */
import { watch, onScopeDispose } from 'vue';
import { unByKey } from 'ol/Observable';
import { VIEW_VERSION, sameView, samePosition } from '@/libs/views/viewState';
import { sameVizParams } from '@/libs/map/rasterLayers';

/** @typedef {import('@/libs/views/viewState').ViewState} ViewState */
/** @typedef {import('@/libs/views/viewState').MapPosition} MapPosition */

/**
 * @param {any} view  an OpenLayers View
 * @returns {MapPosition|null}
 */
function positionOf(view) {
    const center = view.getCenter();
    const zoom = view.getZoom();
    if (!center || zoom === undefined) return null;
    return { center: [center[0], center[1]], zoom, rotation: view.getRotation() };
}

/** @param {string[]} a @param {string[]} b  the same paths, in any order (paths are unique) */
const sameSet = (a, b) => a.length === b.length && a.every(p => b.includes(p));

/**
 * @param {object} ctx
 * @param {() => ViewState|null} ctx.view            the parent's state, null on other maps
 * @param {(event: string, ...args: any[]) => void} ctx.emit
 * @param {import('vue').Ref<any>} ctx.map
 * @param {import('vue').Ref<any[]>} ctx.rasterLayerList   top-first rows (useRasterLayers)
 * @param {import('vue').Ref<number>} ctx.rasterOpacity     the opacity of a lone raster
 * @param {import('vue').Ref<boolean>} ctx.splitMode
 * @param {import('vue').Ref<number[]>} ctx.splitPositions
 * @param {(enabled: boolean, positions: number[]) => void} ctx.setSplit
 * @param {import('vue').Ref<Record<string, any>>} ctx.vizParamsByPath
 * @param {() => void} ctx.refreshRasterLayers
 * @param {import('vue').Ref<string>} ctx.selectedBasemap   what the map draws
 * @param {(name: string|null) => void} ctx.applyBasemap    draws a basemap without saving it as the preference
 * @param {import('vue').Ref<string|null>} ctx.analysisTargetPath   the elevation model chosen, null until a tool chose one
 * @param {() => string|null} ctx.defaultAnalysisTarget     the one a tool picks when none was chosen
 * @param {(path: string) => boolean} ctx.restoreAnalysisTarget   chooses it without a question or a panel; whether it did
 */
export function useMapViewState(ctx) {
    const {
        view, emit, map, rasterLayerList, rasterOpacity, splitMode, splitPositions, setSplit, vizParamsByPath,
        refreshRasterLayers, selectedBasemap, applyBasemap, analysisTargetPath, defaultAnalysisTarget, restoreAnalysisTarget
    } = ctx;
    let moveKey = null;
    let shownPaths = '';
    // The parent's state lists the layers in another order than the rows, and the map has not
    // rebuilt them yet: the rows are the old order, not a reorder by the user
    let orderPending = false;

    const rowPaths = () => rasterLayerList.value.map(r => r.path);
    const targetPaths = (/** @type {ViewState} */ target) => target.layers.map(l => l.path);
    /** The rows are the state's layers in the state's order. @param {ViewState} target */
    const inOrder = target => {
        const rows = rowPaths();
        return rows.length === target.layers.length && rows.every((p, i) => p === target.layers[i].path);
    };

    /** The elevation model the state records: nothing when it is the one the tools pick anyway. */
    function analysisTarget() {
        const path = analysisTargetPath.value;
        if (!path) return null;
        return path === defaultAnalysisTarget() ? null : path;
    }

    /** The state the map shows now. @param {ViewState} target */
    function currentState(target) {
        const hashes = new Map(target.layers.map(l => [l.path, l.hash]));
        const position = map.value ? positionOf(map.value.getView()) : null;
        return {
            v: VIEW_VERSION,
            base: { path: target.base.path, hash: target.base.hash },
            layers: rasterLayerList.value.map(r => {
                const viz = vizParamsByPath.value[r.path];
                return {
                    path: r.path,
                    hash: hashes.get(r.path) ?? '',
                    opacity: r.opacity,
                    visible: r.visible !== false,
                    vizParams: viz && Object.keys(viz).length ? { ...viz } : null
                };
            }),
            split: { enabled: splitMode.value, positions: splitMode.value ? [...splitPositions.value] : [] },
            view: position || target.view,
            display: { basemap: selectedBasemap.value || null },
            analysis: { target: analysisTarget() }
        };
    }

    // The map has caught up with the state's layers (a layer added or removed by the parent
    // shows after the file list is rebuilt): before that, what it shows is not a state
    /** @param {ViewState} target */
    function caughtUp(target) {
        if (orderPending) return false;
        const rows = rowPaths();
        if (!sameSet(rows, targetPaths(target))) return false;
        return !splitMode.value || splitPositions.value.length === rows.length - 1;
    }

    function reportChange() {
        const target = view();
        if (!target || !caughtUp(target)) return;
        const current = currentState(target);
        if (!sameView(current, target) || !samePosition(current.view, target.view)) emit('update:view', current);
    }

    /** @param {ViewState} target */
    function applyLayers(target) {
        const byPath = new Map(target.layers.map(l => [l.path, l]));
        const rows = rasterLayerList.value;
        // The opacity of a map with one raster is the single one; the row holds it as well
        if (rows.length === 1 && byPath.has(rows[0].path) && rasterOpacity.value !== byPath.get(rows[0].path).opacity) {
            rasterOpacity.value = byPath.get(rows[0].path).opacity;
        }
        const differs = (/** @type {any} */ r) => {
            const l = byPath.get(r.path);
            return !!l && (l.opacity !== r.opacity || l.visible !== (r.visible !== false));
        };
        if (rows.some(differs)) {
            rasterLayerList.value = rows.map(r => {
                const l = byPath.get(r.path);
                return differs(r) ? { ...r, opacity: l.opacity, visible: l.visible } : r;
            });
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

        // Dividers are for the bands of the rows that are drawn: only once the rows are the state's
        if (sameSet(rowPaths(), targetPaths(target))) {
            const { enabled, positions } = target.split;
            const same = enabled === splitMode.value && positions.length === splitPositions.value.length
                && positions.every((p, i) => Math.abs(p - splitPositions.value[i]) < 1e-9);
            if (!same) setSplit(enabled, positions);
        }
    }

    /** A state without a position leaves the map where the file fits it. @param {ViewState} target */
    function applyPosition(target) {
        const olView = map.value && map.value.getView();
        if (!olView || !target.view) return;
        if (samePosition(positionOf(olView), target.view)) return;
        olView.setCenter(target.view.center);
        olView.setZoom(target.view.zoom);
        olView.setRotation(target.view.rotation);
    }

    // A state without an elevation model uses the one the tools pick: a model chosen before
    // (by the user, or by the state of another view) gives way to it
    /** @param {ViewState} target */
    function applyAnalysisTarget(target) {
        const wanted = target.analysis.target;
        if (wanted === analysisTarget()) return;
        const path = wanted ?? defaultAnalysisTarget();
        if (path) restoreAnalysisTarget(path);
    }

    function apply() {
        const target = view();
        if (!target) return;
        applyLayers(target);
        applyPosition(target);
        // A state without a basemap draws the user's preference
        applyBasemap(target.display.basemap);
        applyAnalysisTarget(target);
    }

    watch(view, target => {
        orderPending = !!target && sameSet(rowPaths(), targetPaths(target)) && !inOrder(target);
        apply();
    });

    // A rebuilt layer list with other files: the parent changed the layers, its state applies
    // to the new ones; the same files in another order, an opacity change and the like are the user's
    watch(rasterLayerList, () => {
        const target = view();
        if (!target) return;
        const paths = rowPaths().sort().join('\n');
        const rebuilt = orderPending && inOrder(target);
        if (rebuilt) orderPending = false;
        if (rebuilt || paths !== shownPaths) {
            shownPaths = paths;
            apply();
        }
        reportChange();
    });
    watch([rasterOpacity, splitMode, splitPositions, vizParamsByPath, selectedBasemap, analysisTargetPath], reportChange);

    watch(map, m => {
        unByKey(moveKey);
        moveKey = null;
        if (!m) return;
        if (view()) apply();
        // lifetime: paired (removed when the map changes and with the owner)
        moveKey = m.on('moveend', reportChange);
    }, { immediate: true });
    onScopeDispose(() => unByKey(moveKey));

    return { applyView: apply };
}
