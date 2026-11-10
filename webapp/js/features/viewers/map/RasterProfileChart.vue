<template>
    <div v-if="profile && hasSamples" class="raster-profile-chart" :class="{ expanded }">
        <!-- Summary stats -->
        <div class="profile-summary" :class="{ 'thermal': isThermal }">
            <span v-if="profile.min !== null && profile.min !== undefined">Min: {{ formatValue(profile.min) }}</span>
            <span v-if="profile.max !== null && profile.max !== undefined">Max: {{ formatValue(profile.max) }}</span>
            <span v-if="profile.mean !== null && profile.mean !== undefined">Mean: {{ formatValue(profile.mean) }}</span>
            <span>Length: {{ formatLength(profile.totalLength) }}</span>
        </div>

        <!-- Inline SVG chart (no external dependencies) -->
        <!-- A scrubber over the samples: the pointer or the arrow keys pick one -->
        <svg :ref="observeWidth" class="profile-svg" :viewBox="viewBox" preserveAspectRatio="none"
             role="slider" tabindex="0" aria-label="Profile position"
             :aria-valuemin="0" :aria-valuemax="samples.length - 1" :aria-valuenow="hoverIdx ?? 0"
             :aria-valuetext="hoverText"
             @mousemove="onHover" @mouseleave="setHover(null)" @touchmove.prevent="onTouchHover"
             @focus="hoverIdx === null && setHover(0)" @blur="setHover(null)" @keydown="onKey">
            <!-- Axis grid lines (5 horizontal bands) -->
            <g class="grid">
                <line v-for="i in 4" :key="'h' + i"
                      :x1="padLeft" :x2="width - padRight"
                      :y1="padTop + (i * chartHeight) / 5"
                      :y2="padTop + (i * chartHeight) / 5" />
            </g>

            <!-- Profile polyline -->
            <polyline class="profile-line" :class="{ 'thermal': isThermal }"
                      :points="polyPoints" fill="none" stroke-width="1.5" />

            <!-- Invalid-sample markers (null values, e.g. nodata) -->
            <g v-if="nullBands.length" class="null-bands">
                <rect v-for="(band, i) in nullBands" :key="'n' + i"
                      :x="band.x" :y="padTop" :width="band.w" :height="chartHeight" />
            </g>

            <!-- Axes -->
            <line class="axis" :x1="padLeft" :y1="padTop" :x2="padLeft" :y2="height - padBottom" />
            <line class="axis" :x1="padLeft" :y1="height - padBottom" :x2="width - padRight" :y2="height - padBottom" />

            <!-- Y labels -->
            <text class="label" :x="padLeft - 4" :y="padTop + 4" text-anchor="end">{{ formatValue(yMax) }}</text>
            <text class="label" :x="padLeft - 4" :y="height - padBottom" text-anchor="end">{{ formatValue(yMin) }}</text>
            <!-- X labels -->
            <text class="label" :x="padLeft" :y="height - 2">0</text>
            <text class="label" :x="width - padRight" :y="height - 2" text-anchor="end">
                {{ formatLength(profile.totalLength) }}
            </text>

            <!-- Hover marker -->
            <g v-if="hoverIdx !== null && hoveredSample">
                <line class="hover-line" :x1="hoverX" :x2="hoverX" :y1="padTop" :y2="height - padBottom" />
                <circle v-if="hoveredSample.value !== null"
                        class="hover-dot" :class="{ 'thermal': isThermal }"
                        :cx="hoverX" :cy="hoverY" r="3" />
            </g>
        </svg>

        <!-- Tooltip + CSV export -->
        <div class="profile-actions">
            <span v-if="hoveredSample" class="hover-info">{{ hoverText }}</span>
            <span v-else class="hover-info placeholder">Hover or focus the chart for details</span>
            <span class="profile-buttons">
                <button v-if="expandable" class="panel-btn" title="Show the chart larger" aria-label="Expand the chart" @click="expandedOpen = true">
                    <i class="fas fa-expand" aria-hidden="true" />
                </button>
                <button class="panel-btn" title="Export CSV" aria-label="Export CSV" @click="exportCsv">
                    <i class="fas fa-file-csv" aria-hidden="true" />
                </button>
            </span>
        </div>

        <!-- The same chart in a window of the wide size, 40vh high (FR-RAS-35); the panel's colours come with the
             classes of the panel, the window is outside it -->
        <Window v-if="expandedOpen" id="raster-profile-expanded" :title="title" modal size-class="dialog-wide" close-button
                @close="expandedOpen = false">
            <div class="profile-expanded analysis-panel analysis-panel--raster">
                <RasterProfileChart :profile="profile" :unit="unit" :is-thermal="isThermal" :expandable="false" expanded
                                    @active-sample="sample => $emit('activeSample', sample)" />
            </div>
        </Window>
    </div>
