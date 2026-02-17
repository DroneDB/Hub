<template>
    <div class="singleMap" @mouseover="setMouseInside(true)" @mouseleave="setMouseInside(false)">
        <TabViewLoader @loaded="loadMap" titleSuffix="Map" />
        <Toolbar :tools="tools" ref="toolbar" />

        <div ref="map-container" class="map-container">
            <select id="basemap-selector" v-model="selectedBasemap" @change="updateBasemap">
                <option v-for="(v, k) in basemaps" :value="k">
                    {{ v.label }}
                </option>
            </select>
        </div>
        <Alert :title="alertTitle" v-if="alertDialogOpen" @onClose="handleAlertDialogClose">
            {{ alertMessage }}
        </Alert>
        <ConfirmDialog v-if="clearMeasurementsDialogOpen"
            title="Clear All Measurements"
            message="Are you sure you want to clear all measurements?"
            confirmText="Clear"
            cancelText="Cancel"
            confirmButtonClass="negative"
            @onClose="handleClearMeasurementsDialogClose">
        </ConfirmDialog>
        <ConfirmDialog v-if="deleteSavedMeasurementsDialogOpen"
            title="Delete Saved Measurements"
            message="Are you sure you want to delete saved measurements?"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="negative"
            @onClose="handleDeleteSavedMeasurementsDialogClose">
        </ConfirmDialog>
        <Flash v-if="flashMessage" :color="flashColor" :icon="flashIcon" @onClose="closeFlash">{{ flashMessage }}</Flash>
    </div>
</template>

<script>

import 'ol/ol.css';
import { Map, View } from 'ol';
import bbox from '@turf/bbox';
import { Tile as TileLayer, Vector as VectorLayer, Group as LayerGroup } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { createEmpty as createEmptyExtent, isEmpty as isEmptyExtent, extend as extendExtent, getCenter as getExtentCenter, buffer as extentBuffer } from 'ol/extent';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import Overlay from 'ol/Overlay';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';

import ddb from 'ddb';
import HybridXYZ from '../libs/olHybridXYZ';
import olMeasure from './olMeasure';
import TabViewLoader from './TabViewLoader';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import { transformExtent } from 'ol/proj';
import { Basemaps, getCustomBasemapConfig } from '../libs/basemaps';
import * as flatgeobuf from 'flatgeobuf';
import Vue from 'vue';
import FeatureInfoDialog from './FeatureInfoDialog.vue';
import { extractFeatureDisplayName } from '../libs/propertiesUtils';
import { MeasurementStorage } from '../libs/measurementStorage';
import Alert from './Alert.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import Flash from './Flash.vue';
import Toolbar from './Toolbar.vue';
import Keyboard from '../libs/keyboard';
import { requestFullScreen, exitFullScreen, isFullScreenCurrently, supportsFullScreen } from '../libs/utils';

