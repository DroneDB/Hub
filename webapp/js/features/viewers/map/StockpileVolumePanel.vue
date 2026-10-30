<template>
    <div v-if="visible" class="analysis-panel analysis-panel--stockpile stockpile-panel" data-testid="stockpile-panel">
        <div class="panel-header">
            <span class="panel-title">
                <i class="fa-solid fa-layer-group" /> Stockpile Volume
            </span>
            <button class="close-btn" title="Close" aria-label="Close" @click="$emit('close')"><i class="fas fa-times" /></button>
        </div>

        <div class="panel-body">
            <div class="section">
                <label for="stockpile-volume-panel-base-plane-method" class="section-label">
                    Base Plane Method
                    <button type="button" class="info-icon-btn"
                            :title="baseMethodTooltip" :aria-label="baseMethodTooltip"
                            data-testid="stockpile-base-method-info"
                            @click="showBaseMethodsInfo = true">
                        <i class="fas fa-info-circle" />
                    </button>
                </label>
                <select id="stockpile-volume-panel-base-plane-method" v-model="localBaseMethod" class="panel-select" data-testid="stockpile-base-method">
                    <option value="lowest_perimeter">Lowest perimeter</option>
                    <option value="average_perimeter">Average perimeter</option>
                    <option value="best_fit">Best-fit plane</option>
                    <option value="flat">Flat (elevation = 0)</option>
                </select>
            </div>

            <div class="section">
                <label for="stockpile-volume-panel-detection-sensitivity" class="section-label">Detection Sensitivity: <strong>{{ localSensitivity.toFixed(2) }}</strong></label>
                <input id="stockpile-volume-panel-detection-sensitivity" v-model.number="localSensitivity" type="range" min="0" max="1" step="0.05"
                       class="panel-range" data-testid="stockpile-sensitivity">
            </div>

            <div class="section">
                <label for="stockpile-volume-panel-search-radius" class="section-label">Search Radius (m)</label>
                <input id="stockpile-volume-panel-search-radius" v-model.number="localRadius" type="number" min="5" step="5"
                       class="panel-input" data-testid="stockpile-radius">
            </div>

            <div class="section">
                <div class="section-label-row">
                    <label for="stockpile-volume-panel-material" class="section-label">Material (optional)</label>
                    <button v-if="canEditMaterials" type="button" class="link-btn" data-testid="stockpile-edit-materials"
                            title="Change the densities and prices of your materials, add your own"
                            @click="editMaterials">
                        Edit materials…
                    </button>
                </div>
                <select id="stockpile-volume-panel-material" v-model="localMaterial" class="panel-select" data-testid="stockpile-material">
                    <option :value="null">- none -</option>
                    <option v-for="m in savedMaterials" :key="m.slug" :value="m.slug">
                        {{ m.name }} (saved, {{ formatDensity(m.densityTonPerM3) }})
                    </option>
                    <optgroup v-for="group in materialGroups" :key="group.label" :label="group.label">
                        <option v-for="m in group.materials" :key="m.slug" :value="m.slug">
                            {{ m.name }} ({{ formatDensity(m.densityTonPerM3) }})
                        </option>
                    </optgroup>
                    <option :value="customSlug">+ Custom…</option>
                </select>
                <div v-if="localMaterial === customSlug" class="custom-material-grid">
                    <label>
                        <span>Density ({{ units.density.unit }})</span>
                        <input v-model.number="localCustomDensity" type="number" min="0" step="0.05"
                               class="panel-input" data-testid="stockpile-custom-density">
                    </label>
                    <label>
                        <span>Cost / {{ units.perWeight.unit }} ({{ currency }})</span>
                        <input v-model.number="localCustomCostPerTon" type="number" min="0" step="1"
                               class="panel-input" data-testid="stockpile-custom-cost">
                    </label>
                </div>
            </div>

            <div class="section actions-grid">
                <button class="panel-btn panel-btn--primary action-btn"
                        :disabled="loading"
                        data-testid="stockpile-click-btn" title="Click on the map to detect a pile at that point"
                        @click="$emit('clickOnMap')">
                    <i :class="loading ? 'fas fa-spinner fa-spin' : 'fa-solid fa-crosshairs'" />
                    <span class="action-label">{{ mode === 'click' ? 'Click map…' : 'Click map' }}</span>
                </button>
                <button class="panel-btn action-btn" :class="{ active: mode === 'draw' }"
                        :disabled="loading"
                        data-testid="stockpile-draw-btn" title="Draw a polygon around the pile to compute its volume"
                        @click="$emit('drawPolygon')">
                    <i class="fa-solid fa-draw-polygon" />
                    <span class="action-label">{{ mode === 'draw' ? 'Drawing…' : 'Draw' }}</span>
                </button>
                <button class="panel-btn action-btn" :disabled="!canClear"
                        data-testid="stockpile-clear-btn" title="Clear the overlay, exit any active mode and reset the panel"
                        @click="$emit('clearOverlay')">
                    <i class="fa-solid fa-eraser" />
                    <span class="action-label">Clear</span>
                </button>
            </div>

            <div v-if="mode === 'click'" class="section click-banner" data-testid="stockpile-click-banner">
                <i class="fa-solid fa-crosshairs" />
                <span>Click on the map to detect a pile (ESC to cancel).</span>
                <button class="banner-cancel" title="Cancel" aria-label="Cancel" @click="$emit('cancelMode')">
                    <i class="fas fa-times" />
                </button>
            </div>
            <div v-else-if="mode === 'draw'" class="section click-banner" data-testid="stockpile-draw-banner">
                <i class="fa-solid fa-draw-polygon" />
                <span>Draw a polygon around the pile (double-click to finish, ESC to cancel).</span>
                <button class="banner-cancel" title="Cancel" aria-label="Cancel" @click="$emit('cancelMode')">
                    <i class="fas fa-times" />
                </button>
            </div>

            <div v-if="error" class="section error" data-testid="stockpile-error">
                <i class="fas fa-exclamation-triangle" /> {{ error }}
            </div>

            <div v-if="result" class="section result" data-testid="stockpile-result">
                <label for="stockpile-volume-panel-identification" class="section-label">Identification</label>
                <input id="stockpile-volume-panel-identification" v-model="localTitle" type="text" class="panel-input"
                       placeholder="Title (e.g. North pile)" maxlength="120"
                       data-testid="stockpile-title">
                <textarea v-model="localDescription" class="panel-input panel-textarea" aria-label="Description"
                          rows="2" placeholder="Description (optional)" maxlength="500"
                          data-testid="stockpile-description" />

                <span class="section-label">Result</span>
                <div class="result-grid">
                    <span class="result-label">Cut volume</span>
                    <span class="result-value">{{ formatVolume(result.cutVolume) }}</span>

                    <template v-if="showFillRow">
                        <span class="result-label">Fill volume</span>
                        <span class="result-value">{{ formatVolume(result.fillVolume) }}</span>
                    </template>

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
                        <span class="result-value">{{ formatElevation(result.baseElevation) }}</span>
                    </template>

                    <template v-if="typeof result.confidence === 'number'">
                        <span class="result-label">Confidence</span>
                        <span class="result-value">{{ (result.confidence * 100).toFixed(0) }}%</span>
                    </template>

                    <template v-if="result.weightEstimate">
                        <span class="result-label">Weight</span>
                        <span class="result-value" data-testid="stockpile-weight">{{ formatTons(result.weightEstimate.tons) }}</span>
                    </template>

                    <template v-if="result.costEstimate">
                        <span class="result-label">Est. cost</span>
                        <span class="result-value" data-testid="stockpile-cost">{{ formatCost(result.costEstimate) }}</span>
                    </template>
                </div>
                <div v-if="!showFillRow" class="fill-hint" data-testid="stockpile-fill-hint">
                    <i class="fas fa-info-circle" />
                    Fill volume is not applicable for the selected base plane method.
                </div>
                <div class="result-actions">
                    <button class="panel-btn" data-testid="stockpile-export-btn"
                            title="Download the pile contour as GeoJSON"
                            @click="$emit('exportGeoJson')">
                        <i class="fa-solid fa-file-export" />
                        Export GeoJSON
                    </button>
                </div>
            </div>
        </div>
        <StockpileBaseMethodsDialog v-model:visible="showBaseMethodsInfo" />
    </div>
