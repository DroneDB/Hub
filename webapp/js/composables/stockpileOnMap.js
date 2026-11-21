/**
 * The piles that are measurements of the map, for the stockpile panel (a part of useStockpileVolume: its state and
 * methods are merged into the feature's scope and use its `this`).
 *
 * A click on one chooses it; the outline of the chosen pile is edited with Edit outline (the measure control's edit
 * mode on that feature); and whenever the user changes the outline of a pile, with the panel open or not, the
 * pile's volume is measured again once the outline rests.
 */
import { markRaw, toRaw } from 'vue';
import { unByKey } from 'ol/Observable';
import { computeMaterialEstimate, materialOfSavedPile } from '@/libs/stockpileMaterials';
import { stockpileLabel } from '@/libs/format';
import { updateFeatureTooltip } from '@/libs/map/olMeasurementConverter';
import { RESULT_PROPERTIES, propertiesOfResult, resultOfProperties, stockpilePolygonOf } from '@/libs/map/stockpileStorage';
import { BASE_METHOD, isBaseMethod } from '@/libs/stockpileBase';

// How long the outline of a pile rests before its volume is measured again: a vertex dragged, then another
const REMEASURE_DELAY_MS = 400;

/** The state of the piles on the map; `_` members are the feature's own. */
export const onMapState = () => ({
    // The outline of the chosen pile is being edited (Edit outline)
    stockpileEditing: false,
    // The key of the click on the map that chooses a pile, while the panel is open
    _stockpileClickKey: null,
    // The measuring of a pile again, by feature id: the turn that tells an answer is overtaken by a later outline,
    // and the timer of the pause before it starts
    _remeasureTurns: {},
    _remeasureTimers: {}
});

