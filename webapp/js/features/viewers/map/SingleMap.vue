<template>
    <div class="singleMap" @mouseover="setMouseInside(true)" @mouseleave="setMouseInside(false)">
        <TabViewLoader @loaded="loadMap" titleSuffix="Map" />

        <div ref="map-container" class="map-container">
            <OpacityControl v-model="rasterOpacity" :visible="hasRasters" />
            <PlantHealthPanel
                :visible="plantHealthVisible"
                :dataset="dataset"
                :filePath="plantHealthFilePath"
                :initialParams="plantHealthInitialParams"
                @close="closePlantHealth"
                @vizParamsChanged="handleVizParamsChanged" />
            <RasterAnalysisControls
                :visible="rasterPanelVisible"
                :dataset="dataset"
                :filePath="rasterFilePath"
                :initialParams="rasterInitialParams"
                :spotInfo="rasterSpotInfo"
                :areaStats="rasterAreaStats"
                :profile="rasterProfile"
                :profileLoading="rasterProfileLoading"
                :profileError="rasterProfileError"
                :drawingProfile="rasterProfileDrawing"
                :inspectActive="rasterInspectActive"
                @close="closeRasterAnalysis"
                @vizParamsChanged="handleRasterVizParamsChanged"
                @pickProfile="handlePickProfile"
                @clearProfile="handleClearProfile"
                @cancelDrawProfile="cancelRasterProfileDrawing"
                @toggleInspectValue="toggleRasterInspect"
                @profileHover="handleProfileHover"
                @openContourDialog="openContourDialog" />
            <ContourOptionsDialog
                v-model:visible="contourDialogVisible"
                :loading="contourLoading"
                :unit="contourUnit"
                :rasterMin="contourRasterMin"
                :rasterMax="contourRasterMax"
                :initialOptions="contourLastOptions"
                @generate="generateContourLines"
                @cancel="closeContourDialog" />
            <StockpileVolumePanel
                :visible="stockpilePanelVisible"
                :loading="stockpileLoading"
                :error="stockpileError"
                :result="stockpileResult"
                :baseMethod="stockpileBaseMethod"
                :sensitivity="stockpileSensitivity"
                :radius="stockpileRadius"
                :material="stockpileMaterial"
                :materials="stockpileMaterials"
                :mode="stockpileMode"
                :customDensity="stockpileCustomDensity"
                :customCostPerTon="stockpileCustomCostPerTon"
                :unitPref="currentUnitPref"
                :title="stockpileTitle"
                :description="stockpileDescription"
                @close="closeStockpileVolume"
                @clickOnMap="startStockpileClickMode"
                @drawPolygon="startStockpilePolygonDrawing"
                @clearOverlay="clearStockpileOverlay"
                @cancelMode="_stopStockpileInteractions"
                @exportGeoJson="exportStockpileGeoJson"
                @update:baseMethod="stockpileBaseMethod = $event"
                @update:sensitivity="stockpileSensitivity = $event"
                @update:radius="stockpileRadius = $event"
                @update:material="stockpileMaterial = $event"
                @update:customDensity="stockpileCustomDensity = $event"
                @update:customCostPerTon="stockpileCustomCostPerTon = $event"
                @update:title="stockpileTitle = $event"
                @update:description="stockpileDescription = $event" />
        </div>
        <MapSettingsDialog v-if="mapSettingsDialogOpen"
            :basemaps="basemaps"
            :selectedBasemap="selectedBasemap"
            :customBasemapConfig="customBasemapConfig"
            @onClose="mapSettingsDialogOpen = false"
            @basemapChanged="handleBasemapChanged"
            @customBasemapConfigChanged="handleCustomBasemapConfigChanged">
        </MapSettingsDialog>
        <MapDialogs
            :alertDialogOpen="alertDialogOpen"
            :alertTitle="alertTitle"
            :alertMessage="alertMessage"
            :clearMeasurementsDialogOpen="clearMeasurementsDialogOpen"
            :deleteSavedMeasurementsDialogOpen="deleteSavedMeasurementsDialogOpen"
            @alertClose="handleAlertDialogClose"
            @clearMeasurementsClose="handleClearMeasurementsDialogClose"
            @deleteSavedMeasurementsClose="handleDeleteSavedMeasurementsDialogClose" />
        <MeasurementListDialog v-if="measurementListDialogOpen"
            :measurements="measurementListItems"
            :groups="measurementGroups"
            @onClose="measurementListDialogOpen = false"
            @deleteMeasurement="handleDeleteMeasurementFromList"
            @editMeasurement="handleEditMeasurementFromList"
            @createGroup="openCreateGroupDialog"
            @renameGroup="openRenameGroupDialog"
            @deleteGroup="deleteGroup"
            @toggleGroupVisibility="toggleGroupVisibility"
            @moveMeasurementToGroup="moveMeasurementToGroup" />
        <MeasurementGroupDialog v-if="measurementGroupDialogOpen"
            :group="pendingGroupForRename"
            @onClose="measurementGroupDialogOpen = false"
            @onSave="handleGroupDialogSave" />
        <Toast position="bottom-left" />
    </div>
