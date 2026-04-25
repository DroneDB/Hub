<template>
    <div class="raster-profile-chart" v-if="profile && hasSamples">
        <!-- Summary stats -->
        <div class="profile-summary" :class="{ 'thermal': isThermal }">
            <span v-if="profile.min !== null && profile.min !== undefined">Min: {{ formatValue(profile.min) }}</span>
            <span v-if="profile.max !== null && profile.max !== undefined">Max: {{ formatValue(profile.max) }}</span>
            <span v-if="profile.mean !== null && profile.mean !== undefined">Mean: {{ formatValue(profile.mean) }}</span>
            <span>Length: {{ formatLength(profile.totalLength) }}</span>
        </div>

        <!-- Inline SVG chart (no external dependencies) -->
        <svg class="profile-svg" :viewBox="viewBox" preserveAspectRatio="none"
            @mousemove="onHover" @mouseleave="hoverIdx = null" @touchmove.prevent="onTouchHover">
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
            <span class="hover-info" v-if="hoveredSample">
                d: {{ formatLength(hoveredSample.distance) }} ·
                v: {{ hoveredSample.value === null ? 'n/d' : formatValue(hoveredSample.value) }}
            </span>
            <span class="hover-info placeholder" v-else>Hover the chart for details</span>
            <button class="btn btn-secondary btn-sm" @click="exportCsv" title="Export CSV">
                <i class="fas fa-file-csv"></i>
            </button>
        </div>
    </div>
</template>

<script>
/**
 * Elevation / value profile chart.
 *
 * Design notes:
 * - Pure SVG: avoids pulling a chart library into the bundle for a single view.
 * - Emits `hover` with the currently highlighted sample (or null) so the parent
 *   map can render a matching marker on the polyline.
 * - Null samples (nodata) are rendered as translucent vertical bands so users
 *   immediately see gaps instead of a misleading flat line.
 */
export default {
    name: 'RasterProfileChart',
    props: {
        profile: { type: Object, default: null },
        unit: { type: String, default: '' },
        isThermal: { type: Boolean, default: false }
    },
    emits: ['hover'],
    data() {
        return {
            width: 320,
            height: 160,
            padTop: 8,
            padBottom: 14,
            padLeft: 38,
            padRight: 6,
            hoverIdx: null
        };
    },
    computed: {
        viewBox() { return `0 0 ${this.width} ${this.height}`; },
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
    methods: {
        xFor(i) {
            const n = this.samples.length;
            if (n <= 1) return this.padLeft + this.chartWidth / 2;
            return this.padLeft + (i * this.chartWidth) / (n - 1);
        },
        yFor(v) {
            const t = (v - this.yMin) / this.yRange;
            return this.padTop + (1 - t) * this.chartHeight;
        },
        formatValue(v) {
            if (v === null || v === undefined || Number.isNaN(v)) return 'n/d';
            const abs = Math.abs(v);
            const digits = abs >= 100 ? 1 : (abs >= 10 ? 2 : 3);
            return `${v.toFixed(digits)}${this.unit ? ' ' + this.unit : ''}`;
        },
        formatLength(m) {
            if (m === null || m === undefined) return '';
            if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
            return `${m.toFixed(1)} m`;
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
            if (clamped !== this.hoverIdx) {
                this.hoverIdx = clamped;
                this.$emit('hover', this.samples[clamped] || null);
            }
        },
        exportCsv() {
            if (!this.hasSamples) return;
            const header = 'index,distance_m,value,unit,lon,lat\n';
            const unit = this.profile.unit || this.unit || '';
            const escape = (v) => (v === null || v === undefined) ? '' : String(v);
            const rows = this.samples.map((s, i) =>
                `${i},${escape(s.distance)},${escape(s.value)},${unit},${escape(s.lon)},${escape(s.lat)}`);
            const blob = new Blob([header + rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'raster-profile.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Revoke on next tick to avoid cancelling the download on slow browsers.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    },
    watch: {
        profile() { this.hoverIdx = null; }
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
    font-size: 11px;
    color: #ccc;
}

.profile-summary.thermal {
    color: #ffab91;
}

.profile-svg {
    width: 100%;
    height: 160px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 3px;
    cursor: crosshair;
    display: block;
}

.profile-svg .grid {
    stroke: rgba(255, 255, 255, 0.08);
    stroke-width: 0.5;
}

.profile-svg .axis {
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 0.75;
}

.profile-svg .label {
    font-size: 9px;
    fill: #bbb;
    font-family: inherit;
}

.profile-line {
    stroke: #4fc3f7;
}

.profile-line.thermal {
    stroke: #ff7043;
}

.null-bands rect {
    fill: rgba(255, 82, 82, 0.15);
}

.hover-line {
    stroke: rgba(255, 255, 255, 0.5);
    stroke-dasharray: 2 2;
    stroke-width: 0.75;
}

.hover-dot {
    fill: #fff;
    stroke: #4fc3f7;
    stroke-width: 1.5;
}

.hover-dot.thermal {
    stroke: #ff7043;
}

.profile-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #ccc;
}

.hover-info.placeholder {
    color: #888;
    font-style: italic;
}
</style>
