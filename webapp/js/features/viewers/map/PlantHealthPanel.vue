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
                    <option v-for="f in availableFormulas" :key="f.id" :value="f.id"
                        :disabled="f.disabled"
                        :title="f.disabled ? f.disabledReason : f.help">
                        {{ f.name }}{{ f.disabled ? ' ✗' : '' }}
                    </option>
                </select>
            </div>

            <!-- Band Mapping (when no formula) -->
            <div class="section" v-if="!selectedFormula && rasterInfo.bands && rasterInfo.bands.length > 3">
                <label class="section-label">Bands (R,G,B)</label>
                <BandSelector
                    v-model="customBands"
                    :bands="rasterInfo.bands"
                    @update:modelValue="debouncedApply" />
            </div>

            <!-- Single band info message -->
            <div class="section" v-if="rasterInfo.bands && rasterInfo.bands.length === 1">
                <div class="single-band-info">
                    <i class="fas fa-info-circle"></i>
                    <span>Single band image. Use <strong>Merge Multispectral</strong> to combine bands for vegetation indices.</span>
                </div>
            </div>

            <!-- Colormap (when formula is active) -->
            <div class="section" v-if="selectedFormula">
                <label class="section-label">Colormap</label>
                <ColormapDropdown
                    v-model="selectedColormap"
                    :colormaps="availableColormaps"
                    @update:modelValue="debouncedApply" />
            </div>

            <!-- Stretch Type -->
            <div class="section" v-if="rasterInfo && ((rasterInfo.dataType && rasterInfo.dataType !== 'Byte') || selectedFormula)">
                <label class="section-label">Stretch</label>
                <select v-model="selectedStretch" @change="onStretchChange" class="panel-select">
                    <option value="percentile">Percentile (2%-98%)</option>
                    <option value="minmax">Min / Max</option>
                    <option value="stddev">Std Dev (±2σ)</option>
                    <option value="none">None</option>
                    <option value="custom">Custom</option>
                </select>
            </div>

            <!-- Rescale (when formula is active) -->
            <div class="section" v-if="selectedFormula">
                <label class="section-label">Rescale</label>
                <input v-model="rescale" @change="onRescaleManualChange" class="panel-input" placeholder="e.g. -1,1 (auto if empty)" />
            </div>

            <!-- Histogram -->
            <div class="section" v-if="histogramData">
                <label class="section-label">Histogram</label>
                <HistogramChart
                    :data="histogramData"
                    :min="histogramMin"
                    :max="histogramMax"
                    :colormap="selectedFormula ? selectedColormap : null"
                    :height="100"
                    @update:range="onHistogramRangeChange" />
            </div>

            <!-- Statistics -->
            <div class="section" v-if="metadata && metadata.statistics">
                <label class="section-label">Statistics</label>
                <div class="stats-grid">
                    <span>Min: {{ formatNum(firstBandStats.min) }}</span>
                    <span>Max: {{ formatNum(firstBandStats.max) }}</span>
                    <span>Mean: {{ formatNum(firstBandStats.mean) }}</span>
                    <span>StdDev: {{ formatNum(firstBandStats.stddev || firstBandStats.std) }}</span>
                </div>
            </div>

            <!-- Reset / Toggle / Copy Link / Export -->
            <div class="section actions">
                <button class="btn btn-secondary btn-sm" @click="reset">Reset</button>
                <button class="btn btn-sm" :class="originalView ? 'btn-primary' : 'btn-secondary'" @click="toggleOriginalView" :title="originalView ? 'Showing original — click to apply processing' : 'Showing processed — click to show original'">
                    <i :class="originalView ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
                <button class="btn btn-secondary btn-sm" @click="copyLink" title="Copy shareable link">
                    <i class="fas fa-link"></i>
                </button>
                <button class="btn btn-secondary btn-sm" @click="exportGeoTiff" :disabled="exporting" title="Export GeoTIFF">
                    <i :class="exporting ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
                </button>
            </div>
        </div>

        <div class="panel-body loading" v-else>
            <i class="fas fa-spinner fa-spin"></i> Loading raster info...
        </div>
    </div>
</template>

<script>
import HistogramChart from '@/components/HistogramChart.vue';
import ColormapDropdown from '@/components/ColormapDropdown.vue';
import BandSelector from '@/components/BandSelector.vue';
import clipboardCopy from 'clipboard-copy';

