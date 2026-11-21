<template>
    <AnalysisPanel v-if="visible" variant="stockpile" class="stockpile-panel" data-testid="stockpile-panel"
                   :icon="STOCKPILE_ICON" title="Stockpile Volume" @close="$emit('close')">
        <div class="panel-body">
            <AnalysisTargetSelect :candidates="targetCandidates" :model-value="targetPath"
                                  @update:model-value="path => $emit('selectTarget', path)" />

            <!-- A map narrower than `sm` with a mode active or a result: the settings fold behind this button, so the
                 prompt of the mode and the result are in view (FR-MAP-16) -->
            <button v-if="foldable" type="button" class="settings-toggle" data-testid="stockpile-settings-toggle"
                    :aria-expanded="String(settingsOpen)" aria-controls="stockpile-volume-panel-settings" @click="settingsOpen = !settingsOpen">
                <i class="fas" :class="settingsOpen ? 'fa-chevron-down' : 'fa-chevron-right'" aria-hidden="true" />
                Settings
            </button>
            <div v-show="!foldable || settingsOpen" id="stockpile-volume-panel-settings" class="panel-settings" data-testid="stockpile-settings">
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
                    <select id="stockpile-volume-panel-base-plane-method" v-model="localBaseMethod" class="panel-select"
                            :disabled="loading" data-testid="stockpile-base-method">
                        <option v-for="m in baseMethods" :key="m.id" :value="m.id">{{ m.name }}</option>
                    </select>
                    <!-- The elevation of the flat base, in the unit of the user; the pile is measured again when it is typed -->
                    <label v-if="baseMethod === flatMethod" class="flat-elevation">
                        <span>Flat elevation ({{ elevationUnit }})</span>
                        <input v-model.lazy.number="localFlatElevation" type="number" step="any" class="panel-input"
                               :disabled="loading" data-testid="stockpile-flat-elevation">
                    </label>
                </div>

                <div class="section">
                    <label for="stockpile-volume-panel-detection-sensitivity" class="section-label">Detection Sensitivity: <strong>{{ localSensitivity.toFixed(2) }}</strong></label>
                    <input id="stockpile-volume-panel-detection-sensitivity" v-model.number="localSensitivity" type="range" min="0" max="1" step="0.05"
                           class="panel-range" data-testid="stockpile-sensitivity">
                </div>

                <div class="section">
                    <label for="stockpile-volume-panel-search-radius" class="section-label">Search Radius (m)</label>
                    <input id="stockpile-volume-panel-search-radius" v-model.number="localRadius" type="number" min="5" step="5"
                           class="panel-input" aria-describedby="stockpile-volume-panel-search-radius-hint" data-testid="stockpile-radius">
                    <small id="stockpile-volume-panel-search-radius-hint" class="field-hint" data-testid="stockpile-radius-hint">Used by Click map</small>
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
                                   class="panel-input" data-testid="stockpile-custom-density"
                                   :aria-invalid="densityProblem ? 'true' : undefined"
                                   :aria-describedby="densityProblem ? 'stockpile-volume-panel-density-error' : undefined">
                            <!-- The rule of the material catalog (isValidDensity), in the user's unit (FR-MAP-27) -->
                            <small v-if="densityProblem" id="stockpile-volume-panel-density-error" class="density-error" role="alert"
                                   data-testid="stockpile-density-error">{{ densityProblem }}</small>
                        </label>
                        <label>
                            <span>Cost / {{ units.perWeight.unit }} ({{ currency }})</span>
                            <input v-model.number="localCustomCostPerTon" type="number" min="0" step="1"
                                   class="panel-input" data-testid="stockpile-custom-cost">
                        </label>
                    </div>
                </div>
            </div>

            <!-- Every pile of the raster at once: the list chooses the pile the Result shows, and adds piles to the measurements -->
            <div class="section find-all">
                <button type="button" class="panel-btn find-all-btn" :disabled="loading || pilesLoading"
                        data-testid="stockpile-find-all-btn" title="Scan the whole raster for piles, with the detection sensitivity above"
                        @click="$emit('findAll')">
                    <i :class="pilesLoading ? 'fas fa-spinner fa-spin' : 'fa-solid fa-magnifying-glass-location'" aria-hidden="true" />
                    {{ pilesLoading ? 'Finding piles…' : 'Find all piles' }}
                </button>
                <div v-if="pilesError" class="find-all-note error" data-testid="stockpile-piles-error">
                    <i class="fas fa-exclamation-triangle" aria-hidden="true" /> {{ pilesError }}
                </div>
                <div v-else-if="piles && !piles.length" class="find-all-note" role="status" data-testid="stockpile-piles-empty">
                    No piles found. Raise the detection sensitivity to find finer ones.
                </div>
                <div v-else-if="piles" class="pile-list" data-testid="stockpile-piles">
                    <span class="section-label">{{ pilesTitle }}</span>
                    <span class="find-all-note pile-base" data-testid="stockpile-piles-base">Volumes above the {{ pilesBaseName }}</span>
                    <div ref="pileRows" class="pile-rows">
                        <div class="pile-head" aria-hidden="true">
                            <span /><span>#</span><span>Area</span><span>Volume</span><span>Confidence</span><span />
                        </div>
                        <div v-for="(pile, index) in piles" :key="pile.id" class="pile-row" :data-pile-id="pile.id"
                             :class="{ chosen: pile.id === chosenPile, added: isAdded(pile) }">
                            <input v-model="checked" type="checkbox" class="pile-check" :value="pile.id"
                                   :disabled="!canAdd(pile)" :aria-label="`Select pile ${index + 1}`" data-testid="stockpile-pile-check">
                            <button type="button" class="pile-main" :aria-pressed="String(pile.id === chosenPile)" :disabled="loading"
                                    :aria-label="`Pile ${index + 1}: ${pileSummary(pile)}`" data-testid="stockpile-pile"
                                    @click="$emit('pickPile', pile)"
                                    @mouseenter="$emit('hoverPile', pile)" @focus="$emit('hoverPile', pile)"
                                    @mouseleave="$emit('hoverPile', null)" @blur="$emit('hoverPile', null)">
                                <span class="pile-rank">{{ index + 1 }}</span>
                                <span>{{ formatArea(pileArea(pile)) }}</span>
                                <span data-testid="stockpile-pile-volume">
                                    <i v-if="isMeasuring(pile)" class="fas fa-spinner fa-spin" role="status" aria-label="Measuring" data-testid="stockpile-pile-spinner" />
                                    <template v-else>{{ pile.measured ? formatVolume(pile.measured.netVolume) : EMPTY_CELL }}</template>
                                </span>
                                <span>{{ formatConfidence(pile.confidence) }}</span>
                            </button>
                            <i v-if="isAdded(pile)" class="fas fa-check pile-added" title="Added to the measurements"
                               role="img" aria-label="Added" data-testid="stockpile-pile-added" />
                            <button v-else type="button" class="link-btn pile-add" :disabled="!canAdd(pile)"
                                    :aria-label="`Add pile ${index + 1}`" data-testid="stockpile-pile-add"
                                    @click="addPiles([pile])">
                                Add
                            </button>
                        </div>
                    </div>
                    <div class="pile-actions">
                        <button type="button" class="panel-btn" :disabled="!selectedPiles.length" data-testid="stockpile-add-selected"
                                @click="addPiles(selectedPiles)">
                            Add selected ({{ selectedPiles.length }})
                        </button>
                        <button type="button" class="panel-btn" :disabled="!addablePiles.length" data-testid="stockpile-add-all"
                                @click="addPiles(addablePiles)">
                            Add all
                        </button>
                    </div>
                </div>
            </div>

            <div v-if="mode === 'click'" ref="banner" class="section click-banner" data-testid="stockpile-click-banner">
                <i class="fa-solid fa-crosshairs" />
                <span data-testid="stockpile-hint">{{ clickHint }}</span>
                <button class="banner-cancel" title="Cancel" aria-label="Cancel" @click="$emit('cancelMode')">
                    <i class="fas fa-times" />
                </button>
            </div>
            <div v-else-if="mode === 'draw'" ref="banner" class="section click-banner" data-testid="stockpile-draw-banner">
                <i :class="AREA_ICON" />
                <span data-testid="stockpile-hint">{{ drawHint }}</span>
                <button class="banner-cancel" title="Cancel" aria-label="Cancel" @click="$emit('cancelMode')">
                    <i class="fas fa-times" />
                </button>
            </div>

            <div v-if="error" class="section error" data-testid="stockpile-error">
                <i class="fas fa-exclamation-triangle" /> {{ error }}
            </div>

            <div v-if="result" ref="resultSection" class="section result" data-testid="stockpile-result">
                <!-- The pile the panel works on, and the model it was measured on when that is not the one selected above -->
                <div v-if="pileName" class="pile-name" data-testid="stockpile-pile-name">{{ pileName }}</div>
                <div v-if="measuredOn" class="measured-on" data-testid="stockpile-measured-on">
                    <i class="fas fa-info-circle" aria-hidden="true" /> Measured on {{ measuredOnName }}
                </div>
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

                    <!-- A custom material with a density the catalog refuses: the rows stay, with the reason (FR-MAP-27) -->
                    <template v-if="densityProblem && !result.weightEstimate">
                        <span class="result-label">Weight</span>
                        <span class="result-value density-error" data-testid="stockpile-weight-error">{{ densityProblem }}</span>
                    </template>
                    <template v-if="densityProblem && !result.costEstimate">
                        <span class="result-label">Est. cost</span>
                        <span class="result-value density-error" data-testid="stockpile-cost-error">{{ densityProblem }}</span>
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
        <!-- The actions stay in view at the foot of the panel, whatever the length of what is above (FR-RAS-23) -->
        <template #actions>
            <div class="actions-grid">
                <button class="panel-btn action-btn" :class="{ active: mode === 'click', 'is-active': mode === 'click' }"
                        :disabled="loading" :aria-pressed="mode === 'click'"
                        data-testid="stockpile-click-btn" title="Click on the map to detect a pile at that point"
                        @click="$emit('clickOnMap')">
                    <i :class="loading ? 'fas fa-spinner fa-spin' : 'fa-solid fa-crosshairs'" />
                    <span class="action-label">{{ mode === 'click' ? 'Click map…' : 'Click map' }}</span>
                </button>
                <button class="panel-btn action-btn" :class="{ active: mode === 'draw', 'is-active': mode === 'draw' }"
                        :disabled="loading" :aria-pressed="mode === 'draw'"
                        data-testid="stockpile-draw-btn" title="Draw a polygon around the pile to compute its volume"
                        @click="$emit('drawPolygon')">
                    <i :class="AREA_ICON" />
                    <span class="action-label">{{ mode === 'draw' ? 'Drawing…' : 'Draw' }}</span>
                </button>
                <button class="panel-btn action-btn" :disabled="!canClear"
                        data-testid="stockpile-clear-btn" title="Clear the overlay, exit any active mode and reset the panel"
                        @click="$emit('clearOverlay')">
                    <i class="fa-solid fa-eraser" />
                    <span class="action-label">Clear</span>
                </button>
                <!-- The outline of the chosen pile, which is a measurement on the map; its volume is measured again as it changes -->
                <button v-if="canEditOutline" class="panel-btn action-btn edit-outline-btn"
                        :class="{ active: editing, 'is-active': editing }" :aria-pressed="editing"
                        data-testid="stockpile-edit-outline-btn"
                        title="Drag the corners of the outline, or the middle of an edge to add one (Alt+click removes one): the volume is calculated again"
                        @click="$emit('editOutline')">
                    <i :class="EDIT_VERTICES_ICON" />
                    <span class="action-label">{{ editing ? 'Done editing' : 'Edit outline' }}</span>
                </button>
            </div>
        </template>
        <StockpileBaseMethodsDialog v-model:visible="showBaseMethodsInfo" />
    </AnalysisPanel>
