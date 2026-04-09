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
            @onClose="measurementListDialogOpen = false"
            @deleteMeasurement="handleDeleteMeasurementFromList" />
        <Toast position="bottom-left" />
    </div>
</template>

<script>

import 'ol/ol.css';
import { Map, View } from 'ol';
import bbox from '@turf/bbox';
import { Tile as TileLayer, Vector as VectorLayer, Group as LayerGroup } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { createEmpty as createEmptyExtent, isEmpty as isEmptyExtent, extend as extendExtent } from 'ol/extent';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';

import ddb from 'ddb';
import HybridXYZ from '@/libs/map/olHybridXYZ';
import olMeasure from './olMeasure';
import TabViewLoader from '@/features/viewers/TabViewLoader';
import { transformExtent } from 'ol/proj';
import * as flatgeobuf from 'flatgeobuf';
import { extractFeatureDisplayName } from '@/libs/propertiesUtils';
import { MeasurementStorage } from '@/libs/map/measurementStorage';
import OpacityControl from './OpacityControl.vue';
import PlantHealthPanel from './PlantHealthPanel.vue';
import MapDialogs from './MapDialogs.vue';
import MapSettingsDialog from './MapSettingsDialog.vue';
import MeasurementListDialog from './MeasurementListDialog.vue';
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

