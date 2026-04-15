<template>
    <div class="thermal-panel" v-if="visible">
        <div class="panel-header">
            <span class="panel-title"><i class="fas fa-temperature-high"></i> Thermal</span>
            <button class="close-btn" @click="close" title="Close"><i class="fas fa-times"></i></button>
        </div>

        <div class="panel-body" v-if="thermalInfo">
            <!-- No calibration warning -->
            <div class="section" v-if="loadError || !thermalInfo.calibration">
                <div class="no-calibration-info">
                    <i class="fas fa-info-circle"></i>&nbsp;No thermal calibration data: Showing raw values.
                </div>
            </div>

            <!-- Temperature Range -->
            <div class="section" v-if="!loadError">
                <label class="section-label">Value Range</label>
                <div class="temp-range">
                    <span>{{ thermalInfo.calibration ? formatTemp(thermalInfo.temperatureMin) : formatNum(thermalInfo.temperatureMin) }}</span>
                    <span>—</span>
                    <span>{{ thermalInfo.calibration ? formatTemp(thermalInfo.temperatureMax) : formatNum(thermalInfo.temperatureMax) }}</span>
                </div>
            </div>

            <!-- Sensor Info -->
            <div class="section" v-if="thermalInfo.sensorId">
                <label class="section-label">Sensor</label>
                <span class="sensor-badge thermal">{{ thermalInfo.sensorId }}</span>
            </div>

            <!-- Formula Selection (only with calibration) -->
            <div class="section" v-if="thermalInfo.calibration">
                <label class="section-label">Unit</label>
                <select v-model="selectedFormula" @change="onFormulaChange" class="panel-select">
                    <option value="CELSIUS">Celsius (°C)</option>
                    <option value="KELVIN">Kelvin (K)</option>
                </select>
            </div>

            <!-- Colormap -->
            <div class="section">
                <label class="section-label">Colormap</label>
                <ColormapDropdown
                    v-model="selectedColormap"
                    :colormaps="thermalColormaps"
                    @update:modelValue="debouncedApply" />
            </div>

            <!-- Rescale -->
            <div class="section">
                <label class="section-label">Rescale</label>
                <input v-model="rescale" @change="onRescaleChange" class="panel-input" placeholder="e.g. 0,50 (auto if empty)" />
            </div>

            <!-- Spot Info -->
            <div class="section" v-if="spotInfo">
                <label class="section-label">Spot Temperature</label>
                <div class="spot-info">
                    <span class="spot-temp">{{ formatTemp(spotInfo.temperature) }}</span>
                    <span class="spot-coords">({{ spotInfo.x }}, {{ spotInfo.y }})</span>
                </div>
            </div>

            <!-- Area Stats -->
            <div class="section" v-if="areaStats">
                <label class="section-label">Area Statistics</label>
                <div class="stats-grid">
                    <span>Min: {{ formatTemp(areaStats.min) }}</span>
                    <span>Max: {{ formatTemp(areaStats.max) }}</span>
                    <span>Mean: {{ formatTemp(areaStats.mean) }}</span>
                    <span>StdDev: {{ formatNum(areaStats.stddev) }}</span>
                    <span>Median: {{ formatTemp(areaStats.median) }}</span>
                    <span>Pixels: {{ areaStats.pixelCount }}</span>
                </div>
            </div>

            <!-- Actions -->
            <div class="section actions">
                <button class="btn btn-secondary btn-sm" @click="reset">Reset</button>
                <button class="btn btn-sm" :class="originalView ? 'btn-primary' : 'btn-secondary'" @click="toggleOriginalView">
                    <i :class="originalView ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
                <button class="btn btn-secondary btn-sm" @click="exportGeoTiff" :disabled="exporting" title="Export GeoTIFF">
                    <i :class="exporting ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
                </button>
            </div>
        </div>

        <div class="panel-body loading" v-else>
            <i class="fas fa-spinner fa-spin"></i> Loading thermal info...
        </div>
    </div>
</template>

