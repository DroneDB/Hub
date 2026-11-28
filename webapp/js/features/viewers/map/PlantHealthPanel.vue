<template>
    <AnalysisPanel v-if="visible" variant="plant-health" class="plant-health-panel"
                   icon="fas fa-leaf" title="Plant Health" @close="close">
        <!-- The name of the sensor profile (the id as the title): a line under the title, as it is a fact of the raster and no setting -->
        <template v-if="rasterInfo && rasterInfo.detectedSensor" #subtitle>
            <span :title="rasterInfo.detectedSensor" data-testid="plant-health-sensor">{{ sensorLabel }}</span>
        </template>

        <div v-if="rasterInfo" class="panel-body">
            <!-- Preset Selection: the presets of the sensor, built from the bands the raster has -->
            <div v-if="presetList.length > 0" class="panel-row">
                <label for="plant-health-panel-preset" class="section-label">Preset</label>
                <select id="plant-health-panel-preset" v-model="selectedPreset" class="panel-select" @change="onPresetChange">
                    <option value="">Custom...</option>
                    <option v-for="p in presetList" :key="p.id" :value="p.id" :title="p.description">{{ p.name }}</option>
                </select>
            </div>

            <!-- Formula Selection: the guide button sits beside the label text, outside the label, so the select is not named after it.
                 Stacked: the label and its button on one line, and the select, the main control of the panel, at the whole width -->
            <div class="panel-row panel-row--stacked">
                <span class="section-label label-with-info">
                    <label for="plant-health-panel-formula">Formula</label>
                    <button type="button" class="info-icon-btn"
                            title="Learn more about each vegetation index" aria-label="Learn more about each vegetation index"
                            data-testid="plant-health-formulas-info"
                            @click="showFormulasInfo = true">
                        <i class="fas fa-info-circle" />
                    </button>
                </span>
                <!-- The id first, so that the closed select reads "NDVI – ..." even when the name is cut -->
                <select id="plant-health-panel-formula" v-model="selectedFormula" class="panel-select" data-testid="plant-health-formula"
                        :aria-describedby="disabledCount ? 'plant-health-panel-formula-hint' : undefined" @change="onFormulaChange">
                    <option value="">None (bands only)</option>
                    <option v-for="f in shownFormulas" :key="f.id" :value="f.id"
                            :disabled="f.disabled"
                            :title="f.disabled ? f.disabledReason : f.help">
                        {{ f.id }} – {{ f.name }}{{ f.disabled ? ' ✗' : '' }}
                    </option>
                </select>
            </div>
            <!-- A disabled option cannot take the focus: the reason of every one is in the guide, and a select reads this hint -->
            <p v-if="disabledCount" id="plant-health-panel-formula-hint" class="panel-row-note" data-testid="plant-health-formula-hint">
                ✗ {{ disabledCount === 1 ? '1 formula is' : `${disabledCount} formulas are` }} not available for this raster: it lacks
                the bands. The guide (<i class="fas fa-info-circle" />) lists the bands each one needs.
            </p>

            <!-- Band Mapping (when no formula) -->
            <div v-if="!selectedFormula && rasterInfo.bands && rasterInfo.bands.length > 3" class="panel-row panel-row--stacked">
                <span id="plant-health-panel-bands-label" class="section-label">Bands (R,G,B)</span>
                <BandSelector
                    v-model="customBands"
                    aria-labelledby="plant-health-panel-bands-label"
                    :bands="rasterInfo.bands"
                    @update:model-value="debouncedApply" />
            </div>

            <!-- The raster has not the bands the formula needs -->
            <div v-if="formulaRefused" class="section" role="alert" data-testid="plant-health-formula-error">
                <div class="single-band-info">
                    <i class="fas fa-exclamation-triangle" />
                    <span>This formula cannot be computed for this image.</span>
                </div>
            </div>

            <!-- Single band info message -->
            <div v-if="rasterInfo.bands && rasterInfo.bands.length === 1" class="section">
                <div class="single-band-info">
                    <i class="fas fa-info-circle" />
                    <span>Single band image. Use <strong>Merge Multispectral</strong> to combine bands for vegetation indices.</span>
                </div>
            </div>

            <!-- Colormap (when formula is active) -->
            <div v-if="selectedFormula" class="panel-row">
                <label id="plant-health-panel-colormap-label" for="plant-health-panel-colormap" class="section-label">Colors</label>
                <ColormapDropdown
                    v-model="selectedColormap"
                    input-id="plant-health-panel-colormap" aria-labelledby="plant-health-panel-colormap-label"
                    :colormaps="colormapOptions"
                    @update:model-value="debouncedApply" />
            </div>

            <!-- Stretch Type -->
            <div v-if="selectedFormula" class="panel-row">
                <label for="plant-health-panel-stretch" class="section-label">Stretch</label>
                <select id="plant-health-panel-stretch" v-model="selectedStretch" class="panel-select" @change="onStretchChange">
                    <option value="percentile">Percentile (2%-98%)</option>
                    <option value="minmax">Min / Max</option>
                    <option value="stddev">Std Dev (±2σ)</option>
                    <option value="custom">Custom</option>
                </select>
            </div>

            <!-- Rescale (when formula is active) -->
            <div v-if="selectedFormula" class="panel-row">
                <span id="plant-health-panel-rescale-label" class="section-label">Range</span>
                <!-- The same Min and Max fields as the raster panel; a bad range shows its error here and the layer keeps the last valid one -->
                <RescaleFields v-model="rescale" id-prefix="plant-health-panel-rescale" labelledby="plant-health-panel-rescale-label"
                               @commit="onRescaleManualChange" />
            </div>

            <!-- Histogram: right under the range it sets, no heading of its own -->
            <div v-if="histogramData" class="plant-health-histogram" role="group" aria-label="Histogram">
                <HistogramChart
                    :data="histogramData"
                    :min="histogramMin"
                    :max="histogramMax"
                    :colormap="selectedFormula ? selectedColormap : null"
                    :height="100"
                    @update:range="onHistogramRangeChange" />
                <p v-if="histogramNote" class="histogram-note" data-testid="plant-health-histogram-note">{{ histogramNote }}</p>
            </div>

            <!-- Statistics: one muted line. The formulas come with the raster info; only these wait for a pass over the
                 pixels of a raster that has none kept (a COG built before its build kept them) -->
            <div v-if="statisticsState === 'loading'" class="stats-line" data-testid="plant-health-stats-loading">
                <LoadingSpinner inline label="Reading the statistics of the raster…" />
            </div>
            <div v-else-if="statisticsState === 'failed'" class="stats-line statistics-failed" role="alert"
                 data-testid="plant-health-stats-failed">
                <span>The statistics could not be read: {{ statisticsError }}</span>
                <button type="button" class="panel-btn" data-testid="plant-health-stats-retry" @click="loadMetadata">Try again</button>
            </div>
            <p v-else-if="metadata && metadata.statistics" class="stats-line" data-testid="plant-health-stats">
                Min {{ formatNum(firstBandStats.min) }} · Max {{ formatNum(firstBandStats.max) }} · Mean {{ formatNum(firstBandStats.mean) }} · σ {{ formatNum(firstBandStats.stddev || firstBandStats.std) }}
            </p>
        </div>

        <div v-else-if="rasterInfoError" class="panel-body" role="alert" data-testid="plant-health-info-failed">
            <div class="single-band-info">
                <i class="fas fa-exclamation-triangle" />
                <span>The raster could not be read: {{ rasterInfoError }}</span>
            </div>
            <button type="button" class="panel-btn info-retry" @click="loadRasterInfo">Try again</button>
        </div>
        <div v-else class="panel-body loading">
            <LoadingSpinner inline label="Loading raster info..." />
        </div>
        <!-- Reset / Original / Link / Export: the foot of the panel, always in view -->
        <template v-if="rasterInfo" #actions>
            <div class="panel-footer-row">
                <StyleViewActions :original-view="originalView" reset-title="Reset visualization parameters to defaults"
                                  @reset="reset" @toggle-original="toggleOriginalView" />
                <button type="button" class="panel-btn footer-btn" title="Copy a shareable link with the current settings"
                        aria-label="Copy a shareable link with the current settings" @click="copyLink">
                    <i class="fas fa-link" />
                    <span class="footer-label">Link</span>
                </button>

                <!-- The one export control: the styled image as a task, or the visible extent -->
                <RasterExportButton :dataset="dataset" :file-path="filePath" :viz-params="vizParams()" :bbox="visibleBbox" />
            </div>
        </template>

        <PlantHealthFormulasDialog v-model:visible="showFormulasInfo"
                                   :formulas="shownFormulas" />
    </AnalysisPanel>