export const onMapMethods = {
    /**
     * A click on the map while the panel is open and no tool draws chooses what is under it: a pile of the
     * list (its row is chosen and scrolled into view), else a pile on the map, which the panel then works on.
     */
    _onStockpileMapClick(evt) {
        const mc = this.measureControls;
        if (!this.stockpilePanelVisible || this.stockpileMode || !this.map) return;
        // A measure tool or the edit of the outlines uses the click for itself
        if (mc && (mc.selectedTool || mc.isEditMode)) return;
        const map = toRaw(this.map);
        const rank = this._stockpilePreview ? this._stockpilePreview.pileAt(map, evt.pixel) : null;
        const listed = rank === null ? null : (this.stockpilePiles ?? []).find(pile => pile.id === rank);
        if (listed) {
            this.chooseStockpilePile(listed, { fit: false });
            return;
        }
        if (!mc) return;
        const feature = map.forEachFeatureAtPixel(evt.pixel,
            f => (f.get('measurementType') === 'stockpile' ? f : undefined),
            { layerFilter: layer => layer === toRaw(mc).vector, hitTolerance: 4 });
        if (feature) this.selectStockpileFeature(feature);
    },

    _bindStockpileMapClick() {
        if (this._stockpileClickKey || !this.map) return;
        // lifetime: owner (removed by _unbindStockpileMapClick: the panel closing, the map ending)
        this._stockpileClickKey = markRaw(toRaw(this.map).on('singleclick', evt => this._onStockpileMapClick(evt)));
    },

    _unbindStockpileMapClick() {
        if (!this._stockpileClickKey) return;
        unByKey(this._stockpileClickKey);
        this._stockpileClickKey = null;
    },

    /**
     * The user changed the outline of a pile on the map (a vertex, a move, an undo): its volume is measured again
     * once the outline rests, from the base, the flat elevation and the elevation model recorded with the pile, whether
     * the panel is open or not. A later outline overtakes the one that waits and the one that is being measured
     * (a turn for each pile). When the volume cannot be had the pile keeps its figures, and its label and a flash
     * say that they are not those of the outline.
     * @param {import('ol/Feature').default} feature
     */
    remeasureStockpileFeature(feature) {
        if (!feature || !feature.get || feature.get('measurementType') !== 'stockpile') return;
        const id = feature.get('id');
        if (!id) return;
        // The outline to export is the outline now
        if (id === this._chosenStockpileFeatureId) {
            this.stockpileDetectedPolygon = stockpilePolygonOf(feature, this._mapProjection());
        }
        this._dropRemeasure(id);
        const raw = toRaw(feature);
        this._remeasureTimers[id] = setTimeout(async () => {
            delete this._remeasureTimers[id];
            const outcome = await this._recalculateStockpile(raw);
            if (outcome.status === 'failed') this._markNotRecalculated(raw);
        }, REMEASURE_DELAY_MS);
    },

    /** The pause before the measuring of a pile again, and the answer being waited for, are over for it. @param {string} id */
    _dropRemeasure(id) {
        clearTimeout(this._remeasureTimers[id]);
        delete this._remeasureTimers[id];
        if (id in this._remeasureTurns) this._remeasureTurns[id]++;
    },

    /**
     * Measure a pile on the map again and write the volumes to it, from what it records (its base, its flat
     * elevation, its elevation model; `overrides` replaces the base and the flat elevation, for a pile the panel
     * changes the base of). The weight and the cost are those of the material saved with the pile.
     * @param {import('ol/Feature').default} feature
     * @param {{ baseMethod?: string, flatElevation?: number }} [overrides]
     * @returns {Promise<{ status: 'done' | 'stale' | 'failed', error?: any }>}  `stale`: a later outline or the removal of
     *   the pile overtook it, and nothing was written
     */
    async _recalculateStockpile(feature, overrides = {}) {
        const id = feature.get('id');
        const turn = (this._remeasureTurns[id] = (this._remeasureTurns[id] ?? 0) + 1);
        const isCurrent = () => this._remeasureTurns[id] === turn && !!this._stockpileFeatureById(id);
        try {
            const p = feature.getProperties();
            const polygon = stockpilePolygonOf(feature, this._mapProjection());
            const path = p.sourceRaster ?? this._legacyStockpileRaster ?? this.rasterFilePath;
            if (!polygon || !path) throw new Error('The pile has no outline or no elevation model to measure on');
            const baseMethod = overrides.baseMethod ?? (isBaseMethod(p.basePlaneMethod) ? p.basePlaneMethod : BASE_METHOD.LOWEST_PERIMETER);
            const flatElevation = overrides.flatElevation ?? (typeof p.flatElevation === 'number' ? p.flatElevation : 0);
            const volume = await this._measureStockpile(polygon, path, baseMethod, flatElevation);
            if (!isCurrent()) return { status: 'stale' };
            this._writeMeasuredStockpile(feature, volume);
            return { status: 'done' };
        } catch (e) {
            console.error('Stockpile calculation failed:', e);
            return isCurrent() ? { status: 'failed', error: e } : { status: 'stale' };
        }
    },

    /**
     * Write a volume to the pile it is the volume of: the figures, the label on the map, and the panel when it shows
     * this pile. The confidence stays the one of its detection.
     */
    _writeMeasuredStockpile(feature, volume) {
        const p = feature.getProperties();
        const estimate = computeMaterialEstimate(volume, materialOfSavedPile(p));
        const written = propertiesOfResult({ ...volume, confidence: p.confidence, ...estimate });
        RESULT_PROPERTIES.forEach(k => {
            if (written[k] !== undefined) feature.set(k, written[k]);
            else feature.unset(k);
        });
        feature.set('tooltipText', stockpileLabel(feature.getProperties(), this.currentUnitPref));
        updateFeatureTooltip(feature);
        if (feature.get('id') !== this._chosenStockpileFeatureId) return;
        this.stockpileResult = resultOfProperties(feature.getProperties());
        this.stockpileBaseMethod = feature.get('basePlaneMethod');
        this.stockpileFlatElevation = feature.get('flatElevation') ?? 0;
    },

    /** The figures of the pile are those of an outline it no longer has: the label says so, and so does a flash. */
    _markNotRecalculated(feature) {
        if (!this._stockpileFeatureById(feature.get('id'))) return;
        feature.set('tooltipText', `${stockpileLabel(feature.getProperties(), this.currentUnitPref)} (not recalculated)`);
        updateFeatureTooltip(feature);
        if (typeof this.showFlash === 'function') {
            this.showFlash('The volume of the pile could not be calculated for its new outline: the figures shown are those of the previous one.', 'warning');
        }
    },

    /**
     * Edit the outline of the chosen pile (Edit outline), and only that pile: the measure control's edit mode
     * on that one feature. Each change of the outline measures the pile again (remeasureStockpileFeature).
     * A second call ends it, as Esc does.
     */
    toggleStockpileOutlineEdit() {
        if (this.stockpileEditing) {
            this._endStockpileEdit();
            return;
        }
        const mc = this.measureControls;
        const feature = this._stockpileFeatureById(this._chosenStockpileFeatureId);
        if (!feature || !this.map || !mc || typeof mc.enableEditMode !== 'function') return;
        this._stopStockpileInteractions();
        const control = toRaw(mc);
        if (control.selectedTool) control.deselectCurrent();
        // The toolbar's edit of every measurement gives way to this one
        if (control.isEditMode) control.disableEditMode();
        control.enableEditMode(toRaw(this.map), { features: [feature], onExit: () => { this.stockpileEditing = false; } });
        this.stockpileEditing = true;
    },

    /** The edit of the outline of the chosen pile is over (the edit mode of the toolbar ends with it). */
    _endStockpileEdit() {
        if (!this.stockpileEditing) return;
        this.stockpileEditing = false;
        const mc = this.measureControls;
        if (mc && mc.isEditMode) toRaw(mc).disableEditMode();
    },

    /** Every pause before a measuring again is over (the map is gone). */
    _dropAllRemeasures() {
        Object.values(this._remeasureTimers).forEach(timer => clearTimeout(timer));
        this._remeasureTimers = {};
    }
};
