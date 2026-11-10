<template>
    <AnalysisPanel v-if="visible" variant="raster" class="raster-panel"
                   :icon="panelIconClass" :title="panelTitle" @close="close">
        <div v-if="rasterInfo" class="panel-body">
            <AnalysisTargetSelect :candidates="targetCandidates" :model-value="targetPath" label="Raster"
                                  @update:model-value="path => $emit('selectTarget', path)" />

            <!-- Raw counts of a sensor (no calibration, not temperatures): the notice. A raster whose values are temperatures
                 says the unit they are in (FR-RAS-06) -->
            <div v-if="isThermal && !thermalUnit" class="section">
                <div class="no-calibration-info" data-testid="raster-thermal-notice">
                    <i class="fas fa-info-circle" />&nbsp;No thermal calibration data: Showing raw values.
                </div>
            </div>
            <div v-else-if="isThermal && !rasterInfo.calibration" class="section">
                <div class="thermal-file-unit" data-testid="raster-thermal-file-unit">
                    <i class="fas fa-info-circle" />&nbsp;Values in {{ thermalUnit }} from the file.
                </div>
            </div>

            <!-- Value Range -->
            <div v-if="!loadError" class="section">
                <span class="section-label">{{ rangeLabel }}</span>
                <div class="temp-range" :class="{ 'thermal': isThermal }">
                    <span>{{ formatValue(rasterInfo.valueMin, rasterInfo.unit) }}</span>
                    <span>-</span>
                    <span>{{ formatValue(rasterInfo.valueMax, rasterInfo.unit) }}</span>
                </div>
            </div>

            <!-- Sensor Info -->
            <div v-if="rasterInfo.sensorId" class="section">
                <span class="section-label">Sensor</span>
                <span class="sensor-badge" :class="{ thermal: isThermal }">{{ rasterInfo.sensorId }}</span>
            </div>

            <!-- Unit (thermal: °C, K or °F, converted by ddb from the unit of the band; generic: free text with autodetected default) -->
            <div v-if="isThermal && thermalUnit" class="section">
                <label for="raster-analysis-controls-unit" class="section-label">Unit</label>
                <select id="raster-analysis-controls-unit" v-model="selectedFormula" class="panel-select" @change="onFormulaChange">
                    <option v-for="option in thermalUnitOptions" :key="option.formula" :value="option.formula">{{ option.label }}</option>
                </select>
            </div>
            <div v-else-if="!isThermal" class="section">
                <label for="raster-analysis-controls-unit-name" class="section-label">Unit</label>
                <input id="raster-analysis-controls-unit-name" v-model="unitLabel" class="panel-input" placeholder="e.g. m, ft">
            </div>

            <!-- Colormap -->
            <div class="section">
                <label id="raster-analysis-controls-colormap-label" for="raster-analysis-controls-colormap" class="section-label">Colormap</label>
                <ColormapDropdown
                    v-model="selectedColormap"
                    input-id="raster-analysis-controls-colormap" aria-labelledby="raster-analysis-controls-colormap-label"
                    :colormaps="availableColormaps"
                    @update:model-value="debouncedApply" />
            </div>

            <!-- Rescale -->
            <div class="section">
                <span id="raster-analysis-controls-rescale-label" class="section-label">{{ rescaleLabel }}</span>
                <!-- Min and Max, numbers in the user's locale; a bad range shows its error here and the map keeps the last valid one (FR-RAS-10) -->
                <RescaleFields v-model="rescale" id-prefix="raster-analysis-controls-rescale" @commit="onRescaleChange" />
            </div>

            <!-- NoData value: replaces the one of the file (FR-RAS-31), for the tiles and for every number the panel shows -->
            <div class="section" data-testid="raster-nodata-section">
                <label for="raster-analysis-controls-nodata" class="section-label">NoData value</label>
                <input id="raster-analysis-controls-nodata" v-model="nodata" class="panel-input"
                       inputmode="decimal" :placeholder="nodataPlaceholder"
                       data-testid="raster-nodata-input" @change="onNodataChange">
                <div v-if="nodataError" class="profile-error" data-testid="raster-nodata-error">
                    <i class="fas fa-exclamation-triangle" /> {{ nodataError }}
                </div>
                <div v-else-if="nodataInvalid" class="no-calibration-info" data-testid="raster-nodata-invalid">
                    <i class="fas fa-info-circle" />&nbsp;The NoData value of the file ({{ fileNodataText }}) cannot be held
                    by its data type: no pixel is treated as no data. Enter the value of the background (for example 0).
                </div>
            </div>

            <!-- Spot Info: the last value read with Inspect -->
            <div v-if="spotInfo" class="section" data-testid="raster-spot-value">
                <span class="section-label">{{ isThermal ? 'Spot Temperature' : 'Spot Value' }}</span>
                <div class="spot-info">
                    <span class="spot-temp" :class="{ thermal: isThermal }">{{ formatValue(spotInfo.value, spotInfo.unit) }}</span>
                    <span class="spot-coords">{{ spotPlace }}</span>
                </div>
            </div>

            <!-- Area Stats: the values in the rectangle drawn with Area -->
            <div v-if="areaStats || areaStatsLoading || areaStatsError" class="section" data-testid="raster-area-stats">
                <span class="section-label">
                    Area Statistics
                    <button v-if="areaStats || areaStatsError" type="button" class="info-icon-btn"
                            title="Clear the statistics and remove the rectangle from the map"
                            aria-label="Clear the statistics and remove the rectangle from the map"
                            data-testid="raster-area-stats-clear"
                            @click="$emit('clearAreaStats')">
                        <i class="fas fa-eraser" />
                    </button>
                </span>
                <LoadingSpinner v-if="areaStatsLoading" inline label="Computing statistics..." />
                <div v-else-if="areaStatsError" class="profile-error">
                    <i class="fas fa-exclamation-triangle" /> {{ areaStatsError }}
                </div>
                <dl v-else class="stats-grid area-stats">
                    <div v-for="row in areaStatsRows" :key="row.label">
                        <dt>{{ row.label }}:</dt>
                        <dd>{{ row.value }}</dd>
                    </div>
                </dl>
            </div>

            <!-- Profile (elevation / value along a polyline) -->
            <div v-if="!loadError" class="section">
                <span class="section-label">
                    {{ isThermal ? 'Thermal Profile' : 'Value Profile' }}
                </span>
                <div v-if="profileError" class="profile-error">
                    <i class="fas fa-exclamation-triangle" /> {{ profileError }}
                </div>
                <RasterProfileChart v-if="profile"
                                    :profile="profile"
                                    :unit="valueUnit(profile.unit)"
                                    :is-thermal="isThermal"
                                    @active-sample="onProfileHover" />
            </div>
        </div>

        <div v-else class="panel-body loading">
            <LoadingSpinner inline label="Loading raster info..." />
        </div>
        <!-- Actions: two rows so each button has room for a short label; the foot of the panel, always in view (FR-RAS-23) -->
        <template v-if="rasterInfo" #actions>
            <div class="actions-grid">
                <button class="panel-btn action-btn"
                        :class="{ 'is-active': drawingProfile }"
                        :disabled="profileLoading"
                        :title="drawingProfile
                            ? 'Stop drawing and discard the partial profile (Esc)'
                            : (profile ? 'Discard the current profile and draw a new one'
                                : 'Draw a profile line on the map')"
                        @click="onProfileButtonClick">
                    <i :class="profileLoading ? 'fas fa-spinner fa-spin'
                        : (drawingProfile ? 'fas fa-stop' : 'fas fa-route')" />
                    {{ drawingProfile ? 'Stop' : (profile ? 'Redraw' : 'Profile') }}
                </button>
                <button v-if="profile && !drawingProfile" class="panel-btn action-btn"
                        title="Clear the chart and remove the line from the map" aria-label="Clear the chart and remove the line from the map"
                        @click="clearProfile">
                    <i class="fas fa-eraser" />
                </button>
                <button class="panel-btn action-btn"
                        :class="{ 'is-active': inspectActive }"
                        :title="inspectActive
                            ? 'Stop inspecting raster values (Esc)'
                            : 'Click on the map to read the raster value'"
                        @click="toggleInspect">
                    <i :class="inspectActive ? 'fas fa-eye-slash' : 'fas fa-magnifying-glass'" />
                    <span class="action-label">Inspect</span>
                </button>
                <button class="panel-btn action-btn"
                        :class="{ 'is-active': drawingArea }"
                        :disabled="areaStatsLoading"
                        :title="drawingArea
                            ? 'Stop drawing the rectangle (Esc)'
                            : 'Draw a rectangle on the map to get the statistics of the values inside it'"
                        data-testid="raster-area-stats-btn"
                        @click="$emit('toggleAreaStats')">
                    <i :class="drawingArea ? 'fas fa-stop' : 'far fa-square'" />
                    <span class="action-label">{{ drawingArea ? 'Stop' : 'Area' }}</span>
                </button>
                <button v-if="!isThermal && !loadError" class="panel-btn action-btn"
                        :title="isElevation ? 'Generate contour lines from this elevation raster' : 'Generate contour lines from the values of this raster'"
                        data-testid="raster-contours-btn"
                        @click="onGenerateContoursClick">
                    <i class="fas fa-layer-group" />
                    <span class="action-label">Contours</span>
                </button>
                <button class="panel-btn action-btn" title="Reset all visualization parameters to their defaults"
                        @click="reset">
                    <i class="fas fa-rotate-left" />
                    <span class="action-label">Reset</span>
                </button>
                <button class="panel-btn action-btn"
                        :class="{ 'panel-btn--primary': originalView }"
                        :title="originalView ? 'Show the analyzed raster' : 'Show the original raster (no styling applied)'"
                        @click="toggleOriginalView">
                    <i :class="originalView ? 'fas fa-eye-slash' : 'fas fa-eye'" />
                    <span class="action-label">{{ originalView ? 'Hide Orig.' : 'Original' }}</span>
                </button>
            </div>

            <!-- The one export control: the styled image as a task, or the visible extent (FR-RAS-16) -->
            <RasterExportButton :dataset="dataset" :file-path="filePath" :viz-params="vizParams()" :bbox="visibleBbox"
                                :info="rasterInfo" :read-estimate="false" />
        </template>
    </AnalysisPanel>
