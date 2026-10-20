<template>
    <div id="map" @mouseover="setMouseInside(true)" @mouseleave="setMouseInside(false)">
        <DialogHost :dialogs="dialogs" />
        <div ref="map-container" class="map-container" :class="{
            'cursor-pointer': selectSingle,
            'cursor-crosshair': selectPolygon
        }">
            <OpacityControl v-if="rasterLayerList.length <= 1 && !splitMode" v-model="rasterOpacity" :visible="hasRasters"
                            :show-plant-health-btn="rasterLayerList.length === 1 && !!rasterLayerList[0]?.plantHealthCapable"
                            :plant-health-active="plantHealthVisible"
                            @plant-health="handleLayerPlantHealth(rasterLayerList[0]?.path)" />
            <RasterLayerOpacityPanel v-else-if="!splitMode" v-model:layers="rasterLayerList"
                                     :active-plant-health-path="plantHealthVisible ? plantHealthFilePath : null"
                                     @reorder="handleRasterLayerReorder"
                                     @plant-health="handleLayerPlantHealth" />
            <RasterSplitOverlay v-if="splitMode" :bands="splitBands" :positions="splitPositions" @update:positions="onSplitPositionsChange" />
            <PlantHealthPanel :visible="plantHealthVisible" :dataset="dataset" :file-path="plantHealthFilePath"
                              :initial-params="plantHealthInitialParams" @close="closePlantHealth"
                              @viz-params-changed="handleVizParamsChanged" />
            <RasterAnalysisControls :visible="rasterPanelVisible" :dataset="dataset" :file-path="rasterFilePath"
                                    :initial-params="rasterInitialParams" :spot-info="rasterSpotInfo" :area-stats="rasterAreaStats"
                                    :profile="rasterProfile" :profile-loading="rasterProfileLoading" :profile-error="rasterProfileError"
                                    :drawing-profile="rasterProfileDrawing" :inspect-active="rasterInspectActive" @close="closeRasterAnalysis"
                                    @viz-params-changed="handleRasterVizParamsChanged" @pick-profile="handlePickProfile"
                                    @clear-profile="handleClearProfile" @cancel-draw-profile="cancelRasterProfileDrawing"
                                    @toggle-inspect-value="toggleRasterInspect" @profile-hover="handleProfileHover"
                                    @open-contour-dialog="openContourDialog" />
            <ContourOptionsDialog v-model:visible="contourDialogVisible" :loading="contourLoading" :unit="contourUnit"
                                  :raster-min="contourRasterMin" :raster-max="contourRasterMax" :initial-options="contourLastOptions"
                                  @generate="generateContourLines" @cancel="closeContourDialog" />
            <StockpileVolumePanel :visible="stockpilePanelVisible" :loading="stockpileLoading" :error="stockpileError"
                                  :result="stockpileResult" :base-method="stockpileBaseMethod" :sensitivity="stockpileSensitivity"
                                  :radius="stockpileRadius" :material="stockpileMaterial" :materials="stockpileMaterials"
                                  :mode="stockpileMode" :custom-density="stockpileCustomDensity"
                                  :custom-cost-per-ton="stockpileCustomCostPerTon" :unit-pref="currentUnitPref" :title="stockpileTitle"
                                  :description="stockpileDescription" @close="closeStockpileVolume" @click-on-map="startStockpileClickMode"
                                  @draw-polygon="startStockpilePolygonDrawing" @clear-overlay="clearStockpileOverlay"
                                  @cancel-mode="stopStockpileInteractions" @export-geo-json="exportStockpileGeoJson"
                                  @update:base-method="stockpileBaseMethod = $event" @update:sensitivity="stockpileSensitivity = $event"
                                  @update:radius="stockpileRadius = $event" @update:material="stockpileMaterial = $event"
                                  @update:custom-density="stockpileCustomDensity = $event"
                                  @update:custom-cost-per-ton="stockpileCustomCostPerTon = $event" @update:title="stockpileTitle = $event"
                                  @update:description="stockpileDescription = $event" />
        </div>
        <MapDialogs :alert-dialog-open="alertDialogOpen" :alert-title="alertTitle" :alert-message="alertMessage"
                    :clear-measurements-dialog-open="clearMeasurementsDialogOpen"
                    :delete-saved-measurements-dialog-open="deleteSavedMeasurementsDialogOpen" @alert-close="handleAlertDialogClose"
                    @clear-measurements-close="handleClearMeasurementsDialogClose"
                    @delete-saved-measurements-close="handleDeleteSavedMeasurementsDialogClose" />
        <ChangeUnitsDialog v-if="changeUnitsDialogOpen" :target-unit="changeUnitsTargetUnit"
                           :measurements-count="changeUnitsMeasurementsCount" @on-close="handleChangeUnitsDialogClose" />
        <MeasurementListDialog v-if="measurementListDialogOpen" :measurements="measurementListItems"
                               :groups="measurementGroups"
                               @on-close="measurementListDialogOpen = false"
                               @delete-measurement="handleDeleteMeasurementFromList"
                               @edit-measurement="handleEditMeasurementFromList"
                               @create-group="openCreateGroupDialog"
                               @rename-group="openRenameGroupDialog"
                               @delete-group="deleteGroup"
                               @toggle-group-visibility="toggleGroupVisibility"
                               @move-measurement-to-group="moveMeasurementToGroup" />
        <MeasurementGroupDialog v-if="measurementGroupDialogOpen"
                                :group="pendingGroupForRename"
                                @on-close="measurementGroupDialogOpen = false"
                                @on-save="handleGroupDialogSave" />
        <MapSettingsDialog v-if="mapSettingsDialogOpen" :basemaps="basemaps" :selected-basemap="selectedBasemap"
                           :unit-pref="currentUnitPref" :custom-basemap-config="customBasemapConfig"
                           @on-close="mapSettingsDialogOpen = false" @basemap-changed="handleBasemapChanged"
                           @units-changed="handleUnitsChanged" @custom-basemap-config-changed="handleCustomBasemapConfigChanged" />
        <MapFilePopup ref="filePopup" :map="map" @open-item="file => $emit('openItem', file)" />
        <MapToolbar v-if="zones" :zones="zones" :show-back="standalone && !!dataset" :display-options="!standalone"
                    :analysis-entry="analysisFile" :raster-count="rasterLayerList.length"
                    :direction-indicators="showDirectionIndicators" :flight-path="showFlightPath"
                    :split-mode="splitMode" :can-compare="canCompare"
                    @back="goBack" @reset="resetToInitialView" @fullscreen="toggleFullscreen"
                    @analysis="kind => toggleAnalysisPanel(kind, analysisFile)"
                    @update:direction-indicators="setDirectionIndicators" @update:flight-path="setFlightPath"
                    @toggle-split="toggleSplit" />
    </div>