</template>

<script>
import { downloadCsv, toCsv } from '@/libs/csv';
import { formatLength } from '@/libs/format';
import { rasterValueParts } from '@/libs/map/rasterUnit';
import { usePreference } from '@/composables/usePreference';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import Window from '@/components/HubWindow.vue';

// The y labels: the width of a character at the label font and the gap between a label and the axis
const LABEL_CHAR_WIDTH = 6.5;
const LABEL_GAP = 4;
const MIN_PAD_LEFT = 32;

/**
 * Elevation / value profile chart.
 *
 * Design notes:
 * - Pure SVG: avoids pulling a chart library into the bundle for a single view.
 * - Emits `hover` with the currently highlighted sample (or null) so the parent
 *   map can render a matching marker on the polyline.
 * - Null samples (nodata) are rendered as translucent vertical bands so users
 *   immediately see gaps instead of a misleading flat line.
 * - Distances are in the user's units, as the map's measurements; values in the raster's unit.
 */
export default {
    name: 'RasterProfileChart',
    components: { Window },
    props: {
        profile: { type: Object, default: null },
        unit: { type: String, default: '' },
        isThermal: { type: Boolean, default: false },
        /** Show the Expand button, which opens the chart in a larger window */
        expandable: { type: Boolean, default: true },
        /** The chart of the larger window: 40vh high instead of 160 px */
        expanded: { type: Boolean, default: false }
    },
    emits: ['activeSample'],
    setup() {
        return { measureUnit: usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]) };
    },
    data() {
        return {
            // The drawing's size: the chart's own, once measured (a phone's bottom sheet, the desktop panel and the
            // larger window differ), so the text and the line keep their proportions. The paddings leave room for the
            // axis text, 12px (FR-RAS-35)
            width: 320,
            height: 160,
            padTop: 12,
            padBottom: 20,
            padRight: 8,
            hoverIdx: null,
            expandedOpen: false
        };
    },
    computed: {
        viewBox() { return `0 0 ${this.width} ${this.height}`; },
        title() { return this.isThermal ? 'Thermal Profile' : 'Value Profile'; },
        // The room of the y labels: the longest of them at the label font (12px: about 6.5 px a character), so a value with its
        // unit is never cut (FR-RAS-08)
        padLeft() {
            const chars = Math.max(...[this.yMin, this.yMax].map(v => this.formatValue(v).length));
            return Math.max(MIN_PAD_LEFT, Math.ceil(chars * LABEL_CHAR_WIDTH) + LABEL_GAP + 4);
        },
        chartWidth() { return this.width - this.padLeft - this.padRight; },
        chartHeight() { return this.height - this.padTop - this.padBottom; },
        samples() { return (this.profile && this.profile.samples) || []; },
        hasSamples() { return this.samples.length > 0; },
        validSamples() {
            return this.samples.filter(s => s && s.value !== null && s.value !== undefined);
        },
        yMin() {
            if (this.profile && this.profile.min !== null && this.profile.min !== undefined) return this.profile.min;
            if (!this.validSamples.length) return 0;
            return Math.min(...this.validSamples.map(s => s.value));
        },
        yMax() {
            if (this.profile && this.profile.max !== null && this.profile.max !== undefined) return this.profile.max;
            if (!this.validSamples.length) return 1;
            return Math.max(...this.validSamples.map(s => s.value));
        },
        yRange() {
            const r = this.yMax - this.yMin;
            return r === 0 ? 1 : r;
        },
        polyPoints() {
            if (!this.hasSamples) return '';
            // Break the polyline into separate segments across null values.
            const segs = [];
            let current = [];
            this.samples.forEach((s, i) => {
                if (s.value === null || s.value === undefined) {
                    if (current.length) { segs.push(current); current = []; }
                    return;
                }
                current.push(`${this.xFor(i)},${this.yFor(s.value)}`);
            });
            if (current.length) segs.push(current);
            // Render each segment as its own polyline via space-separated "M" using whitespace.
            // For a single <polyline>, glue them with a tiny trick: duplicate endpoint with a
            // fill-none stroke, acceptable given the chart's density.
            return segs.map(s => s.join(' ')).join(' ');
        },
        nullBands() {
            // Group consecutive null samples into visual bands.
            const bands = [];
            let startIdx = null;
            this.samples.forEach((s, i) => {
                const isNull = s.value === null || s.value === undefined;
                if (isNull && startIdx === null) startIdx = i;
                if (!isNull && startIdx !== null) {
                    bands.push({ x: this.xFor(startIdx), w: Math.max(1, this.xFor(i) - this.xFor(startIdx)) });
                    startIdx = null;
                }
            });
            if (startIdx !== null) {
                bands.push({ x: this.xFor(startIdx), w: Math.max(1, this.xFor(this.samples.length - 1) - this.xFor(startIdx)) });
            }
            return bands;
        },
        hoverText() {
            const h = this.hoveredSample;
            if (!h) return '';
            return `d: ${this.formatLength(h.distance)} · v: ${h.value === null ? 'n/d' : this.formatValue(h.value)}`;
        },
        hoveredSample() {
            if (this.hoverIdx === null) return null;
            return this.samples[this.hoverIdx] || null;
        },
        hoverX() {
            return this.hoverIdx !== null ? this.xFor(this.hoverIdx) : 0;
        },
        hoverY() {
            if (!this.hoveredSample || this.hoveredSample.value === null) return this.padTop;
            return this.yFor(this.hoveredSample.value);
        }
    },
    watch: {
        profile() { this.hoverIdx = null; }
    },
    beforeUnmount() {
        this.observeWidth(null);
        // A chart that goes (the expanded window closes) while it shows a hover: the map marker goes with it
        if (this.hoverIdx !== null) this.$emit('activeSample', null);
    },
    methods: {
        // Ref of the chart: follows its size for as long as it is shown (called on every render)
        observeWidth(el) {
            if (el === this.observedEl) return;
            if (this.resizeObserver) this.resizeObserver.disconnect();
            this.resizeObserver = null;
            this.observedEl = el;
            if (!el || typeof ResizeObserver === 'undefined') return;
            this.resizeObserver = new ResizeObserver(([entry]) => {
                const width = Math.round(entry.contentRect.width);
                const height = Math.round(entry.contentRect.height);
                if (width > 0) this.width = width;
                if (height > 0) this.height = height;
            });
            this.resizeObserver.observe(el);
        },
        xFor(i) {
            const n = this.samples.length;
            if (n <= 1) return this.padLeft + this.chartWidth / 2;
            return this.padLeft + (i * this.chartWidth) / (n - 1);
        },
        yFor(v) {
            const t = (v - this.yMin) / this.yRange;
            return this.padTop + (1 - t) * this.chartHeight;
        },
        // The value with its unit, as every raster value is written (FR-RAS-28)
        formatValue(v) {
            return rasterValueParts(v, this.unit, { placeholder: 'n/d' }).text;
        },
        formatLength(m) {
            if (m === null || m === undefined) return '';
            return formatLength(m, this.measureUnit);
        },
        onHover(evt) {
            const svg = evt.currentTarget;
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            this.updateHoverFromClientX(evt.clientX, rect);
        },
        onTouchHover(evt) {
            if (!evt.touches || !evt.touches.length) return;
            const svg = evt.currentTarget;
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            this.updateHoverFromClientX(evt.touches[0].clientX, rect);
        },
        updateHoverFromClientX(clientX, rect) {
            if (!rect || rect.width === 0 || !this.samples.length) return;
            // Translate client X into viewBox coordinate space.
            const vbX = ((clientX - rect.left) / rect.width) * this.width;
            const pxFromLeft = Math.max(0, Math.min(this.chartWidth, vbX - this.padLeft));
            const n = this.samples.length;
            const idx = n <= 1 ? 0 : Math.round((pxFromLeft / this.chartWidth) * (n - 1));
            const clamped = Math.max(0, Math.min(n - 1, idx));
            this.setHover(clamped);
        },
        // The map marker follows the chart: null removes it
        setHover(idx) {
            if (idx === this.hoverIdx) return;
            this.hoverIdx = idx;
            this.$emit('activeSample', idx === null ? null : this.samples[idx] || null);
        },
        // Arrows step one sample (ten with Shift), Home/End go to the ends
        onKey(e) {
            const n = this.samples.length;
            if (!n) return;
            const cur = this.hoverIdx ?? 0;
            const step = e.shiftKey ? 10 : 1;
            const targets = { ArrowLeft: cur - step, ArrowDown: cur - step, ArrowRight: cur + step, ArrowUp: cur + step, Home: 0, End: n - 1 };
            if (!(e.key in targets)) return;
            e.preventDefault();
            this.setHover(Math.max(0, Math.min(n - 1, targets[e.key])));
        },
        exportCsv() {
            if (!this.hasSamples) return;
            const unit = this.profile.unit || this.unit || '';
            const rows = this.samples.map((s, i) => [i, s.distance, s.value, unit, s.lon, s.lat]);
            downloadCsv(toCsv(['index', 'distance_m', 'value', 'unit', 'lon', 'lat'], rows), 'raster-profile.csv');
        }
    }
};
</script>

