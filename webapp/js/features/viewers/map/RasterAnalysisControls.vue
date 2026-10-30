<template>
    <div v-if="visible" class="analysis-panel analysis-panel--raster raster-panel">
        <div class="panel-header">
            <span class="panel-title">
                <i :class="panelIconClass" /> {{ panelTitle }}
            </span>
            <button class="close-btn" title="Close" aria-label="Close" @click="close"><i class="fas fa-times" /></button>
        </div>

        <div v-if="rasterInfo" class="panel-body">
            <!-- No-calibration warning (thermal only) -->
            <div v-if="isThermal && (loadError || !rasterInfo.calibration)" class="section">
                <div class="no-calibration-info">
                    <i class="fas fa-info-circle" />&nbsp;No thermal calibration data: Showing raw values.
                </div>
            </div>

            <!-- Value Range -->
            <div v-if="!loadError" class="section">
                <span class="section-label">{{ rangeLabel }}</span>
                <div class="temp-range" :class="{ 'thermal': isThermal }">
                    <span>{{ formatValue(rasterInfo.valueMin) }}</span>
                    <span>-</span>
                    <span>{{ formatValue(rasterInfo.valueMax) }}</span>
                </div>
            </div>

            <!-- Sensor Info -->
            <div v-if="rasterInfo.sensorId" class="section">
                <span class="section-label">Sensor</span>
                <span class="sensor-badge" :class="{ thermal: isThermal }">{{ rasterInfo.sensorId }}</span>
            </div>

            <!-- Unit (thermal: °C/K toggle; generic: free text with autodetected default) -->
            <div v-if="isThermal && rasterInfo.calibration" class="section">
                <label for="raster-analysis-controls-unit" class="section-label">Unit</label>
                <select id="raster-analysis-controls-unit" v-model="selectedFormula" class="panel-select" @change="onFormulaChange">
                    <option value="CELSIUS">Celsius (°C)</option>
                    <option value="KELVIN">Kelvin (K)</option>
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
                <label for="raster-analysis-controls-rescale" class="section-label">Rescale</label>
                <input id="raster-analysis-controls-rescale" v-model="rescale" class="panel-input" placeholder="e.g. 0,50 (auto if empty)" @change="onRescaleChange">
            </div>

            <!-- Spot Info -->
            <div v-if="spotInfo" class="section">
                <span class="section-label">{{ isThermal ? 'Spot Temperature' : 'Spot Value' }}</span>
                <div class="spot-info">
                    <span class="spot-temp" :class="{ thermal: isThermal }">{{ formatValue(spotInfo.value) }}</span>
                    <span class="spot-coords">({{ spotInfo.x }}, {{ spotInfo.y }})</span>
                </div>
            </div>

            <!-- Area Stats -->
            <div v-if="areaStats" class="section">
                <span class="section-label">Area Statistics</span>
                <div class="stats-grid">
                    <span>Min: {{ formatValue(areaStats.min) }}</span>
                    <span>Max: {{ formatValue(areaStats.max) }}</span>
                    <span>Mean: {{ formatValue(areaStats.mean) }}</span>
                    <span>StdDev: {{ formatNum(areaStats.stddev) }}</span>
                    <span>Median: {{ formatValue(areaStats.median) }}</span>
                    <span>Pixels: {{ areaStats.pixelCount }}</span>
                </div>
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
                                    :unit="displayUnit"
                                    :is-thermal="isThermal"
                                    @active-sample="onProfileHover" />
            </div>
            <!-- Actions: two rows so each button has room for a short label -->
            <div class="section actions-grid">
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
                <button v-if="!isThermal && !loadError" class="panel-btn action-btn"
                        title="Generate contour lines from this elevation raster"
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
                <button v-if="!isExportTooLarge"
                        class="panel-btn action-btn"
                        :disabled="exporting"
                        title="Export the current view as a GeoTIFF file"
                        @click="exportGeoTiff">
                    <i :class="exporting ? 'fas fa-spinner fa-spin' : 'fas fa-download'" />
                    <span class="action-label">Export</span>
                </button>
                <span v-else class="action-btn export-limit-hint" :title="exportLimitTooltip">
                    <i class="fas fa-download" />
                    <span class="action-label">Export</span>
                </span>
            </div>
        </div>

        <div v-else class="panel-body loading">
            <LoadingSpinner inline label="Loading raster info..." />
        </div>
    </div>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import ColormapDropdown from '@/features/viewers/map/ColormapDropdown.vue';
import { colormapList, THERMAL_COLORMAPS, GENERIC_COLORMAPS } from '@/libs/map/colormaps';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { isExportTooLarge as computeIsExportTooLarge } from '@/libs/exportSize';
import { bytesToSize } from '@/libs/utils';
import RasterProfileChart from './RasterProfileChart.vue';
import { downloadBlob, filenameFromDisposition } from '@/libs/download';
import { useTimerGroup } from '@/composables/useTimers';