</template>

<script>
/**
 * MapViewer - the dataset map (Map tab) and, with `standalone`, the single-file map.
 * HQ-07: the view wires OpenLayers to the map features (composables), the file-layer
 * helpers (libs/map/*) and its child components (toolbar, popup, panels, dialogs).
 */
import 'ol/ol.css';
import { Map, View } from 'ol';
import { Vector as VectorLayer, Group as LayerGroup } from 'ol/layer';
import { Vector as VectorSource, Cluster } from 'ol/source';
import { createEmpty as createEmptyExtent, isEmpty as isEmptyExtent, extend as extendExtent } from 'ol/extent';
import { transformExtent, toLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon, { fromExtent } from 'ol/geom/Polygon';
import { coordAll } from '@turf/meta';
import bbox from '@turf/bbox';
import { markRaw, shallowRef, ref, computed, getCurrentInstance } from 'vue';

import ddb from 'ddb';
import emitter from '@/libs/eventBus';
import Keyboard from '@/libs/keyboard';
import { requestFullScreen, exitFullScreen, isFullScreenCurrently } from '@/libs/utils';
import { EPSG } from '@/libs/constants';
import { formatSpeed } from '@/libs/format';
import { getPref, setPref, PREF } from '@/libs/preferences';
import { sanitizeHtml } from '@/libs/sanitize';
import { isPlantHealthCapable, isRasterAnalysisCapable } from '@/libs/entryTypes';
import MeasureControls from '@/libs/map/controls/measureControl';
import SelectionControl from '@/libs/map/controls/selectionControl';
import SettingsControl from '@/libs/map/controls/settingsControl';
import { createControlZones, moveToZone } from '@/libs/map/controlZones';
import { createFileLayerStyles } from '@/libs/map/fileLayerStyles';
import { featureAt, toggleSelectionAt, filesInPolygon } from '@/libs/map/fileSelection';
import { orderFlightPath } from '@/libs/map/flightPath';
import { createRasterTileLayer, ViewZoomCap } from '@/libs/map/rasterLayers';
import { MeasurementStorage, isMeasurementFile } from '@/libs/map/measurementStorage';
import { getVectorColor } from '@/libs/map/mapUtils';
import { createMvtVectorStyles, createMvtStyleFunction, createMvtVectorLayer, fetchMvtMetadata } from '@/composables/useMvtLayer';

import { useListenerBag } from '@/composables/useEventListener';
import { useTimerGroup } from '@/composables/useTimers';
import { useDialogs } from '@/composables/useDialogs';
import { useMapAlerts } from '@/composables/useMapAlerts';
import { useMapBasemap } from '@/composables/useMapBasemap';
import { useMapTooltip } from '@/composables/useMapTooltip';
import { useMapMeasurements } from '@/composables/useMapMeasurements';
import { usePlantHealth } from '@/composables/usePlantHealth';
import { useRasterAnalysis } from '@/composables/useRasterAnalysis';
import { useStockpileVolume } from '@/composables/useStockpileVolume';
import { useContourLines } from '@/composables/useContourLines';
import { useMapPanels } from '@/composables/useMapPanels';
import { useMapSplitCompare } from '@/composables/useMapSplitCompare';

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
import MapDialogs from './MapDialogs.vue';
import ChangeUnitsDialog from './ChangeUnitsDialog.vue';
import MapSettingsDialog from './MapSettingsDialog.vue';
import MeasurementListDialog from './MeasurementListDialog.vue';
import MeasurementGroupDialog from './MeasurementGroupDialog.vue';

// Pointer over one of these: no feature tooltip
const MAP_CONTROLS = '.ol-map-display-buttons, .ol-map-buttons, .ol-measure-control, .ol-selection, .ol-zoom, .ol-settings';
const FIT_OPTIONS = { padding: [40, 40, 40, 40], duration: 500, minResolution: 0.5, maxZoom: 22 };

export default {
    name: 'MapViewer',
    components: {
        DialogHost, MapToolbar, MapFilePopup, OpacityControl, RasterLayerOpacityPanel, RasterSplitOverlay, PlantHealthPanel,
        RasterAnalysisControls, ContourOptionsDialog, StockpileVolumePanel, MapDialogs, ChangeUnitsDialog, MapSettingsDialog,
        MeasurementListDialog, MeasurementGroupDialog
    },
    inject: {
        registerTabChild: { default: null },
        unregisterTabChild: { default: null }
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
        lazyload: {
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
        // The single-file map route (SingleMap): a Back button, no selection tools, and a
        // photo with a footprint is drawn as a raster instead of a camera marker
        standalone: {
            type: Boolean,
            default: false
        }
    },
    emits: ['scrollTo', 'openItem'],
    setup(props) {
        // OpenLayers objects shared with the map features (assigned in loadMap)
        const map = shallowRef(null);
        const measureControls = shallowRef(null);
        const rasterLayer = shallowRef(null);
        const vectorLayers = shallowRef([]);
        const zones = shallowRef(null);
        // Georasters, top first: [{ name, path, olLayer, opacity, plantHealthCapable }]
        const rasterLayerList = ref([]);
        const currentUnitPref = ref(getPref(PREF.MEASURE_UNIT, 'metric'));
        const dialogs = useDialogs();
        const alerts = useMapAlerts();
        // Map methods some features call back into
        const host = getCurrentInstance().proxy;

        // Features (HQ-07); `f` resolves their cross references lazily
        const f = {};
        const dataset = () => props.dataset;
        f.measurements = useMapMeasurements({
            canWrite: () => props.canWrite, canDelete: () => props.canDelete, measureControls,
            showAlert: () => alerts.showAlert, showFlash: () => alerts.showFlash,
            getActiveMeasurementEntry: () => () => host.getActiveMeasurementEntry(),
            initMeasurementStorage: () => () => host.initMeasurementStorage()
        });
        f.plantHealth = usePlantHealth({
            dataset, rasterLayer, entry: () => null,
            closeRasterAnalysis: () => f.raster.closeRasterAnalysis,
            closeStockpileVolume: () => f.stockpile.closeStockpileVolume
        });
        f.raster = useRasterAnalysis({
            dataset, map, measureControls, rasterLayer,
            currentVizParams: f.plantHealth.currentVizParams, vizParamsByPath: f.plantHealth.vizParamsByPath,
            refreshRasterLayers: () => f.plantHealth.refreshRasterLayers,
            onRasterProfileHover: () => undefined,
            closePlantHealth: () => f.plantHealth.closePlantHealth,
            closeStockpileVolume: () => f.stockpile.closeStockpileVolume
        });
        f.stockpile = useStockpileVolume({
            dataset, map, measureControls, currentUnitPref,
            deletedMeasurementIds: f.measurements.deletedMeasurementIds, hasSavedMeasurements: f.measurements.hasSavedMeasurements,
            rasterFilePath: f.raster.rasterFilePath,
            getMapCenterLatLon: () => () => host.getMapCenterLatLon(),
            closePlantHealth: () => f.plantHealth.closePlantHealth,
            closeRasterAnalysis: () => f.raster.closeRasterAnalysis
        });
        f.contours = useContourLines({
            dataset, measureControls, rasterFilePath: f.raster.rasterFilePath,
            hasSavedMeasurements: f.measurements.hasSavedMeasurements,
            showAlert: () => alerts.showAlert, showFlash: () => alerts.showFlash
        });
        f.tooltip = useMapTooltip({ map, vectorLayers, dialogs: () => dialogs });
        const panels = useMapPanels({
            plantHealth: { visible: () => f.plantHealth.plantHealthVisible.value, open: e => f.plantHealth.openPlantHealth(e), close: () => f.plantHealth.closePlantHealth() },
            rasterAnalysis: { visible: () => f.raster.rasterPanelVisible.value, open: e => f.raster.openRasterAnalysis(e), close: () => f.raster.closeRasterAnalysis() },
            stockpile: { visible: () => f.stockpile.stockpilePanelVisible.value, open: e => f.stockpile.openStockpileVolume(e), close: () => f.stockpile.closeStockpileVolume() }
        });
        const split = useMapSplitCompare({ map, rasterLayers: rasterLayerList, onChange: () => host.updateRastersOpacity() });

        return {
            map, measureControls, rasterLayer, vectorLayers, zones, rasterLayerList, currentUnitPref, dialogs,
            ...alerts,
            ...useMapBasemap(map),
            ...f.measurements, ...f.plantHealth, ...f.raster, ...f.stockpile, ...f.contours, ...f.tooltip,
            ...split,
            toggleAnalysisPanel: panels.toggle,
            // The file the toolbar's Raster Analysis / Stockpile tools open for
            analysisFile: computed(() => props.files.find(x => x.entry && isRasterAnalysisCapable(x.entry)) || null),
            later: useTimerGroup(),
            listeners: useListenerBag()
        };
    },
    data: function () {
        return {
            selectSingle: false,
            selectPolygon: false,
            initialExtent: null,
            vectorLayerColors: {},
            currentOrthophotoEntry: null,
            mapSettingsDialogOpen: false,
            showFlightPath: getPref(PREF.SHOW_FLIGHT_PATH, true),
            showDirectionIndicators: getPref(PREF.SHOW_DIRECTION_INDICATORS, false),

            // Measurement group dialog
            measurementGroupDialogOpen: false,
            pendingGroupForRename: null,

            // Change units dialog
            changeUnitsDialogOpen: false,
            changeUnitsTargetUnit: 'metric',
            changeUnitsPreviousUnit: 'metric',
            changeUnitsMeasurementsCount: 0,

            rasterOpacity: 1.0,
            hasRasters: false
        };
    },
    computed: {
        // Identity of the file set: a change (added, removed, reordered, replaced in place)
        // rebuilds the layers; anything else is a selection change
        filesKey: function () {
            return this.files.map(f => f.path || (f.entry && f.entry.path)).join('\n');
        }
    },
    watch: {
        rasterOpacity: function () {
            this.updateRastersOpacity();
        },
        rasterLayerList: {
            deep: true,
            handler: function () {
                this.updateRastersOpacity();
            }
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
                if (typeof this.fileLayer !== 'undefined') {
                    this.fileLayer.changed();
                    this.updateRastersOpacity();
                }
            }
        }
    },
    mounted: function () {
        if (this.registerTabChild) this.registerTabChild('map', this);
        if (!this.lazyload) {
            this.loadMap();
            this.reloadFileLayers();
        }
    },
    beforeUnmount: function () {
        if (this.unregisterTabChild) this.unregisterTabChild('map');
        Keyboard.offKeyDown(this.handleKeyDown);
        Keyboard.offKeyUp(this.handleKeyUp);
        if (this.viewZoomCap) this.viewZoomCap.dispose();
        if (this.map) {
            if (this.tooltipOverlay) this.map.removeOverlay(this.tooltipOverlay);
            this.vectorLayers.forEach(layer => this.map.removeLayer(layer));
        }
        this.tooltipOverlay = null;
        this.tooltipElement = null;
        this.vectorLayers = [];
    },
    methods: {
        // Generate a unique color based on the file name or index
        getVectorFileColor: function (file, index) {
            return getVectorColor(file.entry.path, index, this.vectorLayerColors);
        },

        // Returns current map view center as [lon, lat] in WGS84, or null if unavailable.
        getMapCenterLatLon: function () {
            const center = this.map && this.map.getView().getCenter();
            return center ? toLonLat(center) : null;
        },

        loadMap: function () {
            if (this.loaded) return;
            this.loaded = true;
            this.vectorLayers = [];

            // File layers, bottom to top: rasters, clicked footprints, invisible raster
            // extents (to click rasters), then flight path, shots and flags
            this.styles = createFileLayerStyles();
            this.rasterLayer = new LayerGroup();
            this.footprintRastersLayer = new LayerGroup();
            this.extentsFeatures = new VectorSource();
            this.extentLayer = new VectorLayer({ source: this.extentsFeatures, style: this.styles.invisible });
            this.fileFeatures = new VectorSource();
            this.fileLayer = new VectorLayer({
                source: new Cluster({ distance: 0.0001, source: this.fileFeatures }),
                style: this.styles.forCluster
            });
            this.flightPathFeatures = new VectorSource();
            this.flightPathLayer = new VectorLayer({ source: this.flightPathFeatures, visible: this.showFlightPath });
            this.markerFeatures = new VectorSource();
            this.markerLayer = new VectorLayer({ source: this.markerFeatures, visible: this.showFlightPath });
            const topLayers = new LayerGroup({ layers: [this.flightPathLayer, this.fileLayer, this.markerLayer] });

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

            this.measureControls = new MeasureControls({
                openDialog: (component, props) => this.dialogs.open(component, props),
                onToolSelected: () => { this.measuring = true; if (this.selectionControl) this.selectionControl.deactivate(); },
                onToolDeselected: () => { this.measuring = false; },
                onSave: () => { this.saveMeasurements(); },
                onClearAll: () => { this.onClearAllMeasurements(); },
                onExport: () => { this.exportMeasurementsToFile(); },
                onDeleteSaved: () => { this.deleteSavedMeasurements(); },
                onRequestClearConfirm: () => { this.clearMeasurementsDialogOpen = true; },
                onRequestDeleteConfirm: () => { this.deleteSavedMeasurementsDialogOpen = true; },
                onListOpen: () => { this.openMeasurementListDialog(); },
                onMeasurementDeleted: (feature) => {
                    if (!feature || !this.deletedMeasurementIds) return;
                    const id = feature.get && feature.get('id');
                    if (id) this.deletedMeasurementIds.add(id);
                    // Allow the stockpile composable to reset its panel
                    // state when the user erases a draft polygon.
                    this.onStockpileFeatureRemoved(feature);
                },
                canWrite: this.canWrite,
                canDelete: this.canDelete
            });

            this.map = new Map({
                target: this.$refs['map-container'],
                layers: [
                    this.createBasemapLayer(),
                    this.rasterLayer,
                    this.footprintRastersLayer,
                    this.extentLayer,
                    topLayers,
                    this.measureControls.getLayer()
                ],
                view: new View({ center: [0, 0], zoom: 2 })
            });

            this.setupTooltipOverlay();
            this.map.addOverlay(this.tooltipOverlay);
            this.map.once('postrender', () => {
                this.map.getTargetElement().querySelector('canvas').style.cursor = 'inherit';
            });

            // The View's max zoom follows the deepest native zoom of the loaded rasters
            this.viewZoomCap = new ViewZoomCap(this.map, [this.rasterLayer, this.footprintRastersLayer]);

            // Map listeners are removed with the component (this.listeners)
            this.listeners.ol([
                this.map.on('pointermove', e => this.onPointerMove(e)),
                this.map.on('click', e => this.onMapClick(e)),
                this.map.on('dblclick', e => this.onMapDoubleClick(e)),
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

            // Toolbar zones: the controls stack without overlapping; MapToolbar teleports in
            const zones = createControlZones(this.map);
            if (this.selectionControl) moveToZone(this.selectionControl, zones.topLeft);
            moveToZone(this.measureControls, zones.topRight);
            moveToZone(this.settingsControl, zones.bottomLeft);
            this.zones = zones;

            Keyboard.onKeyDown(this.handleKeyDown);
            Keyboard.onKeyUp(this.handleKeyUp);

            // Redraw, otherwise openlayers does not draw the map correctly
            this.later(() => this.map.updateSize(), 1);
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
            const shotHit = vectorHit ? null : featureAt(this.map, e.pixel, l => l === this.fileLayer);
            this.map.getTargetElement().style.cursor = vectorHit || shotHit ? 'pointer' : 'inherit';

            const shots = shotHit && shotHit.feature.get('features');
            if (vectorHit) this.showFeatureTooltip(vectorHit.feature, e.pixel, vectorHit.layer);
            else if (shots && shots.length) this.showTextTooltip(this.shotsLabel(shots), e.pixel);
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
            this.clearLayerGroup(this.footprintRastersLayer);

            // Raster extents no longer highlight on click (the outline mode was removed)
            const hit = featureAt(this.map, e.pixel, l => l.getVisible() && (l === this.fileLayer || l === this.extentLayer));
            const shots = hit && hit.feature.get('features');
            if (shots) this.openShot(shots[0].file, e.coordinate);
            this.fileLayer.changed();
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
            if (type === T.GEOVIDEO || !file.entry.polygon_geom) return;

            const footprint = new Polygon([coordAll(file.entry.polygon_geom)]);
            footprint.transform(EPSG.WGS84, EPSG.WEB_MERCATOR);
            this.footprintRastersLayer.getLayers().push(createRasterTileLayer(file, footprint.getExtent()));
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
            const hit = featureAt(this.map, e.pixel, l => l.getVisible() && l === this.fileLayer);
            const file = hit && hit.feature.get('features') && hit.feature.get('features')[0].file;
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
                shots: this.fileFeatures.getFeatures(),
                extents: this.extentsFeatures.getFeatures(),
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

        onPanelResized: function () {
            // Redraw when map is resized (via panels)
            if (this.map) this.map.updateSize();
        },

        onTabActivated: function () {
            if (!this.loaded) {
                this.loadMap();
                this.reloadFileLayers();
            } else {
                this.$nextTick(() => {
                    if (this.map) this.map.updateSize();
                });
            }
        },

        zoomToFilesExtent: function () {
            const ext = this.getSelectedFilesExtent();
            if (!isEmptyExtent(ext)) {
                // Remember the first extent for Reset view
                if (!this.initialExtent) this.initialExtent = ext.slice();
                this.later(() => this.map.getView().fit(ext, FIT_OPTIONS), 10);
            } else if (this.vectorLayers.length === 0 && this.files.length === 0) {
                this.map.getView().setCenter([0, 0]);
                this.map.getView().setZoom(2);
            }
        },

        resetToInitialView: function () {
            if (this.initialExtent && !isEmptyExtent(this.initialExtent)) this.map.getView().fit(this.initialExtent, FIT_OPTIONS);
            else this.zoomToFilesExtent();
        },

        getSelectedFilesExtent: function () {
            const ext = createEmptyExtent();
            if (this.fileFeatures.getFeatures().length) extendExtent(ext, this.fileFeatures.getExtent());
            this.rasterLayer.getLayers().forEach(layer => extendExtent(ext, layer.getExtent()));

            // Vector files: the entry's geometry (a VectorTileSource only knows its loaded tiles)
            this.files.forEach(f => {
                if (!f.entry || f.entry.type !== ddb.entry.type.VECTOR) return;
                const geom = f.entry.polygon_geom || f.entry.point_geom;
                if (!geom) return;
                const vExt = transformExtent(bbox(geom), EPSG.WGS84, EPSG.WEB_MERCATOR);
                if (!isEmptyExtent(vExt)) extendExtent(ext, vExt);
            });
            return ext;
        },

        clearLayerGroup: function (layerGroup) {
            layerGroup.getLayers().clear();
        },

        setMouseInside: function (flag) {
            this.mouseInside = flag;
        },

        shotStyleKey: function () {
            return this.showDirectionIndicators ? 'direction' : 'shot';
        },

        reloadFileLayers: function () {
            if (!this.loaded) return;

            [this.fileFeatures, this.extentsFeatures, this.flightPathFeatures, this.markerFeatures].forEach(s => s.clear());
            this.clearLayerGroup(this.rasterLayer);
            this.vectorLayers.forEach(layer => this.map.removeLayer(layer));
            this.vectorLayers = [];

            const T = ddb.entry.type;
            const shots = [];
            const stops = [];
            const vectorLoads = [];
            for (const f of this.files) {
                if (!f.entry) continue;
                const type = f.entry.type;
                const imageAsRaster = this.standalone && type === T.GEOIMAGE && f.entry.polygon_geom;
                if ((type === T.GEOIMAGE && !imageAsRaster) || type === T.GEOVIDEO || type === T.GEOPANORAMA) {
                    const lonLat = coordAll(f.entry.point_geom)[0];
                    const feat = new Feature(new Point(lonLat));
                    feat.getGeometry().transform(EPSG.WGS84, EPSG.WEB_MERCATOR);
                    feat.style = type === T.GEOPANORAMA ? 'pano' : this.shotStyleKey();
                    feat.file = f;
                    shots.push(feat);
                    const props = f.entry.properties || {};
                    if (type !== T.GEOPANORAMA && props.captureTime) {
                        stops.push({ coords: lonLat, captureTime: props.captureTime, flightSpeed: props.flightSpeed, feature: feat });
                    }
                } else if (f.entry.polygon_geom && (type === T.GEORASTER || type === T.GEOIMAGE || type === T.POINTCLOUD)) {
                    const extent = transformExtent(bbox(f.entry.polygon_geom), EPSG.WGS84, EPSG.WEB_MERCATOR);
                    this.rasterLayer.getLayers().push(createRasterTileLayer(f, extent));
                    // An invisible extent makes the raster clickable
                    const extentFeat = new Feature(fromExtent(extent));
                    extentFeat.file = f;
                    this.extentsFeatures.addFeature(extentFeat);
                } else if (type === T.VECTOR && !isMeasurementFile(f.entry.path)) {
                    // Measurement files are loaded as measurements, not drawn as layers
                    vectorLoads.push(this.addVectorLayer(f));
                }
            }
            if (shots.length) this.fileFeatures.addFeatures(shots);
            this.drawFlightPath(stops);

            // Zoom once every vector file's metadata is in (resolves at once without vectors)
            Promise.all(vectorLoads).then(() => this.zoomToFilesExtent());
            this.syncRasterLayers();
            this.updateRastersOpacity();
            this.loadMeasurementsForOrthophotos();
            this.restorePlantHealthFromHash(this.files);
            this.viewZoomCap.schedule();
        },

        // Flight path through the timed shots, start/finish flags, and each shot's speed
        drawFlightPath: function (stops) {
            if (stops.length < 2) return;
            const { ordered, speeds } = orderFlightPath(stops);
            ordered.forEach((stop, i) => { if (speeds[i] !== null) stop.feature.computedSpeed = speeds[i]; });
            const points = ordered.map(stop => stop.feature.getGeometry().getCoordinates());

            const flag = (coords, style) => {
                const feat = new Feature(new Point(coords));
                feat.setStyle(style);
                this.markerFeatures.addFeature(feat);
            };
            flag(points[0], this.styles.startFlag);
            flag(points[points.length - 1], this.styles.finishFlag);

            const path = new Feature(new LineString(points));
            path.setStyle(this.styles.flightPath);
            this.flightPathFeatures.addFeature(path);
        },

        // A vector file from its precomputed MVT tile pyramid (/mvt/{hash}/{z}/{x}/{y}.pbf)
        addVectorLayer: async function (f) {
            try {
                if (!this.dataset) throw new Error('Dataset not found for vector file');
                const entry = this.dataset.Entry(f.entry);

                // maxZoom avoids requests for tiles that do not exist; bounds stand in for
                // the extent when the indexer left polygon_geom/point_geom unset
                const { maxZoom, bounds } = await fetchMvtMetadata(entry);
                if (bounds && !f.entry.polygon_geom && !f.entry.point_geom) {
                    const [minX, minY, maxX, maxY] = bounds;
                    f.entry.polygon_geom = {
                        type: 'Polygon',
                        coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]]
                    };
                }

                const styles = createMvtVectorStyles(this.getVectorFileColor(f, this.vectorLayers.length));
                const { layer, source } = createMvtVectorLayer({
                    urlTemplate: entry.getMvtUrlTemplate(),
                    styleFunction: createMvtStyleFunction({
                        styles,
                        getZoom: () => (this.map ? this.map.getView().getZoom() : 0),
                        isSelected: () => f.selected
                    }),
                    useMarkRaw: true,
                    maxZoom
                });
                layer.file = f;
                layer.vectorSource = source;
                this.map.addLayer(layer);
                this.vectorLayers.push(layer);
            } catch (error) {
                console.error('Error loading vector file:', error);
            }
        },

        applyDirectionStyles: function () {
            // Restyle the photo/video shots without reloading the layers
            if (!this.fileFeatures) return;
            const T = ddb.entry.type;
            this.fileFeatures.getFeatures().forEach(feat => {
                const type = feat.file?.entry?.type;
                if (type === T.GEOIMAGE || type === T.GEOVIDEO) feat.style = this.shotStyleKey();
            });
            if (this.fileLayer) this.fileLayer.changed();
        },

        setDirectionIndicators: function (on) {
            this.showDirectionIndicators = on;
            setPref(PREF.SHOW_DIRECTION_INDICATORS, on);
            this.applyDirectionStyles();
        },

        setFlightPath: function (on) {
            this.showFlightPath = on;
            setPref(PREF.SHOW_FLIGHT_PATH, on);
            if (this.flightPathLayer) this.flightPathLayer.setVisible(on);
            if (this.markerLayer) this.markerLayer.setVisible(on);
        },

        goBack: function () {
            this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
        },

        toggleFullscreen: function () {
            if (isFullScreenCurrently()) {
                exitFullScreen();
            } else {
                requestFullScreen(this.$el);
                this.later(() => this.map.updateSize(), 500);
            }
        },

        handleKeyDown: function (e) {
            if (Keyboard.isCtrlPressed() && this.mouseInside) {
                this.selectSingle = true;
                if (this.selectionControl) this.selectionControl.deactivate();
            }
            // H: reset view
            if (e.keyCode === 72 && this.mouseInside) this.resetToInitialView();
        },

        handleKeyUp: function (e) {
            // ESC
            if (e.keyCode === 27) {
                this.selectSingle = false;
                this.measureControls.deselectCurrent();
                if (this.selectionControl) this.selectionControl.deactivate();
            }
            if (!Keyboard.isCtrlPressed() && this.mouseInside) this.selectSingle = false;
        },

        syncRasterLayers: function () {
            const list = [];
            this.rasterLayer.getLayers().forEach(olLayer => {
                if (!olLayer.file) return;
                const entryPath = olLayer.file.entry && olLayer.file.entry.path;
                const name = this.getLayerDisplayName(olLayer) || (entryPath ? ddb.pathutils.basename(entryPath) : '');
                const path = entryPath || name;
                // Keep the opacity of a layer already in the list
                const existing = this.rasterLayerList.find(r => r.path === path);
                list.push({
                    name,
                    path,
                    // markRaw: a reactive proxy would break identity checks and slow OpenLayers
                    olLayer: markRaw(olLayer),
                    opacity: existing ? existing.opacity : 1.0,
                    // Per-row Plant Health button in the opacity panel
                    plantHealthCapable: isPlantHealthCapable(olLayer.file?.entry)
                });
            });
            // Top first (the OL collection is bottom first), as in any layer panel
            this.rasterLayerList = list.reverse();
        },

        handleLayerPlantHealth: function (path) {
            // The same layer's button again closes the panel
            if (this.plantHealthVisible && this.plantHealthFilePath === path) this.closePlantHealth();
            else this.openPlantHealth(path);
        },

        handleRasterLayerReorder: function ({ fromIndex, toIndex }) {
            const updated = [...this.rasterLayerList];
            const [moved] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, moved);
            this.rasterLayerList = updated;

            // The OL collection is the reverse of the list (OL draws the last on top)
            const olLayers = this.rasterLayer.getLayers();
            olLayers.clear();
            for (let i = updated.length - 1; i >= 0; i--) olLayers.push(updated[i].olLayer);
        },

        updateRastersOpacity: function () {
            const rasters = this.rasterLayer.getLayers();
            this.hasRasters = rasters.getLength() > 0;
            // In split mode every raster is opaque: the clips separate them
            if (this.splitMode) {
                rasters.forEach(layer => layer.setOpacity(1));
                return;
            }

            const perLayer = this.rasterLayerList.length > 1;
            rasters.forEach(layer => {
                let opacity = this.rasterOpacity;
                if (perLayer) {
                    // By path: the list holds proxied layers, identity is unreliable
                    const path = layer.file && layer.file.entry ? layer.file.entry.path : null;
                    const entry = this.rasterLayerList.find(r => r.path === path);
                    opacity = entry ? entry.opacity : 1.0;
                }
                // Dim selected layers slightly
                if (layer.file && layer.file.selected) opacity *= 0.8;
                layer.setOpacity(opacity);
            });

            // Vector styles read the selection: a redraw is enough
            this.vectorLayers.forEach(layer => {
                if (layer.getSource()) layer.getSource().changed();
            });
        },

        // measurements.geojson in the folder on show (the measurements of a view without rasters)
        standaloneMeasurementEntry: function () {
            const first = this.files.find(f => f.entry && f.entry.path);
            const folder = first ? ddb.pathutils.getParentFolder(first.entry.path) || '' : '';
            return { path: folder ? `${folder}/measurements.geojson` : 'measurements.geojson' };
        },

        /**
         * Loads the saved measurements: those of the first georaster / point cloud on show,
         * else the folder's measurements.geojson.
         */
        loadMeasurementsForOrthophotos: async function () {
            if (!this.dataset || !this.measureControls) return;
            const T = ddb.entry.type;
            const anchor = this.files.find(f => f.entry && (f.entry.type === T.GEORASTER || f.entry.type === T.POINTCLOUD));
            this.currentOrthophotoEntry = anchor ? anchor.entry : this.standaloneMeasurementEntry();
            this.measurementStorage = new MeasurementStorage(this.dataset, this.currentOrthophotoEntry);

            let geojson = null;
            try {
                geojson = await this.measurementStorage.load();
            } catch (e) {
                if (anchor) console.error('Error loading measurements:', e);
            }
            this.hasSavedMeasurements = !!(geojson && geojson.features && geojson.features.length);
            if (this.hasSavedMeasurements) {
                const result = this.measureControls.importFromGeoJSON(geojson);
                if (result && result.groups) this.restoreGroupsFromMetadata(result.groups);
                this.measureControls.updateButtonsVisibility(true, true);
            } else if (!anchor) {
                // No standalone file yet: initMeasurementStorage creates it on the first save
                this.currentOrthophotoEntry = null;
                this.measurementStorage = null;
            }
        },

        // For useMapMeasurements: the entry the measurements are exported for
        getActiveMeasurementEntry: function () {
            return this.currentOrthophotoEntry;
        },

        // For useMapMeasurements: (re)creates the storage, the folder's file as a fallback
        initMeasurementStorage: async function () {
            await this.loadMeasurementsForOrthophotos();
            if (!this.measurementStorage && this.dataset) {
                this.currentOrthophotoEntry = this.standaloneMeasurementEntry();
                this.measurementStorage = new MeasurementStorage(this.dataset, this.currentOrthophotoEntry);
            }
        },

        // Units change with measurements on the map: confirm first
        onUnitsChangeRequested: function (newUnit, oldUnit) {
            this.changeUnitsTargetUnit = newUnit;
            this.changeUnitsPreviousUnit = oldUnit;
            this.changeUnitsMeasurementsCount = this.measureControls.getMeasurementsCount();
            this.changeUnitsDialogOpen = true;
        },

        handleChangeUnitsDialogClose: async function (result) {
            this.changeUnitsDialogOpen = false;
            if (result === 'confirm') {
                this.measureControls.applyUnitsChange(this.changeUnitsTargetUnit);
                this.currentUnitPref = this.changeUnitsTargetUnit;
                // Save the measurements in the new units
                await this.saveMeasurements();
            }
        },

        // Units from the settings dialog
        handleUnitsChanged: function (newUnit, oldUnit) {
            if (this.measureControls && this.measureControls.hasMeasurements()) {
                this.onUnitsChangeRequested(newUnit, oldUnit);
            } else {
                this.measureControls.applyUnitsChange(newUnit);
                this.currentUnitPref = newUnit;
            }
        },

        // ── Group dialog helpers ─────────────────────────────────────────

        openCreateGroupDialog() {
            this.pendingGroupForRename = null;
            this.measurementGroupDialogOpen = true;
        },

        openRenameGroupDialog(group) {
            this.pendingGroupForRename = group;
            this.measurementGroupDialogOpen = true;
        },

        handleGroupDialogSave(groupData) {
            if (this.pendingGroupForRename) this.renameGroup(this.pendingGroupForRename, groupData);
            else this.createGroup(groupData);
            this.pendingGroupForRename = null;
            this.measurementGroupDialogOpen = false;
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
    -webkit-tap-highlight-color: rgba(255, 255, 255, 0);
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