export default {
    components: { HistogramChart, ColormapDropdown, BandSelector },
    props: {
        visible: { type: Boolean, default: false },
        dataset: { type: Object, required: true },
        filePath: { type: String, default: null },
        initialParams: { type: Object, default: null }
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
            selectedStretch: 'percentile',
            rescale: '',
            availableFormulas: [],
            availableColormaps: ['rdylgn', 'discrete_ndvi', 'spectral', 'viridis', 'plasma', 'inferno', 'magma', 'grayscale', 'ironbow', 'rainbow', 'bugn', 'whitehot', 'blackhot', 'arctic', 'lava'],
            exporting: false,
            originalView: false
        };
    },

    computed: {
        normalizedColormaps() {
            return this.availableColormaps.map(cm =>
                typeof cm === 'string' ? { id: cm, name: cm } : cm
            );
        },
        enabledFormulas() {
            if (!this.rasterInfo || !this.availableFormulas) return [];
            return this.availableFormulas.filter(f => !f.disabled);
        },
        firstBandStats() {
            if (!this.metadata || !this.metadata.statistics) return {};
            const stats = this.metadata.statistics;
            // Statistics may be keyed by band number ("1") or flat
            if (stats['1']) return stats['1'];
            return stats;
        },
        histogramData() {
            const s = this.firstBandStats;
            if (s && s.histogram) return s.histogram;
            return null;
        },
        stretchRange() {
            const s = this.firstBandStats;
            const fallback = [s ? (s.min || 0) : 0, s ? (s.max || 1) : 1];
            if (!s) return fallback;

            switch (this.selectedStretch) {
                case 'percentile': {
                    const lo = (s.percentiles && s.percentiles.p2 !== undefined) ? s.percentiles.p2 : fallback[0];
                    const hi = (s.percentiles && s.percentiles.p98 !== undefined) ? s.percentiles.p98 : fallback[1];
                    return [lo, hi];
                }
                case 'minmax':
                case 'none':
                    return fallback;
                case 'stddev': {
                    const mean = s.mean || 0;
                    const std = s.stddev || s.std || 0;
                    return [mean - 2 * std, mean + 2 * std];
                }
                case 'custom':
                    if (this.rescale) {
                        const parts = this.rescale.split(',');
                        const lo = parts.length >= 1 ? parseFloat(parts[0]) : NaN;
                        const hi = parts.length >= 2 ? parseFloat(parts[1]) : NaN;
                        if (!isNaN(lo) && !isNaN(hi)) return [lo, hi];
                    }
                    break;
            }
            // Default: percentile if available, else min/max
            const pLo = (s.percentiles && s.percentiles.p2 !== undefined) ? s.percentiles.p2 : fallback[0];
            const pHi = (s.percentiles && s.percentiles.p98 !== undefined) ? s.percentiles.p98 : fallback[1];
            return [pLo, pHi];
        },
        histogramMin() {
            return this.stretchRange[0];
        },
        histogramMax() {
            return this.stretchRange[1];
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

                // Apply initial params from URL hash (if provided)
                if (this.initialParams && !this._initialParamsApplied) {
                    this._initialParamsApplied = true;
                    if (this.initialParams.preset) this.selectedPreset = this.initialParams.preset;
                    if (this.initialParams.formula) this.selectedFormula = this.initialParams.formula;
                    if (this.initialParams.bands) this.customBands = this.initialParams.bands;
                    if (this.initialParams.colormap) this.selectedColormap = this.initialParams.colormap;
                    if (this.initialParams.rescale) this.rescale = this.initialParams.rescale;
                    if (this.initialParams.stretch) this.selectedStretch = this.initialParams.stretch;
                    this.computeRescaleFromStretch();
                    this.apply();
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
            this.computeRescaleFromStretch();
            this.apply();
        },

        apply() {
            this.originalView = false; // Any param change exits original view
            const params = {};
            if (this.selectedPreset) params.preset = this.selectedPreset;
            if (this.selectedFormula) params.formula = this.selectedFormula;
            if (this.customBands && !this.selectedPreset && !this.selectedFormula) params.bands = this.customBands;
            if (this.selectedFormula && this.selectedColormap) params.colormap = this.selectedColormap;
            if (this.rescale) params.rescale = this.rescale;
            if (this.selectedStretch) params.stretch = this.selectedStretch;

            this.$emit('vizParamsChanged', params);
        },

        debouncedApply() {
            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => this.apply(), 300);
        },

        async reset() {
            this.selectedPreset = '';
            this.selectedFormula = '';
            this.customBands = '';
            this.selectedColormap = 'rdylgn';
            this.selectedStretch = 'percentile';
            this.rescale = '';
            this.originalView = false;
            this.$emit('vizParamsChanged', {});

            // Reload base metadata (statistics, histogram) for the original raster
            if (this.filePath && this.dataset) {
                try {
                    const meta = await this.dataset.getRasterMetadata(this.filePath);
                    this.metadata = meta;
                    if (meta.autoBands) this.customBands = meta.autoBands;
                } catch (e) {
                    console.error('Failed to reload metadata after reset:', e);
                }
            }
        },

        close() {
            this.reset();
            this.$emit('close');
        },

        toggleOriginalView() {
            this.originalView = !this.originalView;
            if (this.originalView) {
                // Show original raster without any processing
                this.$emit('vizParamsChanged', {});
            } else {
                // Re-apply current settings
                this.apply();
            }
        },

        onStretchChange() {
            this.computeRescaleFromStretch();
            this.apply();
        },

        computeRescaleFromStretch() {
            if (this.selectedStretch === 'custom') return;
            const s = this.firstBandStats;
            if (!s) return;

            if (this.selectedStretch === 'percentile') {
                const lo = (s.percentiles && s.percentiles.p2 !== undefined) ? s.percentiles.p2 : s.min;
                const hi = (s.percentiles && s.percentiles.p98 !== undefined) ? s.percentiles.p98 : s.max;
                this.rescale = `${Number(lo).toFixed(3)},${Number(hi).toFixed(3)}`;
            } else if (this.selectedStretch === 'minmax') {
                this.rescale = `${Number(s.min).toFixed(3)},${Number(s.max).toFixed(3)}`;
            } else if (this.selectedStretch === 'stddev') {
                const std = s.stddev || s.std || 0;
                const mean = s.mean || 0;
                this.rescale = `${(mean - 2 * std).toFixed(3)},${(mean + 2 * std).toFixed(3)}`;
            } else if (this.selectedStretch === 'none') {
                this.rescale = `${Number(s.min).toFixed(3)},${Number(s.max).toFixed(3)}`;
            }
        },

        onHistogramRangeChange({ min, max }) {
            this.rescale = `${min.toFixed(3)},${max.toFixed(3)}`;
            this.selectedStretch = 'custom';
            this.apply();
        },

        onRescaleManualChange() {
            this.selectedStretch = 'custom';
            this.debouncedApply();
        },

        async exportGeoTiff() {
            if (!this.filePath || !this.dataset) return;
            const vizParams = {};
            if (this.selectedPreset) vizParams.preset = this.selectedPreset;
            if (this.selectedFormula) vizParams.formula = this.selectedFormula;
            if (this.customBands && !this.selectedPreset && !this.selectedFormula) vizParams.bands = this.customBands;
            if (this.selectedFormula && this.selectedColormap) vizParams.colormap = this.selectedColormap;
            if (this.rescale) vizParams.rescale = this.rescale;

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
                a.download = match ? match[1].trim() : 'export.tif';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                console.error('Export error:', e);
                if (this.$toast) {
                    this.$toast.add({ severity: 'error', summary: 'Export Failed', detail: e.message, life: 5000 });
                }
            } finally {
                this.exporting = false;
            }
        },

        copyLink() {
            const url = new URL(window.location.href);
            // Build hash params
            const hashParams = new URLSearchParams();
            hashParams.set('path', this.filePath);
            if (this.selectedPreset) hashParams.set('preset', this.selectedPreset);
            if (this.selectedFormula) hashParams.set('formula', this.selectedFormula);
            if (this.customBands && !this.selectedPreset && !this.selectedFormula) hashParams.set('bands', this.customBands);
            if (this.selectedFormula && this.selectedColormap) hashParams.set('colormap', this.selectedColormap);
            if (this.rescale) hashParams.set('rescale', this.rescale);
            if (this.selectedStretch) hashParams.set('stretch', this.selectedStretch);
            url.hash = hashParams.toString();

            // Update browser URL
            window.history.replaceState(null, '', url.toString());

            clipboardCopy(url.toString());
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

.panel-select option {
    background: #2a2a2a;
    color: #eee;
}

.panel-select option:disabled {
    color: #777;
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.15rem;
    font-size: 0.75rem;
    color: #ccc;
}

.single-band-info {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: #bbb;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    line-height: 1.3;
}

.single-band-info i {
    color: #66b3ff;
    margin-top: 0.1rem;
    flex-shrink: 0;
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

/* Responsive: bottom-sheet on mobile */
@media (max-width: 768px) {
    .plant-health-panel {
        position: fixed;
        top: auto;
        right: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        max-height: 50vh;
        border-radius: 0.75rem 0.75rem 0 0;
        transition: transform 0.3s ease;
    }

    .panel-body {
        padding: 0.5rem;
    }

    .stats-grid {
        grid-template-columns: 1fr 1fr;
    }

    .actions {
        flex-wrap: wrap;
    }
}
</style>
