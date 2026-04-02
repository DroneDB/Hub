<template>
    <div class="plant-health-panel" v-if="visible">
        <div class="panel-header">
            <span class="panel-title"><i class="fas fa-leaf"></i> Plant Health</span>
            <button class="close-btn" @click="close" title="Close"><i class="fas fa-times"></i></button>
        </div>

        <div class="panel-body" v-if="rasterInfo">
            <!-- Sensor Info -->
            <div class="section" v-if="rasterInfo.detectedSensor">
                <label class="section-label">Sensor</label>
                <span class="sensor-badge">{{ rasterInfo.detectedSensor }}</span>
            </div>

            <!-- Preset Selection -->
            <div class="section" v-if="rasterInfo.presets && rasterInfo.presets.length > 0">
                <label class="section-label">Preset</label>
                <select v-model="selectedPreset" @change="onPresetChange" class="panel-select">
                    <option value="">Custom...</option>
                    <option v-for="p in rasterInfo.presets" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
            </div>

            <!-- Formula Selection -->
            <div class="section">
                <label class="section-label">Formula</label>
                <select v-model="selectedFormula" @change="onFormulaChange" class="panel-select">
                    <option value="">None (bands only)</option>
                    <option v-for="f in availableFormulas" :key="f.id" :value="f.id">{{ f.name }}</option>
                </select>
            </div>

            <!-- Band Mapping (when no formula) -->
            <div class="section" v-if="!selectedFormula && rasterInfo.bands && rasterInfo.bands.length > 3">
                <label class="section-label">Bands (R,G,B)</label>
                <input v-model="customBands" @change="apply" class="panel-input" placeholder="e.g. 4,3,2" />
            </div>

            <!-- Colormap (when formula is active) -->
            <div class="section" v-if="selectedFormula">
                <label class="section-label">Colormap</label>
                <select v-model="selectedColormap" @change="apply" class="panel-select">
                    <option v-for="cm in availableColormaps" :key="cm" :value="cm">{{ cm }}</option>
                </select>
            </div>

            <!-- Rescale (when formula is active) -->
            <div class="section" v-if="selectedFormula">
                <label class="section-label">Rescale</label>
                <input v-model="rescale" @change="apply" class="panel-input" placeholder="e.g. -1,1 (auto if empty)" />
            </div>

            <!-- Histogram -->
            <div class="section" v-if="metadata && metadata.statistics">
                <label class="section-label">Statistics</label>
                <div class="stats-grid">
                    <span>Min: {{ formatNum(metadata.statistics.min) }}</span>
                    <span>Max: {{ formatNum(metadata.statistics.max) }}</span>
                    <span>Mean: {{ formatNum(metadata.statistics.mean) }}</span>
                    <span>StdDev: {{ formatNum(metadata.statistics.stddev) }}</span>
                </div>
            </div>

            <!-- Apply / Reset -->
            <div class="section actions">
                <button class="btn btn-primary btn-sm" @click="apply">Apply</button>
                <button class="btn btn-secondary btn-sm" @click="reset">Reset</button>
            </div>
        </div>

        <div class="panel-body loading" v-else>
            <i class="fas fa-spinner fa-spin"></i> Loading raster info...
        </div>
    </div>
</template>

<script>
export default {
    props: {
        visible: { type: Boolean, default: false },
        dataset: { type: Object, required: true },
        filePath: { type: String, default: null }
    },

    emits: ['close', 'vizParamsChanged'],

    data() {
        return {
            rasterInfo: null,
            metadata: null,
            selectedPreset: '',
            selectedFormula: '',
            customBands: '',
            selectedColormap: 'rdylgn',
            rescale: '',
            availableFormulas: [],
            availableColormaps: ['rdylgn', 'discrete_ndvi', 'spectral', 'viridis', 'plasma', 'inferno', 'magma', 'grayscale', 'ironbow', 'rainbow', 'bugn']
        };
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

            try {
                this.rasterInfo = await this.dataset.getRasterInfo(this.filePath);

                // Load formulas from raster metadata
                const meta = await this.dataset.getRasterMetadata(this.filePath);
                this.metadata = meta;
                if (meta.algorithms) {
                    this.availableFormulas = meta.algorithms;
                }
                if (meta.colormaps) {
                    this.availableColormaps = meta.colormaps;
                }
                if (meta.autoBands) {
                    this.customBands = meta.autoBands;
                }
            } catch (e) {
                console.error('Failed to load raster info:', e);
            }
        },

        onPresetChange() {
            if (this.selectedPreset) {
                this.selectedFormula = '';
                this.customBands = '';
            }
            this.apply();
        },

        async onFormulaChange() {
            this.selectedPreset = '';
            if (this.selectedFormula) {
                try {
                    const meta = await this.dataset.getRasterMetadata(
                        this.filePath, this.selectedFormula
                    );
                    this.metadata = meta;
                } catch (e) {
                    console.error('Failed to load formula metadata:', e);
                }
            }
            this.apply();
        },

        apply() {
            const params = {};
            if (this.selectedPreset) params.preset = this.selectedPreset;
            if (this.selectedFormula) params.formula = this.selectedFormula;
            if (this.customBands && !this.selectedPreset && !this.selectedFormula) params.bands = this.customBands;
            if (this.selectedFormula && this.selectedColormap) params.colormap = this.selectedColormap;
            if (this.rescale) params.rescale = this.rescale;

            this.$emit('vizParamsChanged', params);
        },

        reset() {
            this.selectedPreset = '';
            this.selectedFormula = '';
            this.customBands = '';
            this.selectedColormap = 'rdylgn';
            this.rescale = '';
            this.metadata = null;
            this.$emit('vizParamsChanged', {});
        },

        close() {
            this.reset();
            this.$emit('close');
        },

        formatNum(val) {
            if (val === undefined || val === null) return '-';
            return typeof val === 'number' ? val.toFixed(3) : val;
        }
    }
};
</script>

<style scoped>
.plant-health-panel {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
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
    color: #4caf50;
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

.sensor-badge {
    display: inline-block;
    background: rgba(76, 175, 80, 0.25);
    border: 1px solid rgba(76, 175, 80, 0.5);
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
    border-color: rgba(76, 175, 80, 0.6);
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
    background: #4caf50;
    color: white;
}

.btn-primary:hover {
    background: #388e3c;
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
</style>