</template>

<script>
import AnalysisPanel from './AnalysisPanel.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import HistogramChart from '@/features/viewers/map/HistogramChart.vue';
import ColormapDropdown from '@/features/viewers/map/ColormapDropdown.vue';
import { colormap, INDEX_COLORMAPS } from '@/libs/map/colormaps';
import BandSelector from '@/features/viewers/map/BandSelector.vue';
import PlantHealthFormulasDialog from './PlantHealthFormulasDialog.vue';
import RescaleFields from './RescaleFields.vue';
import StyleViewActions from './StyleViewActions.vue';
import RasterExportButton from './RasterExportButton.vue';
import { copyLinkWithNotice } from '@/composables/useCopyText';
import { encodeVizParamsHash } from '@/libs/map/vizParamsHash';
import { formatNumber } from '@/libs/format';
import { machineRange } from '@/libs/rescale';
import { shownHistogram } from '@/libs/map/histogramRange';
import { defaultVizParams } from '@/libs/map/defaultVizParams';
import { useTimerGroup } from '@/composables/useTimers';
import { replaceHash } from '@/libs/routeQuery';

/**
 * The "min,max" of a range, '' when either end is not a number (the statistics could not be read) or the ends are equal
 * (the server refuses a range with no width).
 * @param {any} min @param {any} max
 */