</template>

<script>
import AnalysisPanel from './AnalysisPanel.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import ColormapDropdown from '@/features/viewers/map/ColormapDropdown.vue';
import AnalysisTargetSelect from './AnalysisTargetSelect.vue';
import RescaleFields from './RescaleFields.vue';
import RasterExportButton from './RasterExportButton.vue';
import { colormapList, THERMAL_COLORMAPS, GENERIC_COLORMAPS } from '@/libs/map/colormaps';
import RasterProfileChart from './RasterProfileChart.vue';
import { useTimerGroup } from '@/composables/useTimers';
import { noDataPixelCount } from '@/libs/map/rasterAreaStats';
import { nodataNumber } from '@/libs/ddb/dataset';
import { rasterValueParts, isElevationRaster, THERMAL_UNIT_OPTIONS, thermalBandUnit, thermalFormulaOfUnit, thermalUnitOfFormula } from '@/libs/map/rasterUnit';
import { defaultVizParams } from '@/libs/map/defaultVizParams';
import { formatNumber, formatNumberList } from '@/libs/format';

const formatCount = n => formatNumber(n, 'count');

export default {
    components: { AnalysisPanel, ColormapDropdown, RasterProfileChart, LoadingSpinner, AnalysisTargetSelect, RescaleFields, RasterExportButton },
    props: {
        visible: { type: Boolean, default: false },
        dataset: { type: Object, default: null },
        filePath: { type: String, default: null },
        // The rasters the panel can work on ({ path, label }) and the one it works on: the
        // elevation model selector shows with two or more
        targetCandidates: { type: Array, default: () => [] },
        targetPath: { type: String, default: null },
        initialParams: { type: Object, default: null },
        // The visible extent of the map in WGS 84 (minLon, minLat, maxLon, maxLat), for 'Export visible extent' (FR-RAS-16)
        visibleBbox: { type: Array, default: null },
        spotInfo: { type: Object, default: null },
        areaStats: { type: Object, default: null },
        areaStatsLoading: { type: Boolean, default: false },
        areaStatsError: { type: String, default: null },
        // True while the host has an active OL Draw interaction for the statistics rectangle.
        drawingArea: { type: Boolean, default: false },
        profile: { type: Object, default: null },
        profileLoading: { type: Boolean, default: false },
        profileError: { type: String, default: null },
        // True while the host has an active OL Draw interaction for the profile.
        drawingProfile: { type: Boolean, default: false },
        // True while the inspect-value tool is active on the host.
        inspectActive: { type: Boolean, default: false }
    },

    emits: ['close', 'vizParamsChanged', 'pickProfile', 'clearProfile',
            'profileHover', 'cancelDrawProfile', 'toggleInspectValue',
            'openContourDialog', 'toggleAreaStats', 'clearAreaStats', 'selectTarget'],

    setup() {
        return { applyLater: useTimerGroup() };
    },    data() {
        return {
            // The value info the panel shows: the range in the selected unit (D-022)
            rasterInfo: null,
            // The value info of the file as it is: in the unit of its band, the one of the defaults
            bandInfo: null,
            loadError: false,
            // The thermal formula of the Unit select; '' for a raster whose values are no temperatures
            selectedFormula: '',
            selectedColormap: 'ironbow',
            rescale: '',
            // The unit the rescale was written in (D-022): the unit of the band for the default one, the unit selected when the
            // user typed it. Changing the unit keeps the temperatures of the rescale: it is sent with this unit
            rescaleUnit: '',
            // The NoData value typed in the panel ('' keeps the one of the file)
            nodata: '',
            unitLabel: '',
            originalView: false
        };
    },
    computed: {
        isThermal() {
            return !!(this.rasterInfo && this.rasterInfo.isThermal);
        },
        // An elevation model has elevations; any other raster has values (FR-RAS-25)
        isElevation() {
            return isElevationRaster(this.rasterInfo);
        },
        panelTitle() {
            return this.isThermal ? 'Thermal' : 'Raster Analysis';
        },
        panelIconClass() {
            return this.isThermal ? 'fas fa-temperature-high' : 'fas fa-chart-area';
        },
        rangeLabel() {
            return this.isThermal ? 'Temperature Range' : 'Value Range';
        },
        availableColormaps() {
            return colormapList(this.isThermal ? THERMAL_COLORMAPS : GENERIC_COLORMAPS);
        },
        // Where the spot value was read: longitude and latitude when the raster is georeferenced
        spotPlace() {
            const s = this.spotInfo;
            if (!s) return '';
            // The point that was clicked (the server answers with it); the centre of its pixel for an answer that has none
            if (typeof s.lon === 'number' && typeof s.lat === 'number') {
                return formatNumberList([s.lat, s.lon], 6);
            }
            if (s.hasGeo && typeof s.geoX === 'number' && typeof s.geoY === 'number') {
                return formatNumberList([s.geoY, s.geoX], 6);
            }
            return `pixel ${s.x}, ${s.y}`;
        },
        // Min, max, mean, median and standard deviation in the raster's unit, then the pixels
        // counted and those without data
        areaStatsRows() {
            const s = this.areaStats;
            if (!s) return [];
            const rows = [
                { label: 'Min', value: this.formatValue(s.min, s.unit) },
                { label: 'Max', value: this.formatValue(s.max, s.unit) },
                { label: 'Mean', value: this.formatValue(s.mean, s.unit) },
                { label: 'Median', value: this.formatValue(s.median, s.unit) },
                { label: 'Std dev', value: this.formatSpread(s.stddev, s.unit) },
                { label: 'Pixels', value: formatCount(s.pixelCount) }
            ];
            const noData = noDataPixelCount(s);
            if (noData) rows.push({ label: 'No data', value: formatCount(noData) });
            return rows;
        },
        // The NoData value of the panel as a number; null for none or for text that is not a number
        nodataValue() {
            return nodataNumber(this.nodata);
        },
        nodataError() {
            const text = String(this.nodata ?? '').trim();
            return text !== '' && this.nodataValue === null ? 'The NoData value must be a number.' : '';
        },
        // True when the NoData value of the file cannot be held by its data type (65536 in a UInt16 band) and none was typed
        nodataInvalid() {
            return !!(this.rasterInfo && this.rasterInfo.nodataInvalid && !this.rasterInfo.nodataOverridden);
        },
        fileNodataText() {
            const v = this.rasterInfo && this.rasterInfo.nodata;
            // As typed, so that it can be entered again (no thousands separator)
            return typeof v === 'number' ? String(v) : 'none';
        },
        nodataPlaceholder() {
            const v = this.rasterInfo && !this.rasterInfo.nodataOverridden ? this.rasterInfo.nodata : null;
            return typeof v === 'number' ? `${v} (of the file)` : 'e.g. 0 (none if empty)';
        },
        // The raster the open panel works on; null while it is closed
        activePath() {
            return this.visible ? this.filePath : null;
        },
        // The unit of the band of a thermal raster ('°C', 'K', '°F'); '' for raw counts, which are no temperatures
        thermalUnit() {
            return thermalBandUnit(this.bandInfo || this.rasterInfo);
        },
        thermalUnitOptions() {
            return THERMAL_UNIT_OPTIONS;
        },
        // The unit the numbers of the panel are in: the one of the selected formula, which ddb converts the values to
        displayUnit() {
            if (this.isThermal) return thermalUnitOfFormula(this.selectedFormula);
            return this.unitLabel || '';
        },
        // The rescale has the unit it was written in when that is a temperature unit
        rescaleLabel() {
            return this.isThermal && this.thermalUnit && this.rescale && this.rescaleUnit ? `Rescale (${this.rescaleUnit})` : 'Rescale';
        }
    },

    watch: {
        // The panel reads and styles a raster only while it is open: another tool that takes the raster (Stockpile Volume,
        // contours) changes the file path without it (FR-RAS-17)
        activePath: {
            handler(path) {
                // A panel opened again takes the style of the layer again
                this._initialParamsApplied = false;
                if (!path) return;
                // The same raster after a close keeps its Original view; another raster starts anew
                if (path !== this._lastPath) this.originalView = false;
                this._lastPath = path;
                this.loadRasterInfo();
            },
            immediate: true
        }
    },

    methods: {
        async loadRasterInfo() {
            if (!this.filePath || !this.dataset) return;

            const path = this.filePath;
            this.loadError = false;
            try {
                const info = await this.readInfo('');
                // The panel closed or moved to another raster while the info was read
                if (!this.visible || path !== this.filePath) return;
                this.bandInfo = info;
                this.rasterInfo = info;
                this.useDefaults();
                await this.applyInitialParams();
            } catch (e) {
                console.error('Failed to load raster info:', e);
                if (!this.visible || path !== this.filePath) return;
                // Fallback so colormap/rescale controls still work
                this.bandInfo = { valueMin: 0, valueMax: 65535, isThermal: false, isDirectValue: true, sensorId: '', unit: '' };
                this.rasterInfo = this.bandInfo;
                this.loadError = true;
                this.useDefaults();
                await this.applyInitialParams();
            }
        },

        // The value info of the file with the NoData value of the panel; with a thermal formula, ddb gives the range and the unit
        // in the unit of the formula (D-022), without one in the unit of the band
        readInfo(formula) {
            const options = { nodata: this.nodataValue ?? undefined };
            if (formula) options.formula = formula;
            return this.dataset.getRasterValueInfo(this.filePath, options);
        },

        // The info the panel shows, in the unit of the Unit select: the info of the file for the unit of the band, else ddb's
        // answer for the formula. A later change of the unit wins over an answer that comes late. Rejects when ddb cannot
        // answer: the panel keeps showing the unit it showed (_shownFormula)
        async showSelectedUnit() {
            const formula = this.selectedFormula;
            if (!this.isThermal || !formula || formula === thermalFormulaOfUnit(this.thermalUnit)) {
                this.rasterInfo = this.bandInfo;
                this._shownFormula = formula;
                return;
            }
            const path = this.filePath;
            const info = await this.readInfo(formula);
            if (path !== this.filePath || formula !== this.selectedFormula) return;
            this.rasterInfo = info;
            this._shownFormula = formula;
        },

        // The panel's fields at the default style of the raster (FR-RAS-24): the one function the map seeds a layer with.
        // Without value info there is no range to stretch to: the tiles keep the server's own stretch (no rescale), not
        // the range of the fallback info
        useDefaults() {
            const defaults = defaultVizParams(this.bandInfo);
            this.selectedFormula = defaults.formula || '';
            this.selectedColormap = defaults.colormap;
            this.rescale = this.loadError ? '' : defaults.rescale;
            this.unitLabel = defaults.unit;
            // The stretch of ddb is in the unit of the band
            this.rescaleUnit = this.thermalUnit;
            this.rasterInfo = this.bandInfo;
            this._shownFormula = this.selectedFormula;
        },

        // The style the layer has (URL hash, the panel's cache) over the defaults; a layer without one is styled with them,
        // unless the user chose its original view
        async applyInitialParams() {
            const initial = this.initialParams;
            if (initial && !this._initialParamsApplied) {
                this._initialParamsApplied = true;
                // Only a thermal formula of a raster whose values are temperatures is a unit; an index of Plant Health on the same
                // file is not
                if (initial.formula && this.thermalUnit && thermalUnitOfFormula(initial.formula)) this.selectedFormula = initial.formula;
                if (initial.colormap) this.selectedColormap = initial.colormap;
                if (initial.rescale !== undefined) {
                    this.rescale = initial.rescale;
                    // A rescale of the layer was written in the unit it says, else in the unit of its formula
                    this.rescaleUnit = initial.rescaleUnit || thermalUnitOfFormula(initial.formula) || this.thermalUnit;
                }
                if (initial.nodata !== undefined && initial.nodata !== null) {
                    this.nodata = String(initial.nodata);
                }
                await this.showSelectedUnit();
                this.apply();
            } else if (!this.originalView) {
                this.apply();
            }
        },

        // The unit changed: ddb gives the range in it, and the style carries the formula (the rescale keeps its temperatures).
        // When ddb cannot give the range in it, the Unit select goes back to the unit the panel shows and the style is kept
        async onFormulaChange() {
            const previous = this._shownFormula;
            const formula = this.selectedFormula;
            try {
                await this.showSelectedUnit();
            } catch (e) {
                console.error('Failed to read the raster info in the selected unit:', e);
                this.$notify.error(e, { summary: 'Unit' });
                // Unless the user picked another unit meanwhile
                if (previous !== undefined && this.selectedFormula === formula) this.selectedFormula = previous;
                return;
            }
            this.apply();
        },

        // A rescale the user types is in the unit the panel shows
        onRescaleChange() {
            this.rescaleUnit = this.displayUnit;
            this.debouncedApply();
        },

        // A NoData value changes which pixels have a value: the range of the info is that of the new ones
        async onNodataChange() {
            if (this.nodataError || !this.filePath || !this.dataset) return;
            try {
                this.bandInfo = await this.readInfo('');
                this.rescale = defaultVizParams(this.bandInfo).rescale;
                this.rescaleUnit = this.thermalUnit;
                await this.showSelectedUnit();
            } catch (e) {
                console.error('Failed to reload the raster info with the NoData value:', e);
                this.$notify.error(e, { summary: 'NoData value' });
                return;
            }
            this.apply();
        },

        // The style of the panel: what the layer and the export carry. The formula is the thermal unit, so only a thermal
        // raster whose values are temperatures has one (FR-RAS-24, D-022)
        vizParams() {
            const params = {};
            const thermalFormula = this.isThermal && this.thermalUnit ? this.selectedFormula : '';
            if (thermalFormula) params.formula = thermalFormula;
            params.colormap = this.selectedColormap;
            if (this.rescale) {
                params.rescale = this.rescale;
                // The rescale written in another unit than the formula's keeps its temperatures: ddb converts it (D-022)
                if (thermalFormula && this.rescaleUnit && this.rescaleUnit !== thermalUnitOfFormula(thermalFormula)) {
                    params.rescaleUnit = this.rescaleUnit;
                }
            }
            // Sent with the vizParams of the layer (FR-RAS-31): tiles, the numbers and the export read the same pixels
            if (this.nodataValue !== null) params.nodata = this.nodataValue;
            return params;
        },

        apply() {
            // A closed panel styles nothing (FR-RAS-17)
            if (!this.visible) return;
            this.originalView = false;
            this.$emit('vizParamsChanged', this.vizParams());
        },

        debouncedApply() {
            this.applyLater.clear();
            this.applyLater(() => this.apply(), 300);
        },

        // Every setting goes back to the default style of the raster, the Unit and the NoData value too (FR-RAS-24)
        async reset() {
            const hadNodata = this.nodata !== '' && this.nodata !== null;
            this.nodata = '';
            if (hadNodata && this.filePath && this.dataset) {
                // The range of the values is that of the file's own NoData value again
                try {
                    this.bandInfo = await this.readInfo('');
                    this.loadError = false;
                } catch (e) {
                    console.error('Failed to reload the raster info after Reset:', e);
                }
            }
            this.useDefaults();
            this.apply();
        },

        // Closing keeps the style of the layer: only a user edit and Reset change it (FR-RAS-01)
        close() {
            this.$emit('close');
        },

        toggleOriginalView() {
            this.originalView = !this.originalView;
            if (this.originalView) {
                this.$emit('vizParamsChanged', {});
            } else {
                this.apply();
            }
        },

        /**
         * Single button that toggles between starting a draw, redrawing, and
         * stopping an in-progress draw. Exact behaviour is decided by the host.
         */
        onProfileButtonClick() {
            if (this.drawingProfile) this.$emit('cancelDrawProfile');
            else this.$emit('pickProfile');
        },

        toggleInspect() {
            this.$emit('toggleInspectValue');
        },

        onGenerateContoursClick() {
            // Forward the raster info upward so the host's contour composable
            // can pre-fill the dialog with min/max/unit hints.
            this.$emit('openContourDialog', this.rasterInfo);
        },

        clearProfile() {
            this.$emit('clearProfile');
        },

        onProfileHover(sample) {
            this.$emit('profileHover', sample);
        },

        // The unit of numbers the server answered with `unit` (D-022): the temperatures of a thermal raster are in the unit ddb
        // says it gave them in, which is the one of the selected formula unless the answer was read in another (a value read
        // before the unit changed, a server that did not apply the formula); the unit of the panel only when the answer has
        // none. The raw counts of a sensor have no unit, and the values of any other raster have the unit of the panel
        valueUnit(unit) {
            if (this.isThermal && this.thermalUnit && unit) return unit;
            return this.displayUnit;
        },

        // A value of the raster in its unit: the one format of the Hub (FR-RAS-28). It does not convert: ddb answers in the unit
        // of the selected formula (D-022), so a Kelvin raster reads 284.6 K, and 11.5 °C once the user picks °C
        formatValue(val, unit) {
            if (typeof val !== 'number') return val === undefined || val === null ? '-' : val;
            return rasterValueParts(val, this.valueUnit(unit)).text;
        },

        // A spread of values (a standard deviation): in the unit of the values
        formatSpread(val, unit) {
            return typeof val === 'number' ? rasterValueParts(val, this.valueUnit(unit)).text : '-';
        }
    }
};
</script>