</template>

<script>

import 'ol/ol.css';
import { Map, View } from 'ol';
import bbox from '@turf/bbox';
import { Tile as TileLayer, Vector as VectorLayer, VectorTile as VectorTileLayer, Group as LayerGroup } from 'ol/layer';
import { Vector as VectorSource, VectorTile as VectorTileSource } from 'ol/source';
import MVT from 'ol/format/MVT';
import { createEmpty as createEmptyExtent, isEmpty as isEmptyExtent, extend as extendExtent } from 'ol/extent';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';

import ddb from 'ddb';
import HybridXYZ from '@/libs/map/olHybridXYZ';
import olMeasure from './olMeasure';
import TabViewLoader from '@/features/viewers/TabViewLoader';
import { transformExtent, toLonLat } from 'ol/proj';
import { MeasurementStorage } from '@/libs/map/measurementStorage';
import { createMvtVectorStyles, createMvtStyleFunction, createMvtVectorLayer, fetchMvtMetadata } from '@/composables/useMvtLayer';
import OpacityControl from './OpacityControl.vue';
import PlantHealthPanel from './PlantHealthPanel.vue';
import RasterAnalysisControls from './RasterAnalysisControls.vue';
import ContourOptionsDialog from './ContourOptionsDialog.vue';
import StockpileVolumePanel from './StockpileVolumePanel.vue';
import MapDialogs from './MapDialogs.vue';
import MapSettingsDialog from './MapSettingsDialog.vue';
import MeasurementListDialog from './MeasurementListDialog.vue';
import MeasurementGroupDialog from './MeasurementGroupDialog.vue';
import olSettings from './olSettings';
import Toast from 'primevue/toast';
import Keyboard from '@/libs/keyboard';
import { requestFullScreen, exitFullScreen, isFullScreenCurrently, supportsFullScreen } from '@/libs/utils';
import { getVectorColor } from '@/libs/map/mapUtils';
import { saveCustomBasemapConfig } from '@/libs/map/basemaps';
import { Control } from 'ol/control';

// Mixins
import mapAlertFlash from '@/composables/useMapAlertFlash';
import mapBasemap from '@/composables/useMapBasemap';
import mapTooltip from '@/composables/useMapTooltip';
import mapMeasurements from '@/composables/useMapMeasurements';
import mapPlantHealth from '@/composables/usePlantHealth';
import mapRasterAnalysis from '@/composables/useRasterAnalysis';
import mapStockpileVolume from '@/composables/useStockpileVolume';
import mapContourLines from '@/composables/useContourLines';
import mapAnalysisButtons from '@/composables/useMapAnalysisButtons';