function rescaleOf(min, max) {
    const lo = typeof min === 'number' || (typeof min === 'string' && min.trim() !== '') ? Number(min) : NaN;
    const hi = typeof max === 'number' || (typeof max === 'string' && max.trim() !== '') ? Number(max) : NaN;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo.toFixed(3) === hi.toFixed(3)) return '';
    return `${lo.toFixed(3)},${hi.toFixed(3)}`;
}

/**
 * PlantHealthPanel - Plant health (NDVI / custom index) analysis panel.
 *
 * Renders a live-updating raster overlay computed from configurable band
 * expressions. Includes band selector, colormap picker, histogram
 * rescaling, and copy-link functionality.
 */
export default {
    components: { AnalysisPanel, HistogramChart, ColormapDropdown, BandSelector, PlantHealthFormulasDialog, LoadingSpinner, RescaleFields, StyleViewActions, RasterExportButton },
    props: {
        visible: { type: Boolean, default: false },
        dataset: { type: Object, default: null },
        filePath: { type: String, default: null },
        initialParams: { type: Object, default: null },
        // The visible extent of the map in WGS 84 (minLon, minLat, maxLon, maxLat), for 'Export visible extent'
        visibleBbox: { type: Array, default: null },
        // The tiles of the formula chosen failed to load: the raster cannot compute it
        formulaError: { type: Boolean, default: false }
    },

    emits: ['close', 'vizParamsChanged'],

    setup() {
        return { applyLater: useTimerGroup() };
    },
    data() {
        return {
            rasterInfo: null,
            // Why the raster info could not be read, '' while it loads or once it is read
            rasterInfoError: '',
            metadata: null,
            // The statistics (and histogram) of the raster or of the formula: 'loading', 'ready' or 'failed'
            // (statisticsError says why)
            statisticsState: 'ready',
            statisticsError: '',
            selectedPreset: '',
            selectedFormula: '',
            customBands: '',
            selectedColormap: 'rdylgn',
            selectedStretch: 'percentile',
            rescale: '',
            // The default stretch of the selected index, ddb's: { formula, rescale } from the value info read
            // with the formula, null until it is read or when it has none
            indexStretch: null,
            availableFormulas: [],
            // Ids, or { id, name } from the raster metadata
            availableColormaps: INDEX_COLORMAPS,
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
        firstBandStats() {
            if (!this.metadata || !this.metadata.statistics) return {};
            const stats = this.metadata.statistics;
            // Statistics may be keyed by band number ("1") or flat
            if (stats['1']) return stats['1'];
            return stats;
        },
        // The name of the sensor profile; the id written as a name for a server that does not send one
        sensorLabel() {
            const info = this.rasterInfo;
            if (!info || !info.detectedSensor) return '';
            if (info.detectedSensorName) return info.detectedSensorName;
            return String(info.detectedSensor).replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
        },
        // The presets of the sensor, as the server builds them from the bands of the raster
        presetList() {
            const info = this.rasterInfo;
            const list = info && (Array.isArray(info.availablePresets) ? info.availablePresets : info.presets);
            return Array.isArray(list) ? list : [];
        },
        // The formulas offered, by the structured category of ddb: the thermal formulas when the
        // raster can compute one, the reflectance ones (rgb, multispectral) when it can compute one, so a raster of both
        // kinds (MicaSense Altum, Landsat with its thermal band) lists both; a raster that can compute none lists the
        // reflectance ones, disabled with their reason. The one chosen shows whatever it is
        shownFormulas() {
            const all = this.availableFormulas;
            if (!all.some(f => f.category)) return all;
            const isThermal = f => f.category === 'thermal';
            const thermal = all.some(f => isThermal(f) && !f.disabled);
            const reflectance = all.some(f => !isThermal(f) && !f.disabled);
            const shown = f => (isThermal(f) ? thermal : reflectance || !thermal);
            return all.filter(f => shown(f) || f.id === this.selectedFormula);
        },
        // The chosen formula cannot be computed for this raster: its metadata says so (disabled), and only a
        // formula the metadata does not list falls back to the tiles of the layer (formulaError: none of its tiles
        // loaded). A formula the metadata enables is never refused for failed tiles (a timeout, a 5xx, a lost session)
        formulaRefused() {
            if (!this.selectedFormula) return false;
            const f = this.availableFormulas.find(x => x.id === this.selectedFormula);
            return f ? !!f.disabled : this.formulaError;
        },
        disabledCount() {
            return this.shownFormulas.filter(f => f.disabled).length;
        },
        // The [min, max] the selected formula can give (NDVI: -1 to 1), null when it has none
        formulaRange() {
            const f = this.availableFormulas.find(x => x.id === this.selectedFormula);
            return f && Array.isArray(f.range) ? f.range : null;
        },
        // The histogram without the outliers that would crush it into a bar or two
        shownHistogram() {
            const s = this.firstBandStats;
            return s && s.histogram ? shownHistogram(s.histogram, s, this.formulaRange) : null;
        },
        histogramData() {
            return this.shownHistogram ? this.shownHistogram.histogram : null;
        },
        // Why the histogram shows only part of the values. Values are outliers only when they are outside the range the index
        // can have (NDVI: -1 to 1); an index inside its own range gets no note. The numbers have the precision of
        // the values of an index
        histogramNote() {
            const shown = this.shownHistogram;
            if (!shown || !shown.trimmed) return '';
            const s = this.firstBandStats;
            const range = this.formulaRange;
            const [lo, hi] = shown.domain.map(v => this.formatNum(v));
            const outside = !!range && (s.min < range[0] || s.max > range[1]);
            if (range && !outside) return '';
            const span = `the values go from ${this.formatNum(s.min)} to ${this.formatNum(s.max)}`;
            if (outside) {
                // Values outside the histogram shown: say where they go
                return shown.bars
                    ? `Outliers: ${span}. The histogram shows ${lo} to ${hi}.`
                    : `Outliers: ${span}, so the histogram cannot be drawn between ${lo} and ${hi}. Drag the handles to set the range.`;
            }
            // An index with no range of its own: no value can be called an outlier
            return shown.bars
                ? `The histogram shows the central part, ${lo} to ${hi}; ${span}.`
                : `The histogram cannot be drawn between ${lo} and ${hi}; ${span}. Drag the handles to set the range.`;
        },
        // The "min,max" of ddb's default stretch of the selected index, '' until it is read or without one
        indexRescale() {
            const known = this.indexStretch;
            return known && known.formula === this.selectedFormula && known.path === this.filePath ? known.rescale : '';
        },
        // The default stretch of the index (ddb's 2%-98% range inside the formula's range); min / max without it
        percentileStretch() {
            const stretch = this.indexRescale ? this.indexRescale.split(',').map(Number) : null;
            if (stretch && stretch.length === 2 && stretch.every(v => Number.isFinite(v))) return stretch;
            const s = this.firstBandStats;
            return [s ? (s.min || 0) : 0, s ? (s.max || 1) : 1];
        },
        stretchRange() {
            const s = this.firstBandStats;
            const fallback = [s ? (s.min || 0) : 0, s ? (s.max || 1) : 1];
            if (!s) return fallback;

            switch (this.selectedStretch) {
                case 'percentile':
                    return this.percentileStretch;
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
                        // The machine value "min,max" (libs/rescale.js)
                        const range = machineRange(this.rescale);
                        if (range) return [range.min, range.max];
                    }
                    break;
            }
            // Default: percentile if available, else min/max
            return this.percentileStretch;
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
                // The style, the formulas and the stretch of the raster before belong to it: the next edit would write them
                // over this one
                this.clearStyle();
                this.indexStretch = null;
                this.availableFormulas = [];
                this.availableColormaps = INDEX_COLORMAPS;
                if (val) this.loadRasterInfo();
            },
            immediate: true
        }
    },

    methods: {
        async loadRasterInfo() {
            const path = this.filePath;
            if (!path || !this.dataset) return;

            // Nothing of the raster before stays shown while this one is read
            this.rasterInfo = null;
            this.rasterInfoError = '';
            this.metadata = null;
            try {
                const info = await this.dataset.getRasterInfo(path);
                if (path !== this.filePath) return; // another raster was chosen meanwhile
                this.rasterInfo = info;
            } catch (e) {
                console.error('Failed to load raster info:', e);
                if (path === this.filePath) this.rasterInfoError = e?.message || 'unknown error';
                return;
            }
            this.takeStyleChoices(this.rasterInfo);

            // The style of the link or the layer (from the URL hash)
            const initial = this.initialParams && !this._initialParamsApplied ? this.initialParams : null;
            if (initial) {
                this._initialParamsApplied = true;
                if (initial.preset) this.selectedPreset = initial.preset;
                if (initial.formula) this.selectedFormula = initial.formula;
                if (initial.bands) this.customBands = initial.bands;
                if (initial.colormap) this.selectedColormap = initial.colormap;
                if (initial.rescale) this.rescale = initial.rescale;
                if (initial.stretch) this.selectedStretch = initial.stretch;
            }
            // The statistics of the formula of the link (a bounded read), else of the bands
            await this.loadFormulaData();
            if (initial) {
                // The range of the link or the layer is the user's: only a style without one takes the default
                if (!initial.rescale) this.computeRescaleFromStretch();
                this.apply();
            }
        },

        // The formulas, the colormaps and the bands found for them, from the raster info (or the metadata of a server
        // that sends them only there)
        takeStyleChoices(doc) {
            if (!doc) return;
            if (Array.isArray(doc.algorithms)) this.availableFormulas = doc.algorithms;
            if (Array.isArray(doc.colormaps)) this.availableColormaps = doc.colormaps;
            if (doc.autoBands && typeof doc.autoBands === 'string') this.customBands = doc.autoBands;
        },

        // The statistics and histogram of the selected formula (a bounded read), or of every band of the raster (a pass
        // over its pixels when it has none kept)
        async loadMetadata() {
            const path = this.filePath;
            const formula = this.selectedFormula;
            if (!path || !this.dataset) return;
            this.statisticsState = 'loading';
            this.statisticsError = '';
            try {
                const meta = await this.dataset.getRasterMetadata(path, formula || undefined);
                // Another raster or formula was chosen while it was read
                if (path !== this.filePath || formula !== this.selectedFormula) return;
                this.metadata = meta;
                if (!this.availableFormulas.length) this.takeStyleChoices(meta);
                this.statisticsState = 'ready';
            } catch (e) {
                console.error('Failed to load the raster metadata:', e);
                if (path !== this.filePath || formula !== this.selectedFormula) return;
                this.statisticsState = 'failed';
                this.statisticsError = e?.message || 'unknown error';
            }
        },

        async onPresetChange() {
            const preset = this.presetList.find(p => p.id === this.selectedPreset);
            if (preset && preset.type === 'index' && preset.formula) {
                // An index preset is its formula and colormap
                this.selectedFormula = preset.formula;
                if (preset.colormap) this.selectedColormap = preset.colormap;
                await this.onFormulaChange();
                return;
            }
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
            await this.loadFormulaData();
            this.computeRescaleFromStretch();
            this.apply();
        },

        // The statistics and histogram of the selected index (or of the raster without one), and its default stretch
        async loadFormulaData() {
            await Promise.all([this.loadMetadata(), this.loadIndexStretch()]);
        },

        // The default stretch of the selected index comes from ddb, read with the formula: the Hub
        // computes none
        async loadIndexStretch() {
            const formula = this.selectedFormula;
            const path = this.filePath;
            if (!formula || !path || !this.dataset) {
                this.indexStretch = null;
                return;
            }
            if (this.indexRescale) return;
            try {
                const info = await this.dataset.getRasterValueInfo(path, { formula });
                // Another index or raster was chosen while the info was read
                if (formula !== this.selectedFormula || path !== this.filePath) return;
                const { rescale } = defaultVizParams(info, { index: true });
                this.indexStretch = rescale ? { formula, path, rescale } : null;
            } catch (e) {
                console.error('Failed to load the default stretch of the index:', e);
                if (formula === this.selectedFormula && path === this.filePath) this.indexStretch = null;
            }
        },

        // The style of the panel: what the layer, the export and the link carry
        vizParams() {
            const params = {};
            if (this.selectedPreset) params.preset = this.selectedPreset;
            if (this.selectedFormula) params.formula = this.selectedFormula;
            if (this.customBands && !this.selectedPreset && !this.selectedFormula) params.bands = this.customBands;
            if (this.selectedFormula && this.selectedColormap) params.colormap = this.selectedColormap;
            if (this.selectedFormula && this.rescale) params.rescale = this.rescale;
            if (this.selectedFormula && this.selectedStretch) params.stretch = this.selectedStretch;
            return params;
        },

        apply() {
            this.originalView = false; // Any param change exits original view
            this.$emit('vizParamsChanged', this.vizParams());
        },

        debouncedApply() {
            this.applyLater.clear();
            this.applyLater(() => this.apply(), 300);
        },

        // The style fields as they are for a raster nobody has styled
        clearStyle() {
            this.selectedPreset = '';
            this.selectedFormula = '';
            this.customBands = '';
            this.selectedColormap = 'rdylgn';
            this.selectedStretch = 'percentile';
            this.rescale = '';
            this.originalView = false;
        },

        async reset() {
            this.clearStyle();
            this.$emit('vizParamsChanged', {});

            // The statistics of the bands again, and the bands the raster info found for the formulas
            this.takeStyleChoices(this.rasterInfo);
            await this.loadMetadata();
        },

        // Closing the panel keeps the layer's style: only an edit or Reset changes it
        close() {
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
                // ddb's default stretch of the index; the range of the values when the value info has none
                this.rescale = this.indexRescale || rescaleOf(s.min, s.max);
            } else if (this.selectedStretch === 'minmax') {
                this.rescale = rescaleOf(s.min, s.max);
            } else if (this.selectedStretch === 'stddev') {
                const std = s.stddev || s.std || 0;
                const mean = s.mean || 0;
                this.rescale = rescaleOf(mean - 2 * std, mean + 2 * std);
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

        async copyLink() {
            // Into the address bar, keeping the router's history state: the router's next
            // navigation would otherwise write back the address of its last one over this entry
            replaceHash(encodeVizParamsHash(this.filePath, this.vizParams()));
            await copyLinkWithNotice(window.location.href, this.$notify, 'Plant Health');
        },

        // A value of the index, with the decimals of the shared precision table
        formatNum(val) {
            return formatNumber(val, 'value');
        }
    }
};
</script>

<style scoped>
/* Shared look and palette: css/_analysis-panel.scss */


.histogram-note {
    margin: 1.1rem 0 0;
    font-size: 0.7rem;
    line-height: 1.3;
    color: var(--panel-text-soft);
}

.plant-health-histogram {
    margin: 0.25rem 0 0.5rem;
}

.stats-line {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    color: var(--panel-muted);
}

.single-band-info {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--panel-text-soft);
    background: rgba(var(--ddb-glass-rgb), 0.05);
    border: 1px solid rgba(var(--ddb-glass-rgb), 0.1);
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    line-height: 1.3;
}

.statistics-failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    color: var(--panel-text-soft);
}

.info-retry {
    margin-top: 0.5rem;
}

.single-band-info i {
    color: var(--panel-info);
    margin-top: 0.1rem;
    flex-shrink: 0;
}

</style>