export default {
    components: {
        Map, TabViewLoader, OpacityControl, PlantHealthPanel, MapDialogs, MapSettingsDialog, MeasurementListDialog, Toast
    },
    mixins: [mapAlertFlash, mapBasemap, mapTooltip, mapMeasurements, mapPlantHealth],
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
            canWrite: false,
            canDelete: false,
            canRead: false,
            rasterOpacity: 1.0,
            hasRasters: false,
            measurementListDialogOpen: false,
            measurementListItems: []
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

            if (entry.polygon_geom && (entry.type === ddb.entry.type.GEORASTER || entry.type === ddb.entry.type.POINTCLOUD)) {
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

            // Add settings control (gear button)
            this.settingsControl = new olSettings.Control({
                onOpenSettings: () => { this.mapSettingsDialogOpen = true; }
            });
            this.map.addControl(this.settingsControl);

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

            // Plant Health button (for GEORASTER files)
            if (entry.type === ddb.entry.type.GEORASTER) {
                const phBtn = document.createElement('button');
                phBtn.title = 'Plant Health';
                phBtn.innerHTML = '<i class="fa-solid fa-leaf"></i>';
                phBtn.addEventListener('click', () => {
                    if (this.plantHealthVisible) {
                        this.closePlantHealth();
                    } else {
                        this.openPlantHealth(entry.path);
                    }
                });
                controlContainer.appendChild(phBtn);
            }

            this.map.addControl(new Control({ element: controlContainer }));

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

                    // Find the first vector feature at this pixel
                    this.map.forEachFeatureAtPixel(e.pixel,
                        (feature, layer) => {
                            if (this.vectorLayers.includes(layer) && !hoveredFeature) {
                                hoveredFeature = feature;
                                return true; // Stop looking after finding the first feature
                            }
                            return false;
                        }, {
                        layerFilter: layer => this.vectorLayers.includes(layer)
                    });

                    if (hoveredFeature) {
                        // Show tooltip for this feature
                        this.showFeatureTooltip(hoveredFeature, e.pixel);
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

                // First try to find a vector feature at this pixel
                this.map.forEachFeatureAtPixel(e.pixel,
                    (feature, layer) => {
                        if (this.vectorLayers.includes(layer) && !dblClickedFeature) {
                            dblClickedFeature = feature;
                            // Prevent further processing
                            e.stopPropagation();
                            return true; // Stop looking for more features
                        }
                        return false;
                    }, {
                    layerFilter: layer => this.vectorLayers.includes(layer)
                });

                if (dblClickedFeature) {
                    this.showFeaturePropertiesDialog(dblClickedFeature);
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

                // Get the vector URL using getVector method
                let vectorUrl = await this.dataset.Entry(entry).getVector();

                // Create a vector source for streaming features
                const vectorSource = new VectorSource();

                // Get a unique color for this vector file
                const vectorFileIndex = 0; // Only one vector layer in SingleMap
                const vectorColor = this.getVectorFileColor(entry, vectorFileIndex);

                // Create a vector style based on the color
                const vectorStyles = {
                    point: new Style({
                        image: new CircleStyle({
                            radius: 5,
                            fill: new Fill({
                                color: vectorColor
                            }),
                            stroke: new Stroke({
                                color: 'rgba(255, 255, 255, 0.8)',
                                width: 1.5
                            })
                        })
                    }),

                    line: new Style({
                        stroke: new Stroke({
                            color: vectorColor,
                            width: 3
                        })
                    }),

                    polygon: new Style({
                        fill: new Fill({
                            color: vectorColor.replace('0.8', '0.3') // More transparent for fill
                        }),
                        stroke: new Stroke({
                            color: vectorColor,
                            width: 2
                        })
                    })
                };

                // Create the vector layer with styling based on geometry type
                // Style function compatible with RenderFeature (uses getType() instead of getGeometry().getType())
                const vectorStyleFunction = (feature) => {
                    // For RenderFeature, use getType() directly instead of getGeometry().getType()
                    const geometryType = feature.getType ? feature.getType() : (feature.getGeometry ? feature.getGeometry().getType() : 'Point');
                    const properties = feature.getProperties();

                    // Get appropriate base style based on geometry
                    let style;
                    if (geometryType.includes('Point')) {
                        style = vectorStyles.point.clone();
                    } else if (geometryType.includes('LineString')) {
                        style = vectorStyles.line.clone();
                    } else if (geometryType.includes('Polygon')) {
                        style = vectorStyles.polygon.clone();
                    } else {
                        style = vectorStyles.point.clone();
                    }

                    // Add label for features when zoomed in close enough
                    const zoom = this.map ? this.map.getView().getZoom() : 0;

                    if (zoom >= 16) { // Only show labels when zoomed in
                        // Try to find a good label property
                        let label = extractFeatureDisplayName(properties, null);

                        if (label && label !== 'Unknown feature') {
                            // Define text style for the label
                            const textStyle = new Text({
                                text: label,
                                font: 'bold 0.75rem Arial, Helvetica, sans-serif',
                                fill: new Fill({
                                    color: '#000'
                                }),
                                stroke: new Stroke({
                                    color: '#fff',
                                    width: 3
                                }),
                                offsetY: -15, // For points, place above the point
                                textAlign: 'center',
                                overflow: true,
                                maxAngle: 45  // Maximum angle for curved labels (e.g. on lines)
                            });

                            style.setText(textStyle);
                        }
                    }

                    return style;
                };

                // Create the vector layer with bbox loading strategy for efficient streaming
                const vectorLayer = new VectorLayer({
                    source: vectorSource,
                    style: vectorStyleFunction
                });

                // Use FlatGeobuf's createLoader with bbox strategy for spatial queries
                // This loads only features within the current view extent
                const loader = flatgeobuf.ol.createLoader(
                    vectorSource,
                    vectorUrl,
                    'EPSG:4326',  // Source projection - FlatGeobuf uses WGS84
                    bboxStrategy, // Use bbox strategy for spatial queries (requires spatial index in FGB)
                    true          // Clear existing features when loading new ones
                );

                // Set the loader on the vector source
                vectorSource.setLoader(loader);

                // Add entry reference to layer
                vectorLayer.entry = entry;

                // Add layer to the map
                this.map.addLayer(vectorLayer);

                // Store vector layer for later reference
                this.vectorLayers.push(vectorLayer);

                // Add event listener to zoom to all features when source changes
                vectorSource.on('change', () => {
                    // Only trigger if we have features and loading is done
                    if (vectorSource.getFeatures().length > 0 && vectorSource.getState() === 'ready') {
                        // Zoom to the extent of the vector features
                        const vectorExtent = vectorSource.getExtent();
                        if (!isEmptyExtent(vectorExtent)) {
                            // Save initial extent if not already set
                            if (!this.initialExtent) {
                                this.initialExtent = vectorExtent.slice(); // Clone the extent array
                            }
                            this.map.getView().fit(vectorExtent, {
                                padding: [40, 40, 40, 40],
                                duration: 500,
                                minResolution: 0.5
                            });
                        }
                    }
                });

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
                    this.measureControls.importFromGeoJSON(geojson);
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
         * Required by mapMeasurements mixin — returns the entry used for measurement export path.
         */
        getActiveMeasurementEntry: function() {
            return this.entry;
        },

        /**
         * Required by mapMeasurements mixin — (re)initializes measurementStorage if needed.
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