export default {
    components: {
        Map, TabViewLoader, OpacityControl, PlantHealthPanel, RasterAnalysisControls, ContourOptionsDialog, StockpileVolumePanel, MapDialogs, MapSettingsDialog, MeasurementListDialog, MeasurementGroupDialog, Toast
    },
    mixins: [mapAlertFlash, mapBasemap, mapTooltip, mapMeasurements, mapPlantHealth, mapRasterAnalysis, mapStockpileVolume, mapContourLines, mapAnalysisButtons],
    props: ["uri"],
    data: function () {
        return {
            mapSettingsDialogOpen: false,
            initialExtent: null,
            mouseInside: false,
            error: "",
            loading: true,
            entry: {},
            ddbURI: null,
            vectorLayers: [],
            vectorLayerColors: {},
            measureControls: null,
            dataset: null,
            canWrite: false,
            canDelete: false,
            canRead: false,
            rasterOpacity: 1.0,
            hasRasters: false,
            measurementListDialogOpen: false,
            measurementListItems: [],
            // Group dialog
            measurementGroupDialogOpen: false,
            pendingGroupForRename: null,
            // Unit preference shared with sub-panels (volume / area conversions).
            // Persisted across sessions via localStorage.
            currentUnitPref: localStorage.getItem('measureUnitPref') || 'metric'
        };
    },
    mounted: async function () {

    },
    watch: {
        rasterOpacity: function (newVal) {
            if (this.rasterLayer) {
                this.rasterLayer.getLayers().forEach(layer => {
                    layer.setOpacity(newVal);
                });
            }
        }
    },
    beforeUnmount: function () {
        // Clean up keyboard event handlers
        Keyboard.offKeyDown(this.handleKeyDown);

        // Clean up the tooltip overlay
        if (this.tooltipOverlay && this.map) {
            this.map.removeOverlay(this.tooltipOverlay);
            this.tooltipOverlay = null;
            this.tooltipElement = null;
        }

        // Clean up vector layers
        if (this.vectorLayers && this.map) {
            this.vectorLayers.forEach(layer => {
                this.map.removeLayer(layer);
            });
            this.vectorLayers = [];
        }
    },
    methods: {
        setMouseInside: function (flag) {
            this.mouseInside = flag;
        },
        handleKeyDown: function (e) {
            // H key for reset view
            if (e.keyCode === 72 && this.mouseInside) {
                this.resetToInitialView();
            }
        },
        resetToInitialView: function () {
            if (this.initialExtent && !isEmptyExtent(this.initialExtent)) {
                this.map.getView().fit(this.initialExtent, {
                    padding: [40, 40, 40, 40],
                    duration: 500,
                    minResolution: 0.5
                });
            }
        },
        // Generate a unique color based on the entry path and index
        getVectorFileColor: function (entry, index) {
            return getVectorColor(entry.path, index, this.vectorLayerColors);
        },

        // Returns current map view center as [lon, lat] in WGS84, or null if unavailable.
        getMapCenterLatLon: function () {
            if (!this.map) return null;
            const view = this.map.getView();
            const center = view && view.getCenter();
            if (!center) return null;
            return toLonLat(center);
        },

        // Override tooltip fallback label for SingleMap (uses layer.entry)
        getLayerDisplayName: function (layer) {
            if (layer && layer.entry) return layer.entry.name || '';
            return '';
        },

        loadMap: function () {
            if (this.loaded) return;

            const { entry } = this;

            this.loaded = true;

            this.basemapLayer = this.createBasemapLayer();

            this.rasterLayer = new LayerGroup();
            const rasters = this.rasterLayer.getLayers();
            const ext = createEmptyExtent();

            if (entry.polygon_geom && (entry.type === ddb.entry.type.GEORASTER || entry.type === ddb.entry.type.GEOIMAGE || entry.type === ddb.entry.type.POINTCLOUD)) {
                const extent = transformExtent(bbox(entry.polygon_geom), 'EPSG:4326', 'EPSG:3857');
                const tileLayer = new TileLayer({
                    extent,
                    source: new HybridXYZ({
                        url: this.ddbURI,
                        tileSize: 256,
                        transition: 200,
                        minZoom: 14,
                        maxZoom: 22
                    })
                });
                tileLayer.entryPath = entry.path;
                tileLayer.ddbUrl = this.ddbURI;
                rasters.push(tileLayer);
                this.hasRasters = true;
                extendExtent(ext, extent);
            } else if (entry.type === ddb.entry.type.VECTOR) {
                // Clear any existing vector layers
                this.vectorLayers = [];
            }

            this.measureControls = new olMeasure.Controls({
                onToolSelected: () => { this.measuring = true; },
                onToolDelesected: () => { this.measuring = false; },
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
                    if (typeof this._onStockpileFeatureRemoved === 'function') {
                        this._onStockpileFeatureRemoved(feature);
                    }
                },
                canWrite: this.canWrite,
                canDelete: this.canDelete
            });
            this.map = new Map({
                target: this.$refs['map-container'],
                layers: [
                    this.basemapLayer,
                    this.rasterLayer,
                    this.measureControls.getLayer()
                ],
                view: new View({
                    center: [0, 0],
                    zoom: 2
                })
            });
            this.map.addControl(this.measureControls);

            // Group controls into left/right toolbar zones so they stack
            // without overlapping (instead of each being absolute-positioned).
            this.createControlZones();
            this.moveControlToZone(this.measureControls, this._zoneTopRight);

            // Add settings control (gear button)
            this.settingsControl = new olSettings.Control({
                onOpenSettings: () => { this.mapSettingsDialogOpen = true; }
            });
            this.map.addControl(this.settingsControl);
            this.moveControlToZone(this.settingsControl, this._zoneBottomLeft);

            // Add map utility controls (Reset View, Fullscreen, Back to Dataset) in top-right
            const controlContainer = document.createElement('div');
            controlContainer.className = 'ol-map-buttons ol-unselectable ol-control';

            // Back to Dataset button
            const backBtn = document.createElement('button');
            backBtn.title = 'Back to Dataset';
            backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
            backBtn.addEventListener('click', () => {
                this.$router.push({ name: 'ViewDataset', params: this.$route.params });
            });
            controlContainer.appendChild(backBtn);

            // Reset View button
            const resetBtn = document.createElement('button');
            resetBtn.title = 'Reset View (H)';
            resetBtn.innerHTML = '<i class="fa-solid fa-house"></i>';
            resetBtn.addEventListener('click', () => {
                this.resetToInitialView();
            });
            controlContainer.appendChild(resetBtn);

            // Fullscreen button
            if (supportsFullScreen()) {
                const fsBtn = document.createElement('button');
                fsBtn.title = 'Fullscreen (F11)';
                fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
                fsBtn.addEventListener('click', () => {
                    if (isFullScreenCurrently()) {
                        exitFullScreen();
                    } else {
                        requestFullScreen(this.$el);
                        setTimeout(() => {
                            this.map.updateSize();
                        }, 500);
                    }
                });
                controlContainer.appendChild(fsBtn);
            }

            // Plant Health / Raster Analysis / Stockpile Volume buttons -
            // delegated to the shared `useMapAnalysisButtons` composable so
            // SingleMap and Map render an identical button cluster.
            this.appendAnalysisButtonsToContainer(
                controlContainer,
                predicate => (predicate(entry) ? entry.path : null));

            // Keep the utility cluster above the measure control within the
            // top-right zone (it used to sit at the very top of the map).
            controlContainer.style.order = '-1';
            this.map.addControl(new Control({ element: controlContainer, target: this._zoneTopRight }));

            // Setup tooltip overlay for vector features
            this.setupTooltipOverlay();
            this.map.addOverlay(this.tooltipOverlay);

            // Add pointer move handler for tooltips
            this.map.on('pointermove', (e) => {
                if (e.dragging || this.measuring) {
                    this.hideFeatureTooltip();
                    return;
                }

                // Check if pointer is over UI controls - hide tooltip if so
                const domElement = document.elementFromPoint(e.pixel[0], e.pixel[1]);
                if (domElement && (
                    domElement.closest('.ol-measure-control') ||
                    domElement.closest('.ol-zoom') ||
                    domElement.closest('.ol-map-buttons')
                )) {
                    this.hideFeatureTooltip();
                    return;
                }

                // Check if we're hovering over a vector feature
                const hit = this.map.hasFeatureAtPixel(e.pixel, {
                    layerFilter: layer => this.vectorLayers.includes(layer)
                });

                // Update cursor style based on whether we're hovering over a feature
                this.map.getTargetElement().style.cursor = hit ? 'pointer' : 'inherit';

                if (hit) {
                    let hoveredFeature = null;
                    let hoveredLayer = null;

                    // Find the first vector feature at this pixel
                    this.map.forEachFeatureAtPixel(e.pixel,
                        (feature, layer) => {
                            if (this.vectorLayers.includes(layer) && !hoveredFeature) {
                                hoveredFeature = feature;
                                hoveredLayer = layer;
                                return true; // Stop looking after finding the first feature
                            }
                            return false;
                        }, {
                        layerFilter: layer => this.vectorLayers.includes(layer)
                    });

                    if (hoveredFeature) {
                        // Show tooltip for this feature
                        this.showFeatureTooltip(hoveredFeature, e.pixel, hoveredLayer);
                    } else {
                        this.hideFeatureTooltip();
                    }
                } else {
                    this.hideFeatureTooltip();
                }
            });

            // Add double-click handler for showing feature properties
            this.map.on('dblclick', (e) => {
                if (this.measuring) return;

                // Check if we clicked on a vector feature
                let dblClickedFeature = null;
                let dblClickedLayer = null;

                // First try to find a vector feature at this pixel
                this.map.forEachFeatureAtPixel(e.pixel,
                    (feature, layer) => {
                        if (this.vectorLayers.includes(layer) && !dblClickedFeature) {
                            dblClickedFeature = feature;
                            dblClickedLayer = layer;
                            // Prevent further processing
                            e.stopPropagation();
                            return true; // Stop looking for more features
                        }
                        return false;
                    }, {
                    layerFilter: layer => this.vectorLayers.includes(layer)
                });

                if (dblClickedFeature) {
                    this.showFeaturePropertiesDialog(dblClickedFeature, dblClickedLayer);
                }
            });

            setTimeout(() => this.map.updateSize(), 1);

            // Handle vector files
            if (entry.type === ddb.entry.type.VECTOR) {
                this.loadVectorLayer(entry);
            }

            // Load measurements for orthophotos and point clouds if available
            if (entry.type === ddb.entry.type.GEORASTER || entry.type === ddb.entry.type.POINTCLOUD) {
                this.loadMeasurementsForOrthophoto();
            }

            if (!isEmptyExtent(ext)) {
                // Save initial extent
                this.initialExtent = ext.slice(); // Clone the extent array
                setTimeout(() => {
                    this.map.getView().fit(ext, {
                        padding: [40, 40, 40, 40],
                        duration: 500,
                        minResolution: 0.5
                    });
                }, 10);
            }

            // Register keyboard handler
            Keyboard.onKeyDown(this.handleKeyDown);

            // Restore Plant Health state from URL hash
            if (entry.type === ddb.entry.type.GEORASTER) {
                this.restorePlantHealthFromHash();
            }
        },

        // Load vector layer for the entry
        loadVectorLayer: async function (entry) {
            try {
                // Resolve the MVT URL template for the entry
                const ddbEntry = this.dataset.Entry(entry);
                const mvtTemplate = ddbEntry.getMvtUrlTemplate();

                // Always fetch metadata: maxZoom is needed for VectorTileSource (avoids 404 on
                // non-existent high-zoom tiles); bounds is the zoom fallback when polygon_geom is absent.
                const { maxZoom: mvtMaxZoom, bounds: mvtBounds } = await fetchMvtMetadata(ddbEntry);

                // Get a unique color for this vector file
                const vectorFileIndex = 0; // Only one vector layer in SingleMap
                const vectorColor = this.getVectorFileColor(entry, vectorFileIndex);

                const vectorStyles = createMvtVectorStyles(vectorColor);
                const vectorStyleFunction = createMvtStyleFunction({
                    styles: vectorStyles,
                    getZoom: () => (this.map ? this.map.getView().getZoom() : 0)
                });

                // Build the VectorTileSource backed by the MVT pyramid
                const { layer: vectorLayer, source: vectorTileSource } = createMvtVectorLayer({
                    urlTemplate: mvtTemplate,
                    styleFunction: vectorStyleFunction,
                    maxZoom: mvtMaxZoom
                });

                vectorLayer.entry = entry;
                this.map.addLayer(vectorLayer);
                this.vectorLayers.push(vectorLayer);
                vectorLayer.vectorSource = vectorTileSource;

                // Zoom immediately to the bounds fetched from metadata.
                // Do NOT wait for tileloadend: if the view starts far from the data
                // (e.g. Atlantic Ocean at zoom 2), no tiles are ever requested and
                // tileloadend never fires.
                // polygon_geom may be a GeoJSON Feature OR Geometry; bbox() handles both.
                const rawExtent = entry.polygon_geom ? bbox(entry.polygon_geom) : mvtBounds;
                if (rawExtent) {
                    try {
                        const ext3857 = transformExtent(rawExtent, 'EPSG:4326', 'EPSG:3857');
                        if (!this.initialExtent) this.initialExtent = ext3857.slice();
                        this.map.getView().fit(ext3857, {
                            padding: [40, 40, 40, 40],
                            duration: 500,
                            minResolution: 0.5
                        });
                    } catch (e) {
                        console.warn('Unable to compute vector extent from entry geometry:', e);
                    }
                }

            } catch (error) {
                console.error('Error loading vector file:', error);
            }
        },

        onPanelResized: function () {
            // Redraw when map is resized (via panels)
            if (this.map) this.map.updateSize();
        },
        onTabActivated: function () {
            this.$nextTick(() => {
                if (this.map) this.map.updateSize();
            });
        },
        /**
         * Load measurements for orthophoto and point cloud files
         */
        loadMeasurementsForOrthophoto: async function() {
            if (!this.dataset || !this.measureControls || !this.entry) {
                console.log('Cannot load measurements: dataset, measureControls or entry not available');
                return;
            }

            // Only load measurements for georaster and point cloud files
            if (this.entry.type !== ddb.entry.type.GEORASTER && this.entry.type !== ddb.entry.type.POINTCLOUD) {
                console.log('Not a georaster or point cloud file, skipping measurements');
                return;
            }

            // Initialize measurement storage
            this.measurementStorage = new MeasurementStorage(this.dataset, this.entry);
            console.log('Measurement storage initialized for:', this.entry.path);

            try {
                const geojson = await this.measurementStorage.load();

                if (geojson && geojson.features && geojson.features.length > 0) {
                    // Import measurements
                    const result = this.measureControls.importFromGeoJSON(geojson);
                    if (result && result.groups) this.restoreGroupsFromMetadata(result.groups);
                    this.hasSavedMeasurements = true;

                    // Update button visibility
                    this.measureControls.updateButtonsVisibility(true, true);

                    console.log(`Loaded ${geojson.features.length} measurements for orthophoto`);
                } else {
                    console.log('No saved measurements found for this orthophoto');
                    this.hasSavedMeasurements = false;
                }
            } catch (e) {
                console.error('Error loading measurements:', e);
                this.hasSavedMeasurements = false;
            }
        },

        /**
         * Required by mapMeasurements mixin - returns the entry used for measurement export path.
         */
        getActiveMeasurementEntry: function() {
            return this.entry;
        },

        /**
         * Required by mapMeasurements mixin - (re)initializes measurementStorage if needed.
         */
        initMeasurementStorage: async function() {
            await this.loadMeasurementsForOrthophoto();
        },

        handleBasemapChanged: function(basemap) {
            this.selectedBasemap = basemap;
            this.updateBasemap();
        },

        handleCustomBasemapConfigChanged: function(config) {
            saveCustomBasemapConfig(config);
            this.customBasemapConfig = config;
            if (this.selectedBasemap === 'custom') {
                this.updateBasemap();
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
            if (this.pendingGroupForRename) {
                this.renameGroup(this.pendingGroupForRename, groupData);
            } else {
                this.createGroup(groupData);
            }
            this.pendingGroupForRename = null;
            this.measurementGroupDialogOpen = false;
        }
    }
}
</script>

<style scoped>
.singleMap {
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
}
</style>