</template>

<script>
import StockpileBaseMethodsDialog from './StockpileBaseMethodsDialog.vue';
import { areaScale, bulkUnits, DEFAULT_CURRENCY, formatMoney } from '@/libs/format';
import { CUSTOM_MATERIAL_SLUG, shownMaterialValue, storedMaterialValue } from '@/libs/stockpileMaterials';
import { PREFERENCES_QUERY } from '@/libs/authRoutes';
import { useAuthStore } from '@/stores/auth';

/**
 * StockpileVolumePanel - Stockpile volume measurement panel.
 *
 * Provides auto-detect (click-based) and manual polygon drawing workflows
 * to calculate stockpile volumes from DEM/DSM rasters via the
 * useStockpileVolume composable.
 *
 * The weight and the cost are the composable's (`result.weightEstimate`, `result.costEstimate`),
 * the ones the pile is saved with. Densities, prices, volumes and weights are metric in the props
 * and shown in the user's units. "Edit materials…" opens the Preferences on the user's materials.
 */
export default {
    name: 'StockpileVolumePanel',
    components: { StockpileBaseMethodsDialog },
    // An embedded map has no header, so no Preferences window to open
    inject: { embed: { default: false } },
    props: {
        visible: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        error: { type: String, default: null },
        result: { type: Object, default: null },
        baseMethod: { type: String, default: 'lowest_perimeter' },
        sensitivity: { type: Number, default: 0.5 },
        radius: { type: Number, default: 50 },
        material: { type: String, default: null },
        // The offered materials (useStockpileVolume): { slug, name, category, densityTonPerM3, builtIn, saved? }
        materials: { type: Array, default: () => [] },
        currency: { type: String, default: DEFAULT_CURRENCY },
        mode: { type: String, default: null }, // 'click' | 'draw' | null
        customDensity: { type: Number, default: 1.5 },
        customCostPerTon: { type: Number, default: 0 },
        unitPref: {
            type: String,
            default: 'metric',
            validator: (v) => ['metric', 'imperial'].includes(v)
        },
        title: { type: String, default: '' },
        description: { type: String, default: '' }
    },
    emits: ['close', 'clickOnMap', 'drawPolygon', 'clearOverlay',
        'cancelMode', 'exportGeoJson',
        'update:baseMethod', 'update:sensitivity', 'update:radius', 'update:material',
        'update:customDensity', 'update:customCostPerTon',
        'update:title', 'update:description'],
    setup() {
        return { auth: useAuthStore() };
    },
    data() {
        return { customSlug: CUSTOM_MATERIAL_SLUG, showBaseMethodsInfo: false };
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
        // The custom values in the user's units; the props stay t/m³ and per tonne
        localCustomDensity: {
            get() { return shownMaterialValue(this.customDensity, 'densityTonPerM3', this.units); },
            set(v) { this.$emit('update:customDensity', storedMaterialValue(Number(v), 'densityTonPerM3', this.units)); }
        },
        localCustomCostPerTon: {
            get() { return shownMaterialValue(this.customCostPerTon, 'costPerTon', this.units); },
            set(v) { this.$emit('update:customCostPerTon', storedMaterialValue(Number(v), 'costPerTon', this.units)); }
        },
        localTitle: {
            get() { return this.title; },
            set(v) { this.$emit('update:title', v); }
        },
        localDescription: {
            get() { return this.description; },
            set(v) { this.$emit('update:description', v); }
        },
        units() { return bulkUnits(this.unitPref); },
        /** A restored pile's own material, offered as it was saved */
        savedMaterials() { return this.materials.filter(m => m.saved); },
        /** The built-in materials by category, in catalog order, then the user's own */
        materialGroups() {
            const groups = new Map();
            for (const m of this.materials) {
                if (m.saved) continue;
                const label = m.builtIn ? m.category || 'Other' : 'My materials';
                if (!groups.has(label)) groups.set(label, []);
                groups.get(label).push(m);
            }
            const mine = groups.get('My materials');
            groups.delete('My materials');
            if (mine) groups.set('My materials', mine);
            return [...groups].map(([label, materials]) => ({ label, materials }));
        },
        canEditMaterials() { return !this.embed && this.auth.isLoggedIn; },
        // Clear should be available whenever there is something visible to clear
        // (a result, a banner error, an active mode, or a loading request the
        // user wants to abandon).
        canClear() {
            return Boolean(this.result || this.error || this.mode || this.loading);
        },
        isImperial() { return this.unitPref === 'imperial'; },
        // Hide the Fill volume row when the chosen base plane method makes it
        // structurally zero (lowest_perimeter is always 0 by construction;
        // flat with elevation 0 typically yields 0 for absolute-elevation DSMs).
        // For average_perimeter / best_fit / non-zero flat results, show it.
        showFillRow() {
            if (!this.result) return true;
            const fill = Number(this.result.fillVolume);
            const m = this.baseMethod;
            if (m === 'lowest_perimeter') return false;
            if (m === 'flat' && (!isFinite(fill) || fill === 0)) return false;
            return true;
        },
        baseMethodTooltip() {
            return [
                'Defines the reference surface used to compute Cut and Fill volumes:',
                '',
                '- Lowest perimeter: base = the lowest elevation along the polygon boundary. Best for isolated piles on uneven ground; Fill is always 0.',
                '- Average perimeter: base = the mean elevation along the boundary. A balanced choice when the surrounding terrain is roughly level.',
                '- Best-fit plane: fits a tilted plane through the perimeter elevations. Useful when the ground around the pile slopes.',
                '- Flat (elevation = 0): base is the absolute reference 0 m. Use only when your DSM is already a height-above-ground (DTM-subtracted) raster.'
            ].join('\n');
        }
    },
    methods: {
        _fmt(n, digits = 2) {
            return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
        },
        formatVolume(v) {
            if (v == null || !isFinite(v)) return '-';
            const { factor, unit } = this.units.volume;
            return `${this._fmt(v * factor)} ${unit}`;
        },
        formatArea(v) {
            if (v == null || !isFinite(v)) return '-';
            const { factor, unit } = areaScale(v, this.unitPref);
            return `${this._fmt(v * factor)} ${unit}`;
        },
        formatElevation(v) {
            if (v == null || !isFinite(v)) return '-';
            return this.isImperial ? `${this._fmt(v * 3.28084)} ft` : `${this._fmt(v)} m`;
        },
        formatTons(t) {
            if (t == null || !isFinite(t)) return '-';
            const { factor, unit } = this.units.weight;
            return `${this._fmt(t * factor)} ${unit}`;
        },
        formatDensity(d) {
            const { factor, unit } = this.units.density;
            return `${this._fmt(d * factor, 3)} ${unit}`;
        },
        formatCost(c) {
            if (!c || !isFinite(c.amount)) return '-';
            return formatMoney(c.amount, c.currency || DEFAULT_CURRENCY);
        },
        // The Preferences window opens on the materials (HubHeader reads the query and removes it)
        editMaterials() {
            this.$router.push({ query: { ...this.$route.query, [PREFERENCES_QUERY]: 'stockpiles' } });
        }
    }
};
</script>

