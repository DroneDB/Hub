<template>
    <div class="raster-panel" v-if="visible">
        <div class="panel-header">
            <span class="panel-title">
                <i :class="panelIconClass"></i> {{ panelTitle }}
            </span>
            <button class="close-btn" @click="close" title="Close"><i class="fas fa-times"></i></button>
        </div>

        <div class="panel-body" v-if="rasterInfo">
            <!-- No-calibration warning (thermal only) -->
            <div class="section" v-if="isThermal && (loadError || !rasterInfo.calibration)">
                <div class="no-calibration-info">
                    <i class="fas fa-info-circle"></i>&nbsp;No thermal calibration data: Showing raw values.
                </div>
            </div>

            <!-- Value Range -->
            <div class="section" v-if="!loadError">
                <label class="section-label">{{ rangeLabel }}</label>
                <div class="temp-range" :class="{ 'thermal': isThermal }">
                    <span>{{ formatValue(rasterInfo.valueMin) }}</span>
                    <span>-</span>
                    <span>{{ formatValue(rasterInfo.valueMax) }}</span>
                </div>
            </div>

            <!-- Sensor Info -->
            <div class="section" v-if="rasterInfo.sensorId">
                <label class="section-label">Sensor</label>
                <span class="sensor-badge" :class="{ thermal: isThermal }">{{ rasterInfo.sensorId }}</span>
            </div>

            <!-- Unit (thermal: °C/K toggle; generic: free text with autodetected default) -->
            <div class="section" v-if="isThermal && rasterInfo.calibration">
                <label class="section-label">Unit</label>
                <select v-model="selectedFormula" @change="onFormulaChange" class="panel-select">
                    <option value="CELSIUS">Celsius (°C)</option>
                    <option value="KELVIN">Kelvin (K)</option>
                </select>
            </div>
            <div class="section" v-else-if="!isThermal">
                <label class="section-label">Unit</label>
                <input v-model="unitLabel" class="panel-input" placeholder="e.g. m, ft" />
            </div>

            <!-- Colormap -->
            <div class="section">
                <label class="section-label">Colormap</label>
                <ColormapDropdown
                    v-model="selectedColormap"
                    :colormaps="availableColormaps"
                    @update:modelValue="debouncedApply" />
            </div>

            <!-- Rescale -->
            <div class="section">
                <label class="section-label">Rescale</label>
                <input v-model="rescale" @change="onRescaleChange" class="panel-input" placeholder="e.g. 0,50 (auto if empty)" />
            </div>

            <!-- Spot Info -->
            <div class="section" v-if="spotInfo">
                <label class="section-label">{{ isThermal ? 'Spot Temperature' : 'Spot Value' }}</label>
                <div class="spot-info">
                    <span class="spot-temp" :class="{ thermal: isThermal }">{{ formatValue(spotInfo.value) }}</span>
                    <span class="spot-coords">({{ spotInfo.x }}, {{ spotInfo.y }})</span>
                </div>
            </div>

            <!-- Area Stats -->
            <div class="section" v-if="areaStats">
                <label class="section-label">Area Statistics</label>
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
            <div class="section" v-if="!loadError">
                <label class="section-label">
                    {{ isThermal ? 'Thermal Profile' : 'Value Profile' }}
                </label>
                <div class="profile-controls">
                    <button class="btn btn-sm"
                        :class="drawingProfile ? 'btn-warning active' : 'btn-secondary'"
                        @click="onProfileButtonClick"
                        :disabled="profileLoading"
                        :title="drawingProfile
                            ? 'Stop drawing and discard the partial profile (Esc)'
                            : (profile ? 'Discard the current profile and draw a new one'
                                       : 'Draw a profile line on the map')">
                        <i :class="profileLoading ? 'fas fa-spinner fa-spin'
                            : (drawingProfile ? 'fas fa-stop' : 'fas fa-route')"></i>
                        {{ drawingProfile ? 'Stop drawing' : (profile ? 'Redraw' : 'Draw profile') }}
                    </button>
                    <button v-if="profile && !drawingProfile" class="btn btn-link btn-sm"
                        @click="clearProfile"
                        title="Clear the chart and remove the line from the map">
                        <i class="fas fa-eraser"></i>
                    </button>
                </div>
                <div class="profile-error" v-if="profileError">
                    <i class="fas fa-exclamation-triangle"></i> {{ profileError }}
                </div>
                <RasterProfileChart v-if="profile"
                    :profile="profile"
                    :unit="displayUnit"
                    :is-thermal="isThermal"
                    @hover="onProfileHover" />
            </div>

            <!-- Actions -->
            <div class="section actions">
                <button class="btn btn-sm"
                    :class="inspectActive ? 'btn-warning active' : 'btn-secondary'"
                    @click="toggleInspect"
                    :title="inspectActive
                        ? 'Stop inspecting raster values (Esc)'
                        : 'Hover the map to read raster values'">
                    <i :class="inspectActive ? 'fas fa-eye-slash' : 'fas fa-magnifying-glass'"></i>
                </button>
                <button class="btn btn-secondary btn-sm" @click="reset">Reset</button>
                <button class="btn btn-sm" :class="originalView ? 'btn-primary' : 'btn-secondary'" @click="toggleOriginalView">
                    <i :class="originalView ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
                <button v-if="!isExportTooLarge"
                        class="btn btn-secondary btn-sm"
                        @click="exportGeoTiff"
                        :disabled="exporting"
                        title="Export GeoTIFF">
                    <i :class="exporting ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
                </button>
                <span v-else class="export-limit-hint" :title="exportLimitTooltip">
                    <i class="fas fa-download"></i>
                </span>
            </div>
        </div>

        <div class="panel-body loading" v-else>
            <i class="fas fa-spinner fa-spin"></i> Loading raster info...
        </div>
    </div>
