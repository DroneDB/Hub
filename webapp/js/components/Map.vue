<template>
    <div id="map" @mouseover="setMouseInside(true)" @mouseleave="setMouseInside(false)">
        <Toolbar :tools="tools" ref="toolbar" />
        <div ref="map-container" class="map-container" :class="{
            'cursor-pointer': selectSingle,
            'cursor-crosshair': selectPolygon
        }">
            <olMeasure ref="measure" />
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
        <ChangeUnitsDialog v-if="changeUnitsDialogOpen"
            :targetUnit="changeUnitsTargetUnit"
            :measurementsCount="changeUnitsMeasurementsCount"
            @onClose="handleChangeUnitsDialogClose">
        </ChangeUnitsDialog>
        <MapSettingsDialog v-if="mapSettingsDialogOpen"
            :basemaps="basemaps"
            :selectedBasemap="selectedBasemap"
            :unitPref="currentUnitPref"
            :customBasemapConfig="customBasemapConfig"
            @onClose="mapSettingsDialogOpen = false"
            @basemapChanged="handleBasemapChanged"
            @unitsChanged="handleUnitsChanged"
            @customBasemapConfigChanged="handleCustomBasemapConfigChanged">
        </MapSettingsDialog>
        <Flash v-if="flashMessage" :color="flashColor" :icon="flashIcon" @onClose="closeFlash">{{ flashMessage }}</Flash>
        <div ref="imagePopup" class="image-popup" v-show="imagePopupVisible">
            <div class="image-popup-header">
                <span class="image-popup-title">{{ imagePopupFileName }}</span>
                <div class="image-popup-actions">
                    <a :href="imagePopupOpenUrl" target="_blank" class="image-popup-btn" title="Open in new tab">
                        <i style="margin: 0; height: auto" class="icon external alternate"></i>
                    </a>
                    <a :href="imagePopupDownloadUrl" download class="image-popup-btn" title="Download">
                        <i style="margin: 0; height: auto" class="icon download"></i>
                    </a>
                    <button class="image-popup-btn image-popup-close" @click="closeImagePopup" title="Close">
                        <i style="margin: 0; height: auto" class="icon close"></i>
                    </button>
                </div>
            </div>
            <div class="image-popup-body">
                <div v-if="imagePopupLoading" class="image-popup-loading"><i class="icon spinner loading"></i></div>
                <img v-show="!imagePopupLoading && imagePopupThumbnail" :src="imagePopupThumbnail" :alt="imagePopupFileName" class="image-popup-img" @load="onImagePopupLoaded" @error="onImagePopupLoaded" />
            </div>
            <div class="image-popup-footer" v-if="imagePopupCoords">
                <span class="image-popup-coords" :title="imagePopupCoords">{{ imagePopupCoords }}</span>
                <button class="image-popup-btn image-popup-copy" @click="copyCoordinates" :title="imagePopupCoordsCopied ? 'Copied!' : 'Copy coordinates'">
                    <i style="margin: 0" :class="imagePopupCoordsCopied ? 'icon check' : 'icon copy outline'"></i>
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import 'ol/ol.css';
import { Map, View } from 'ol';
import { Tile as TileLayer, Vector as VectorLayer, Group as LayerGroup } from 'ol/layer';
import { Vector as VectorSource, Cluster } from 'ol/source';
import { defaults as defaultControls, Control } from 'ol/control';
import Collection from 'ol/Collection';
import { createEmpty as createEmptyExtent, isEmpty as isEmptyExtent, extend as extendExtent, getCenter as getExtentCenter, buffer as extentBuffer } from 'ol/extent';
import { transformExtent } from 'ol/proj';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';

import Feature from 'ol/Feature';
import { coordEach, coordAll } from '@turf/meta';
import bbox from '@turf/bbox';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import { fromExtent } from 'ol/geom/Polygon';
import GeoJSON from 'ol/format/GeoJSON';
import Overlay from 'ol/Overlay'; // Add overlay for tooltips

import ddb from 'ddb';
import { thumbs } from 'ddb';
import HybridXYZ from '../libs/olHybridXYZ';
import olMeasure from './olMeasure';
import olSelection from './olSelection';
import olSettings from './olSettings';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import Toolbar from './Toolbar.vue';
import Keyboard from '../libs/keyboard';
import Mouse from '../libs/mouse';
import { rootPath } from '../dynamic/pathutils';
import { requestFullScreen, exitFullScreen, isFullScreenCurrently, supportsFullScreen } from '../libs/utils';
import { isMobile } from '../libs/responsive';
import { Basemaps, getCustomBasemapConfig, saveCustomBasemapConfig } from '../libs/basemaps';
import * as flatgeobuf from 'flatgeobuf';
import Vue from 'vue';
import FeatureInfoDialog from './FeatureInfoDialog.vue';
import { extractFeatureDisplayName } from '../libs/propertiesUtils';
import { MeasurementStorage } from '../libs/measurementStorage';
import Alert from './Alert.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import ChangeUnitsDialog from './ChangeUnitsDialog.vue';
import MapSettingsDialog from './MapSettingsDialog.vue';
import Flash from './Flash.vue';

import { Circle as CircleStyle, Fill, Stroke, Style, Text, Icon } from 'ol/style';


