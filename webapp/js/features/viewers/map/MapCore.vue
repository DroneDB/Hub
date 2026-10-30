<template>
    <!-- The map's keyboard shortcuts (Ctrl to select, H to reset, Esc) apply while the pointer or the focus is on it -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- tracks pointer/focus only, no action -->
    <div id="map" role="region" aria-label="Map" @mouseover="pointerInside = true" @mouseleave="pointerInside = false"
         @focusin="focusInside = true" @focusout="focusInside = false">
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
                                     :removable="!!comparison"
                                     @reorder="handleRasterLayerReorder"
                                     @plant-health="handleLayerPlantHealth"
                                     @remove="path => $emit('removeLayer', path)"
                                     @repick="path => $emit('repick', path)" />
            <RasterSplitOverlay v-if="splitMode" :bands="splitBands" :positions="splitPositions" :removable="!!comparison"
                                @update:positions="onSplitPositionsChange"
                                @move="(index, to) => handleRasterLayerReorder({ fromIndex: index, toIndex: to })"
                                @remove="index => $emit('removeLayer', rasterLayerList[index].path)"
                                @repick="index => $emit('repick', rasterLayerList[index].path)" />
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
            <StockpileVolumePanel v-model:base-method="stockpileBaseMethod" v-model:sensitivity="stockpileSensitivity"
                                  v-model:radius="stockpileRadius" v-model:material="stockpileMaterial"
                                  v-model:custom-density="stockpileCustomDensity" v-model:custom-cost-per-ton="stockpileCustomCostPerTon"
                                  v-model:title="stockpileTitle" v-model:description="stockpileDescription"
                                  :visible="stockpilePanelVisible" :loading="stockpileLoading" :error="stockpileError"
                                  :result="stockpileResult" :materials="stockpileMaterials" :currency="stockpileCurrency" :mode="stockpileMode" :unit-pref="currentUnitPref"
                                  @close="closeStockpileVolume" @click-on-map="startStockpileClickMode"
                                  @draw-polygon="startStockpilePolygonDrawing" @clear-overlay="clearStockpileOverlay"
                                  @cancel-mode="stopStockpileInteractions" @export-geo-json="exportStockpileGeoJson" />
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
                           :unit-pref="currentUnitPref" :custom-basemap-config="customBasemapConfig"
                           @close="mapSettingsDialogOpen = false" @basemap-changed="handleBasemapChanged"
                           @units-changed="handleUnitsChanged" @custom-basemap-config-changed="handleCustomBasemapConfigChanged" />
        <MapFilePopup ref="filePopup" :map="map" @open-item="file => $emit('openItem', file)" />
        <MapToolbar v-if="zones" :zones="zones" :show-back="standalone && !!dataset" :display-options="!standalone"
                    :split-toggle="!standalone || !!comparison"
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
 * MapCore - the map shared by the dataset Map tab (DatasetMap.vue) and the single-file map
 * (SingleMap.vue, `standalone`). It wires OpenLayers to the map features
 * (composables), the file layers (libs/map/fileLayers) and its child components
 * (toolbar, popup, panels, dialogs).
 */
import 'ol/ol.css';
import { Map, View } from 'ol';
import { isEmpty as isEmptyExtent, extend as extendExtent } from 'ol/extent';
import { shallowRef } from 'vue';

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
import { getVectorColor, FIT_OPTIONS } from '@/libs/map/mapUtils';

import { useListenerBag } from '@/composables/useEventListener';
import { useTimerGroup } from '@/composables/useTimers';
import { useMapFeatures } from '@/composables/useMapFeatures';
import { useMapComparison } from '@/composables/useMapComparison';
import { usePreference } from '@/composables/usePreference';

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

