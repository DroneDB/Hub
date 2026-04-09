<template>
    <div class="histogram-chart" ref="container">
        <Chart type="bar" :data="chartData" :options="chartOptions" :height="height" />
        <!-- Drag handles for min/max rescale -->
        <div class="handles-overlay" ref="overlay"
            @mousedown="onOverlayMouseDown"
            @touchstart.prevent="onOverlayTouchStart">
            <div class="handle handle-min" :style="{ left: minHandlePos + '%' }"
                @mousedown.stop="startDrag('min', $event)"
                @touchstart.stop.prevent="startDragTouch('min', $event)">
                <div class="handle-label">{{ formatVal(currentMin) }}</div>
            </div>
            <div class="handle handle-max" :style="{ left: maxHandlePos + '%' }"
                @mousedown.stop="startDrag('max', $event)"
                @touchstart.stop.prevent="startDragTouch('max', $event)">
                <div class="handle-label">{{ formatVal(currentMax) }}</div>
            </div>
            <!-- Shaded regions outside the range -->
            <div class="shade shade-left" :style="{ width: minHandlePos + '%' }"></div>
            <div class="shade shade-right" :style="{ left: maxHandlePos + '%', width: (100 - maxHandlePos) + '%' }"></div>
        </div>
    </div>
</template>

<script>
import Chart from 'primevue/chart';

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
        minHandlePos() {
            return ((this.currentMin - this.dataMin) / this.dataRange) * 100;
        },
        maxHandlePos() {
            return ((this.currentMax - this.dataMin) / this.dataRange) * 100;
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
        getBarColor(position) {
            const colormapColors = {
                rdylgn: ['#d73027', '#fdae61', '#fee08b', '#d9ef8b', '#66bd63', '#1a9850'],
                discrete_ndvi: ['#8b0000', '#ff4500', '#ffd700', '#32cd32', '#006400'],
                spectral: ['#d53e4f', '#fc8d59', '#fee08b', '#e6f598', '#99d594', '#3288bd'],
                viridis: ['#440154', '#31688e', '#35b779', '#fde725'],
                plasma: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
                inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a', '#fcffa4'],
                magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
                grayscale: ['#000000', '#ffffff'],
                ironbow: ['#00000a', '#2d0571', '#a4105e', '#ed6926', '#fffe00'],
                rainbow: ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#0000ff', '#8000ff']
            };
            const colors = colormapColors[this.colormap] || colormapColors.grayscale;
            const idx = position * (colors.length - 1);
            const lo = Math.floor(idx);
            const hi = Math.min(lo + 1, colors.length - 1);
            const t = idx - lo;
            return this.lerpColor(colors[lo], colors[hi], t);
        },

        lerpColor(a, b, t) {
            const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
            const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
            const r = Math.round(ar + (br - ar) * t);
            const g = Math.round(ag + (bg - ag) * t);
            const bl = Math.round(ab + (bb - ab) * t);
            return `rgb(${r},${g},${bl})`;
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

        startDrag(handle, event) {
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

        startDragTouch(handle, event) {
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
            const val = this.getPositionFromEvent(event);
            if (this.dragging === 'min') {
                this.currentMin = Math.min(val, this.currentMax - this.dataRange * 0.01);
            } else {
                this.currentMax = Math.max(val, this.currentMin + this.dataRange * 0.01);
            }
        },

        onOverlayMouseDown() {},
        onOverlayTouchStart() {}
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

.handle::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 24px;
    background: #fff;
    border: 1px solid rgba(0,0,0,0.5);
    border-radius: 2px;
}

.handle-label {
    position: absolute;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.65rem;
    color: #ccc;
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
