<template>
    <!-- The map's keyboard shortcuts (Ctrl to select, H to reset, Esc) apply while the pointer or the focus is on it -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- tracks pointer/focus only, no action -->
    <div id="map" role="region" aria-label="Map" @mouseover="pointerInside = true" @mouseleave="pointerInside = false"
         @focusin="focusInside = true" @focusout="focusInside = false">
        <DialogHost :dialogs="dialogs" />
        <!-- Focusable from code (tabindex -1): a focus in the photo popup comes back here when it closes -->
        <div ref="map-container" class="map-container" tabindex="-1" :class="{
            'cursor-pointer': selectSingle,
            'cursor-crosshair': selectPolygon,
            // The size class of the map itself (not of the window): the rules of ol-controls.css and the panels read it
            'is-narrow': mapSize.narrow,
            'is-short': mapSize.short,
            'is-compact': mapSize.compact
        }">
            <!-- A view always has the layer panel (a row has its eye, badge and Pick another; with no georaster yet, a view of
                 another file, it is the Add layer); the dataset map has the one opacity control up to one raster -->
            <OpacityControl v-if="!view && rasterLayerList.length <= 1 && !splitMode" v-model="rasterOpacity" :visible="hasRasters"
                            :show-plant-health-btn="rasterLayerList.length === 1 && !!rasterLayerList[0]?.plantHealthCapable"
                            :plant-health-active="plantHealthVisible"
                            :can-add="layersEditable && canAddLayers" :add-disabled="addLayerDisabled" :add-title="addLayerTitle"
                            @plant-health="handleLayerPlantHealth(rasterLayerList[0]?.path)" @add="$emit('addLayer')" />
            <RasterLayerOpacityPanel v-else-if="!splitMode && (rasterLayerList.length || view)" v-model:layers="rasterLayerList"
                                     :active-plant-health-path="plantHealthVisible ? plantHealthFilePath : null"
                                     :removable="layersEditable && !!view" :can-repick="layersEditable && !!view"
                                     :changed-paths="changedPaths"
                                     :can-add="layersEditable && canAddLayers" :add-disabled="addLayerDisabled" :add-title="addLayerTitle"
                                     @reorder="handleRasterLayerReorder"
                                     @plant-health="handleLayerPlantHealth"
                                     @toggle-visible="toggleRasterLayerVisible"
                                     @remove="path => $emit('removeLayer', path)"
                                     @repick="path => $emit('repick', path)"
                                     @zoom-to="zoomToLayer"
                                     @add="$emit('addLayer')" />
            <RasterSplitOverlay v-if="splitMode" :bands="splitBands" :positions="splitPositions" :removable="layersEditable && !!view"
                                @update:positions="onSplitPositionsChange"
                                @move="(index, to) => handleRasterLayerReorder({ fromIndex: index, toIndex: to })"
                                @remove="index => $emit('removeLayer', rasterLayerList[index].path)"
                                @repick="index => $emit('repick', rasterLayerList[index].path)" />
            <PlantHealthPanel :visible="plantHealthVisible" :dataset="dataset" :file-path="plantHealthFilePath"
                              :initial-params="plantHealthInitialParams" :visible-bbox="visibleBbox" @close="closePlantHealth"
                              @viz-params-changed="handleVizParamsChanged" />
            <RasterAnalysisControls :visible="rasterPanelVisible" :dataset="dataset" :file-path="rasterFilePath"
                                    :target-candidates="analysisCandidates" :target-path="analysisTargetPath"
                                    :initial-params="rasterInitialParams" :visible-bbox="visibleBbox" :spot-info="rasterSpotInfo" :area-stats="rasterAreaStats"
                                    :profile="rasterProfile" :profile-loading="rasterProfileLoading" :profile-error="rasterProfileError"
                                    :drawing-profile="rasterProfileDrawing" :inspect-active="rasterInspectActive"
                                    :area-stats-loading="rasterAreaStatsLoading" :area-stats-error="rasterAreaStatsError"
                                    :drawing-area="rasterAreaDrawing" @close="closeRasterAnalysis"
                                    @viz-params-changed="handleRasterVizParamsChanged" @pick-profile="handlePickProfile"
                                    @clear-profile="handleClearProfile" @cancel-draw-profile="cancelRasterProfileDrawing"
                                    @toggle-inspect-value="toggleRasterInspect" @profile-hover="handleProfileHover"
                                    @toggle-area-stats="toggleRasterAreaDrawing" @clear-area-stats="handleClearAreaStats"
                                    @open-contour-dialog="openContourDialog" @select-target="selectAnalysisTarget" />
            <ContourOptionsDialog v-model:visible="contourDialogVisible" :loading="contourLoading" :unit="contourUnit"
                                  :raster-min="contourRasterMin" :raster-max="contourRasterMax" :initial-options="contourLastOptions"
                                  :dataset="dataset" :task="contourTask" :error="contourError || ''"
                                  @generate="generateContourLines" @cancel="closeContourDialog" />
            <StockpileVolumePanel v-model:sensitivity="stockpileSensitivity"
                                  v-model:radius="stockpileRadius" v-model:material="stockpileMaterial"
                                  v-model:custom-density="stockpileCustomDensity" v-model:custom-cost-per-ton="stockpileCustomCostPerTon"
                                  v-model:title="stockpileTitle" v-model:description="stockpileDescription"
                                  :base-method="stockpileBaseMethod" :visible="stockpilePanelVisible" :loading="stockpileLoading" :error="stockpileError"
                                  :result="stockpileResult" :piles="stockpilePiles" :piles-loading="stockpilePilesLoading" :piles-error="stockpilePilesError"
                                  :chosen-pile="stockpileChosenPile" :materials="stockpileMaterials" :currency="stockpileCurrency" :mode="stockpileMode" :unit-pref="currentUnitPref"
                                  :target-candidates="analysisCandidates" :target-path="analysisTargetPath"
                                  @find-all="findAllStockpiles" @pick-pile="adoptDetectedStockpile"
                                  @update:base-method="chooseStockpileBaseMethod"
                                  @close="closeStockpileVolume" @click-on-map="startStockpileClickMode"
                                  @draw-polygon="startStockpilePolygonDrawing" @clear-overlay="clearStockpileOverlay"
                                  @cancel-mode="stopStockpileInteractions" @export-geo-json="exportStockpileGeoJson"
                                  @select-target="selectAnalysisTarget" />
            <!-- The toolbar's Copy link button opens and closes it: a press on it is not a press outside -->
            <MapLinkPanel v-if="linkPanelOpen && linkTarget" :dataset="dataset" :link-target="linkTarget" :note="shareNote" :can-save="canSave"
                          toggle="[data-map-link-toggle]" @close="linkPanelOpen = false" @save="$emit('save')" />
            <!-- What the page puts over the map (DatasetMap: the hint of FR-MAP-10): in the map, so it has its reserves -->
            <slot name="overlay" />
        </div>
        <MapDialogs :alert-dialog-open="alertDialogOpen" :alert-title="alertTitle" :alert-message="alertMessage"
                    :clear-measurements-dialog-open="clearMeasurementsDialogOpen"
                    :delete-saved-measurements-dialog-open="deleteSavedMeasurementsDialogOpen" @alert-close="handleAlertDialogClose"
                    @clear-measurements-close="handleClearMeasurementsDialogClose"
                    @delete-saved-measurements-close="handleDeleteSavedMeasurementsDialogClose" />
        <ChangeUnitsDialog v-if="changeUnitsDialogOpen" :target-unit="changeUnitsTargetUnit"
                           :measurements-count="changeUnitsMeasurementsCount" @close="handleChangeUnitsDialogClose" />
        <MeasurementListDialog v-if="measurementListDialogOpen" :measurements="measurementListItems"
                               :groups="measurementGroups"
                               @close="measurementListDialogOpen = false"
                               @delete-measurement="handleDeleteMeasurementFromList"
                               @edit-measurement="handleEditMeasurementFromList"
                               @create-group="openCreateGroupDialog"
                               @rename-group="openRenameGroupDialog"
                               @delete-group="deleteGroup"
                               @toggle-group-visibility="toggleGroupVisibility"
                               @move-measurement-to-group="moveMeasurementToGroup" />
        <MeasurementGroupDialog v-if="measurementGroupDialogOpen"
                                :group="pendingGroupForRename"
                                @close="measurementGroupDialogOpen = false"
                                @save="handleGroupDialogSave" />
        <MapSettingsDialog v-if="mapSettingsDialogOpen" :basemaps="basemaps" :selected-basemap="selectedBasemap"
                           :unit-pref="currentUnitPref" @close="mapSettingsDialogOpen = false"
                           @basemap-changed="handleBasemapChanged" @units-changed="handleUnitsChanged" />
        <MapFilePopup ref="filePopup" :map="map" @open-item="file => $emit('openItem', file)" @dismiss="onFilePopupDismissed" />
        <MapToolbar v-if="zones" :zones="zones" :show-back="standalone && !!dataset" :copy-link="!!linkTarget && !!dataset"
                    :display-options="!standalone"
                    :split-toggle="!standalone || !!view"
                    :analysis-entry="analysisEntry" :raster-count="rasterLayerList.length"
                    :direction-indicators="showDirectionIndicators" :flight-path="showFlightPath"
                    :split-mode="splitMode" :can-compare="canCompare" :pick-to-compare="!view"
                    @back="goBack" @reset="resetToInitialView" @fullscreen="toggleFullscreen" @copy-link="toggleLinkPanel"
                    @analysis="toggleAnalysisPanel"
                    @update:direction-indicators="setDirectionIndicators" @update:flight-path="setFlightPath"
                    @toggle-split="toggleSplit" @compare-to="compareTo" />
    </div>