<style scoped>
/* Shared look and palette: css/_analysis-panel.scss */

.raster-panel :deep(.panel-title i.fa-temperature-high) {
    color: var(--panel-thermal-strong);
}

.temp-range {
    display: flex;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--panel-accent);
}

.temp-range.thermal {
    color: var(--panel-thermal);
}


.sensor-badge.thermal {
    background: rgba(var(--panel-thermal-strong-rgb), 0.25);
    border-color: rgba(var(--panel-thermal-strong-rgb), 0.5);
}

.spot-info {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
}

.spot-temp {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--panel-accent);
}

.spot-temp.thermal {
    color: var(--panel-thermal);
}

.area-stats {
    margin: 0;
}

.area-stats div {
    display: flex;
    gap: 0.3rem;
}

.area-stats dt {
    font-weight: normal;
}

.area-stats dd {
    margin: 0;
}

.spot-coords {
    font-size: 0.7rem;
    color: var(--panel-text-faint);
}

.profile-error {
    font-size: 0.72rem;
    color: var(--panel-error-text);
    margin-bottom: 0.25rem;
}

.no-calibration-info {
    background: rgba(var(--panel-warn-rgb), 0.15);
    border: 1px solid rgba(var(--panel-warn-rgb), 0.3);
    border-radius: 0.25rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
    color: var(--panel-warn);
}

.no-calibration-info i {
    margin-right: 0.2rem;
}

.thermal-file-unit {
    font-size: 0.75rem;
    color: var(--panel-text-faint);
}
</style>
