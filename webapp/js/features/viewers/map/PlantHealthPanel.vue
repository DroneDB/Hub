<template>
    <div v-if="visible" class="analysis-panel analysis-panel--plant-health plant-health-panel">
        <div class="panel-header">
            <span class="panel-title"><i class="fas fa-leaf" /> Plant Health</span>
            <button class="close-btn" title="Close" aria-label="Close" @click="close"><i class="fas fa-times" /></button>
        </div>

        <div v-if="rasterInfo" class="panel-body">
            <!-- Sensor Info -->
            <div v-if="rasterInfo.detectedSensor" class="section">
                <span class="section-label">Sensor</span>
                <span class="sensor-badge">{{ rasterInfo.detectedSensor }}</span>
            </div>

            <!-- Preset Selection -->
            <div v-if="rasterInfo.presets && rasterInfo.presets.length > 0" class="section">
                <label for="plant-health-panel-preset" class="section-label">Preset</label>
                <select id="plant-health-panel-preset" v-model="selectedPreset" class="panel-select" @change="onPresetChange">
                    <option value="">Custom...</option>
                    <option v-for="p in rasterInfo.presets" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
            </div>

            <!-- Formula Selection -->
            <div class="section">
                <label for="plant-health-panel-formula" class="section-label">
                    Formula
                    <button type="button" class="info-icon-btn"
                            title="Learn more about each vegetation index" aria-label="Learn more about each vegetation index"
                            data-testid="plant-health-formulas-info"
                            @click="showFormulasInfo = true">
                        <i class="fas fa-info-circle" />
                    </button>
                </label>
                <select id="plant-health-panel-formula" v-model="selectedFormula" class="panel-select" @change="onFormulaChange">
                    <option value="">None (bands only)</option>
                    <option v-for="f in availableFormulas" :key="f.id" :value="f.id"
                            :disabled="f.disabled"
                            :title="f.disabled ? f.disabledReason : f.help">
                        {{ f.name }}{{ f.disabled ? ' ✗' : '' }}
                    </option>
                </select>
            </div>

            <!-- Band Mapping (when no formula) -->
            <div v-if="!selectedFormula && rasterInfo.bands && rasterInfo.bands.length > 3" class="section">
                <span id="plant-health-panel-bands-label" class="section-label">Bands (R,G,B)</span>
                <BandSelector
                    v-model="customBands"
                    aria-labelledby="plant-health-panel-bands-label"
                    :bands="rasterInfo.bands"
                    @update:model-value="debouncedApply" />
            </div>

            <!-- Single band info message -->
            <div v-if="rasterInfo.bands && rasterInfo.bands.length === 1" class="section">
                <div class="single-band-info">
                    <i class="fas fa-info-circle" />
                    <span>Single band image. Use <strong>Merge Multispectral</strong> to combine bands for vegetation indices.</span>
                </div>
            </div>

            <!-- Colormap (when formula is active) -->
            <div v-if="selectedFormula" class="section">
                <label id="plant-health-panel-colormap-label" for="plant-health-panel-colormap" class="section-label">Colormap</label>
                <ColormapDropdown
                    v-model="selectedColormap"
                    input-id="plant-health-panel-colormap" aria-labelledby="plant-health-panel-colormap-label"
                    :colormaps="colormapOptions"
                    @update:model-value="debouncedApply" />
            </div>

            <!-- Stretch Type -->
            <div v-if="selectedFormula" class="section">
                <label for="plant-health-panel-stretch" class="section-label">Stretch</label>
                <select id="plant-health-panel-stretch" v-model="selectedStretch" class="panel-select" @change="onStretchChange">
                    <option value="percentile">Percentile (2%-98%)</option>
                    <option value="minmax">Min / Max</option>
                    <option value="stddev">Std Dev (±2σ)</option>
                    <option value="custom">Custom</option>
                </select>
            </div>

            <!-- Rescale (when formula is active) -->
            <div v-if="selectedFormula" class="section">
                <label for="plant-health-panel-rescale" class="section-label">Rescale</label>
                <input id="plant-health-panel-rescale" v-model="rescale" class="panel-input" placeholder="e.g. -1,1 (auto if empty)" @change="onRescaleManualChange">
            </div>

            <!-- Histogram -->
            <div v-if="histogramData" class="section" style="margin-bottom: 1rem" role="group" aria-label="Histogram">
                <span class="section-label">Histogram</span>
                <HistogramChart
                    :data="histogramData"
                    :min="histogramMin"
                    :max="histogramMax"
                    :colormap="selectedFormula ? selectedColormap : null"
                    :height="100"
                    @update:range="onHistogramRangeChange" />
            </div>

            <!-- Statistics -->
            <div v-if="metadata && metadata.statistics" class="section">
                <span class="section-label">Statistics</span>
                <div class="stats-grid">
                    <span>Min: {{ formatNum(firstBandStats.min) }}</span>
                    <span>Max: {{ formatNum(firstBandStats.max) }}</span>
                    <span>Mean: {{ formatNum(firstBandStats.mean) }}</span>
                    <span>StdDev: {{ formatNum(firstBandStats.stddev || firstBandStats.std) }}</span>
                </div>
            </div>

            <!-- Reset / Toggle / Copy Link / Export -->
            <div class="section actions-grid">
                <button class="panel-btn action-btn" title="Reset visualization parameters to defaults"
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
                <button class="panel-btn action-btn" title="Copy a shareable link with the current settings"
                        @click="copyLink">
                    <i class="fas fa-link" />
                    <span class="action-label">Copy Link</span>
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

        <PlantHealthFormulasDialog v-model:visible="showFormulasInfo"
                                   :formulas="availableFormulas" />
    </div>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import HistogramChart from '@/features/viewers/map/HistogramChart.vue';