</template>

<script>
import AnalysisPanel from './AnalysisPanel.vue';
import { AREA_ICON, EDIT_VERTICES_ICON, STOCKPILE_ICON } from '@/libs/glyphs';
import StockpileBaseMethodsDialog from './StockpileBaseMethodsDialog.vue';
import AnalysisTargetSelect from './AnalysisTargetSelect.vue';
import { pathutils } from 'ddb';
import { areaScale, bulkUnits, DEFAULT_CURRENCY, EMPTY_CELL, formatDensity, formatMoney, formatNumber, formatVolume, formatWeight } from '@/libs/format';
import { CUSTOM_MATERIAL_SLUG, MAX_DENSITY_TON_PER_M3, isValidDensity, shownMaterialValue, storedMaterialValue } from '@/libs/stockpileMaterials';
import { BASE_METHOD, BASE_METHODS, baseMethodName } from '@/libs/stockpileBase';
import { drawingHint } from '@/libs/measureHints';
import { PREFERENCES_QUERY } from '@/libs/authRoutes';
import { currentLocation } from '@/libs/routeQuery';
import { useAuthStore } from '@/stores/auth';
import { DETECT_ALL_MAX_RESULTS } from '@/libs/ddb/dataset';

const FEET_PER_METRE = 3.28084;

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
    components: { AnalysisPanel, StockpileBaseMethodsDialog, AnalysisTargetSelect },
    // An embedded map has no header, so no Preferences window to open
    // The size class of the map (MapCore provides it); a panel mounted without one is on a map that is not narrow
    inject: { embed: { default: false }, mapSize: { default: null } },
    props: {
        visible: { type: Boolean, default: false },
        // The rasters the volume can be measured on ({ path, label }) and the one it is measured on: the
        // elevation model selector shows with two or more
        targetCandidates: { type: Array, default: () => [] },
        targetPath: { type: String, default: null },
        loading: { type: Boolean, default: false },
        error: { type: String, default: null },
        result: { type: Object, default: null },
        // The piles of "Find all piles" (null: not searched; `{ id, areaM2, estimatedVolume, confidence }`, the biggest
        // first), whether the search runs, why it failed, and the id of the pile adopted
        piles: { type: Array, default: null },
        pilesLoading: { type: Boolean, default: false },
        pilesError: { type: String, default: null },
        chosenPile: { type: Number, default: null },
        // The base the volumes of the list are measured from, and the piles of the list that are measurements (pile id -> feature id)
        pilesBase: { type: String, default: BASE_METHOD.BEST_FIT },
        addedPiles: { type: Object, default: () => ({}) },
        // The pile the Result is of: its name, the model it was measured on when that is not the selected one, and whether
        // its outline can be edited (it is a measurement on the map) and is being edited
        pileName: { type: String, default: '' },
        measuredOn: { type: String, default: null },
        canEditOutline: { type: Boolean, default: false },
        editing: { type: Boolean, default: false },
        // The base of the pile shown; a pick is emitted (update:baseMethod) and the pile measured again
        baseMethod: { type: String, default: BASE_METHOD.LOWEST_PERIMETER },
        // The elevation of the flat base, in metres
        flatElevation: { type: Number, default: 0 },
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
        'cancelMode', 'exportGeoJson', 'selectTarget', 'findAll', 'pickPile', 'hoverPile', 'addPiles', 'editOutline',
        'update:baseMethod', 'update:flatElevation', 'update:sensitivity', 'update:radius', 'update:material',
        'update:customDensity', 'update:customCostPerTon',
        'update:title', 'update:description'],
    setup() {
        return { auth: useAuthStore() };
    },
    data() {
        return {
            AREA_ICON, EDIT_VERTICES_ICON, STOCKPILE_ICON, EMPTY_CELL, customSlug: CUSTOM_MATERIAL_SLUG, baseMethods: BASE_METHODS,
            flatMethod: BASE_METHOD.FLAT, showBaseMethodsInfo: false, settingsOpen: false,
            // The ids of the rows ticked for Add selected
            checked: []
        };
    },
    computed: {
        // Below `sm`, while a mode is active or a result shows, the settings (base plane, sensitivity, radius, material) fold
        foldable() { return !!this.mapSize?.narrow && !!(this.mode || this.result); },
        localBaseMethod: {
            get() { return this.baseMethod; },
            set(v) { this.$emit('update:baseMethod', v); }
        },
        // The flat elevation in the user's unit; the prop stays metres
        localFlatElevation: {
            get() { return this.isImperial ? Number((this.flatElevation * FEET_PER_METRE).toFixed(3)) : this.flatElevation; },
            set(v) {
                const typed = Number(v);
                if (v === '' || !Number.isFinite(typed)) return;
                this.$emit('update:flatElevation', this.isImperial ? typed / FEET_PER_METRE : typed);
            }
        },
        elevationUnit() { return this.isImperial ? 'ft' : 'm'; },
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
        /**
         * What is wrong with the density of the custom material, or '': the rule of the material catalog (more than 0, at most
         * MAX_DENSITY_TON_PER_M3, checked on the stored t/m³ value), the limit said in the user's unit (FR-MAP-27).
         */
        densityProblem() {
            if (this.material !== this.customSlug || isValidDensity(this.customDensity)) return '';
            const typed = this.customDensity;
            if (Number.isFinite(typed) && typed > MAX_DENSITY_TON_PER_M3) {
                const limit = shownMaterialValue(MAX_DENSITY_TON_PER_M3, 'densityTonPerM3', this.units);
                return `Density must be at most ${formatNumber(limit, 3, { trim: true })} ${this.units.density.unit}`;
            }
            return 'Density must be greater than 0';
        },
        // A full list is the biggest of maybe more piles: the server counts its totalFound after the cut, so it cannot say
        pilesTitle() {
            const count = this.piles?.length ?? 0;
            return count >= DETECT_ALL_MAX_RESULTS
                ? `Largest ${formatNumber(count, 0)} piles`
                : `Piles found (${formatNumber(count, 0)})`;
        },
        pilesBaseName() { return baseMethodName(this.pilesBase).toLowerCase(); },
        /** The piles of the list that have a volume and are not measurements yet: what Add can add */
        addablePiles() { return (this.piles ?? []).filter(pile => this.canAdd(pile)); },
        /** The addable piles that are ticked, in the order of the list */
        selectedPiles() { return this.addablePiles.filter(pile => this.checked.includes(pile.id)); },
        measuredOnName() { return this.measuredOn ? pathutils.basename(this.measuredOn) : ''; },
        // The one hint of every drawing tool (libs/measureHints): how to place a point, finish and cancel
        clickHint() { return drawingHint('pick', { crosshair: true }); },
        drawHint() { return drawingHint('area', { crosshair: true }); },
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
            if (m === BASE_METHOD.LOWEST_PERIMETER) return false;
            if (m === BASE_METHOD.FLAT && (!isFinite(fill) || fill === 0)) return false;
            return true;
        },
        baseMethodTooltip() {
            return [
                'Defines the reference surface used to compute Cut and Fill volumes:',
                '',
                '- Lowest perimeter: base = the lowest elevation along the polygon boundary. Best for isolated piles on uneven ground; Fill is always 0.',
                '- Average perimeter: base = the mean elevation along the boundary. A balanced choice when the surrounding terrain is roughly level.',
                '- Best-fit plane: fits a tilted plane through the perimeter elevations. Useful when the ground around the pile slopes.',
                '- Flat (elevation = 0): base is the absolute reference 0 m. Use only when your DSM is already a height-above-ground (DTM-subtracted) raster.',
                '',
                'Until you pick one, a pile found with Click map is measured from the Best-fit plane (the ground around it) and a drawn polygon from the Lowest perimeter.'
            ].join('\n');
        }
    },
    watch: {
        // A new mode starts with the settings folded: the prompt is what the user needs next
        mode(mode) {
            if (mode) this.settingsOpen = false;
            this.scrollTo('banner');
        },
        result(result) {
            if (result) this.scrollTo('resultSection');
        },
        // A new list has none ticked, and the pile that was chosen (a click on the map) is brought into view in the list
        piles() { this.checked = []; },
        chosenPile(id) {
            if (id !== null) this.scrollToPile(id);
        }
    },
    methods: {
        /** Brings a part of the panel (the prompt of the mode, the result) into the visible part of the sheet (FR-MAP-16) */
        async scrollTo(ref) {
            await this.$nextTick();
            this.$refs[ref]?.scrollIntoView?.({ block: 'nearest' });
        },
        /** Brings the row of a pile into the visible part of the list */
        async scrollToPile(id) {
            await this.$nextTick();
            this.$refs.pileRows?.querySelector(`[data-pile-id="${id}"]`)?.scrollIntoView?.({ block: 'nearest' });
        },
        isAdded(pile) { return pile.id in this.addedPiles; },
        isMeasuring(pile) { return pile.measureState === 'pending' || pile.measureState === 'measuring'; },
        /** A pile can be added once it has its volume and while it is not a measurement */
        canAdd(pile) { return pile.measureState === 'done' && !this.isAdded(pile); },
        addPiles(piles) {
            this.$emit('addPiles', piles);
            this.checked = [];
        },
        // Every number through the one formatter (libs/format.js), so the panel and the label of the
        // pile on the map write the same quantity the same way
        _fmt(n, quantity) {
            return formatNumber(Number(n), quantity, { trim: true });
        },
        formatVolume(v) {
            return formatVolume(v, this.unitPref);
        },
        formatArea(v) {
            if (v == null || !isFinite(v)) return EMPTY_CELL;
            const { factor, unit } = areaScale(v, this.unitPref);
            return `${this._fmt(v * factor, 'area')} ${unit}`;
        },
        formatConfidence(c) {
            return typeof c === 'number' && isFinite(c) ? `${this._fmt(c * 100, 0)}%` : EMPTY_CELL;
        },
        // What a row of the list says to a screen reader: its three figures
        // The area of a row: the one its volume was measured with (the Result's 2D area, the measurement's once the pile
        // is one), else the one the search found
        pileArea(pile) {
            return pile.measured && typeof pile.measured.area2d === 'number' ? pile.measured.area2d : pile.areaM2;
        },
        pileSummary(pile) {
            const volume = pile.measured ? this.formatVolume(pile.measured.netVolume) : 'volume not measured';
            return `${this.formatArea(this.pileArea(pile))}, ${volume}, confidence ${this.formatConfidence(pile.confidence)}`;
        },
        formatElevation(v) {
            if (v == null || !isFinite(v)) return EMPTY_CELL;
            return this.isImperial ? `${this._fmt(v * FEET_PER_METRE, 'elevation')} ft` : `${this._fmt(v, 'elevation')} m`;
        },
        formatTons(t) {
            return formatWeight(t, this.unitPref);
        },
        formatDensity(d) {
            return formatDensity(d, this.unitPref);
        },
        formatCost(c) {
            if (!c || !isFinite(c.amount)) return EMPTY_CELL;
            return formatMoney(c.amount, c.currency || DEFAULT_CURRENCY);
        },
        // The Preferences window opens on the materials (HubHeader reads the query and removes it).
        // From the address bar, not $route: the map writes its layers without a navigation
        editMaterials() {
            this.$router.push(currentLocation({ [PREFERENCES_QUERY]: 'stockpiles' }));
        }
    }
};
</script>

