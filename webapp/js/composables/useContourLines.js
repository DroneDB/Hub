/**
 * Contour lines composable. Provides on-demand generation of contour lines
 * from an elevation raster and adopts the resulting LineString features into
 * the shared OL measurements layer so they can be persisted via the regular
 * toolbar Save button.
 *
 * Host requirements:
 *  - this.dataset (Dataset instance exposing generateContours)
 *  - this.rasterFilePath (shared with useRasterAnalysis / useStockpileVolume)
 *  - this.measureControls (the OL measurements controller, same one used by
 *    useStockpileVolume) for importFromGeoJSON and source access.
 *
 * Regeneration policy: only contour features still flagged `unsaved: true`
 * are wiped before adding the new batch. Contours that have already been
 * persisted via the toolbar Save button (which clears the flag) are kept.
 */
import { buildContourFeature, colorForElevation } from '@/libs/map/contourStorage';

function friendlyContourError(raw, fallback) {
    if (!raw) return fallback;
    const msg = String(raw);
    if (/no valid data|no data/i.test(msg)) {
        return 'The raster contains no valid elevation data in the requested range.';
    }
    if (/either interval or count/i.test(msg)) {
        return 'Provide either an interval or a target count.';
    }
    if (/min.*max/i.test(msg)) {
        return 'Min elevation must be less than max elevation.';
    }
    if (/too many levels|max levels/i.test(msg)) {
        return 'Too many contour levels would be produced. Increase the interval or reduce the count.';
    }
    return fallback;
}