export default {
    components: {
        Map, TabViewLoader, FeatureInfoDialog, Alert, ConfirmDialog, Flash, Toolbar
    },
    props: ["uri"],
    data: function () {
        const tools = [
            {
                id: 'reset-view',
                title: "Reset View (H)",
                icon: "home",
                onClick: () => {
                    this.resetToInitialView();
                }
            }
        ];

        if (supportsFullScreen()) {
            tools.push({
                id: 'fullscreen',
                title: "Fullscreen (F11)",
                icon: "expand",
                onClick: () => {
                    if (isFullScreenCurrently()) {
                        exitFullScreen();
                    } else {
                        requestFullScreen(this.$el);
                        setTimeout(() => {
                            this.map.updateSize();
                        }, 500);
                    }
                }
            });
        }

        return {
            tools,
            initialExtent: null,
            mouseInside: false,
            error: "",
            selectedBasemap: "satellite",
            basemaps: Basemaps,
            customBasemapConfig: getCustomBasemapConfig(),
            loading: true,
            entry: {},
            ddbURI: null,
            vectorLayers: [],
            vectorLayerColors: {}, // Store colors for vector layers
            tooltipElement: null,  // Element for vector feature tooltips
            tooltipOverlay: null,  // Overlay for tooltips
            measuring: false,
            measurementStorage: null,
            hasSavedMeasurements: false,
            measureControls: null,
            canWrite: false,
            canDelete: false,
            canRead: false,

            // Alert dialog
            alertDialogOpen: false,
            alertTitle: '',
            alertMessage: '',

            // Confirm dialogs
            clearMeasurementsDialogOpen: false,
            deleteSavedMeasurementsDialogOpen: false,

            // Flash message
            flashMessage: null,
            flashIcon: 'check circle outline',
            flashColor: 'positive'
        };
    },
    mounted: async function () {

    },
    beforeDestroy: function () {
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
        // Generate a unique color based on the file name or index
        getVectorFileColor: function (entry, index) {
            // If we already have a color for this file, return it
            if (this.vectorLayerColors[entry.path]) {
                return this.vectorLayerColors[entry.path];
            }

            // Color palette for vector layers - bright, distinct colors with good contrast
            const colorPalette = [
                'rgba(66, 133, 244, 0.8)',    // Blue
                'rgba(219, 68, 55, 0.8)',     // Red
                'rgba(15, 157, 88, 0.8)',     // Green
                'rgba(244, 160, 0, 0.8)',     // Yellow
                'rgba(171, 71, 188, 0.8)',    // Purple
                'rgba(255, 87, 34, 0.8)',     // Deep Orange
                'rgba(3, 169, 244, 0.8)',     // Light Blue
                'rgba(0, 150, 136, 0.8)',     // Teal
                'rgba(124, 77, 255, 0.8)',    // Deep Purple
                'rgba(229, 57, 53, 0.8)',     // Red
                'rgba(0, 200, 83, 0.8)',      // Green
                'rgba(253, 216, 53, 0.8)'     // Yellow
            ];

            // Use the index to select a color or generate a hash-based color for more files
            let color;
            if (index < colorPalette.length) {
                color = colorPalette[index];
            } else {
                // Generate a more sophisticated hash-based color
                // This uses HSL to ensure good saturation and lightness
                const hash = this.stringToHashCode(entry.path);

                // Get hue from 0-360 based on hash
                const hue = hash % 360;
                // Fixed high saturation for visibility
                const saturation = 80;
                // Medium lightness for good contrast
                const lightness = 45;

                color = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`;
            }

            // Store the color for future reference
            this.vectorLayerColors[entry.path] = color;
            return color;
        },

        // Helper to generate a numeric hash from a string
        stringToHashCode: function (str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash);
        },

        // Setup tooltip overlay for vector features
        setupTooltipOverlay: function () {
            // Create tooltip element
            this.tooltipElement = document.createElement('div');
            this.tooltipElement.className = 'vector-tooltip';
            this.tooltipElement.style.cssText =
                'position: absolute; ' +
                'background-color: rgba(255, 255, 255, 0.9); ' +
                'color: #333; ' +
                'padding: 6px 10px; ' +
                'border-radius: 4px; ' +
                'border: 1px solid rgba(0, 0, 0, 0.2); ' +
                'font-size: 13px; ' +
                'font-weight: bold; ' +
                'box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15); ' +
                'pointer-events: none; ' +
                'z-index: 1000; ' +
                'max-width: 300px; ' +
                'white-space: nowrap; ' +
                'overflow: hidden; ' +
                'text-overflow: ellipsis; ' +
                'display: none;';

            // Create and add the overlay to the map
            this.tooltipOverlay = new Overlay({
                element: this.tooltipElement,
                offset: [12, 0],
                positioning: 'center-left'
            });
        },

        // Display tooltip with feature info
        showFeatureTooltip: function (feature, pixel) {
            if (!this.tooltipElement || !this.tooltipOverlay) return;

            // Get feature info
            let content = '';

            // Try to get feature name from properties
            const properties = feature.getProperties();

            // Extract display name from properties
            content = extractFeatureDisplayName(properties);

            // Fallback to file name if no label is found
            if (content === 'Unknown feature') {
                const layer = this.findVectorLayerForFeature(feature);
                if (layer && layer.entry) {
                    content = layer.entry.name || 'Unknown layer';
                }
            }

            // Set content and show tooltip
            this.tooltipElement.innerHTML = content;
            this.tooltipElement.style.display = 'block';
            this.tooltipOverlay.setPosition(this.map.getCoordinateFromPixel(pixel));
        },

        // Hide tooltip
        hideFeatureTooltip: function () {
            if (this.tooltipElement) {
                this.tooltipElement.style.display = 'none';
            }
        },

        // Find the vector layer that contains a feature
        findVectorLayerForFeature: function (feature) {
            for (let i = 0; i < this.vectorLayers.length; i++) {
                const layer = this.vectorLayers[i];
                const source = layer.getSource();

                // Check if this source contains the feature
                if (source.getFeatures().some(f => f === feature)) {
                    return layer;
                }
            }

            return null;
        },

        // Show dialog with feature properties
        showFeaturePropertiesDialog: function (feature) {
            // Get feature properties
            const properties = { ...feature.getProperties() };
            delete properties.geometry; // Remove geometry from properties

            // Try to get a good title for the dialog
            let title = 'Feature Properties';

            // Find the layer that contains this feature
            const layer = this.findVectorLayerForFeature(feature);

            // Get file name for the dialog title
            if (layer && layer.entry) {
                const fileName = layer.entry.name || '';
                if (fileName) {
                    title = `${fileName} - Feature Properties`;
                }

                // If there's a name property, include it in the title
                if (properties.name) {
                    title = `${fileName} - ${properties.name}`;
                }
            }

            // Use the FeatureInfoDialog component
            const DialogComponent = Vue.extend(FeatureInfoDialog);
            const dialogInstance = new DialogComponent({
                propsData: {
                    title: title,
                    properties: properties
                }
            });

            dialogInstance.$mount();
            document.body.appendChild(dialogInstance.$el);

            // Handle close event
            dialogInstance.$on('onClose', () => {
                document.body.removeChild(dialogInstance.$el);
                dialogInstance.$destroy();
            });
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
                        // TODO: get min/max zoom from file
                    })
                });
                rasters.push(tileLayer);
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
                    domElement.closest('#basemap-selector')
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
                                font: 'bold 12px Arial, Helvetica, sans-serif',
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
        createBasemapLayer: function () {
            if (this.selectedBasemap === 'custom') {
                const config = this.customBasemapConfig;
                if (config && config.url) {
                    const attributions = config.attribution ? [config.attribution] : [];
                    if (config.sourceType === 'wms') {
                        return new TileLayer({
                            source: new TileWMS({
                                url: config.url,
                                params: { LAYERS: config.layerName, TILED: true },
                                attributions: attributions
                            })
                        });
                    } else {
                        return new TileLayer({
                            source: new XYZ({
                                url: config.url,
                                attributions: attributions
                            })
                        });
                    }
                }
            }
            const basemap = this.basemaps[this.selectedBasemap] || this.basemaps['satellite'];
            return new TileLayer({
                source: new XYZ({
                    url: basemap.url,
                    attributions: basemap.attributions
                })
            });
        },
        updateBasemap: function () {
            const newLayer = this.createBasemapLayer();
            const layers = this.map.getLayers();
            layers.removeAt(0);
            layers.insertAt(0, newLayer);
            this.basemapLayer = newLayer;
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
         * Save measurements
         */
        saveMeasurements: async function() {
            // Check write permissions first
            if (!this.canWrite) {
                this.showAlert('Permission Denied', 'You do not have permission to save measurements in this dataset');
                return;
            }

            if (!this.measureControls) {
                console.error('Cannot save: measureControls not initialized');
                this.showAlert('Error', 'Cannot save: measurement controls not initialized');
                return;
            }

            if (!this.measureControls.hasMeasurements()) {
                this.showAlert('Warning', 'No measurements to save');
                return;
            }

            // Try to initialize measurement storage if not already done
            if (!this.measurementStorage) {
                console.log('Measurement storage not initialized, trying to initialize now...');
                await this.loadMeasurementsForOrthophoto();

                // Check again after initialization attempt
                if (!this.measurementStorage) {
                    console.error('Cannot save: no georaster or point cloud file found');
                    this.showAlert('Error', 'Cannot save: no orthophoto/georaster or point cloud file found. Measurements can only be saved for orthophoto or point cloud files.');
                    return;
                }
            }

            if (!this.entry) {
                console.error('Cannot save: entry not set');
                this.showAlert('Error', 'Cannot save: no entry found');
                return;
            }

            try {
                const geojson = this.measureControls.exportToGeoJSON(this.entry.path);

                if (!geojson.features || geojson.features.length === 0) {
                    this.showAlert('Warning', 'No measurements to save');
                    return;
                }

                await this.measurementStorage.save(geojson);
                this.hasSavedMeasurements = true;

                // Update button visibility
                this.measureControls.updateButtonsVisibility(true, true);

                console.log(`Saved ${geojson.features.length} measurements`);
                this.showFlash(`Saved ${geojson.features.length} measurement(s)`, 'positive', 'check circle outline');
            } catch (e) {
                console.error('Error saving measurements:', e);
                this.showAlert('Error', `Failed to save measurements: ${e.message}`);
            }
        },

        /**
         * Handle clear all measurements
         */
        onClearAllMeasurements: function() {
            // Update button visibility after clear
            this.measureControls.updateButtonsVisibility(false, this.hasSavedMeasurements);
        },

        /**
         * Export measurements to file
         */
        exportMeasurementsToFile: function() {
            if (!this.measureControls || !this.entry) {
                return;
            }

            if (!this.measureControls.hasMeasurements()) {
                this.showAlert('Warning', 'No measurements to export');
                return;
            }

            const geojson = this.measureControls.exportToGeoJSON(this.entry.path);

            if (!geojson.features || geojson.features.length === 0) {
                this.showAlert('Warning', 'No measurements to export');
                return;
            }

            // Use MeasurementStorage's export method
            if (this.measurementStorage) {
                this.measurementStorage.exportToFile(geojson);
            }
        },

        /**
         * Delete saved measurements
         */
        deleteSavedMeasurements: async function() {
            if (!this.measurementStorage) {
                return;
            }

            try {
                await this.measurementStorage.delete();
                this.hasSavedMeasurements = false;

                // Clear measurements from the map
                this.measureControls.clearAllMeasurements();

                // Update button visibility
                this.measureControls.updateButtonsVisibility(
                    this.measureControls.hasMeasurements(),
                    false
                );

                console.log('Saved measurements deleted');
                this.showFlash('Saved measurements deleted', 'positive', 'check circle outline');
            } catch (e) {
                console.error('Error deleting measurements:', e);
                this.showAlert('Error', `Failed to delete measurements: ${e.message}`);
            }
        },

        /**
         * Show alert dialog
         */
        showAlert: function(title, message) {
            this.alertTitle = title;
            this.alertMessage = message;
            this.alertDialogOpen = true;
        },

        /**
         * Handle alert dialog close
         */
        handleAlertDialogClose: function() {
            this.alertDialogOpen = false;
        },

        /**
         * Handle clear measurements dialog close
         */
        handleClearMeasurementsDialogClose: function(result) {
            this.clearMeasurementsDialogOpen = false;
            if (result === 'confirm' && this.measureControls) {
                this.measureControls.confirmClearAll();
            }
        },

        /**
         * Handle delete saved measurements dialog close
         */
        handleDeleteSavedMeasurementsDialogClose: function(result) {
            this.deleteSavedMeasurementsDialogOpen = false;
            if (result === 'confirm') {
                this.measureControls.confirmDeleteSaved();
            }
        },

        /**
         * Show flash message
         */
        showFlash: function(message, color = 'positive', icon = 'check circle outline') {
            this.flashMessage = message;
            this.flashColor = color;
            this.flashIcon = icon;
        },

        /**
         * Close flash message
         */
        closeFlash: function() {
            this.flashMessage = null;
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

    #basemap-selector {
        position: absolute;
        right: 8px;
        top: 8px;
        z-index: 1;
    }
}
</style>