<style scoped>
/* Shared look and palette: css/_analysis-panel.scss */

.find-all-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
}

.find-all-note {
    margin-top: 0.4rem;
    font-size: 0.75rem;
    color: var(--panel-text-soft);
}

.find-all-note.error {
    color: var(--panel-warn-text);
}

/* The list: one line per pile, as wide as the panel, scrolled when there are many. A row is a tick, the button
   that chooses the pile (its four figures) and Add, or the check mark of a pile that was added */
.pile-list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.4rem;
}

.pile-base {
    margin-top: 0;
}

.pile-rows {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    max-height: 12rem;
    overflow-y: auto;
}

.pile-row {
    display: grid;
    grid-template-columns: 1.1rem minmax(0, 1fr) 2.4rem;
    gap: 0.3rem;
    align-items: center;
}

/* The four figures of a row, and the header over them (the cells of the header are the columns of the row) */
.pile-main,
.pile-head {
    display: grid;
    align-items: center;
    font-size: 0.72rem;
    text-align: right;
}

.pile-main {
    grid-template-columns: 1.5rem 1fr 1.3fr 1fr;
    gap: 0.4rem;
}

.pile-head {
    grid-template-columns: 1.1rem 1.5rem 1fr 1.3fr 1fr 2.4rem;
    gap: 0.35rem;
    padding: 0 0.4rem;
    color: var(--panel-muted);
}

