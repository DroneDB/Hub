<template>
    <div class="stockpile-panel" v-if="visible" data-testid="stockpile-panel">
        <div class="panel-header">
            <span class="panel-title">
                <i class="fa-solid fa-layer-group"></i> Stockpile Volume
            </span>
            <button class="close-btn" @click="$emit('close')" title="Close"><i class="fas fa-times"></i></button>
        </div>

        <div class="panel-body">
            <div class="section">
                <label class="section-label">Base Plane Method</label>
                <select v-model="localBaseMethod" class="panel-select" data-testid="stockpile-base-method">
                    <option value="lowest_perimeter">Lowest perimeter</option>
                    <option value="average_perimeter">Average perimeter</option>
                    <option value="best_fit">Best-fit plane</option>
                    <option value="flat">Flat (elevation = 0)</option>
                </select>
            </div>

            <div class="section">
                <label class="section-label">Detection Sensitivity: <strong>{{ localSensitivity.toFixed(2) }}</strong></label>
                <input type="range" min="0" max="1" step="0.05" v-model.number="localSensitivity"
                       class="panel-range" data-testid="stockpile-sensitivity" />
            </div>

            <div class="section">
                <label class="section-label">Search Radius (m)</label>
                <input type="number" min="5" step="5" v-model.number="localRadius"
                       class="panel-input" data-testid="stockpile-radius" />
            </div>

            <div class="section" v-if="materials && materials.length">
                <label class="section-label">Material (optional)</label>
                <select v-model="localMaterial" class="panel-select" data-testid="stockpile-material">
                    <option :value="null">— none —</option>
                    <option v-for="m in materials" :key="m.slug" :value="m.slug">
                        {{ m.name }} ({{ m.densityTonPerM3 }} t/m³)
                    </option>
                    <option :value="customSlug">+ Custom…</option>
                </select>
                <div v-if="localMaterial === customSlug" class="custom-material-grid">
                    <label>
                        <span>Density (t/m³)</span>
                        <input type="number" min="0" step="0.05" v-model.number="localCustomDensity"
                               class="panel-input" data-testid="stockpile-custom-density" />
                    </label>
                    <label>
                        <span>Cost / ton</span>
                        <input type="number" min="0" step="1" v-model.number="localCustomCostPerTon"
                               class="panel-input" data-testid="stockpile-custom-cost" />
                    </label>
                </div>
            </div>

            <div class="section actions">
                <button class="btn btn-primary btn-sm" @click="triggerDetectCenter"
                        :disabled="loading" data-testid="stockpile-detect-btn"
                        :title="'Auto-detect the pile under the current map center'">
                    <i :class="loading ? 'fas fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles'"></i>
                    {{ loading ? 'Working…' : 'Auto-detect' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="$emit('clickOnMap')"
                        :disabled="loading" data-testid="stockpile-click-btn"
                        title="Click on the map to detect a pile at that point">
                    <i class="fa-solid fa-crosshairs"></i>
                    Click on map
                </button>
            </div>
            <div class="section actions">
                <button class="btn btn-secondary btn-sm" @click="$emit('drawPolygon')"
                        :disabled="loading" data-testid="stockpile-draw-btn"
                        title="Draw a polygon around the pile to compute its volume">
                    <i class="fa-solid fa-draw-polygon"></i>
                    Draw polygon
                </button>
                <button class="btn btn-secondary btn-sm" @click="$emit('clearOverlay')"
                        :disabled="loading || (!result && !error)" data-testid="stockpile-clear-btn"
                        title="Clear the overlay and result">
                    <i class="fa-solid fa-eraser"></i>
                    Clear
                </button>
            </div>

            <div class="section click-banner" v-if="mode === 'click'" data-testid="stockpile-click-banner">
                <i class="fa-solid fa-crosshairs"></i>
                <span>Click on the map to detect a pile (ESC to cancel).</span>
                <button class="banner-cancel" @click="$emit('cancelMode')" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="section click-banner" v-else-if="mode === 'draw'" data-testid="stockpile-draw-banner">
                <i class="fa-solid fa-draw-polygon"></i>
                <span>Draw a polygon around the pile (double-click to finish, ESC to cancel).</span>
                <button class="banner-cancel" @click="$emit('cancelMode')" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="section error" v-if="error" data-testid="stockpile-error">
                <i class="fas fa-exclamation-triangle"></i> {{ error }}
            </div>

            <div class="section result" v-if="result" data-testid="stockpile-result">
                <label class="section-label">Result</label>
                <div class="result-grid">
                    <span class="result-label">Cut volume</span>
                    <span class="result-value">{{ formatVolume(result.cutVolume) }}</span>

                    <span class="result-label">Fill volume</span>
                    <span class="result-value">{{ formatVolume(result.fillVolume) }}</span>

                    <span class="result-label highlight">Net volume</span>
                    <span class="result-value highlight" data-testid="stockpile-net-volume">{{ formatVolume(result.netVolume) }}</span>

                    <span class="result-label">2D area</span>
                    <span class="result-value">{{ formatArea(result.area2d) }}</span>

                    <template v-if="result.area3d">
                        <span class="result-label">3D surface</span>
                        <span class="result-value">{{ formatArea(result.area3d) }}</span>
                    </template>

                    <template v-if="typeof result.baseElevation === 'number'">
                        <span class="result-label">Base elevation</span>
                        <span class="result-value">{{ result.baseElevation.toFixed(2) }} m</span>
                    </template>

                    <template v-if="typeof result.confidence === 'number'">
                        <span class="result-label">Confidence</span>
                        <span class="result-value">{{ (result.confidence * 100).toFixed(0) }}%</span>
                    </template>

                    <template v-if="derivedWeightTons != null">
                        <span class="result-label">Weight</span>
                        <span class="result-value" data-testid="stockpile-weight">{{ formatTons(derivedWeightTons) }}</span>
                    </template>

                    <template v-if="derivedCost != null">
                        <span class="result-label">Est. cost</span>
                        <span class="result-value" data-testid="stockpile-cost">{{ formatCost(derivedCost) }}</span>
                    </template>
                </div>
                <div class="result-actions">
                    <button class="btn btn-secondary btn-sm" @click="$emit('exportGeoJson')"
                            data-testid="stockpile-export-btn"
                            title="Download the pile contour as GeoJSON">
                        <i class="fa-solid fa-file-export"></i>
                        Export GeoJSON
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
const CUSTOM_SLUG = '__custom__';

export default {
    name: 'StockpileVolumePanel',
    props: {
        visible: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        error: { type: String, default: null },
        result: { type: Object, default: null },
        baseMethod: { type: String, default: 'lowest_perimeter' },
        sensitivity: { type: Number, default: 0.5 },
        radius: { type: Number, default: 50 },
        material: { type: String, default: null },
        materials: { type: Array, default: () => [] },
        mode: { type: String, default: null }, // 'click' | 'draw' | null
        customDensity: { type: Number, default: 1.5 },
        customCostPerTon: { type: Number, default: 0 }
    },
    emits: ['close', 'detectCenter', 'clickOnMap', 'drawPolygon', 'clearOverlay',
        'cancelMode', 'exportGeoJson',
        'update:baseMethod', 'update:sensitivity', 'update:radius', 'update:material',
        'update:customDensity', 'update:customCostPerTon'],
    data() {
        return { customSlug: CUSTOM_SLUG };
    },
    computed: {
        localBaseMethod: {
            get() { return this.baseMethod; },
            set(v) { this.$emit('update:baseMethod', v); }
        },
        localSensitivity: {
            get() { return this.sensitivity; },
            set(v) { this.$emit('update:sensitivity', Number(v)); }
        },
        localRadius: {
            get() { return this.radius; },
            set(v) { this.$emit('update:radius', Number(v)); }
        },
        localMaterial: {
            get() { return this.material; },
            set(v) { this.$emit('update:material', v); }
        },
        localCustomDensity: {
            get() { return this.customDensity; },
            set(v) { this.$emit('update:customDensity', Number(v)); }
        },
        localCustomCostPerTon: {
            get() { return this.customCostPerTon; },
            set(v) { this.$emit('update:customCostPerTon', Number(v)); }
        },
        // Resolves the active material parameters: predefined slug, custom inputs, or null.
        effectiveMaterial() {
            if (!this.material) return null;
            if (this.material === CUSTOM_SLUG) {
                const d = Number(this.customDensity);
                if (!isFinite(d) || d <= 0) return null;
                return {
                    densityTonPerM3: d,
                    costPerTon: Math.max(0, Number(this.customCostPerTon) || 0),
                    currency: this.result && this.result.costEstimate && this.result.costEstimate.currency || ''
                };
            }
            const m = (this.materials || []).find(x => x.slug === this.material);
            return m ? {
                densityTonPerM3: Number(m.densityTonPerM3) || 0,
                costPerTon: Number(m.costPerTon) || 0,
                currency: m.currency || (this.result && this.result.costEstimate && this.result.costEstimate.currency) || ''
            } : null;
        },
        // Volume base for tonnage: prefer net (DSM-DTM) when positive, fall back to cut.
        derivedVolumeM3() {
            if (!this.result) return null;
            const net = Number(this.result.netVolume);
            if (isFinite(net) && net > 0) return net;
            const cut = Number(this.result.cutVolume);
            if (isFinite(cut) && cut > 0) return cut;
            return null;
        },
        derivedWeightTons() {
            const v = this.derivedVolumeM3;
            const m = this.effectiveMaterial;
            if (v == null || !m || !m.densityTonPerM3) {
                // Fallback to backend-provided estimate if no material is selected.
                return this.result && this.result.weightEstimate ? this.result.weightEstimate.tons : null;
            }
            return v * m.densityTonPerM3;
        },
        derivedCost() {
            const tons = this.derivedWeightTons;
            const m = this.effectiveMaterial;
            if (tons == null || !m || !isFinite(m.costPerTon)) {
                return this.result && this.result.costEstimate ? this.result.costEstimate : null;
            }
            return { amount: tons * m.costPerTon, currency: m.currency || '' };
        }
    },
    methods: {
        triggerDetectCenter() { this.$emit('detectCenter'); },
        formatVolume(v) {
            if (v == null || !isFinite(v)) return '—';
            return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} m³`;
        },
        formatArea(v) {
            if (v == null || !isFinite(v)) return '—';
            return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} m²`;
        },
        formatTons(t) {
            if (t == null || !isFinite(t)) return '—';
            return `${Number(t).toLocaleString(undefined, { maximumFractionDigits: 2 })} t`;
        },
        formatCost(c) {
            if (!c || !isFinite(c.amount)) return '—';
            return `${Number(c.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c.currency || ''}`.trim();
        }
    }
};
</script>

<style scoped>
.stockpile-panel {
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
    color: #ffb74d;
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

.section-label strong {
    color: #eee;
    text-transform: none;
    letter-spacing: 0;
}

.panel-select, .panel-input, .panel-range {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #eee;
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
}

.panel-range {
    padding: 0;
    height: 1.4rem;
    background: transparent;
    border: 0;
}

.panel-select:focus, .panel-input:focus {
    outline: none;
    border-color: rgba(255, 183, 77, 0.6);
}

.panel-select option {
    background: #2a2a2a;
    color: #eee;
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
    background: #ff9800;
    color: white;
}

.btn-primary:hover:not(:disabled) {
    background: #f57c00;
}

.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-sm {
    flex: 1;
}

.section.error {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: #ffcc80;
    background: rgba(255, 152, 0, 0.1);
    border: 1px solid rgba(255, 152, 0, 0.3);
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    line-height: 1.3;
}

.section.error i {
    color: #ffb74d;
    margin-top: 0.1rem;
    flex-shrink: 0;
}

.result-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.6rem;
    font-size: 0.75rem;
}

.result-label {
    color: #aaa;
}

.result-value {
    color: #ccc;
    font-family: monospace;
    text-align: right;
}

.result-label.highlight {
    color: #ffb74d;
    font-weight: 600;
}

.result-value.highlight {
    color: #ffb74d;
    font-weight: 700;
}

.click-banner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(255, 152, 0, 0.18);
    border: 1px solid rgba(255, 152, 0, 0.45);
    color: #ffe0b2;
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    font-size: 0.75rem;
    line-height: 1.25;
}
.click-banner i {
    color: #ffb74d;
    flex-shrink: 0;
}
.click-banner span {
    flex: 1;
}
.banner-cancel {
    background: none;
    border: none;
    color: #ffe0b2;
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
}
.banner-cancel:hover { color: #fff; }

.custom-material-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
    margin-top: 0.35rem;
}
.custom-material-grid label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.7rem;
    color: #aaa;
}
.custom-material-grid input {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #eee;
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
}

.btn-secondary {
    background: rgba(255,255,255,0.12);
    color: #eee;
}
.btn-secondary:hover:not(:disabled) {
    background: rgba(255,255,255,0.2);
}
.btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.result-actions {
    margin-top: 0.5rem;
    display: flex;
    justify-content: flex-end;
}
</style>