<style scoped>
/* Shared look and palette: css/_analysis-panel.scss */

.section-label strong {
    color: var(--panel-text);
    text-transform: none;
    letter-spacing: 0;
}

.fill-hint {
    margin-top: 0.35rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255,255,255,0.06);
    border-left: 2px solid rgba(255, 183, 77, 0.6);
    color: var(--panel-text-soft);
    font-size: 0.72rem;
    line-height: 1.3;
    border-radius: 0.2rem;
}

.fill-hint i {
    color: var(--panel-accent);
    margin-right: 0.25rem;
}

.section.error {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--panel-warn-text);
    background: rgba(var(--panel-warn-rgb), 0.1);
    border: 1px solid rgba(var(--panel-warn-rgb), 0.3);
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    line-height: 1.3;
}

.section.error i {
    color: var(--panel-accent);
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
    color: var(--panel-muted);
}

.result-value {
    color: var(--panel-text-soft);
    font-family: monospace;
    text-align: right;
}

.result-label.highlight {
    color: var(--panel-accent);
    font-weight: 600;
}

.result-value.highlight {
    color: var(--panel-accent);
    font-weight: 700;
}

.click-banner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(var(--panel-warn-rgb), 0.18);
    border: 1px solid rgba(var(--panel-warn-rgb), 0.45);
    color: var(--panel-warn-light);
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    font-size: 0.75rem;
    line-height: 1.25;
}
.click-banner i {
    color: var(--panel-accent);
    flex-shrink: 0;
}
.click-banner span {
    flex: 1;
}
.banner-cancel {
    background: none;
    border: none;
    color: var(--panel-warn-light);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
}
.banner-cancel:hover { color: var(--ddb-text-on-color); }

.section-label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
}

.link-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--panel-accent);
    font-size: 0.7rem;
    cursor: pointer;
    white-space: nowrap;
}
.link-btn:hover,
.link-btn:focus-visible {
    text-decoration: underline;
}

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
    color: var(--panel-muted);
}
.custom-material-grid input {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: var(--panel-text);
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
}

.result-actions {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: flex-end;
}
</style>