.pile-head > span:nth-child(2) {
    text-align: left;
}

.pile-row {
    padding: 0.2rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    background: rgba(var(--ddb-glass-rgb), 0.08);
}

.pile-row:hover {
    background: rgba(var(--ddb-glass-rgb), 0.18);
}

.pile-row.chosen {
    border-color: var(--panel-accent);
}

/* A pile that is a measurement already: the row is quieter, the check mark says why */
.pile-row.added .pile-main {
    opacity: 0.7;
}

.pile-main {
    width: 100%;
    padding: 0.05rem 0;
    border: none;
    background: none;
    color: var(--panel-text-soft);
    font-family: monospace;
    cursor: pointer;
}

.pile-row.chosen .pile-main {
    color: var(--panel-text);
}

.pile-check {
    margin: 0;
}

.pile-rank {
    text-align: left;
    color: var(--panel-muted);
}

.pile-add,
.pile-added {
    justify-self: end;
}

.pile-added {
    color: var(--panel-accent);
    font-size: 0.75rem;
}

.pile-add:disabled {
    opacity: 0.4;
    cursor: default;
}

.pile-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
    margin-top: 0.3rem;
}

.field-hint {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.7rem;
    color: var(--panel-muted);
}

.flat-elevation {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.4rem;
    font-size: 0.7rem;
    color: var(--panel-muted);
}