</template>

<script>
/**
 * MapCore - the map shared by the dataset Map tab (DatasetMap.vue) and the map viewer
 * (MapViewer.vue: `standalone`, showing a `view`). It wires OpenLayers to the map features
 * (composables), the file layers (libs/map/fileLayers) and its child components
 * (toolbar, popup, panels, dialogs).
 */
import 'ol/ol.css';
import { Map, View } from 'ol';
import { ScaleLine } from 'ol/control';
import { isEmpty as isEmptyExtent, extend as extendExtent, getWidth as extentWidth, getHeight as extentHeight, intersects as extentsIntersect } from 'ol/extent';
import { inject, provide, shallowRef } from 'vue';

import ddb from 'ddb';
import emitter from '@/libs/eventBus';
import Keyboard from '@/libs/keyboard';
import { requestFullScreen, exitFullScreen, isFullScreenCurrently } from '@/libs/utils';
import { formatSpeed } from '@/libs/format';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { sanitizeHtml } from '@/libs/sanitize';
import SelectionControl from '@/libs/map/controls/selectionControl';
import SettingsControl from '@/libs/map/controls/settingsControl';
import { createControlZones, moveToZone } from '@/libs/map/controlZones';
import { FileLayers, createVectorFileLayer, mercatorExtent } from '@/libs/map/fileLayers';
import { featureAt, toggleSelectionAt, filesInPolygon } from '@/libs/map/fileSelection';
import { ViewZoomCap } from '@/libs/map/rasterLayers';
import { visibleBbox } from '@/libs/map/rasterExport';
import { getVectorColor, FILE_FIT_OPTIONS, POINT_FIT_MIN_RESOLUTION } from '@/libs/map/mapUtils';