export default {
    name: 'MapCore',
    components: {
        DialogHost, MapToolbar, MapFilePopup, OpacityControl, RasterLayerOpacityPanel, RasterSplitOverlay, PlantHealthPanel,
        RasterAnalysisControls, ContourOptionsDialog, StockpileVolumePanel, MapDialogs, ChangeUnitsDialog, MapSettingsDialog,
        MeasurementListDialog, MeasurementGroupDialog
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
        // The single-file map route (SingleMap): a Back button, no selection tools, and a
        // photo with a footprint is drawn as a raster instead of a camera marker
        standalone: {
            type: Boolean,
            default: false
        },
        // A comparison (the compare view): its state is the parent's, the map shows it and
        // emits what the user changes (update:comparison), plus removeLayer and repick (a path)
        // for the parent to apply. Set before the map mounts; null on the other maps.
        comparison: {
            type: Object,
            default: null
        }
    },
    emits: ['scrollTo', 'openItem', 'update:comparison', 'removeLayer', 'repick'],
    setup(props, { emit }) {
        const features = useMapFeatures(props);
        return {
            ...features,
            ...useMapComparison({ ...features, comparison: () => props.comparison, emit }),
            showFlightPath: usePreference(PREF.SHOW_FLIGHT_PATH, PREF_DEFAULTS[PREF.SHOW_FLIGHT_PATH]),
            showDirectionIndicators: usePreference(PREF.SHOW_DIRECTION_INDICATORS, PREF_DEFAULTS[PREF.SHOW_DIRECTION_INDICATORS]),
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
            mapSettingsDialogOpen: false
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
        if (!this.deferLoad) this.activate();
    },
    beforeUnmount: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
        Keyboard.offKeyUp(this.handleKeyUp);
        if (this.viewZoomCap) this.viewZoomCap.dispose();
        if (this.map) {
            if (this.tooltipOverlay) this.map.removeOverlay(this.tooltipOverlay);
            // Releases the control's subscription to the unit preference
            if (this.measureControls) this.map.removeControl(this.measureControls);
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

        loadMap: function () {
            this.loaded = true;
            this.comparisonFitPending = !!this.comparison && !this.comparison.view;
            this.vectorLayers = [];
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
                view: new View({ center: [0, 0], zoom: 2 })
            });

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
                this.map.on('moveend', () => this.loadSplatFootprints()),
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
            this.later(() => this.updateSize(), 1);
        },

        reloadFileLayers: function () {
            if (!this.loaded) return;
            this.vectorLayers.forEach(layer => this.map.removeLayer(layer));
            this.vectorLayers = [];
            const vectorFiles = this.fileLayers.build(this.files, { standalone: this.standalone, shotStyle: this.shotStyleKey() });

            // Zoom once every vector file's metadata is in (resolves at once without vectors)
            Promise.all(vectorFiles.map(f => this.addVectorLayer(f))).then(() => {
                if (this.fitsToFiles()) this.zoomToFilesExtent();
            });
            this.syncRasterLayers(this.fileLayers.rasterSlots);
            // New layers get the plant-health styling remembered for their file
            this.refreshRasterLayers();
            this.loadSplatFootprints();
            this.updateRastersOpacity();
            // A comparison has no measurements of its own and its plant health is in its state
            if (!this.comparison) {
                this.loadSavedMeasurements();
                this.restorePlantHealthFromHash(this.files);
            }
            this.viewZoomCap.schedule();
        },

        // A comparison keeps its view: the map fits its files once, on the first load of a state
        // without a view (the world view the map starts with is reported before that fit)
        fitsToFiles: function () {
            if (!this.comparison) return true;
            const first = this.comparisonFitPending;
            this.comparisonFitPending = false;
            return first;
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
            const ext = this.fileLayers.extent();
            // Vector files: the entry's geometry (a VectorTileSource only knows its loaded tiles)
            this.files.forEach(f => {
                const geom = f.entry && f.entry.type === ddb.entry.type.VECTOR && (f.entry.polygon_geom || f.entry.point_geom);
                if (geom) extendExtent(ext, mercatorExtent(geom));
            });
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

        goBack: function () {
            this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
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