<script>
import ColormapDropdown from '@/components/ColormapDropdown.vue';

export default {
    components: { ColormapDropdown },
    props: {
        visible: { type: Boolean, default: false },
        dataset: { type: Object, default: null },
        filePath: { type: String, default: null },
        initialParams: { type: Object, default: null },
        spotInfo: { type: Object, default: null },
        areaStats: { type: Object, default: null }
    },

    emits: ['close', 'vizParamsChanged'],

    data() {
        return {
            thermalInfo: null,
            loadError: false,
            selectedFormula: 'CELSIUS',
            selectedColormap: 'ironbow',
            rescale: '',
            thermalColormaps: [
                { id: 'ironbow', name: 'Ironbow', colors: ['#000000', '#570f6a', '#bd3754', '#f97808', '#ffe344', '#ffffff'] },
                { id: 'whitehot', name: 'White Hot', colors: ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff'] },
                { id: 'blackhot', name: 'Black Hot', colors: ['#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#000000'] },
                { id: 'arctic', name: 'Arctic', colors: ['#000040', '#0064c8', '#64c8ff', '#c8f0ff', '#ffffff', '#ffffff'] },
                { id: 'lava', name: 'Lava', colors: ['#000000', '#800000', '#ff5000', '#ffc800', '#ffffc8', '#ffffc8'] },
                { id: 'inferno', name: 'Inferno', colors: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4', '#fcffa4'] },
                { id: 'magma', name: 'Magma', colors: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf', '#fcfdbf'] },
                { id: 'plasma', name: 'Plasma', colors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921', '#f0f921'] }
            ],
            exporting: false,
            originalView: false
        };
    },

    watch: {
        filePath: {
            handler(val) {
                if (val) this.loadThermalInfo();
            },
            immediate: true
        }
    },

    methods: {
        async loadThermalInfo() {
            if (!this.filePath || !this.dataset) return;

            this.loadError = false;
            try {
                this.thermalInfo = await this.dataset.getThermalInfo(this.filePath);

                // Set initial rescale from temperature range
                if (this.thermalInfo.temperatureMin !== undefined && this.thermalInfo.temperatureMax !== undefined) {
                    this.rescale = `${this.thermalInfo.temperatureMin.toFixed(1)},${this.thermalInfo.temperatureMax.toFixed(1)}`;
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
                console.error('Failed to load thermal info:', e);
                // Provide fallback so colormap/rescale controls still work
                this.thermalInfo = { temperatureMin: 0, temperatureMax: 65535, isDirectTemperature: false, sensorId: '' };
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
            this.selectedColormap = 'ironbow';
            this.originalView = false;
            if (this.thermalInfo) {
                this.rescale = `${this.thermalInfo.temperatureMin.toFixed(1)},${this.thermalInfo.temperatureMax.toFixed(1)}`;
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
                a.download = match ? match[1].trim() : 'thermal_export.tif';
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

        formatTemp(val) {
            if (val === undefined || val === null) return '-';
            return typeof val === 'number' ? `${val.toFixed(1)}°C` : val;
        },

        formatNum(val) {
            if (val === undefined || val === null) return '-';
            return typeof val === 'number' ? val.toFixed(3) : val;
        }
    }
};
</script>

<style scoped>
.thermal-panel {
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
    color: #ff5722;
    margin-right: 0.3rem;
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
    color: #ff9800;
}

.sensor-badge.thermal {
    display: inline-block;
    background: rgba(255, 87, 34, 0.25);
    border: 1px solid rgba(255, 87, 34, 0.5);
    border-radius: 0.25rem;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
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
    border-color: rgba(255, 87, 34, 0.6);
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
    background: #ff5722;
    color: white;
}

.btn-primary:hover {
    background: #e64a19;
}

.btn-secondary {
    background: rgba(255,255,255,0.15);
    color: #ccc;
}

.btn-secondary:hover {
    background: rgba(255,255,255,0.25);
}

.btn-sm {
    flex: 1;
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