import { useListenerBag } from '@/composables/useEventListener';
import { useTimerGroup } from '@/composables/useTimers';
import { useMapSize } from '@/composables/useMapSize';
import { useMapFeatures } from '@/composables/useMapFeatures';
import { useMapViewState } from '@/composables/useMapViewState';
import { usePreference } from '@/composables/usePreference';
import { fileViewUrl, openInNewTab } from '@/libs/views/viewLinks';

import DialogHost from '@/components/DialogHost.vue';
import MapToolbar from './MapToolbar.vue';
import MapFilePopup from './MapFilePopup.vue';
import OpacityControl from './OpacityControl.vue';
import RasterLayerOpacityPanel from './RasterLayerOpacityPanel.vue';
import RasterSplitOverlay from './RasterSplitOverlay.vue';
import PlantHealthPanel from './PlantHealthPanel.vue';
import RasterAnalysisControls from './RasterAnalysisControls.vue';
import ContourOptionsDialog from './ContourOptionsDialog.vue';
import StockpileVolumePanel from './StockpileVolumePanel.vue';
import MapLinkPanel from './MapLinkPanel.vue';
import MapDialogs from './MapDialogs.vue';
import ChangeUnitsDialog from './ChangeUnitsDialog.vue';
import MapSettingsDialog from './MapSettingsDialog.vue';
import MeasurementListDialog from './MeasurementListDialog.vue';
import MeasurementGroupDialog from './MeasurementGroupDialog.vue';
import { onColorSchemeChange } from '@/libs/colorScheme';
import { notify } from '@/libs/notify';
import { appliedPixelRatio, watchPixelRatio } from '@/libs/pixelRatio';

// A layer added to a view is looked for this often, this long apart, until the map has drawn it
const ADDED_LAYER_WAIT_TRIES = 20;
const ADDED_LAYER_WAIT_MS = 150;

/** The options to fit the view to the extent of the files: the whole extent in the map; an extent with no size (one point) stops at a small scale */
function fileFitOptions(extent) {
    return extentWidth(extent) === 0 && extentHeight(extent) === 0 ? { ...FILE_FIT_OPTIONS, minResolution: POINT_FIT_MIN_RESOLUTION } : FILE_FIT_OPTIONS;
}

/** The ScaleLine units of a measurement-units preference: metric or imperial (anything else reads as metric) */
const scaleLineUnits = unit => (unit === 'imperial' ? 'imperial' : 'metric');

// Pointer over one of these: no feature tooltip
const MAP_CONTROLS = '.ol-map-display-buttons, .ol-map-buttons, .ol-measure-control, .ol-selection, .ol-zoom, .ol-settings';