export default {
    components: { ColormapDropdown, RasterProfileChart, LoadingSpinner },
    props: {
        visible: { type: Boolean, default: false },
        dataset: { type: Object, default: null },
        filePath: { type: String, default: null },
        initialParams: { type: Object, default: null },
        spotInfo: { type: Object, default: null },
        areaStats: { type: Object, default: null },
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
            'openContourDialog'],

    setup() {
        return { applyLater: useTimerGroup() };
    },    data() {
        return {
            rasterInfo: null,
            loadError: false,
            selectedFormula: 'CELSIUS',
            selectedColormap: 'ironbow',
            rescale: '',
            unitLabel: '',
            exporting: false,
            originalView: false
        };
    },
    computed: {
        isThermal() {
            return !!(this.rasterInfo && this.rasterInfo.isThermal);
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
        displayUnit() {
            if (this.isThermal) {
                return this.selectedFormula === 'KELVIN' ? 'K' : '°C';
            }
            return this.unitLabel || '';
        },
        maxExportSizeBytes() {
            return reg.features.value(Features.MAX_EXPORT_SIZE_BYTES);
        },
        isExportTooLarge() {
            return computeIsExportTooLarge(this.rasterInfo, this.maxExportSizeBytes);
        },
        exportLimitTooltip() {
            const limit = this.maxExportSizeBytes;
            return limit
                ? `Export disabled: estimated output exceeds the configured limit (${bytesToSize(limit)})`
                : 'Export disabled';
        }
    },

    watch: {
        filePath: {
            handler(val) {
                if (val) this.loadRasterInfo();
            },
            immediate: true
        }
    },

    methods: {
        async loadRasterInfo() {
            if (!this.filePath || !this.dataset) return;

            this.loadError = false;
            try {
                this.rasterInfo = await this.dataset.getRasterValueInfo(this.filePath);

                // Default colormap and unit based on raster kind
                if (this.isThermal) {
                    this.selectedColormap = 'ironbow';
                } else {
                    this.selectedColormap = 'viridis';
                    this.unitLabel = this.rasterInfo.unit || 'm';
                }

                // Initial rescale from observed range
                if (this.rasterInfo.valueMin !== undefined && this.rasterInfo.valueMax !== undefined) {
                    this.rescale = `${this.rasterInfo.valueMin.toFixed(1)},${this.rasterInfo.valueMax.toFixed(1)}`;
                }

                // Apply initial params from URL hash
                if (this.initialParams && !this._initialParamsApplied) {
                    this._initialParamsApplied = true;
                    if (this.initialParams.formula) this.selectedFormula = this.initialParams.formula;
                    if (this.initialParams.colormap) this.selectedColormap = this.initialParams.colormap;
                    if (this.initialParams.rescale) this.rescale = this.initialParams.rescale;
                }

                this.apply();
            } catch (e) {
                console.error('Failed to load raster info:', e);
                // Fallback so colormap/rescale controls still work
                this.rasterInfo = { valueMin: 0, valueMax: 65535, isThermal: false, isDirectValue: true, sensorId: '', unit: '' };
                this.rescale = '';
                this.loadError = true;
                this.apply();
            }
        },

        onFormulaChange() {
            this.apply();
        },

        onRescaleChange() {
            this.debouncedApply();
        },

        apply() {
            this.originalView = false;
            const params = {
                formula: this.selectedFormula,
                colormap: this.selectedColormap,
                rescale: this.rescale
            };
            this.$emit('vizParamsChanged', params);
        },

        debouncedApply() {
            this.applyLater.clear();
            this.applyLater(() => this.apply(), 300);
        },

        reset() {
            this.selectedFormula = 'CELSIUS';
            this.selectedColormap = this.isThermal ? 'ironbow' : 'viridis';
            this.originalView = false;
            if (this.rasterInfo) {
                this.rescale = `${this.rasterInfo.valueMin.toFixed(1)},${this.rasterInfo.valueMax.toFixed(1)}`;
            } else {
                this.rescale = '';
            }
            this.$emit('vizParamsChanged', {});
        },

        close() {
            this.reset();
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

        async exportGeoTiff() {
            if (!this.filePath || !this.dataset) return;
            const vizParams = {
                formula: this.selectedFormula,
                colormap: this.selectedColormap,
                rescale: this.rescale
            };

            const url = this.dataset.exportUrl(this.filePath, vizParams);
            try {
                this.exporting = true;
                const resp = await this.dataset.registry.fetchRaw(url, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`Export failed (HTTP ${resp.status})`);
                const blob = await resp.blob();
                downloadBlob(blob, filenameFromDisposition(resp.headers.get('content-disposition'), 'raster_export.tif'));
            } catch (e) {
                console.error('Export error:', e);
                this.$notify.error(e, { summary: 'Export Failed' });
            } finally {
                this.exporting = false;
            }
        },

        formatValue(val) {
            if (val === undefined || val === null) return '-';
            if (typeof val !== 'number') return val;
            if (this.isThermal) {
                const unit = this.selectedFormula === 'KELVIN' ? 'K' : '°C';
                const display = this.selectedFormula === 'KELVIN' ? val + 273.15 : val;
                return `${display.toFixed(1)}${unit}`;
            }
            const unit = this.unitLabel ? ` ${this.unitLabel}` : '';
            return `${val.toFixed(2)}${unit}`;
        },

        formatNum(val) {
            if (val === undefined || val === null) return '-';
            return typeof val === 'number' ? val.toFixed(3) : val;
        }
    }
};
</script>

<style scoped>
/* Shared look and palette: css/_analysis-panel.scss */

.raster-panel .panel-title i.fa-temperature-high {
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
    background: rgba(255, 87, 34, 0.25);
    border-color: rgba(255, 87, 34, 0.5);
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
</style>