export default {
    components: {
        Map, Toolbar, olMeasure, FeatureInfoDialog, Alert, ConfirmDialog, ChangeUnitsDialog, MapSettingsDialog, Flash
    }, props: {
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
        }
    },
    data: function () {
        const savedDirectionIndicators = localStorage.getItem('showDirectionIndicators') === 'true';
        const savedFlightPath = localStorage.getItem('showFlightPath') !== 'false';

        const tools = [
            {
                id: 'select-features',
                title: "Select Features — Hold CTRL and click on a feature to select/deselect it. Hold CTRL+click multiple features to multi-select.",
                icon: "mouse pointer",
                exclusiveGroup: "select",
                onSelect: () => {
                    this.selectSingle = true;
                    if (this.selectionControl) this.selectionControl.deactivate();
                },
                onDeselect: () => {
                    this.selectSingle = false;
                }
            },
            {
                id: 'reset-view',
                title: "Reset View — Zoom to fit all features. Shortcut: H",
                icon: "home",
                onClick: () => {
                    this.resetToInitialView();
                }
            }
        ];

        if (supportsFullScreen()) {
            tools.push({
                id: 'fullscreen',
                title: "Fullscreen — Toggle fullscreen mode. Shortcut: F11",
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

        tools.push({ id: 'separator' });
        tools.push({
            id: 'toggle-direction',
            title: 'Show direction and speed indicators',
            icon: 'location arrow',
            selected: savedDirectionIndicators,
            onSelect: () => {
                this.showDirectionIndicators = true;
                localStorage.setItem('showDirectionIndicators', 'true');
                this.applyDirectionStyles();
            },
            onDeselect: () => {
                this.showDirectionIndicators = false;
                localStorage.setItem('showDirectionIndicators', 'false');
                this.applyDirectionStyles();
            }
        });
        tools.push({
            id: 'toggle-flight-path',
            title: 'Show drone flight path',
            icon: 'map signs',
            selected: savedFlightPath,
            onSelect: () => {
                this.showFlightPath = true;
                localStorage.setItem('showFlightPath', 'true');
                if (this.flightPathLayer) this.flightPathLayer.setVisible(true);
                if (this.markerLayer) this.markerLayer.setVisible(true);
            },
            onDeselect: () => {
                this.showFlightPath = false;
                localStorage.setItem('showFlightPath', 'false');
                if (this.flightPathLayer) this.flightPathLayer.setVisible(false);
                if (this.markerLayer) this.markerLayer.setVisible(false);
            }
        });

        return {
            tools,
            selectSingle: false,
            selectPolygon: false,
            initialExtent: null,
            vectorLayers: [],
            vectorLayerColors: {}, // Store colors for vector layers
            tooltipElement: null,  // Element for vector feature tooltips
            tooltipOverlay: null,  // Overlay for tooltips
            selectedBasemap: localStorage.getItem('selectedBasemap') || 'satellite',
            basemaps: Basemaps,
            customBasemapConfig: getCustomBasemapConfig(),
            measuring: false,
            measurementStorage: null,
            hasSavedMeasurements: false,
            currentOrthophotoEntry: null,
            mapSettingsDialogOpen: false,
            showFlightPath: savedFlightPath,
            showDirectionIndicators: savedDirectionIndicators,
            currentUnitPref: localStorage.getItem('measureUnitPref') || 'metric',

            // Alert dialog
            alertDialogOpen: false,
            alertTitle: '',
            alertMessage: '',

            // Confirm dialogs
            clearMeasurementsDialogOpen: false,
            deleteSavedMeasurementsDialogOpen: false,
            changeUnitsDialogOpen: false,
            changeUnitsTargetUnit: 'metric',
            changeUnitsPreviousUnit: 'metric',
            changeUnitsMeasurementsCount: 0,

            // Flash message
            flashMessage: null,
            flashIcon: 'check circle outline',

            // Image popup
            imagePopupVisible: false,
            imagePopupLoading: true,
            imagePopupFileName: '',
            imagePopupThumbnail: null,
            imagePopupOpenUrl: '',
            imagePopupDownloadUrl: '',
            imagePopupCoords: '',
            imagePopupCoordsCopied: false,
            imagePopupOverlay: null,
            flashColor: 'positive'
        };
    },
    mounted: function () {
        if (!this.lazyload) this.loadMap();
    }, beforeDestroy: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
        Keyboard.offKeyUp(this.handleKeyUp);

        // Clean up the tooltip overlay
        if (this.tooltipOverlay && this.map) {
            this.map.removeOverlay(this.tooltipOverlay);
            this.tooltipOverlay = null;
            this.tooltipElement = null;
        }

        // Clean up image popup overlay
        if (this.imagePopupOverlay && this.map) {
            this.map.removeOverlay(this.imagePopupOverlay);
            this.imagePopupOverlay = null;
        }

        // Clean up vector layers
        if (this.vectorLayers && this.map) {
            this.vectorLayers.forEach(layer => {
                this.map.removeLayer(layer);
            });
            this.vectorLayers = [];
        }
    },
    watch: {
        files: {
            deep: true,
            handler: function (newVal, oldVal) {
                // Prevent multiple updates
                if (this._updateMap) {
                    clearTimeout(this._updateMap);
                    this._updateMap = null;
                }

                this._updateMap = setTimeout(() => {
                    // Do we need to redraw the features?
                    // Count has changed or first or last items are different
                    if (newVal.length !== oldVal.length ||
                        newVal[0] !== oldVal[0] ||
                        newVal[newVal.length - 1] !== oldVal[oldVal.length - 1]) {
                        this.reloadFileLayers();
                    } else {
                        // Just update (selection change)
                        if (typeof this.fileLayer !== 'undefined') {
                            this.fileLayer.changed();
                            this.updateRastersOpacity();
                        }
                    }
                }, 5);
            }
        }
    },
    methods: {        // Generate a unique color based on the file name or index
        getVectorFileColor: function (file, index) {
            // If we already have a color for this file, return it
            if (this.vectorLayerColors[file.entry.path]) {
                return this.vectorLayerColors[file.entry.path];
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
                const hash = this.stringToHashCode(file.entry.path);

                // Get hue from 0-360 based on hash
                const hue = hash % 360;
                // Fixed high saturation for visibility
                const saturation = 80;
                // Medium lightness for good contrast
                const lightness = 45;

                color = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`;
            }

            // Store the color for future reference
            this.vectorLayerColors[file.entry.path] = color;
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
                if (layer && layer.file) {
                    content = layer.file.name || 'Unknown layer';
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

        // Show image popup overlay on the map
        showImagePopup: function (file, coordinate) {
            const pathUtils = ddb.pathutils || ddb.utils;
            this.imagePopupFileName = pathUtils.basename ? pathUtils.basename(file.entry.path) : file.entry.path.split('/').pop();

            // Reset loading state and thumbnail for new image
            this.imagePopupLoading = true;
            this.imagePopupThumbnail = null;

            // Get thumbnail URL (set after nextTick so v-show hides the img while loading)
            this.$nextTick(() => {
                if (thumbs.supportedForType(file.entry.type)) {
                    this.imagePopupThumbnail = thumbs.fetch(file.path, 512);
                } else {
                    this.imagePopupLoading = false;
                }
            });

            // Build download and open URLs
            const [dataset, path] = ddb.utils.datasetPathFromUri(file.path);
            this.imagePopupDownloadUrl = dataset.downloadUrl(path);
            this.imagePopupOpenUrl = dataset.downloadUrl(path, { inline: true });

            // Extract WGS84 coordinates from entry
            if (file.entry.point_geom) {
                const coords = coordAll(file.entry.point_geom)[0];
                if (coords && coords.length >= 2) {
                    const lon = coords[0].toFixed(6);
                    const lat = coords[1].toFixed(6);
                    this.imagePopupCoords = `${lat}, ${lon}`;
                } else {
                    this.imagePopupCoords = '';
                }
            } else {
                this.imagePopupCoords = '';
            }
            this.imagePopupCoordsCopied = false;

            this.imagePopupVisible = true;

            // Position the overlay on the map
            this.$nextTick(() => {
                if (!this.imagePopupOverlay) {
                    this.imagePopupOverlay = new Overlay({
                        element: this.$refs.imagePopup,
                        autoPan: true,
                        autoPanAnimation: { duration: 250 },
                        offset: [150, -150],
                        positioning: 'bottom-left'
                    });
                    this.map.addOverlay(this.imagePopupOverlay);
                }
                this.imagePopupOverlay.setPosition(coordinate);
            });
        },

        // Called when popup image finishes loading (or errors)
        onImagePopupLoaded: function () {
            this.imagePopupLoading = false;
        },

        // Close image popup
        closeImagePopup: function () {
            this.imagePopupVisible = false;
            this.imagePopupLoading = true;
            this.imagePopupCoordsCopied = false;
            if (this.imagePopupOverlay) {
                this.imagePopupOverlay.setPosition(undefined);
            }
        },

        // Copy coordinates to clipboard
        copyCoordinates: function () {
            if (!this.imagePopupCoords) return;
            navigator.clipboard.writeText(this.imagePopupCoords).then(() => {
                this.imagePopupCoordsCopied = true;
                setTimeout(() => { this.imagePopupCoordsCopied = false; }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = this.imagePopupCoords;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this.imagePopupCoordsCopied = true;
                setTimeout(() => { this.imagePopupCoordsCopied = false; }, 2000);
            });
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
            if (layer && layer.file) {
                const fileName = layer.file.name || layer.file.entry.name || '';
                if (fileName) {
                    title = `${fileName} - Feature Properties`;
                }

                // If there's a name property, include it in the title
                if (properties.name) {
                    title = `${fileName} - ${properties.name}`;
                }
            }            // Use the FeatureInfoDialog component
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

            this.loaded = true;
            this._updateMap = null;
            this.vectorLayers = [];

            const genShotStyle = (fill, stroke, size) => {
                let text = null;
                if (size > 1) {
                    text = new Text({
                        text: size.toString(),
                        font: 'bold 14px sans-serif',
                        fill: new Fill({
                            color: 'rgba(252, 252, 255, 1)'
                        })
                    });
                }

                return new Style({
                    image: new CircleStyle({
                        radius: isMobile() ? 10 : 8,
                        fill: new Fill({
                            color: fill
                        }),
                        stroke: new Stroke({
                            color: stroke,
                            width: 2
                        })
                    }),
                    text
                });
            };

            const genDirectionStyle = (svgName, yawDegrees, size) => {
                if (size > 1) {
                    // Cluster: show numbered circle, not arrow
                    return genShotStyle('rgba(75, 150, 243, 1)', 'rgba(252, 252, 255, 1)', size);
                }

                return new Style({
                    image: new Icon({
                        src: rootPath(`images/${svgName}`),
                        rotation: yawDegrees * (Math.PI / 180),
                        rotateWithView: false,
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        scale: isMobile() ? 1.2 : 1.0,
                    })
                });
            };

            this.styles = {
                shot: feats => {
                    let styleId = `_shot-${feats.length}`;
                    let selected = false;

                    for (let i = 0; i < feats.length; i++) {
                        if (feats[i].file && feats[i].file.selected) {
                            styleId = `_shot-selected-${feats.length}`;
                            selected = true;
                            break;
                        }
                    }

                    // Memoize
                    if (!this.styles[styleId]) {
                        if (selected) this.styles[styleId] = genShotStyle('rgba(255, 158, 103, 1)', 'rgba(252, 252, 255, 1)', feats.length);
                        else this.styles[styleId] = genShotStyle('rgba(75, 150, 243, 1)', 'rgba(252, 252, 255, 1)', feats.length);
                    }

                    return this.styles[styleId];
                },

                'shot-outlined': feats => {
                    let styleId = `_shot-outlined-${feats.length}`;

                    // Memoize
                    if (!this.styles[styleId]) {
                        this.styles[styleId] = genShotStyle('rgba(253, 226, 147, 1)', 'rgba(252, 252, 255, 1)', feats.length);
                    }

                    return this.styles[styleId];
                },

                direction: feats => {
                    const size = feats.length;
                    if (size > 1) {
                        // Cluster: fallback to numbered circle
                        return this.styles.shot(feats);
                    }

                    const feat = feats[0];
                    const yaw = feat.file?.entry?.properties?.cameraYaw ?? 0;
                    const hasCameraOri = feat.file?.entry?.properties?.hasCameraOrientation;

                    // If orientation is not available, use circle
                    if (!hasCameraOri) {
                        return this.styles.shot(feats);
                    }

                    const selected = feat.file?.selected;
                    const svgName = selected ? 'direction-arrow-selected.svg' : 'direction-arrow.svg';
                    const styleId = `_direction-${selected ? 'sel' : 'def'}-${Math.round(yaw)}`;

                    if (!this.styles[styleId]) {
                        this.styles[styleId] = genDirectionStyle(svgName, yaw, 1);
                    }
                    return this.styles[styleId];
                },

                'direction-outlined': feats => {
                    if (feats.length > 1) return this.styles['shot-outlined'](feats);

                    const feat = feats[0];
                    const yaw = feat.file?.entry?.properties?.cameraYaw ?? 0;
                    const hasCameraOri = feat.file?.entry?.properties?.hasCameraOrientation;

                    if (!hasCameraOri) return this.styles['shot-outlined'](feats);

                    const styleId = `_direction-out-${Math.round(yaw)}`;
                    if (!this.styles[styleId]) {
                        this.styles[styleId] = genDirectionStyle('direction-arrow-outlined.svg', yaw, 1);
                    }
                    return this.styles[styleId];
                },

                outline: new Style({
                    stroke: new Stroke({
                        color: 'rgba(253, 226, 147, 1)',
                        width: 6
                    })
                }),

                invisible: new Style({
                    fill: new Fill({
                        color: 'rgba(0, 0, 0, 0)'
                    })
                }),

                startFlag: new Style({
                    image: new Icon({
                        anchor: [0.05, 1],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        src: rootPath('images/start-flag.svg'),
                    })
                }),

                finishFlag: new Style({
                    image: new Icon({
                        anchor: [0.05, 1],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        src: rootPath('images/finish-flag.svg'),
                    })
                }),

                flightPath: new Style({
                    stroke: new Stroke({
                        color: 'rgba(75, 150, 243, 1)', //'rgba(253, 226, 147, 1)',
                        width: 4
                    })
                }),

                pano: feats => {
                    let styleId = 'panoDeselected';

                    for (let i = 0; i < feats.length; i++) {
                        if (feats[i].file && feats[i].file.selected) {
                            styleId = 'panoSelected';
                            break;
                        }
                    }

                    return this.styles[styleId];
                },

                panoDeselected: new Style({
                    image: new Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        src: rootPath('images/pano.svg')
                    })
                }), panoSelected: new Style({
                    image: new Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        src: rootPath('images/pano-selected.svg')
                    })
                }),

                // Vector file styles
                vectorPoint: new Style({
                    image: new CircleStyle({
                        radius: 5,
                        fill: new Fill({
                            color: 'rgba(30, 144, 255, 0.8)'
                        }),
                        stroke: new Stroke({
                            color: 'rgba(0, 0, 139, 1)',
                            width: 1.5
                        })
                    })
                }),

                vectorLine: new Style({
                    stroke: new Stroke({
                        color: 'rgba(30, 144, 255, 0.8)',
                        width: 3
                    })
                }),

                vectorPolygon: new Style({
                    fill: new Fill({
                        color: 'rgba(30, 144, 255, 0.2)'
                    }),
                    stroke: new Stroke({
                        color: 'rgba(30, 144, 255, 0.8)',
                        width: 2
                    })
                })
            };

            this.fileFeatures = new VectorSource();
            const clusterSource = new Cluster({
                distance: 0.0001,
                source: this.fileFeatures
            });
            this.fileLayer = new VectorLayer({
                source: clusterSource,
                style: cluster => {
                    const feats = cluster.get('features');
                    const s = this.styles[feats[0].style];
                    if (typeof s === "function") return s(feats);
                    else return s;
                }
            });
            this.rasterLayer = new LayerGroup();

            this.extentsFeatures = new VectorSource();
            this.extentLayer = new VectorLayer({
                source: this.extentsFeatures,
                style: this.styles.invisible
            });

            this.outlineFeatures = new VectorSource();
            this.outlineLayer = new VectorLayer({
                source: this.outlineFeatures,
                style: this.styles.outline
            });
            this.footprintRastersLayer = new LayerGroup();

            this.flightPathFeatures = new VectorSource();
            this.flightPathLayer = new VectorLayer({
                source: this.flightPathFeatures
            });
            this.markerFeatures = new VectorSource();
            this.markerLayer = new VectorLayer({
                source: this.markerFeatures
            });

            this.topLayers = new LayerGroup();
            this.topLayers.setLayers(new Collection([
                this.flightPathLayer,
                this.fileLayer,
                this.markerLayer
            ]));


            this.basemapLayer = this.createBasemapLayer();

            this.selectionControl = new olSelection.Control({
                onSelectionComplete: (polygon) => { this.handlePolygonSelection(polygon); },
                onActivated: () => {
                    this.$refs.toolbar.deselectAll();
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

            this.measureControls = new olMeasure.Controls({
                onToolSelected: () => { this.measuring = true; if (this.selectionControl) this.selectionControl.deactivate(); },
                onToolDelesected: () => { this.measuring = false; },
                onSave: () => { this.saveMeasurements(); },
                onClearAll: () => { this.onClearAllMeasurements(); },
                onExport: () => { this.exportMeasurementsToFile(); },
                onDeleteSaved: () => { this.deleteSavedMeasurements(); },
                onRequestClearConfirm: () => { this.clearMeasurementsDialogOpen = true; },
                onRequestDeleteConfirm: () => { this.deleteSavedMeasurementsDialogOpen = true; },
                canWrite: this.canWrite,
                canDelete: this.canDelete
            }); this.map = new Map({
                target: this.$refs['map-container'],
                layers: [
                    this.basemapLayer,
                    this.rasterLayer,
                    this.footprintRastersLayer,
                    this.extentLayer,
                    this.outlineLayer,
                    this.topLayers,
                    this.measureControls.getLayer()
                ],
                view: new View({
                    center: [0, 0],
                    zoom: 2
                })
            });

            // Setup tooltip overlay for vector features
            this.setupTooltipOverlay();
            this.map.addOverlay(this.tooltipOverlay); this.map.once("postrender", () => {
                this.map.getTargetElement().querySelector("canvas").style.cursor = "inherit";
            });
            // Add pointer move handler for tooltips
            this.map.on('pointermove', (e) => {
                if (e.dragging || this.measuring) {
                    this.hideFeatureTooltip();
                    return;
                }

                // Check if pointer is over UI controls - hide tooltip if so
                const domElement = document.elementFromPoint(e.pixel[0], e.pixel[1]);
                if (domElement && (
                    domElement.closest('.toolbar') ||
                    domElement.closest('.ol-measure-control') ||
                    domElement.closest('.ol-selection') ||
                    domElement.closest('.ol-zoom') ||
                    domElement.closest('.ol-settings')
                )) {
                    this.hideFeatureTooltip();
                    return;
                }

                // Check if we're hovering over a vector feature or image marker
                const hitVector = this.map.hasFeatureAtPixel(e.pixel, {
                    layerFilter: layer => this.vectorLayers.includes(layer)
                });
                const hitImage = this.map.hasFeatureAtPixel(e.pixel, {
                    layerFilter: layer => layer === this.fileLayer
                });
                const hit = hitVector || hitImage;

                // Update cursor style based on whether we're hovering over a feature
                this.map.getTargetElement().style.cursor = hit ? 'pointer' : 'inherit';

                if (hitVector) {
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
                } else if (hitImage) {
                    // Show tooltip for image markers (GEOIMAGE cluster)
                    let imageFeature = null;
                    this.map.forEachFeatureAtPixel(e.pixel,
                        (feature) => {
                            if (!imageFeature) {
                                imageFeature = feature;
                                return true;
                            }
                            return false;
                        }, {
                        layerFilter: layer => layer === this.fileLayer
                    });

                    if (imageFeature) {
                        const clusterFeatures = imageFeature.get('features');
                        if (clusterFeatures && clusterFeatures.length > 0) {
                            let label;
                            if (clusterFeatures.length === 1) {
                                const file = clusterFeatures[0].file;
                                const feat = clusterFeatures[0];
                                label = file.entry.path.split('/').pop();

                                // Append speed info when direction indicators are active
                                if (this.showDirectionIndicators) {
                                    const speed = feat.computedSpeed;
                                    if (speed !== undefined && speed !== null) {
                                        let speedDisplay, speedUnit;
                                        if (this.currentUnitPref === 'imperial') {
                                            speedDisplay = (speed * 2.23694).toFixed(1);
                                            speedUnit = 'mph';
                                        } else {
                                            speedDisplay = (speed * 3.6).toFixed(1);
                                            speedUnit = 'km/h';
                                        }
                                        label += ` — ${speedDisplay} ${speedUnit}`;
                                    }
                                }
                            } else {
                                label = `${clusterFeatures.length} images`;
                            }
                            this.tooltipElement.innerHTML = label;
                            this.tooltipElement.style.display = 'block';
                            this.tooltipOverlay.setPosition(this.map.getCoordinateFromPixel(e.pixel));
                        } else {
                            this.hideFeatureTooltip();
                        }
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

            this.map.addControl(this.selectionControl);
            this.map.addControl(this.measureControls);

            this.settingsControl = new olSettings.Control({
                onOpenSettings: () => { this.mapSettingsDialogOpen = true; }
            });
            this.map.addControl(this.settingsControl);

            // Apply flight path visibility preference
            this.flightPathLayer.setVisible(this.showFlightPath);
            this.markerLayer.setVisible(this.showFlightPath);

            const doSelectSingle = e => {
                let first = true;
                let vectorLayerClicked = false;

                // First check vector features, since they might be on top
                // Loop through all vector layers
                for (let i = 0; i < this.vectorLayers.length; i++) {
                    const vectorLayer = this.vectorLayers[i];

                    // Use OpenLayers' built-in feature detection at pixel
                    // This works well with the streamed features
                    let foundFeature = false;

                    this.map.forEachFeatureAtPixel(e.pixel, (feature, layer) => {
                        if (layer === vectorLayer && !foundFeature) {
                            foundFeature = true;
                            vectorLayerClicked = true;

                            if (vectorLayer.file) {
                                vectorLayer.file.selected = !vectorLayer.file.selected;

                                // Inform other components we should scroll to this file
                                if (vectorLayer.file.selected) {
                                    this.$emit("scrollTo", vectorLayer.file);
                                }

                                // Update the vector layer's style to reflect selection
                                this.updateRastersOpacity();
                            }
                        }
                    });

                    if (vectorLayerClicked) break;
                }

                // If no vector feature was clicked, check other features
                if (!vectorLayerClicked) {
                    this.map.forEachFeatureAtPixel(e.pixel, feat => {
                        // Only select the first entry
                        if (!first) return;
                        first = false;

                        const feats = feat.get('features');
                        if (feats) {
                            // Geoimage point cluster
                            let selected = false;
                            for (let i = 0; i < feats.length; i++) {
                                if (feats[i].file && feats[i].file.selected) {
                                    selected = true;
                                    break;
                                }
                            }

                            for (let i = 0; i < feats.length; i++) {
                                if (feats[i].file) feats[i].file.selected = !selected;
                            }

                            // Inform other components we should scroll to this file
                            if (!selected && feats.length && feats[0].file) {
                                this.$emit("scrollTo", feats[0].file);
                            }
                        } else {
                            // Extents selection
                            if (feat.file) feat.file.selected = !feat.file.selected;
                        }
                    });
                }
            };

            this.map.on('click', e => {
                if (this.measuring) return;
                if (this.selectPolygon || (this.selectionControl && this.selectionControl.isActive())) return;

                // Single selection
                if (this.selectSingle) {
                    doSelectSingle(e);
                } else {
                    // Close any open image popup
                    this.closeImagePopup();

                    // Remove all
                    this.outlineFeatures.forEachFeature(outline => {
                        this.outlineFeatures.removeFeature(outline);

                        // Deselect style
                        if (outline.feat.get('features')) {
                            outline.feat.get('features').forEach(f => {
                                f.style = this.showDirectionIndicators ? 'direction' : 'shot';
                            });
                        }

                        delete (outline.feat.outline);
                    });
                    this.clearLayerGroup(this.footprintRastersLayer);
                    this.topLayers.setVisible(true);

                    // Add selected
                    let stop = false;
                    this.map.forEachFeatureAtPixel(e.pixel, feat => {
                        if (stop) return;

                        if (!feat.outline) {
                            let outline = null;

                            if (feat.get('features')) {
                                // Geoimage (point cluster)
                                const file = feat.get('features')[0].file;
                                if (file.entry.polygon_geom) {
                                    const coords = coordAll(file.entry.polygon_geom);
                                    outline = new Feature(new Polygon([coords]));
                                    outline.getGeometry().transform('EPSG:4326', 'EPSG:3857');
                                }

                                // Clicked on panorama
                                if ([ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA].indexOf(file.entry.type) !== -1) {
                                    // Open panorama view
                                    this.$emit('openItem', file, 'panorama');
                                    return;
                                }

                                // Clicked on geoimage - show image popup
                                if (file.entry.type === ddb.entry.type.GEOIMAGE) {
                                    this.showImagePopup(file, e.coordinate);
                                }

                                // Nothing else to do
                                if (!outline) return;

                                // Set style
                                feat.get('features').forEach(f => {
                                    f.style = this.showDirectionIndicators ? 'direction-outlined' : 'shot-outlined';
                                });

                                // Add geoprojected raster footprint
                                const rasterFootprint = new TileLayer({
                                    extent: outline.getGeometry().getExtent(),
                                    source: new HybridXYZ({
                                        url: file.path,
                                        tileSize: 256,
                                        transition: 200,
                                        minZoom: 14,
                                        maxZoom: 22
                                        // TODO: get min/max zoom somehow?
                                    })
                                });
                                // tileLayer.file = f;
                                this.footprintRastersLayer.getLayers().push(rasterFootprint);
                            } else {
                                // Extent
                                outline = feat;
                            }

                            this.outlineFeatures.addFeature(outline);

                            // Add reference to self (for deletion later)
                            outline.feat = feat;
                            feat.outline = outline;

                            this.topLayers.setVisible(false);

                            stop = true;
                        }
                    }, {
                        layerFilter: layer => {
                            return layer.getVisible() &&
                                (layer === this.fileLayer ||
                                    layer === this.extentLayer);
                        }
                    });

                    // Update styles
                    this.fileLayer.changed();
                }
            });

            // Right click
            this.map.on('contextmenu', e => {
                // Single selection
                doSelectSingle(e);

                e.stopPropagation();
                e.preventDefault();
                return false;
            });

            this.$root.$on('addItems', () => {
                this.reloadFileLayers();
            });

            Keyboard.onKeyDown(this.handleKeyDown);
            Keyboard.onKeyUp(this.handleKeyUp);

            // Redraw, otherwise openlayers does not draw
            // the map correctly
            setTimeout(() => this.map.updateSize(), 1);
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
        }, zoomToFilesExtent: function () {
            const ext = this.getSelectedFilesExtent();
            if (!isEmptyExtent(ext)) {
                // Save initial extent on first zoom
                if (!this.initialExtent) {
                    this.initialExtent = ext.slice(); // Clone the extent array
                }
                // Zoom to it
                setTimeout(() => {
                    this.map.getView().fit(ext, {
                        padding: [40, 40, 40, 40],
                        duration: 500,
                        minResolution: 0.5,
                        maxZoom: 22  // Prevent zooming in too much on single points
                    });
                }, 10);
            } else {
                // If we have no content to zoom to, check if we'll get vector data later
                // In this case, an event listener in reloadFileLayers will handle zooming
                // when vector features are loaded

                // If no vector layers expected and no extent, set a default view
                if (this.vectorLayers.length === 0 && this.files.length === 0) {
                    // Reset to default view
                    this.map.getView().setCenter([0, 0]);
                    this.map.getView().setZoom(2);
                }
            }
        },
        resetToInitialView: function () {
            if (this.initialExtent && !isEmptyExtent(this.initialExtent)) {
                this.map.getView().fit(this.initialExtent, {
                    padding: [40, 40, 40, 40],
                    duration: 500,
                    minResolution: 0.5,
                    maxZoom: 22
                });
            } else {
                // Fallback to recalculating extent
                this.zoomToFilesExtent();
            }
        },
        getSelectedFilesExtent: function () {
            const ext = createEmptyExtent();
            if (this.fileFeatures.getFeatures().length) {
                extendExtent(ext, this.fileFeatures.getExtent());
            }
            this.rasterLayer.getLayers().forEach(layer => {
                extendExtent(ext, layer.getExtent());
            });

            // Include vector layers' extent
            this.vectorLayers.forEach(layer => {
                const source = layer.getSource();
                if (source && source.getExtent) {
                    const vectorExtent = source.getExtent();
                    if (!isEmptyExtent(vectorExtent)) {
                        extendExtent(ext, vectorExtent);
                    }
                }
            });

            return ext;
        },
        clearLayerGroup: function (layerGroup) {
            let count = layerGroup.getLayers().getLength();
            for (var j = 0; j < count; j++) {
                let layer = layerGroup.getLayers().pop();
                layer = {};
            }
        },
        setMouseInside: function (flag) {
            this.mouseInside = flag;
        },
        reloadFileLayers: function () {
            if (!this.loaded) return;

            this.fileFeatures.clear();
            this.extentsFeatures.clear();
            this.outlineFeatures.clear();
            this.flightPathFeatures.clear();
            this.markerFeatures.clear();
            this.clearLayerGroup(this.rasterLayer);

            const features = [];
            const rasters = this.rasterLayer.getLayers();

            // Clear any existing vector layers
            const vectorLayers = this.vectorLayers || [];
            vectorLayers.forEach(layer => {
                if (this.map) {
                    this.map.removeLayer(layer);
                }
            });
            this.vectorLayers = [];

            let flightPath = [];

            // Create features, add them to map
            this.files.forEach(f => {
                if (!f.entry) return;

                if (f.entry.type === ddb.entry.type.GEOIMAGE || f.entry.type === ddb.entry.type.GEOVIDEO) {
                    const coords = coordAll(f.entry.point_geom)[0];
                    const point = new Point(coords);
                    const feat = new Feature(point);
                    feat.style = this.showDirectionIndicators ? 'direction' : 'shot';
                    feat.file = f;
                    feat.getGeometry().transform('EPSG:4326', 'EPSG:3857');
                    features.push(feat);

                    if (f.entry.type === ddb.entry.type.GEOIMAGE) {
                        if (f.entry.properties.captureTime) {
                            flightPath.push({
                                point,
                                captureTime: f.entry.properties.captureTime,
                                feature: feat
                            });
                        }
                    }
                } else if (f.entry.polygon_geom && (f.entry.type === ddb.entry.type.GEORASTER || f.entry.type === ddb.entry.type.POINTCLOUD)) {
                    const extent = transformExtent(bbox(f.entry.polygon_geom), 'EPSG:4326', 'EPSG:3857');
                    const tileLayer = new TileLayer({
                        extent,
                        source: new HybridXYZ({
                            url: f.path,
                            tileSize: 256,
                            transition: 200,
                            minZoom: 14,
                            maxZoom: 22
                            // TODO: get min/max zoom from file
                        })
                    });
                    tileLayer.file = f;
                    rasters.push(tileLayer);

                    // We create "hidden" extents as polygons
                    // so that we can click raster layers
                    const extentFeat = new Feature(fromExtent(extent));
                    extentFeat.file = f;
                    this.extentsFeatures.addFeature(extentFeat);
                } else if (f.entry.type === ddb.entry.type.GEOPANORAMA) {
                    const coords = coordAll(f.entry.point_geom)[0];
                    const point = new Point(coords);
                    const feat = new Feature(point);
                    feat.style = 'pano';
                    feat.file = f;
                    feat.getGeometry().transform('EPSG:4326', 'EPSG:3857'); features.push(feat);
                } else if (f.entry.type === ddb.entry.type.VECTOR) {
                    // Skip measurement files (they are loaded separately as measurements)
                    if (f.entry.path.endsWith('_measurements.geojson')) {
                        console.log(`Skipping vector layer for measurement file: ${f.entry.path}`);
                        return;
                    }

                    // Handle vector files using streaming approach
                    const loadVectorFile = async () => {
                        try {
                            // Create a proper Entry object using the dataset
                            let vectorUrl = '';

                            if (this.dataset) {
                                // Create the Entry object using the dataset
                                const entry = this.dataset.Entry(f.entry);
                                // Get the vector URL using getVector method
                                vectorUrl = await entry.getVector();
                            } else {
                                console.warn('Dataset not available, using fallback URL construction');
                                // Fallback in case dataset is not available
                                const hashMatch = f.path.match(/\/r\/([^\/]+)\/([^\/]+)\/([^\/]+)/);

                                if (hashMatch && hashMatch.length >= 4) {
                                    // Use the same URL pattern that getVector() would use
                                    const hash = hashMatch[3];
                                    const baseApi = f.path.split('/r/')[0];
                                    vectorUrl = `${baseApi}/build/${hash}/vec/vector.fgb`;
                                } else {
                                    // Fallback in case the path structure is different
                                    vectorUrl = `${f.path}/vector.fgb`;
                                }
                            }

                            // Create a vector source that will stream features based on the current view
                            const vectorSource = new VectorSource();

                            // Get a unique color for this vector file
                            const vectorFileIndex = this.vectorLayers.length;
                            const vectorColor = this.getVectorFileColor(f, vectorFileIndex);
                            const vectorSelectedColor = 'rgba(255, 158, 103, 0.8)'; // Orange for selected state
                            // Create a vector style based on the unique color
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
                                }),

                                // Selected styles
                                pointSelected: new Style({
                                    image: new CircleStyle({
                                        radius: 6, // Slightly larger when selected
                                        fill: new Fill({
                                            color: vectorSelectedColor
                                        }),
                                        stroke: new Stroke({
                                            color: 'rgba(255, 255, 255, 0.8)',
                                            width: 2
                                        })
                                    })
                                }),

                                lineSelected: new Style({
                                    stroke: new Stroke({
                                        color: vectorSelectedColor,
                                        width: 4 // Slightly thicker when selected
                                    })
                                }),

                                polygonSelected: new Style({
                                    fill: new Fill({
                                        color: vectorSelectedColor.replace('0.8', '0.3') // More transparent for fill
                                    }),
                                    stroke: new Stroke({
                                        color: vectorSelectedColor,
                                        width: 3 // Slightly thicker when selected
                                    })
                                })
                            };

                            // Create the vector layer with styling based on geometry type
                            // Style function compatible with RenderFeature (uses getType() instead of getGeometry().getType())
                            const vectorStyleFunction = (feature) => {
                                // For RenderFeature, use getType() directly instead of getGeometry().getType()
                                const geometryType = feature.getType ? feature.getType() : (feature.getGeometry ? feature.getGeometry().getType() : 'Point');
                                const isSelected = f.selected;
                                const properties = feature.getProperties();

                                // Get appropriate base style based on geometry and selection
                                let style;
                                if (isSelected) {
                                    if (geometryType.includes('Point')) {
                                        style = vectorStyles.pointSelected.clone();
                                    } else if (geometryType.includes('LineString')) {
                                        style = vectorStyles.lineSelected.clone();
                                    } else if (geometryType.includes('Polygon')) {
                                        style = vectorStyles.polygonSelected.clone();
                                    } else {
                                        style = vectorStyles.pointSelected.clone();
                                    }
                                } else {
                                    if (geometryType.includes('Point')) {
                                        style = vectorStyles.point.clone();
                                    } else if (geometryType.includes('LineString')) {
                                        style = vectorStyles.line.clone();
                                    } else if (geometryType.includes('Polygon')) {
                                        style = vectorStyles.polygon.clone();
                                    } else {
                                        style = vectorStyles.point.clone();
                                    }
                                }

                                // Add label for features when zoomed in close enough
                                // Only add labels at higher zoom levels to prevent clutter
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

                            // Add file reference to layer for selection handling
                            vectorLayer.file = f;

                            // Add layer to the map
                            this.map.addLayer(vectorLayer);

                            // Store vector layer for later reference
                            this.vectorLayers.push(vectorLayer);

                            // Add event listener to zoom to all features when source changes
                            // This helps with requirement #5 - calculate initial map position
                            vectorSource.on('change', () => {
                                // Only trigger if we have features and loading is done
                                if (vectorSource.getFeatures().length > 0 && vectorSource.getState() === 'ready') {
                                    // Trigger a map extent update to include these features
                                    this.zoomToFilesExtent();
                                }
                            });

                        } catch (error) {
                            console.error('Error loading vector file:', error);
                        }
                    };

                    // Start loading the vector file asynchronously
                    loadVectorFile();
                }
            });

            if (features.length) this.fileFeatures.addFeatures(features);

            // Add flight path line
            if (flightPath.length >= 2) {
                flightPath.sort((a, b) => a.captureTime < b.captureTime ? -1 : (a.captureTime === b.captureTime ? 0 : 1));

                // Compute estimated speed from consecutive positions (fallback)
                for (let i = 0; i < flightPath.length; i++) {
                    const fp = flightPath[i];
                    const feat = fp.feature;
                    if (!feat) continue;

                    // Priority 1: backend-extracted speed (DJI XMP or EXIF GPS)
                    const backendSpeed = feat.file?.entry?.properties?.flightSpeed;
                    if (backendSpeed !== undefined && backendSpeed !== null) {
                        feat.computedSpeed = backendSpeed; // m/s
                        continue;
                    }

                    // Priority 2: calculate from consecutive positions
                    if (i > 0) {
                        const prev = flightPath[i - 1];
                        const coords1 = prev.point.getCoordinates(); // [lon, lat] EPSG:4326
                        const coords2 = fp.point.getCoordinates();

                        // Haversine distance
                        const R = 6371000; // Earth radius in meters
                        const dLat = (coords2[1] - coords1[1]) * Math.PI / 180;
                        const dLon = (coords2[0] - coords1[0]) * Math.PI / 180;
                        const a = Math.sin(dLat / 2) ** 2 +
                                  Math.cos(coords1[1] * Math.PI / 180) *
                                  Math.cos(coords2[1] * Math.PI / 180) *
                                  Math.sin(dLon / 2) ** 2;
                        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                        const dt = fp.captureTime - prev.captureTime;
                        // Only calculate if time gap is reasonable (< 5 minutes)
                        if (dt > 0 && dt < 300) {
                            const speed = dist / dt; // m/s
                            // Sanity check: skip if speed > 200 km/h (~55.6 m/s)
                            if (speed <= 55.6) {
                                feat.computedSpeed = speed;
                            }
                        }
                    }
                }

                const startPoint = flightPath[0].point;
                const finishPoint = flightPath[flightPath.length - 1].point;

                const addFlag = (point, style) => {
                    const feat = new Feature({
                        geometry: point
                    });
                    // feat.getGeometry().transform('EPSG:4326', 'EPSG:3857');
                    feat.setStyle(style);
                    this.markerFeatures.addFeature(feat);
                };

                addFlag(startPoint, this.styles.startFlag);
                addFlag(finishPoint, this.styles.finishFlag);

                // Draw linestring
                const pathFeat = new Feature({
                    geometry: new LineString(flightPath.map(fp => fp.point.flatCoordinates))
                });
                pathFeat.setStyle(this.styles.flightPath);
                this.flightPathFeatures.addFeature(pathFeat);
            }

            this.zoomToFilesExtent();
            this.updateRastersOpacity();

            // Load measurements for orthophotos if available
            this.loadMeasurementsForOrthophotos();
        },

        applyDirectionStyles: function () {
            // Update style of all GEOIMAGE/GEOVIDEO features without reloading layers
            if (!this.fileFeatures) return;
            const features = this.fileFeatures.getFeatures();
            features.forEach(feat => {
                if (feat.file?.entry?.type === ddb.entry.type.GEOIMAGE ||
                    feat.file?.entry?.type === ddb.entry.type.GEOVIDEO) {

                    if (this.showDirectionIndicators) {
                        feat.style = 'direction';
                    } else {
                        feat.style = 'shot';
                    }
                }
            });
            // Force re-render of the layer
            if (this.fileLayer) {
                this.fileLayer.changed();
            }
        },

        handleKeyDown: function (e) {
            if (Keyboard.isCtrlPressed() && this.mouseInside) {
                this.$refs.toolbar.selectTool('select-features');
            }
            // H key for reset view
            if (e.keyCode === 72 && this.mouseInside) {
                this.resetToInitialView();
            }
        },
        handleKeyUp: function (e) {
            // ESC
            if (e.keyCode === 27) {
                this.$refs.toolbar.deselectAll();
                this.measureControls.deselectCurrent();
                if (this.selectionControl) {
                    this.selectionControl.deactivate();
                }
            }

            if (!Keyboard.isCtrlPressed() && this.mouseInside) {
                this.$refs.toolbar.deselectTool('select-features');
            }
        },
        handlePolygonSelection: function (polygon) {
            this.selectPolygon = true;

            let scrolled = false;

            // Check geoimage/geopanorama point features
            this.fileFeatures.getFeatures().forEach(feat => {
                const geom = feat.getGeometry();
                if (geom && polygon.intersectsCoordinate(geom.getCoordinates())) {
                    if (feat.file) {
                        feat.file.selected = true;
                        if (!scrolled) {
                            this.$emit('scrollTo', feat.file);
                            scrolled = true;
                        }
                    }
                }
            });

            // Check raster extent features (polygon geometries)
            this.extentsFeatures.getFeatures().forEach(feat => {
                const geom = feat.getGeometry();
                if (geom && polygon.intersectsExtent(geom.getExtent())) {
                    if (feat.file) {
                        feat.file.selected = true;
                        if (!scrolled) {
                            this.$emit('scrollTo', feat.file);
                            scrolled = true;
                        }
                    }
                }
            });

            // Check vector layers
            this.vectorLayers.forEach(vectorLayer => {
                if (!vectorLayer.file) return;
                const source = vectorLayer.getSource();
                if (!source) return;

                let hasIntersection = false;
                const extent = polygon.getExtent();
                if (source.forEachFeatureInExtent) {
                    source.forEachFeatureInExtent(extent, feature => {
                        const featureGeom = feature.getGeometry();
                        if (featureGeom) {
                            const featureExtent = featureGeom.getExtent();
                            if (polygon.intersectsExtent(featureExtent)) {
                                hasIntersection = true;
                            }
                        }
                    });
                }

                if (hasIntersection) {
                    vectorLayer.file.selected = true;
                    if (!scrolled) {
                        this.$emit('scrollTo', vectorLayer.file);
                        scrolled = true;
                    }
                }
            });

            this.updateRastersOpacity();
        },
        clearSelection: function () {
            this.files.forEach(f => f.selected = false);
        }, updateRastersOpacity: function () {
            this.rasterLayer.getLayers().forEach(layer => {
                if (layer.file.selected) layer.setOpacity(0.8);
                else layer.setOpacity(1.0);
            });

            // For vector layers, no need to update the style manually
            // since we're using a style function that checks the selection state
            // Just trigger a redraw of the layer
            this.vectorLayers.forEach(layer => {
                if (layer.getSource()) {
                    layer.getSource().changed();
                }
            });
        },
        /**
         * Create a TileLayer for the current basemap selection
         */
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
            // Default: built-in basemap (or fallback for invalid custom)
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
            // Replace the basemap layer at position 0
            layers.removeAt(0);
            layers.insertAt(0, newLayer);
            this.basemapLayer = newLayer;
            localStorage.setItem('selectedBasemap', this.selectedBasemap);
        },

        /**
         * Load measurements for orthophoto and point cloud files
         */
        loadMeasurementsForOrthophotos: async function() {
            if (!this.dataset || !this.measureControls) {
                console.log('Cannot load measurements: dataset or measureControls not available');
                return;
            }

            // Find the first orthophoto/georaster or point cloud file
            const orthophotoFile = this.files.find(f =>
                f.entry && (f.entry.type === ddb.entry.type.GEORASTER || f.entry.type === ddb.entry.type.POINTCLOUD)
            );

            if (!orthophotoFile) {
                console.log('No orthophoto/georaster or point cloud files found');
                // Reset measurement storage if no georaster files
                this.currentOrthophotoEntry = null;
                this.measurementStorage = null;
                return;
            }

            // Initialize measurement storage even if no saved measurements exist
            this.currentOrthophotoEntry = orthophotoFile.entry;
            this.measurementStorage = new MeasurementStorage(this.dataset, this.currentOrthophotoEntry);
            console.log('Measurement storage initialized for:', this.currentOrthophotoEntry.path);

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
                await this.loadMeasurementsForOrthophotos();

                // Check again after initialization attempt
                if (!this.measurementStorage) {
                    console.error('Cannot save: no georaster or point cloud file found');
                    this.showAlert('Error', 'Cannot save: no orthophoto/georaster or point cloud file found. Measurements can only be saved for orthophoto or point cloud files.');
                    return;
                }
            }

            if (!this.currentOrthophotoEntry) {
                console.error('Cannot save: currentOrthophotoEntry not set');
                this.showAlert('Error', 'Cannot save: no orthophoto entry found');
                return;
            }

            try {
                const geojson = this.measureControls.exportToGeoJSON(this.currentOrthophotoEntry.path);

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
            if (!this.measureControls || !this.currentOrthophotoEntry) {
                return;
            }

            if (!this.measureControls.hasMeasurements()) {
                this.showAlert('Warning', 'No measurements to export');
                return;
            }

            const geojson = this.measureControls.exportToGeoJSON(this.currentOrthophotoEntry.path);

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
         * Handle units change request - show confirmation dialog
         */
        onUnitsChangeRequested: function(newUnit, oldUnit) {
            this.changeUnitsTargetUnit = newUnit;
            this.changeUnitsPreviousUnit = oldUnit;
            this.changeUnitsMeasurementsCount = this.measureControls.getMeasurementsCount();
            this.changeUnitsDialogOpen = true;
        },

        /**
         * Handle change units dialog close
         */
        handleChangeUnitsDialogClose: async function(result) {
            this.changeUnitsDialogOpen = false;
            if (result === 'confirm') {
                // Apply the unit change
                this.measureControls.applyUnitsChange(this.changeUnitsTargetUnit);
                this.currentUnitPref = this.changeUnitsTargetUnit;
                // Save measurements with new units
                await this.saveMeasurements();
            }
        },

        /**
         * Handle basemap change from settings dialog
         */
        handleBasemapChanged: function(basemap) {
            this.selectedBasemap = basemap;
            this.updateBasemap();
        },

        /**
         * Handle custom basemap configuration change from settings dialog
         */
        handleCustomBasemapConfigChanged: function(config) {
            saveCustomBasemapConfig(config);
            this.customBasemapConfig = config;
            if (this.selectedBasemap === 'custom') {
                this.updateBasemap();
            }
        },

        /**
         * Handle units change from settings dialog
         */
        handleUnitsChanged: function(newUnit, oldUnit) {
            // If there are measurements, show confirmation dialog
            if (this.measureControls && this.measureControls.hasMeasurements()) {
                this.onUnitsChangeRequested(newUnit, oldUnit);
            } else {
                // No measurements, apply directly
                this.measureControls.applyUnitsChange(newUnit);
                this.currentUnitPref = newUnit;
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

.image-popup {
    background: white;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    min-width: 260px;
    max-width: 320px;
    overflow: hidden;
    z-index: 1001;
    font-family: inherit;
}

.image-popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
}

.image-popup-title {
    font-size: 13px;
    font-weight: 600;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
}

.image-popup-actions {
    display: flex;
    gap: 4px;
    align-items: center;
}

.image-popup-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 3px;
    color: #555;
    font-size: 14px;
    display: flex;
    align-items: center;
    text-decoration: none;
}

.image-popup-btn:hover {
    background: #e0e0e0;
    color: #222;
}

.image-popup-close:hover {
    background: #ffcdd2;
    color: #c62828;
}

.image-popup-body {
    padding: 6px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100px;
}

.image-popup-img {
    max-width: 100%;
    max-height: 240px;
    border-radius: 4px;
    object-fit: contain;
}

.image-popup-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100px;
    font-size: 24px;
    color: #999;
}

.image-popup-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 10px;
    border-top: 1px solid #e0e0e0;
    background: #fafafa;
    border-radius: 0 0 6px 6px;
}

.image-popup-coords {
    font-size: 12px;
    font-family: monospace;
    color: #555;
    user-select: all;
    cursor: text;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.image-popup-copy {
    flex-shrink: 0;
    margin-left: 6px;
}

.image-popup-copy .icon.check {
    color: #2e7d32;
}
</style>