export default {
    name: 'MapCore',
    components: {
        DialogHost, MapToolbar, MapFilePopup, OpacityControl, RasterLayerOpacityPanel, RasterSplitOverlay, PlantHealthPanel,
        RasterAnalysisControls, ContourOptionsDialog, StockpileVolumePanel, MapDialogs, ChangeUnitsDialog, MapSettingsDialog,
        MeasurementListDialog, MeasurementGroupDialog, MapLinkPanel
    },
    props: {
        files: {
            type: Array,
            required: true
        },
        dataset: {
            type: Object,
            default: null
        },
        // Build the map on the first activate() (a tab that is not on show yet)
        deferLoad: {
            type: Boolean,
            default: false
        },
        canWrite: {
            type: Boolean,
            default: true
        },
        canDelete: {
            type: Boolean,
            default: true
        },
        // The map viewer route (MapViewer): a Back button, no selection tools, and a photo with a
        // footprint is drawn as a raster instead of a camera marker
        standalone: {
            type: Boolean,
            default: false
        },
        // The view the map shows (the map viewer): its state is the parent's, the map shows it and
        // emits what the user changes (update:view, the complete new state), plus removeLayer and
        // repick (a path) and addLayer for the parent to apply. `files` are its
        // layers in draw order (the rows follow them), and the map fits its base file once unless
        // the state has a position. Set before the map mounts; null on the dataset map, whose
        // rasters are the files of the folder. Every map emits fileWritten / fileRemoved (a path)
        // when it saves or removes a file of the dataset (the measurements)
        view: {
            type: Object,
            default: null
        },
        // Paths of the layers of the saved view the map shows, as it was saved: the style the view records for them
        // (none included) is the user's, so the map gives them no default style (FR-RAS-01). Empty on a new view and on
        // the dataset map, whose rasters without a style get the default of their value info
        savedLayers: {
            type: Array,
            default: () => []
        },
        // Paths of the layers whose file is not the one the saved view was made with (a badge on their rows)
        changedPaths: {
            type: Array,
            default: () => []
        },
        // A view takes georasters: the parent owns them and applies addLayer / removeLayer (a
        // path). The add action is off while `addLayerDisabled`, whose reason is `addLayerTitle`
        canAddLayers: {
            type: Boolean,
            default: false
        },
        addLayerDisabled: {
            type: Boolean,
            default: false
        },
        addLayerTitle: {
            type: String,
            default: ''
        },
        // What the Copy link panel links to: { uid } for a saved view, { path } for a file; null
        // has no panel. `shareNote`: the link does not show what the map shows, so the panel says
        // to save; `canSave` offers the save there
        linkTarget: {
            type: Object,
            default: null
        },
        shareNote: {
            type: Boolean,
            default: false
        },
        canSave: {
            type: Boolean,
            default: false
        }
    },
    emits: ['scrollTo', 'openItem', 'update:view', 'removeLayer', 'repick', 'addLayer', 'save', 'fileWritten', 'fileRemoved'],
    setup(props, { emit }) {
        // The size class of the map's container: the panels over the map inject it
        const { size: mapSize, observe: observeMapSize } = useMapSize();
        provide('mapSize', mapSize);
        const features = useMapFeatures(props, {
            onFileWritten: path => emit('fileWritten', path),
            onFileRemoved: path => emit('fileRemoved', path)
        });
        return {
            ...features,
            // Provided by the app: true on a map embedded in another page
            embed: inject('embed', false),
            ...useMapViewState({ ...features, view: () => props.view, emit }),
            showFlightPath: usePreference(PREF.SHOW_FLIGHT_PATH, PREF_DEFAULTS[PREF.SHOW_FLIGHT_PATH]),
            showDirectionIndicators: usePreference(PREF.SHOW_DIRECTION_INDICATORS, PREF_DEFAULTS[PREF.SHOW_DIRECTION_INDICATORS]),
            // The units of the scale bar (FR-MAP-30): the measurement units, which the Preferences page and the measure tools change
            measureUnit: usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]),
            mapSize,
            observeMapSize,
            // Toolbar zones (createControlZones), set when the map is built
            zones: shallowRef(null),
            later: useTimerGroup(),
            listeners: useListenerBag()
        };
    },
    data: function () {
        return {
            selectSingle: false,
            pointerInside: false,
            focusInside: false,
            selectPolygon: false,
            initialExtent: null,
            vectorLayerColors: {},
            mapSettingsDialogOpen: false,
            linkPanelOpen: false,
            // The visible extent in WGS 84, for 'Export visible extent' of the raster panels (FR-RAS-16)
            visibleBbox: null
        };
    },
    computed: {
        // A viewer-only map is locked to its layers: they can be hidden, faded and reordered
        // (that changes the view only), not added, removed or picked again
        layersEditable: function () {
            return !this.embed;
        },
        // Identity of the file set: a change (added, removed, reordered, replaced in place)
        // rebuilds the layers; anything else is a selection change
        filesKey: function () {
            return this.files.map(f => f.path || (f.entry && f.entry.path)).join('\n');
        },
        // The entry of the base file of the view, when it is on the map (a missing one is a placeholder)
        baseEntry: function () {
            const path = this.view && this.view.base.path;
            const base = path && this.files.find(f => f.entry && f.entry.path === path);
            return base ? base.entry : null;
        },
        // A panel that opens over the link panel's place (they share the corner)
        analysisPanelOpen: function () {
            return this.plantHealthVisible || this.rasterPanelVisible || this.stockpilePanelVisible;
        }
    },
    watch: {
        // Also changes from outside (the Preferences page, another tab, the account)
        showFlightPath: {
            flush: 'sync',
            handler: function (on) {
                if (this.fileLayers) this.fileLayers.setFlightPathVisible(on);
            }
        },
        showDirectionIndicators: {
            flush: 'sync',
            handler: function () {
                if (this.fileLayers) this.fileLayers.setShotStyle(this.shotStyleKey());
            }
        },
        measureUnit: {
            flush: 'sync',
            handler: function (unit) {
                if (this.scaleLine) this.scaleLine.setUnits(scaleLineUnits(unit));
            }
        },
        // One panel at a time in that corner: an analysis panel replaces the link panel
        analysisPanelOpen: function (open) {
            if (open) this.linkPanelOpen = false;
        },
        filesKey: function () {
            // Coalesce bursts (the explorer replaces the array, then patches entries)
            this.later.clear();
            this.later(() => this.reloadFileLayers(), 5);
        },
        files: {
            deep: true,
            handler: function () {
                // Selection change: restyle without rebuilding
                if (this.fileLayers) {
                    this.fileLayers.shotLayer.changed();
                    this.updateRastersOpacity();
                }
            }
        }
    },
    mounted: function () {
        this.observeMapSize(this.$refs['map-container']);
        if (!this.deferLoad) this.activate();
    },
    beforeUnmount: function () {
        if (this.stopColorScheme) this.stopColorScheme();
        this.stopColorScheme = null;
        if (this.stopPixelRatio) this.stopPixelRatio();
        this.stopPixelRatio = null;
        Keyboard.offKeyDown(this.handleKeyDown);
        Keyboard.offKeyUp(this.handleKeyUp);
        if (this.viewZoomCap) this.viewZoomCap.dispose();
        if (this.map) {
            if (this.tooltipOverlay) this.map.removeOverlay(this.tooltipOverlay);
            // Releases the control's subscription to the unit preference
            if (this.measureControls) this.map.removeControl(this.measureControls);
            if (this.scaleLine) this.map.removeControl(this.scaleLine);
            this.vectorLayers.forEach(layer => this.map.removeLayer(layer));
        }
        this.tooltipOverlay = null;
        this.tooltipElement = null;
        this.vectorLayers = [];
    },
    methods: {
        // Builds the map on first use, else fits it to its (maybe resized) container
        activate: function () {
            if (this.loaded) {
                this.$nextTick(() => this.updateSize());
                return;
            }
            this.loadMap();
            this.reloadFileLayers();
        },

        updateSize: function () {
            if (this.map) this.map.updateSize();
        },

        // The styles of the file layers, the measurements and the selection, made again from the
        // colour tokens, and the map drawn with them
        restyleCanvas: function () {
            if (this.fileLayers) this.fileLayers.restyle();
            if (this.measureControls) this.measureControls.restyle();
            if (this.selectionControl) this.selectionControl.restyle();
            if (this.map) this.map.render();
        },

        loadMap: function () {
            this.loaded = true;
            // A view fits once, unless its state has a position; the standalone map fits once
            this.fitPending = this.view ? !this.view.view : this.standalone;
            this.vectorLayers = [];
            // The canvas colours are tokens (FR-XC-21): draw again with the values of a new scheme
            this.stopColorScheme = onColorSchemeChange(() => this.restyleCanvas());
            this.fileLayers = new FileLayers();
            this.fileLayers.setFlightPathVisible(this.showFlightPath);
            // Shared with the raster features (plant health, raster analysis)
            this.rasterLayer = this.fileLayers.rasters;

            this.selectionControl = this.standalone ? null : new SelectionControl({
                onSelectionComplete: (polygon) => { this.handlePolygonSelection(polygon); },
                onActivated: () => {
                    this.selectSingle = false;
                    this.measureControls.deselectCurrent();
                },
                onDeactivated: () => {
                    this.selectPolygon = false;
                    this.updateRastersOpacity();
                },
                onClearSelection: () => {
                    this.clearSelection();
                    this.updateRastersOpacity();
                }
            });

            this.createMeasureControls({
                openDialog: (component, props) => this.dialogs.open(component, props),
                onToolSelected: () => { if (this.selectionControl) this.selectionControl.deactivate(); },
                // The stockpile panel resets when its draft polygon is erased
                onFeatureRemoved: feature => this.onStockpileFeatureRemoved(feature)
            });

            this.map = new Map({
                target: this.$refs['map-container'],
                layers: [this.createBasemapLayer(), ...this.fileLayers.layers, this.measureControls.getLayer()],
                view: new View({ center: [0, 0], zoom: 2 }),
                // The canvas is the CSS size x the applied ratio (FR-XC-32, D-042): OpenLayers would draw at the device ratio, uncapped
                pixelRatio: appliedPixelRatio()
            });
            this.stopPixelRatio = watchPixelRatio(() => this.map.setPixelRatio(appliedPixelRatio()));

            this.setupTooltipOverlay();
            this.map.addOverlay(this.tooltipOverlay);
            this.map.once('postrender', () => {
                this.map.getTargetElement().querySelector('canvas').style.cursor = 'inherit';
            });

            // The View's max zoom follows the deepest native zoom of the loaded rasters
            this.viewZoomCap = new ViewZoomCap(this.map, [this.fileLayers.rasters, this.fileLayers.footprints]);

            // Map listeners are removed with the component (this.listeners)
            this.listeners.ol([
                this.map.on('pointermove', e => this.onPointerMove(e)),
                this.map.on('click', e => this.onMapClick(e)),
                this.map.on('dblclick', e => this.onMapDoubleClick(e)),
                this.map.on('moveend', () => {
                    this.loadSplatFootprints();
                    this.updateVisibleBbox();
                }),
                this.map.on('contextmenu', e => {
                    this.selectAt(e.pixel);
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                })
            ]);
            this.listeners.bus(emitter, 'addItems', () => this.reloadFileLayers());

            if (this.selectionControl) this.map.addControl(this.selectionControl);
            this.map.addControl(this.measureControls);
            this.settingsControl = new SettingsControl({
                onOpenSettings: () => { this.mapSettingsDialogOpen = true; }
            });
            this.map.addControl(this.settingsControl);
            // The scale bar, at the bottom left beside the settings button (ol-controls.css)
            this.scaleLine = new ScaleLine({ bar: true, minWidth: 100, units: scaleLineUnits(this.measureUnit) });
            this.map.addControl(this.scaleLine);

            // Toolbar zones: the controls stack without overlapping; MapToolbar teleports in
            const zones = createControlZones(this.map);
            if (this.selectionControl) moveToZone(this.selectionControl, zones.topLeft);
            moveToZone(this.measureControls, zones.topRight);
            moveToZone(this.settingsControl, zones.bottomLeft);
            this.zones = zones;

            Keyboard.onKeyDown(this.handleKeyDown);
            Keyboard.onKeyUp(this.handleKeyUp);

            // Redraw, otherwise openlayers does not draw the map correctly
            this.later(() => this.updateSize(), 1);
        },

        reloadFileLayers: function () {
            if (!this.loaded) return;
            // Another folder: the popup and the footprint of a photo of the previous one go
            if (this.$refs.filePopup && this.$refs.filePopup.closeUnlessIn(this.files)) this.fileLayers.clearFootprints();
            this.vectorLayers.forEach(layer => this.map.removeLayer(layer));
            this.vectorLayers = [];
            const vectorFiles = this.fileLayers.build(this.files, { standalone: this.standalone, shotStyle: this.shotStyleKey() });

            // Zoom once every vector file's metadata is in (resolves at once without vectors)
            Promise.all(vectorFiles.map(f => this.addVectorLayer(f))).then(() => {
                if (this.fitsToFiles()) this.zoomToFilesExtent();
            });
            // The dataset map keeps the order the user gave the layers; a view's order is its state's
            this.syncRasterLayers(this.fileLayers.rasterSlots, { keepOrder: !this.view });
            // New layers get the plant-health styling remembered for their file
            this.refreshRasterLayers();
            this.loadSplatFootprints();
            this.updateRastersOpacity();
            // A tool target that left the map is replaced first: it decides which measurements load
            this.reconcileAnalysisTarget();
            this.loadSavedMeasurements();
            this.restorePlantHealthFromHash(this.files);
            // After the link's style: a raster without a style gets the default of its value info (FR-RAS-01)
            this.seedRasterDefaults();
            this.viewZoomCap.schedule();
        },

        // A view and the standalone map keep their position: the map fits its files once, on the
        // first load (of a view without a saved position; the world view the map starts with is
        // reported before that fit), so adding or removing a layer never moves it
        fitsToFiles: function () {
            if (!this.view && !this.standalone) return true;
            const first = this.fitPending;
            this.fitPending = false;
            return first;
        },

        // A view opens on its base file, not on all of its layers
        mainFileExtent: function () {
            const geom = this.baseEntry && this.baseEntry.polygon_geom;
            return geom ? mercatorExtent(geom) : null;
        },

        // The window the map shows, as the WGS 84 box of the export of the visible extent (D-023)
        updateVisibleBbox: function () {
            const size = this.map && this.map.getSize();
            this.visibleBbox = size ? visibleBbox(this.map.getView().calculateExtent(size)) : null;
        },

        // The footprints of the georeferenced splats in view (the points of the others stay)
        loadSplatFootprints: function () {
            if (!this.map || !this.fileLayers) return;
            const extent = this.map.getView().calculateExtent(this.map.getSize());
            this.fileLayers.splats.loadInView(extent, this.dataset).catch(error => console.error('Error loading splat footprints:', error));
        },

        addVectorLayer: async function (file) {
            try {
                const layer = await createVectorFileLayer({
                    dataset: this.dataset,
                    file,
                    color: getVectorColor(file.entry.path, this.vectorLayers.length, this.vectorLayerColors),
                    getZoom: () => (this.map ? this.map.getView().getZoom() : 0)
                });
                this.map.addLayer(layer);
                this.vectorLayers.push(layer);
            } catch (error) {
                console.error('Error loading vector file:', error);
            }
        },

        isSelecting: function () {
            return this.selectPolygon || !!(this.selectionControl && this.selectionControl.isActive());
        },

        // Tooltip over vector features and shots; pointer cursor over anything clickable
        onPointerMove: function (e) {
            const target = e.originalEvent && e.originalEvent.target;
            if (e.dragging || this.measuring || (target instanceof Element && target.closest(MAP_CONTROLS))) {
                this.hideFeatureTooltip();
                return;
            }
            const vectorHit = featureAt(this.map, e.pixel, l => this.vectorLayers.includes(l));
            const shotHit = vectorHit ? null : featureAt(this.map, e.pixel, l => l === this.fileLayers.shotLayer);
            const splatHit = vectorHit || shotHit ? null : featureAt(this.map, e.pixel, l => l === this.fileLayers.splats.layer);
            this.map.getTargetElement().style.cursor = vectorHit || shotHit || splatHit ? 'pointer' : 'inherit';

            const shots = shotHit && shotHit.feature.get('features');
            if (vectorHit) this.showFeatureTooltip(vectorHit.feature, e.pixel, vectorHit.layer);
            else if (shots && shots.length) this.showTextTooltip(this.shotsLabel(shots), e.pixel);
            else if (splatHit) this.showTextTooltip(ddb.pathutils.basename(splatHit.feature.file.entry.path), e.pixel);
            else this.hideFeatureTooltip();
        },

        // "name - 12.3 km/h" for one shot (speed with the direction indicators), "N images" for a cluster
        shotsLabel: function (shots) {
            if (shots.length !== 1) return `${shots.length} images`;
            const label = ddb.pathutils.basename(shots[0].file.entry.path);
            const speed = shots[0].computedSpeed;
            return this.showDirectionIndicators && speed !== undefined && speed !== null
                ? `${label} - ${formatSpeed(speed, this.currentUnitPref)}`
                : label;
        },

        showTextTooltip: function (text, pixel) {
            this.tooltipElement.innerHTML = sanitizeHtml(text);
            this.tooltipElement.style.display = 'block';
            this.tooltipOverlay.setPosition(this.map.getCoordinateFromPixel(pixel));
        },

        onMapClick: function (e) {
            if (this.measuring || this.isSelecting()) return;
            if (this.selectSingle) {
                this.selectAt(e.pixel);
                return;
            }
            this.$refs.filePopup.close();
            this.fileLayers.clearFootprints();

            // Raster extents do not highlight on click
            const { shotLayer, extentLayer } = this.fileLayers;
            const hit = featureAt(this.map, e.pixel, l => l.getVisible() && (l === shotLayer || l === extentLayer));
            const shots = hit && hit.feature.get('features');
            if (shots) this.openShot(shots[0].file, e.coordinate);
            shotLayer.changed();
        },

        // The user closed the photo popup (Escape, its Close button): the footprint goes. The
        // overlay stack gives a focus that was in the popup back to the map
        onFilePopupDismissed: function () {
            if (this.fileLayers) this.fileLayers.clearFootprints();
        },

        // A clicked shot: panoramas open, photos and videos get the popup, photos their footprint
        openShot: function (file, coordinate) {
            const T = ddb.entry.type;
            const type = file.entry.type;
            if (type === T.PANORAMA || type === T.GEOPANORAMA) {
                this.$emit('openItem', file, 'panorama');
                return;
            }
            if (type === T.GEOIMAGE || type === T.GEOVIDEO) this.$refs.filePopup.show(file, coordinate);
            if (type === T.GEOIMAGE && file.entry.polygon_geom) this.fileLayers.showFootprint(file);
        },

        // Double click: a vector feature's properties, or play a video
        onMapDoubleClick: function (e) {
            if (this.measuring) return;
            const vectorHit = featureAt(this.map, e.pixel, l => this.vectorLayers.includes(l));
            if (vectorHit) {
                e.stopPropagation();
                this.showFeaturePropertiesDialog(vectorHit.feature, vectorHit.layer);
                return;
            }
            if (this.isSelecting()) return;
            const hit = featureAt(this.map, e.pixel, l => l.getVisible() && l === this.fileLayers.shotLayer);
            const file = hit && hit.feature.get('features')[0].file;
            // A splat opens in its viewer
            const splat = hit ? null : featureAt(this.map, e.pixel, l => l === this.fileLayers.splats.layer);
            if (splat) {
                this.$refs.filePopup.close();
                this.$emit('openItem', splat.feature.file);
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            if (file && file.entry.type === ddb.entry.type.GEOVIDEO) {
                this.$refs.filePopup.close();
                this.$emit('openItem', file);
                e.preventDefault();
            }
        },

        // Ctrl+click / right click: toggle the selection of what is under the pointer
        selectAt: function (pixel) {
            const file = toggleSelectionAt(this.map, pixel, this.vectorLayers);
            if (file) this.$emit('scrollTo', file);
            this.updateRastersOpacity();
            this.updateClearSelectionButton();
        },

        handlePolygonSelection: function (polygon) {
            this.selectPolygon = true;
            const files = filesInPolygon(polygon, {
                shots: this.fileLayers.shotFeatures.getFeatures(),
                extents: this.fileLayers.extentFeatures.getFeatures(),
                vectorLayers: this.vectorLayers
            });
            files.forEach(file => { file.selected = true; });
            if (files.length) this.$emit('scrollTo', files[0]);
            this.updateRastersOpacity();
            this.updateClearSelectionButton();
        },

        clearSelection: function () {
            this.files.forEach(f => f.selected = false);
            this.updateClearSelectionButton();
        },

        updateClearSelectionButton: function () {
            if (this.selectionControl) this.selectionControl.setClearButtonVisible(this.files.some(f => f.selected));
        },

        zoomToFilesExtent: function () {
            const own = this.mainFileExtent();
            const ext = own || this.fileLayers.extent();
            // Vector files: the entry's geometry (a VectorTileSource only knows its loaded tiles)
            if (!own) {
                this.files.forEach(f => {
                    const geom = f.entry && f.entry.type === ddb.entry.type.VECTOR && (f.entry.polygon_geom || f.entry.point_geom);
                    if (geom) extendExtent(ext, mercatorExtent(geom));
                });
                // A raster that is building has no layer yet: the map looks at where it will be (FR-RAS-09)
                this.files.forEach(f => {
                    if (f.placeholder?.footprint) extendExtent(ext, mercatorExtent(f.placeholder.footprint));
                });
            }
            if (!isEmptyExtent(ext)) {
                // Remember the first extent for Reset view
                if (!this.initialExtent) this.initialExtent = ext.slice();
                this.later(() => this.map.getView().fit(ext, fileFitOptions(ext)), 10);
            } else if (this.vectorLayers.length === 0 && this.files.length === 0) {
                this.map.getView().setCenter([0, 0]);
                this.map.getView().setZoom(2);
            }
        },

        // The extent (EPSG:3857) of the raster layer of `path`; null while it is not drawn yet (or has no size to fit).
        // A raster that is building is not drawn: its footprint stands in for the layer
        layerExtent: function (path) {
            const row = this.rasterLayerList.find(r => r.path === path);
            const footprint = row?.placeholder?.footprint;
            const extent = row?.olLayer?.getExtent() ?? (footprint ? mercatorExtent(footprint) : null);
            return extent && !isEmptyExtent(extent) ? extent : null;
        },

        // "Zoom to layer": the map fits the extent of one raster layer (FR-MAP-08)
        zoomToLayer: function (path) {
            const extent = this.layerExtent(path);
            if (!this.map || !extent) return false;
            this.map.getView().fit(extent, fileFitOptions(extent));
            return true;
        },

        // A layer was added to the view (the parent calls it with the path). A layer that lands where the map is not
        // looking would show nothing happened: the toast says where it is, with "Zoom to layer" (FR-MAP-08, FR-XC-23).
        // The layer is drawn a moment after the add: it is asked for until it is there
        announceAddedLayer: function (path, attempt = 0) {
            const extent = this.layerExtent(path);
            if (!extent) {
                if (attempt < ADDED_LAYER_WAIT_TRIES) this.later(() => this.announceAddedLayer(path, attempt + 1), ADDED_LAYER_WAIT_MS);
                return;
            }
            const size = this.map?.getSize();
            if (!size || extentsIntersect(extent, this.map.getView().calculateExtent(size))) return;
            const name = this.rasterLayerList.find(r => r.path === path)?.name ?? path;
            notify.info(`${name} is outside the part of the map you are looking at.`, {
                summary: 'Layer added',
                action: { label: 'Zoom to layer', run: () => this.zoomToLayer(path) }
            });
        },

        resetToInitialView: function () {
            if (this.initialExtent && !isEmptyExtent(this.initialExtent)) this.map.getView().fit(this.initialExtent, fileFitOptions(this.initialExtent));
            else this.zoomToFilesExtent();
        },

        // The shortcuts are the map's while the pointer or focus is on it, not while typing
        shortcutsFor: function (e) {
            const t = e && e.target;
            const typing = t instanceof Element && (t.closest('input, textarea, select') || t.isContentEditable);
            return (this.pointerInside || this.focusInside) && !typing;
        },

        shotStyleKey: function () {
            return this.showDirectionIndicators ? 'direction' : 'shot';
        },

        setDirectionIndicators: function (on) {
            this.showDirectionIndicators = on;
        },

        setFlightPath: function (on) {
            this.showFlightPath = on;
        },

        toggleLinkPanel: function () {
            if (!this.linkPanelOpen) {
                // One panel at a time in that corner
                if (this.plantHealthVisible) this.closePlantHealth();
                if (this.rasterPanelVisible) this.closeRasterAnalysis();
                if (this.stockpilePanelVisible) this.closeStockpileVolume();
            }
            this.linkPanelOpen = !this.linkPanelOpen;
        },

        goBack: function () {
            this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
        },

        // The compare button of the dataset map with one georaster opens a view of it, with the
        // picker, in a new tab. A view has no such button: it adds a layer in its layer panel, and
        // only a view that starts from several files turns split on by itself
        compareTo: function () {
            if (this.dataset && this.rasterLayerList.length) openInNewTab(fileViewUrl(this.dataset, this.rasterLayerList[0].path, { pick: true }));
        },

        toggleFullscreen: function () {
            if (isFullScreenCurrently()) {
                exitFullScreen();
            } else {
                requestFullScreen(this.$el);
                this.later(() => this.updateSize(), 500);
            }
        },

        handleKeyDown: function (e) {
            if (!this.shortcutsFor(e)) return;
            if (Keyboard.isToggleSelectPressed()) {
                this.selectSingle = true;
                if (this.selectionControl) this.selectionControl.deactivate();
            }
            // H: reset view
            if (e.keyCode === 72) this.resetToInitialView();
        },

        handleKeyUp: function (e) {
            // ESC
            if (e.keyCode === 27) {
                this.selectSingle = false;
                this.measureControls.deselectCurrent();
                if (this.selectionControl) this.selectionControl.deactivate();
            }
            if (!Keyboard.isToggleSelectPressed() && this.shortcutsFor(e)) this.selectSingle = false;
        },

        handleLayerPlantHealth: function (path) {
            // The same layer's button again closes the panel
            if (this.plantHealthVisible && this.plantHealthFilePath === path) this.closePlantHealth();
            else this.openPlantHealth(path);
        }
    }
};
</script>

<style scoped>
#map {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.map-container {
    -webkit-tap-highlight-color: transparent;
    position: relative;
    width: 100%;
    height: 100%;

    &.cursor-pointer {
        cursor: pointer;
    }

    &.cursor-crosshair {
        cursor: crosshair;
    }
}
</style>