<style scoped>
.raster-profile-chart {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.profile-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--panel-text-soft);
}

.profile-summary.thermal {
    color: var(--panel-thermal-soft);
}

.profile-svg {
    width: 100%;
    height: 160px;
    background: rgba(var(--ddb-glass-rgb), 0.03);
    border-radius: 3px;
    cursor: crosshair;
    display: block;
}

.profile-svg:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: 1px;
}

.profile-svg .grid {
    stroke: rgba(var(--ddb-glass-rgb), 0.08);
    stroke-width: 0.5;
}

.profile-svg .axis {
    stroke: rgba(var(--ddb-glass-rgb), 0.25);
    stroke-width: 0.75;
}

.profile-svg .label {
    font-size: 0.75rem;
    fill: var(--panel-text-soft);
    font-family: inherit;
}

.profile-line {
    stroke: var(--panel-accent);
}

.profile-line.thermal {
    stroke: var(--panel-thermal-strong);
}

.null-bands rect {
    fill: rgba(var(--panel-danger-rgb), 0.15);
}

.hover-line {
    stroke: rgba(var(--ddb-glass-rgb), 0.5);
    stroke-dasharray: 2 2;
    stroke-width: 0.75;
}

.hover-dot {
    fill: var(--ddb-text-on-dark);
    stroke: var(--panel-accent);
    stroke-width: 1.5;
}

.hover-dot.thermal {
    stroke: var(--panel-thermal-strong);
}

.raster-profile-chart.expanded .profile-svg {
    height: 40vh;
}

.profile-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--panel-text-soft);
}

.profile-buttons {
    display: inline-flex;
    gap: 0.25rem;
    flex-shrink: 0;
}

/* The panel's colours in a window: the classes of the panel, without its place on the map */
.profile-expanded {
    position: static;
    width: auto;
    max-height: none;
    overflow: visible;
    padding: 0.75rem;
}

.hover-info.placeholder {
    color: var(--panel-text-faint);
    font-style: italic;
}
</style>