</template>

<script>
import ColormapDropdown from '@/components/ColormapDropdown.vue';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { isExportTooLarge as computeIsExportTooLarge, formatBytes } from '@/libs/exportSize';
import RasterProfileChart from './RasterProfileChart.vue';

const THERMAL_COLORMAPS = [
    { id: 'ironbow', name: 'Ironbow', colors: ['#000000', '#570f6a', '#bd3754', '#f97808', '#ffe344', '#ffffff'] },
    { id: 'whitehot', name: 'White Hot', colors: ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff'] },
    { id: 'blackhot', name: 'Black Hot', colors: ['#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#000000'] },
    { id: 'arctic', name: 'Arctic', colors: ['#000040', '#0064c8', '#64c8ff', '#c8f0ff', '#ffffff', '#ffffff'] },
    { id: 'lava', name: 'Lava', colors: ['#000000', '#800000', '#ff5000', '#ffc800', '#ffffc8', '#ffffc8'] },
    { id: 'inferno', name: 'Inferno', colors: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4', '#fcffa4'] },
    { id: 'magma', name: 'Magma', colors: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf', '#fcfdbf'] },
    { id: 'plasma', name: 'Plasma', colors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921', '#f0f921'] }
];

// Palettes suitable for elevation and generic value rasters.
const GENERIC_COLORMAPS = [
    { id: 'viridis', name: 'Viridis', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
    { id: 'terrain', name: 'Terrain', colors: ['#333399', '#00b4b4', '#a0d979', '#ecd87a', '#a97443', '#ffffff'] },
    { id: 'magma', name: 'Magma', colors: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf', '#fcfdbf'] },
    { id: 'plasma', name: 'Plasma', colors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921', '#f0f921'] },
    { id: 'inferno', name: 'Inferno', colors: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4', '#fcffa4'] },
    { id: 'greys', name: 'Greys', colors: ['#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#000000'] }
];

export default {
    components: { ColormapDropdown, RasterProfileChart },
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
            'profileHover', 'cancelDrawProfile', 'toggleInspectValue'],    data() {
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
            return this.isThermal ? THERMAL_COLORMAPS : GENERIC_COLORMAPS;
        },
        displayUnit() {
            if (this.isThermal) {
                return this.selectedFormula === 'KELVIN' ? 'K' : '°C';
            }
            return this.unitLabel || '';
        },
        maxExportSizeBytes() {
            return reg.getFeatureValue(Features.MAX_EXPORT_SIZE_BYTES);
        },
        isExportTooLarge() {
            return computeIsExportTooLarge(this.rasterInfo, this.maxExportSizeBytes);
        },
        exportLimitTooltip() {
            const limit = this.maxExportSizeBytes;
            return limit
                ? `Export disabled: estimated output exceeds the configured limit (${formatBytes(limit)})`
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
            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => this.apply(), 300);
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

        requestPickProfile() {
            this.$emit('pickProfile');
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
                const resp = await fetch(url, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`Export failed (HTTP ${resp.status})`);
                const blob = await resp.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                const disposition = resp.headers.get('content-disposition');
                const match = disposition && disposition.match(/filename=([^;]+)/);
                a.download = match ? match[1].trim() : 'raster_export.tif';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                console.error('Export error:', e);
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
.raster-panel {
    position: absolute;
    top: 0.5rem;
    right: 4rem;
    z-index: 2;
    width: 16rem;
    background: rgba(0, 0, 0, 0.85);
    color: #eee;
    border-radius: 0.5rem;
    font-size: 0.8rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    max-height: calc(100% - 1rem);
    overflow-y: auto;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(255,255,255,0.15);
}

.panel-title {
    font-weight: 600;
}

.panel-title i {
    color: #4fc3f7;
    margin-right: 0.3rem;
}

.raster-panel >>> .panel-title i.fa-temperature-high {
    color: #ff5722;
}

.close-btn {
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
}

.close-btn:hover {
    color: #fff;
}

.panel-body {
    padding: 0.5rem 0.75rem;
}

.panel-body.loading {
    text-align: center;
    padding: 1rem;
    color: #aaa;
}

.section {
    margin-bottom: 0.5rem;
}

.section-label {
    display: block;
    font-size: 0.7rem;
    color: #aaa;
    margin-bottom: 0.15rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.temp-range {
    display: flex;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #4fc3f7;
}

.temp-range.thermal {
    color: #ff9800;
}

.sensor-badge {
    display: inline-block;
    background: rgba(79, 195, 247, 0.25);
    border: 1px solid rgba(79, 195, 247, 0.5);
    border-radius: 0.25rem;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
}

.sensor-badge.thermal {
    background: rgba(255, 87, 34, 0.25);
    border-color: rgba(255, 87, 34, 0.5);
}

.panel-select, .panel-input {
    width: 100%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #eee;
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
}

.panel-select:focus, .panel-input:focus {
    outline: none;
    border-color: rgba(79, 195, 247, 0.6);
}

.panel-select option {
    background: #2a2a2a;
    color: #eee;
}

.spot-info {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
}

.spot-temp {
    font-size: 1.1rem;
    font-weight: 700;
    color: #4fc3f7;
}

.spot-temp.thermal {
    color: #ff9800;
}

.spot-coords {
    font-size: 0.7rem;
    color: #888;
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.15rem;
    font-size: 0.75rem;
    color: #ccc;
}

.profile-controls {
    display: flex;
    gap: 0.35rem;
    margin-bottom: 0.35rem;
}

.profile-error {
    font-size: 0.72rem;
    color: #ff8a80;
    margin-bottom: 0.25rem;
}

.actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
}

.btn {
    border: none;
    border-radius: 0.25rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.8rem;
}

.btn-primary {
    background: #4fc3f7;
    color: white;
}

.btn-primary:hover {
    background: #29b6f6;
}

.btn-secondary {
    background: rgba(255,255,255,0.15);
    color: #ccc;
}

.btn-secondary:hover {
    background: rgba(255,255,255,0.25);
}

.btn-warning {
    background: rgba(255, 152, 0, 0.45);
    color: #fff;
    border: 1px solid #ff9800;
}

.btn-warning:hover {
    background: rgba(255, 152, 0, 0.6);
}

.btn-warning.active {
    box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.5);
}

.btn-sm {
    flex: 1;
}

.export-limit-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 0.85rem;
    color: #aaa;
    cursor: default;
    flex: 1;
    justify-content: center;
}

.no-calibration-info {
    background: rgba(255, 152, 0, 0.15);
    border: 1px solid rgba(255, 152, 0, 0.3);
    border-radius: 0.25rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
    color: #ffb74d;
}

.no-calibration-info i {
    margin-right: 0.2rem;
}
</style>
