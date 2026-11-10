/**
 * Contour lines composable. Provides on-demand generation of contour lines
 * from an elevation raster and adopts the resulting LineString features into
 * the shared OL measurements layer so they can be persisted via the regular
 * toolbar Save button.
 *
 * Every request runs as the heavy task `raster-contours` (FR-RAS-11, NFR-001): the dialog follows the task with
 * HeavyTaskStatus (progress, Cancel), the lines are the artifact of the task, and a result the server cut at its cap says so.
 *
 * Host requirements:
 *  - this.dataset (Dataset instance exposing submitTask, getTask and taskResult)
 *  - this.rasterFilePath (shared with useRasterAnalysis / useStockpileVolume)
 *  - this.vizParamsByPath (optional; the styles of the layers, shared with useRasterAnalysis): the contours are read with
 *    the NoData value of the layer (FR-RAS-31)
 *  - this.measureControls (the OL measurements controller, same one used by
 *    useStockpileVolume) for importFromGeoJSON and source access.
 *
 * Regeneration policy: only contour features still flagged `unsaved: true`
 * are wiped before adding the new batch. Contours that have already been
 * persisted via the toolbar Save button (which clears the flag) are kept.
 */
import { buildContourFeature, colorForElevation } from '@/libs/map/contourStorage';
import { CONTOUR_TOOL_ID, contourTaskParams, contourTruncation } from '@/libs/map/contourTask';
import { isElevationRaster } from '@/libs/map/rasterUnit';
import { createFeatureScope } from '@/composables/featureScope';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { formatNumber } from '@/libs/format';

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

const definition = {
    data() {
        return {
            contourDialogVisible: false,
            contourLoading: false,
            // Why the request was refused before a task existed (a 400 of the submit): shown by the task status
            contourError: null,
            // The task of the latest request (its state is read from the live entries of useHeavyTask)
            contourTaskId: null,
            // Last-used options so the dialog re-opens with prior values.
            contourLastOptions: null,
            // Cached raster min/max for the dialog hint (populated lazily).
            contourRasterMin: null,
            contourRasterMax: null,
            contourUnit: '',
            // The raster is an elevation model (FR-RAS-25): the dialog says elevation or value
            contourElevation: true
        };
    },
    computed: {
        // The live entry of the task of the latest request: queued, running, failed with its reason, cancelled
        contourTask() {
            return this.contourTaskId ? this.heavyTasks[this.contourTaskId] ?? null : null;
        }
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
                this.contourElevation = isElevationRaster(rasterInfoLike);
            }
            this.contourError = null;
            // A task of an earlier request has nothing to say to a new one
            if (!this.contourLoading) this.contourTaskId = null;
            this.contourDialogVisible = true;
        },

        closeContourDialog() {
            this.contourDialogVisible = false;
        },

        /**
         * The options of the values the layer is read with (the NoData value it is styled with, FR-RAS-31).
         */
        _contourValueOptions() {
            const style = this.vizParamsByPath && this.rasterFilePath ? this.vizParamsByPath[this.rasterFilePath] : null;
            return style && style.nodata !== undefined && style.nodata !== '' ? { nodata: style.nodata } : {};
        },

        /**
         * Generate contour lines on the backend (the task `raster-contours`) and inject them into the shared
         * measurements layer. The dialog stays open while the task runs, with its progress and a Cancel; it closes when the
         * lines are on the map. A result the server cut at its cap says so.
         *
         * @param {Object} options - Payload from ContourOptionsDialog.
         */
        async generateContourLines(options) {
            if (!this.dataset
                || typeof this.dataset.submitTask !== 'function') {
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
            if (this.contourLoading) return;

            this.contourLoading = true;
            this.contourError = null;
            this.contourTaskId = null;
            try {
                // The task shows its own failure, with the message of the server: no toast of the poller, no alert
                const entry = await this.runHeavyTask(this.dataset, CONTOUR_TOOL_ID, {
                    path: this.rasterFilePath,
                    params: contourTaskParams(options, this._contourValueOptions()),
                    notify: false,
                    onSubmitted: submitted => { this.contourTaskId = submitted.taskId; }
                });
                const result = JSON.parse(await (await this.dataset.taskResult(entry.taskId)).text());
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
                    this.showFlash(`Generated ${formatNumber(n, 0)} contour line${n === 1 ? '' : 's'}.`, 'positive');
                }
                // The lines stop at the cap of the server (FR-RAS-11): a message the user acknowledges
                const cut = contourTruncation(result, this.contourElevation ? 'elevation' : 'value');
                if (cut.truncated && typeof this.showAlert === 'function') this.showAlert(cut.title, cut.message);
            } catch (e) {
                // A task that failed or was cancelled is shown by its status in the dialog (FR-XC-06); anything else
                // (the submit was refused, an unreadable result) has no task row to say it
                if (!(e && e.task)) {
                    console.error('Contour generation failed:', e);
                    const raw = e && (e.message || e.error || e.toString());
                    this.contourError = friendlyContourError(raw,
                        raw || 'Could not generate contours. Check raster validity and parameters.');
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
                } catch {
                    try { src.removeFeature(f); } catch { /* noop */ }
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
                this.measureControls.refreshButtons();
            } catch (e) {
                console.warn('Could not import contours into measurement layer:', e);
            }
        }
    }
};

/**
 * The feature's state and methods live on their own scope
 * (createFeatureScope); `externals` supplies what it needs from the map view.
 * @param {Record<string, any>} externals
 */
export function useContourLines(externals) {
    // Follows the task of a request until it ends; stops with the component that owns the map
    const heavy = useHeavyTask();
    return createFeatureScope({
        ...definition,
        externals: {
            ...externals,
            runHeavyTask: () => heavy.runHeavyTask,
            heavyTasks: () => heavy.heavyTasks.value
        }
    });
}