import ColormapDropdown from '@/features/viewers/map/ColormapDropdown.vue';
import { colormap, INDEX_COLORMAPS } from '@/libs/map/colormaps';
import BandSelector from '@/features/viewers/map/BandSelector.vue';
import PlantHealthFormulasDialog from './PlantHealthFormulasDialog.vue';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { isExportTooLarge as computeIsExportTooLarge } from '@/libs/exportSize';
import { bytesToSize } from '@/libs/utils';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { downloadBlob } from '@/libs/download';
import { pathutils } from 'ddb';
import { copyText } from '@/composables/useCopyText';
import { formatNumber } from '@/libs/format';
import { useTimerGroup } from '@/composables/useTimers';

/**
 * PlantHealthPanel - Plant health (NDVI / custom index) analysis panel.
 *
 * Renders a live-updating raster overlay computed from configurable band
 * expressions. Includes band selector, colormap picker, histogram
 * rescaling, and copy-link functionality.
 */
export default {
    components: { HistogramChart, ColormapDropdown, BandSelector, PlantHealthFormulasDialog, LoadingSpinner },
    props: {
        visible: { type: Boolean, default: false },
        dataset: { type: Object, default: null },
        filePath: { type: String, default: null },
        initialParams: { type: Object, default: null }
    },

    emits: ['close', 'vizParamsChanged'],

    setup() {
        const { runHeavyTask } = useHeavyTask();
        return { runHeavyTask, applyLater: useTimerGroup() };
    },
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
            // Ids, or { id, name } from the raster metadata
            availableColormaps: INDEX_COLORMAPS,
            exporting: false,
            originalView: false,
            showFormulasInfo: false
        };
    },

    computed: {
        // With the swatch colours of the shared table (the server sends ids and names)
        colormapOptions() {
            return this.availableColormaps.map(cm => {
                const id = typeof cm === 'string' ? cm : cm.id;
                return { ...colormap(id), ...(cm.name ? { name: cm.name } : {}) };
            });
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
                if (meta.autoBands && typeof meta.autoBands === 'string') {
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
            if (!this.selectedFormula) {
                this.rescale = '';
            }
            try {
                const meta = await this.dataset.getRasterMetadata(
                    this.filePath, this.selectedFormula || undefined
                );
                this.metadata = meta;
            } catch (e) {
                console.error('Failed to load formula metadata:', e);
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
            if (this.selectedFormula && this.rescale) params.rescale = this.rescale;
            if (this.selectedFormula && this.selectedStretch) params.stretch = this.selectedStretch;

            this.$emit('vizParamsChanged', params);
        },

        debouncedApply() {
            this.applyLater.clear();
            this.applyLater(() => this.apply(), 300);
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
                    if (meta.autoBands && typeof meta.autoBands === 'string') this.customBands = meta.autoBands;
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
                this.rescale = '';
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
            const params = { path: this.filePath };
            if (this.selectedPreset) params.preset = this.selectedPreset;
            if (this.selectedFormula) params.formula = this.selectedFormula;
            if (this.customBands && !this.selectedPreset && !this.selectedFormula) params.bands = this.customBands;
            if (this.selectedFormula && this.selectedColormap) params.colormap = this.selectedColormap;
            if (this.selectedFormula && this.rescale) params.rescale = this.rescale;

            try {
                this.exporting = true;
                // Submit a raster-export heavy task and wait for it to complete.
                const result = await this.runHeavyTask(this.dataset, 'raster-export', {
                    path: this.filePath,
                    params,
                    notify: false
                });

                // Download the produced GeoTIFF
                const blob = await this.dataset.taskResult(result.taskId);
                downloadBlob(blob, `${pathutils.stem(this.filePath) || 'export'}_export.tif`);
            } catch (e) {
                console.error('Export error:', e);
                this.$notify.error(e, { summary: 'Export Failed' });
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

            copyText(url.toString());
        },

        formatNum(val) {
            return formatNumber(val, 3);
        }
    }
};
</script>

<style scoped>
/* Shared look and palette: css/_analysis-panel.scss */


.single-band-info {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--panel-text-soft);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    line-height: 1.3;
}

.single-band-info i {
    color: var(--panel-info);
    margin-top: 0.1rem;
    flex-shrink: 0;
}

</style>