/* Which pile the Result is of, and the model it was measured on */
.pile-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--panel-text);
    overflow-wrap: anywhere;
}

.measured-on {
    font-size: 0.72rem;
    color: var(--panel-text-soft);
    overflow-wrap: anywhere;
}

.measured-on i {
    color: var(--panel-accent);
    margin-right: 0.25rem;
}

/* The fourth button of the foot has the whole row */
.edit-outline-btn {
    grid-column: 1 / -1;
}

/* The disclosure of the settings: a line the width of the panel */
.settings-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    background: none;
    border: none;
    padding: 0.15rem 0;
    color: var(--panel-text);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
}

.section-label strong {
    color: var(--panel-text);
    text-transform: none;
    letter-spacing: 0;
}

.fill-hint {
    margin-top: 0.35rem;
    padding: 0.35rem 0.5rem;
    background: rgba(var(--ddb-glass-rgb), 0.06);
    border-left: 2px solid rgba(var(--panel-warn-rgb), 0.6);
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
.banner-cancel:hover { color: var(--ddb-text-on-dark); }

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
    background: rgba(var(--ddb-glass-rgb), 0.1);
    border: 1px solid rgba(var(--ddb-glass-rgb), 0.2);
    color: var(--panel-text);
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
}

/* The density the catalog refuses, at its field and in the Weight and Est. cost rows (FR-MAP-27) */
.density-error {
    color: var(--ddb-danger);
}

.result-actions {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: flex-end;
}
</style>
