<template>
    <div ref="container" class="histogram-chart">
        <Chart type="bar" :data="chartData" :options="chartOptions" :height="height" />
        <!-- Drag handles for min/max rescale -->
        <div ref="overlay" class="handles-overlay">
            <div v-for="h in handles" :key="h.id" class="handle" :class="'handle-' + h.id" :style="{ left: h.pos + '%' }"
                 role="slider" tabindex="0" :aria-label="h.label" aria-orientation="horizontal"
                 :aria-valuemin="dataMin" :aria-valuemax="dataMax" :aria-valuenow="h.value"
                 :aria-valuetext="formatVal(h.value)"
                 @mousedown.stop="startDrag(h.id, $event)"
                 @touchstart.stop.prevent="startDragTouch(h.id, $event)"
                 @keydown="onHandleKey(h.id, $event)" @keyup="onHandleKeyUp">
                <div class="handle-label">{{ formatVal(h.value) }}</div>
            </div>
            <!-- Shaded regions outside the range -->
            <div class="shade shade-left" :style="{ width: minHandlePos + '%' }" />
            <div class="shade shade-right" :style="{ left: maxHandlePos + '%', width: (100 - maxHandlePos) + '%' }" />
        </div>
    </div>
</template>

<script>
import Chart from 'primevue/chart';
import { colorAt } from '@/libs/map/colormaps';

const HANDLE_KEYS = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'];

/**
 * HistogramChart - Interactive bar histogram with draggable min/max rescale handles.
 *
 * Renders a Chart.js bar chart and overlays two drag handles for defining
 * the visible value range. Emits the updated range via v-model.
 *
 * Props:
 *   modelValue - Current range as { min, max } (two-way binding).
 *   data       - Histogram data array.
 *   height     - Chart height in pixels (default: 80).
 */
export default {
    components: { Chart },
    props: {
        data: {
            type: Object,
            default: () => ({ counts: [], edges: [] })
        },
        min: { type: Number, default: 0 },
        max: { type: Number, default: 1 },
        colormap: { type: String, default: null },
        height: { type: Number, default: 120 }
    },
    emits: ['update:range'],

    data() {
        return {
            currentMin: this.min,
            currentMax: this.max,
            dragging: null // 'min' or 'max'
        };
    },

    computed: {
        dataMin() {
            if (!this.data.edges || this.data.edges.length === 0) return 0;
            return this.data.edges[0];
        },
        dataMax() {
            if (!this.data.edges || this.data.edges.length === 0) return 1;
            return this.data.edges[this.data.edges.length - 1];
        },
        dataRange() {
            return this.dataMax - this.dataMin || 1;
        },
        // A value outside the histogram (a range typed by hand) puts its handle on the edge
        minHandlePos() {
            return this.positionOf(this.currentMin);
        },
        maxHandlePos() {
            return this.positionOf(this.currentMax);
        },
        handles() {
            return [
                { id: 'min', label: 'Range minimum', value: this.currentMin, pos: this.minHandlePos },
                { id: 'max', label: 'Range maximum', value: this.currentMax, pos: this.maxHandlePos }
            ];
        },
        chartData() {
            const counts = this.data.counts || [];
            const edges = this.data.edges || [];
            const labels = [];
            for (let i = 0; i < counts.length; i++) {
                if (i < edges.length) labels.push(this.formatVal(edges[i]));
                else labels.push('');
            }

            const barColors = counts.map((_, i) => {
                const pos = counts.length > 1 ? i / (counts.length - 1) : 0.5;
                return this.getBarColor(pos);
            });

            return {
                labels,
                datasets: [{
                    data: counts,
                    backgroundColor: barColors,
                    borderWidth: 0,
                    barPercentage: 1.0,
                    categoryPercentage: 1.0
                }]
            };
        },
        chartOptions() {
            return {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: {
                        display: false,
                        grid: { display: false }
                    },
                    y: {
                        display: false,
                        grid: { display: false },
                        beginAtZero: true
                    }
                }
            };
        }
    },

    watch: {
        min(val) { this.currentMin = val; },
        max(val) { this.currentMax = val; },
        data() {
            // Reset range when data changes
            this.currentMin = this.min;
            this.currentMax = this.max;
        }
    },

    methods: {
        positionOf(value) {
            return Math.max(0, Math.min(100, ((value - this.dataMin) / this.dataRange) * 100));
        },

        getBarColor(position) {
            return colorAt(this.colormap, position);
        },

        formatVal(v) {
            if (v === undefined || v === null) return '';
            return Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(0);
        },

        getPositionFromEvent(event) {
            const overlay = this.$refs.overlay;
            if (!overlay) return 0;
            const rect = overlay.getBoundingClientRect();
            const clientX = event.touches ? event.touches[0].clientX : event.clientX;
            const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            return this.dataMin + (pct / 100) * this.dataRange;
        },

        startDrag(handle) {
            this.dragging = handle;
            const onMove = (e) => this.onDragMove(e);
            const onUp = () => {
                this.dragging = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                this.$emit('update:range', { min: this.currentMin, max: this.currentMax });
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },

        startDragTouch(handle) {
            this.dragging = handle;
            const onMove = (e) => this.onDragMove(e);
            const onEnd = () => {
                this.dragging = null;
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
                this.$emit('update:range', { min: this.currentMin, max: this.currentMax });
            };
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        },

        onDragMove(event) {
            if (!this.dragging) return;
            this.setHandle(this.dragging, this.getPositionFromEvent(event));
        },

        // The handles keep 1% of the data range between them and stay inside it
        setHandle(handle, val) {
            const gap = this.dataRange * 0.01;
            if (handle === 'min') {
                this.currentMin = Math.max(this.dataMin, Math.min(val, this.currentMax - gap));
            } else {
                this.currentMax = Math.min(this.dataMax, Math.max(val, this.currentMin + gap));
            }
        },

        // Arrows move 1% of the range (10% with Shift), Home/End go to the ends;
        // the range is applied when the key is released, not on every repeat
        onHandleKey(handle, e) {
            const step = this.dataRange * (e.shiftKey ? 0.1 : 0.01);
            const current = handle === 'min' ? this.currentMin : this.currentMax;
            const targets = {
                ArrowLeft: current - step,
                ArrowDown: current - step,
                ArrowRight: current + step,
                ArrowUp: current + step,
                Home: this.dataMin,
                End: this.dataMax
            };
            if (!HANDLE_KEYS.includes(e.key)) return;
            e.preventDefault();
            this.setHandle(handle, targets[e.key]);
        },

        onHandleKeyUp(e) {
            if (HANDLE_KEYS.includes(e.key)) this.$emit('update:range', { min: this.currentMin, max: this.currentMax });
        }
    }
};
</script>

<style scoped>
.histogram-chart {
    position: relative;
    width: 100%;
}

.handles-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
}

.handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    margin-left: -4px;
    cursor: ew-resize;
    pointer-events: all;
    z-index: 2;
}

.handle:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: 1px;
}

.handle::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 24px;
    background: var(--ddb-text-on-color);
    border: 1px solid rgba(0,0,0,0.5);
    border-radius: 2px;
}

.handle-label {
    position: absolute;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.65rem;
    color: var(--panel-text-soft);
    white-space: nowrap;
}

.shade {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    pointer-events: none;
}

.shade-left {
    left: 0;
}
</style>