export default {
    data() {
        return {
            contourDialogVisible: false,
            contourLoading: false,
            contourError: null,
            // Last-used options so the dialog re-opens with prior values.
            contourLastOptions: null,
            // Cached raster min/max for the dialog hint (populated lazily).
            contourRasterMin: null,
            contourRasterMax: null,
            contourUnit: ''
        };
    },
    methods: {
        /**
         * Open the contour options dialog. Pre-populates min/max/unit when a
         * raster info object is already available (e.g. from useRasterAnalysis).
         */
        openContourDialog(rasterInfoLike = null) {
            if (rasterInfoLike) {
                if (typeof rasterInfoLike.valueMin === 'number') {
                    this.contourRasterMin = rasterInfoLike.valueMin;
                }
                if (typeof rasterInfoLike.valueMax === 'number') {
                    this.contourRasterMax = rasterInfoLike.valueMax;
                }
                if (rasterInfoLike.unit) this.contourUnit = rasterInfoLike.unit;
            }
            this.contourError = null;
            this.contourDialogVisible = true;
        },

        closeContourDialog() {
            this.contourDialogVisible = false;
        },

        /**
         * Generate contour lines on the backend and inject them into the
         * shared measurements layer.
         *
         * @param {Object} options - Payload from ContourOptionsDialog.
         */
        async generateContourLines(options) {
            if (!this.dataset
                || typeof this.dataset.generateContours !== 'function') {
                this.contourError = 'Dataset is not available.';
                return;
            }
            if (!this.rasterFilePath) {
                this.contourError = 'No raster selected.';
                return;
            }
            if (!this.measureControls
                || typeof this.measureControls.importFromGeoJSON !== 'function') {
                this.contourError = 'Measurement layer is not ready.';
                return;
            }

            this.contourLoading = true;
            this.contourError = null;
            try {
                const result = await this.dataset.generateContours(
                    this.rasterFilePath, options);
                if (!result || result.type !== 'FeatureCollection'
                    || !Array.isArray(result.features)) {
                    throw new Error('Unexpected contour response.');
                }
                if (result.features.length === 0) {
                    throw new Error('No contour lines were generated. Try a smaller interval, a larger count, or widen the elevation range.');
                }

                // Cache stats for the dialog hint on next open.
                if (typeof result.rasterMin === 'number') {
                    this.contourRasterMin = result.rasterMin;
                }
                if (typeof result.rasterMax === 'number') {
                    this.contourRasterMax = result.rasterMax;
                }
                if (result.unit) this.contourUnit = result.unit;
                this.contourLastOptions = { ...options };

                this._removeUnsavedContourFeatures();
                this._adoptContourFeatures(result);

                this.contourDialogVisible = false;

                // Success toast - non-intrusive feedback.
                if (typeof this.showFlash === 'function') {
                    const n = result.features.length;
                    this.showFlash(`Generated ${n} contour line${n === 1 ? '' : 's'}.`, 'positive');
                }
            } catch (e) {
                console.error('Contour generation failed:', e);
                const raw = e && (e.message || e.error || e.toString());
                const friendly = friendlyContourError(raw,
                    'Could not generate contours. Check raster validity and parameters.');
                this.contourError = friendly;
                // Modal error dialog so the user does not miss the failure.
                if (typeof this.showAlert === 'function') {
                    this.showAlert('Contour generation failed', friendly);
                }
            } finally {
                this.contourLoading = false;
            }
        },

        /**
         * Remove only the contour features still flagged as unsaved drafts.
         * Persisted contours (saved via the toolbar) are left alone.
         */
        _removeUnsavedContourFeatures() {
            const src = this.measureControls && this.measureControls.source;
            if (!src) return;
            const toRemove = src.getFeatures().filter(
                f => f.get('measurementType') === 'contour' && f.get('unsaved') === true);
            for (const f of toRemove) {
                try {
                    if (typeof this.measureControls.deleteMeasurement === 'function') {
                        this.measureControls.deleteMeasurement(f);
                    } else {
                        src.removeFeature(f);
                    }
                } catch (_) {
                    try { src.removeFeature(f); } catch (__) { /* noop */ }
                }
            }
        },

        /**
         * Build a measurements-shaped FeatureCollection from the backend
         * response and import it into the OL layer in a single call so the
         * existing import pipeline (style + label hooks) handles everything.
         */
        _adoptContourFeatures(fc) {
            const interval = fc.interval != null ? Number(fc.interval) : null;
            // Range used to map elevation -> color along the terrain ramp.
            // Prefer the values the user actually requested (min/max) so the
            // ramp is stable across regenerations; fall back to the dataset
            // bounds reported by the backend, then to derived feature stats.
            let rangeMin = typeof fc.min === 'number' ? fc.min
                : (typeof fc.rasterMin === 'number' ? fc.rasterMin : null);
            let rangeMax = typeof fc.max === 'number' ? fc.max
                : (typeof fc.rasterMax === 'number' ? fc.rasterMax : null);
            if (rangeMin == null || rangeMax == null || !(rangeMax > rangeMin)) {
                let lo = Infinity, hi = -Infinity;
                for (const r of fc.features || []) {
                    const e = r && r.properties && r.properties.elev;
                    if (typeof e === 'number' && isFinite(e)) {
                        if (e < lo) lo = e;
                        if (e > hi) hi = e;
                    }
                }
                if (isFinite(lo) && isFinite(hi) && hi > lo) {
                    rangeMin = lo;
                    rangeMax = hi;
                }
            }

            const features = [];
            for (const raw of fc.features) {
                if (!raw || !raw.geometry) continue;
                const elev = raw.properties && typeof raw.properties.elev === 'number'
                    ? raw.properties.elev : null;
                if (elev === null) continue;

                // Mark every 5th level as "major" for slightly thicker strokes.
                let isMajor = false;
                if (interval && interval > 0) {
                    const n = Math.round((elev - (fc.baseOffset || 0)) / interval);
                    isMajor = (n % 5 === 0);
                }
                const stroke = colorForElevation(elev, rangeMin, rangeMax);

                if (raw.geometry.type === 'LineString') {
                    features.push(buildContourFeature(raw.geometry, elev, {
                        interval, isMajor, unit: fc.unit || '', stroke
                    }));
                } else if (raw.geometry.type === 'MultiLineString') {
                    for (const coords of raw.geometry.coordinates) {
                        features.push(buildContourFeature(
                            { type: 'LineString', coordinates: coords },
                            elev,
                            { interval, isMajor, unit: fc.unit || '', stroke }));
                    }
                }
            }
            if (features.length === 0) return;

            const measurementsFc = {
                type: 'FeatureCollection',
                metadata: { application: 'DroneDB Registry', kind: 'measurements' },
                features
            };
            try {
                this.measureControls.importFromGeoJSON(measurementsFc);
                if (typeof this.measureControls.updateButtonsVisibility === 'function') {
                    this.measureControls.updateButtonsVisibility(
                        this.measureControls.hasMeasurements(),
                        !!this.hasSavedMeasurements);
                }
            } catch (e) {
                console.warn('Could not import contours into measurement layer:', e);
            }
        }
    }
};
