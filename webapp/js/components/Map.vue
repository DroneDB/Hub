<template>
    <div id="map" 
        @mouseover="setMouseInside(true)" 
        @mouseleave="setMouseInside(false)">
        <Toolbar :tools="tools" ref="toolbar" />
        <div ref="map-container" class="map-container" :class="{'cursor-pointer': selectSingle,
                                         'cursor-crosshair': selectArea}">
            <select id="basemap-selector" v-model="selectedBasemap" @change="updateBasemap">
                <option v-for="(v, k) in basemaps" :value="k">
                    {{ v.label }}
                </option>
            </select>
        </div>
    </div>
</template>

<script>
import 'ol/ol.css';
import {Map, View} from 'ol';
import {Tile as TileLayer, Vector as VectorLayer, Group as LayerGroup} from 'ol/layer';
import {Vector as VectorSource, Cluster} from 'ol/source';
import {defaults as defaultControls, Control} from 'ol/control';
import Collection from 'ol/Collection';
import {DragBox} from 'ol/interaction';
import {createEmpty as createEmptyExtent, isEmpty as isEmptyExtent, extend as extendExtent} from 'ol/extent';
import {transformExtent} from 'ol/proj';

import Feature from 'ol/Feature';
import { coordEach, coordAll } from '@turf/meta';
import bbox from '@turf/bbox';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import { fromExtent } from 'ol/geom/Polygon';

import ddb from 'ddb';
import HybridXYZ from '../libs/olHybridXYZ';
import XYZ from 'ol/source/XYZ';
import Toolbar from './Toolbar.vue';
import Keyboard from '../libs/keyboard';
import Mouse from '../libs/mouse';
import { rootPath } from '../dynamic/pathutils';
import { requestFullScreen, exitFullScreen, isFullScreenCurrently, supportsFullScreen } from '../libs/utils';
import { isMobile } from '../libs/responsive';
import { Basemaps } from '../libs/basemaps';

import {Circle as CircleStyle, Fill, Stroke, Style, Text, Icon} from 'ol/style';

export default {
  components: {
      Map, Toolbar
  },
  props: {
      files: {
          type: Array,
          required: true
      },
      lazyload: {
          type: Boolean,
          default: false
      }
  },
  data: function(){
      const tools = [
            {
                id: 'select-features',
                title: "Select Features (CTRL)",
                icon: "mouse pointer",
                exclusiveGroup: "select",
                onSelect: () => {
                    this.selectSingle = true;
                },
                onDeselect: () => {
                    this.selectSingle = false;
                }
            },
            {
                id: 'select-features-by-area',
                title: "Select Features by Area (CTRL+SHIFT)",
                icon: "square outline",
                exclusiveGroup: "select",
                onSelect: () => {
                    this.selectArea = true;
                    this.map.addInteraction(this.dragBox);
                },
                onDeselect: () => {
                    this.selectArea = false;
                    this.selectFeaturesByAreaKeyPressed = false;
                    this.map.removeInteraction(this.dragBox);
                }
            },
            {
                id: 'clear-selection',
                title: "Clear Selection (ESC)",
                icon: "ban",
                onClick: () => {
                    this.clearSelection();
                }
            }
      ];

      if (supportsFullScreen()){
            tools.push({
                id: 'fullscreen',
                title: "Fullscreen (F11)",
                icon: "expand",
                onClick: () => {
                    if (isFullScreenCurrently()){
                        exitFullScreen();
                    } else{
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
        selectSingle: false,
        selectArea: false,

        selectedBasemap: "satellite",
        basemaps: Basemaps
      };
  },
  mounted: function(){
    if (!this.lazyload) this.loadMap();
  },
  beforeDestroy: function(){
    Keyboard.offKeyDown(this.handleKeyDown);
    Keyboard.offKeyUp(this.handleKeyUp);
  },
  watch: {
      files: {
        deep: true,
        handler: function(newVal, oldVal){
            // Prevent multiple updates
            if (this._updateMap){
                clearTimeout(this._updateMap);
                this._updateMap = null;
            }

            this._updateMap = setTimeout(() => {
                // Do we need to redraw the features?
                // Count has changed or first or last items are different
                if (newVal.length !== oldVal.length || 
                    newVal[0] !== oldVal[0] || 
                    newVal[newVal.length - 1] !== oldVal[oldVal.length - 1]){
                   this.reloadFileLayers();
                }else{
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
  methods: {
      loadMap: function(){
        if (this.loaded) return;

        this.loaded = true;
        this._updateMap = null;

        const genShotStyle = (fill, stroke, size) => {
            let text = null;
            if (size > 1){
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

        this.styles = {
            shot: feats => {
                let styleId = `_shot-${feats.length}`;
                let selected = false;

                for (let i = 0; i < feats.length; i++){
                    if (feats[i].file && feats[i].file.selected){
                        styleId = `_shot-selected-${feats.length}`;
                        selected = true;
                        break;
                    }
                }
                
                // Memoize
                if (!this.styles[styleId]){
                    if (selected) this.styles[styleId] = genShotStyle('rgba(255, 158, 103, 1)', 'rgba(252, 252, 255, 1)', feats.length);
                    else this.styles[styleId] = genShotStyle('rgba(75, 150, 243, 1)', 'rgba(252, 252, 255, 1)', feats.length);
                }

                return this.styles[styleId];
            },

            'shot-outlined': feats => {
                let styleId = `_shot-outlined-${feats.length}`;

                // Memoize
                if (!this.styles[styleId]){
                    this.styles[styleId] = genShotStyle('rgba(253, 226, 147, 1)', 'rgba(252, 252, 255, 1)', feats.length);
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

                for (let i = 0; i < feats.length; i++){
                    if (feats[i].file && feats[i].file.selected){
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
            }),

            panoSelected: new Style({
                image: new Icon({
                    anchor: [0.5, 0.5],
                    anchorXUnits: 'fraction',
                    anchorYUnits: 'fraction',
                    src: rootPath('images/pano-selected.svg')
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

        this.dragBox = new DragBox({minArea: 0});
        this.dragBox.on('boxend', () => {
            let extent = this.dragBox.getGeometry().getExtent();

            // Select (default) or deselect (if all features are previously selected)
            const intersect = [];

            [this.fileFeatures, this.extentsFeatures].forEach(layer => {
                layer.forEachFeatureIntersectingExtent(extent, feat => {
                    intersect.push(feat);
                });
            });

            let deselect = false;
            
            // Clear previous
            if (!Keyboard.isShiftPressed()){
                this.clearSelection();
            }else{
                deselect = intersect.length > 0 && intersect.filter(feat => feat.file.selected).length === intersect.length;
            }
            
            if (deselect){
                intersect.forEach(feat => feat.file.selected = false);
            }else{
                let scrolled = false;
                intersect.forEach(feat => {
                    feat.file.selected = true;

                    if (!scrolled){
                        this.$emit("scrollTo", feat.file);
                        scrolled = true;
                    }
                });
            }
        });

        this.basemapLayer = new TileLayer({
            source: new XYZ({
                url: this.basemaps[this.selectedBasemap].url,
                attributions: this.basemaps[this.selectedBasemap].attributions
            })
        });

        this.map = new Map({
            target: this.$refs['map-container'],
            layers: [
                this.basemapLayer,
                this.rasterLayer,
                this.footprintRastersLayer,
                this.extentLayer,
                this.outlineLayer,
                this.topLayers,
            ],
            view: new View({
                center: [0, 0],
                zoom: 2
            })
        });

        const doSelectSingle = e => {
            let first = true;

            this.map.forEachFeatureAtPixel(e.pixel, feat => {
                // Only select the first entry
                if (!first) return;
                first = false;

                const feats = feat.get('features');
                if (feats){
                    // Geoimage point cluster
                    let selected = false;
                    for (let i = 0; i < feats.length; i++){
                        if (feats[i].file && feats[i].file.selected){
                            selected = true;
                            break;
                        }
                    }

                    for (let i = 0; i < feats.length; i++){
                        if (feats[i].file) feats[i].file.selected = !selected;
                    }

                    // Inform other components we should scroll to this file
                    if (!selected && feats.length && feats[0].file){
                        this.$emit("scrollTo", feats[0].file);
                    }
                }else{
                    // Extents selection
                    if (feat.file) feat.file.selected = !feat.file.selected;
                }
            });
        };

        this.map.on('click', e => {
            // Single selection
            if (this.selectSingle){
                doSelectSingle(e);
            }else{
            // Remove all
            this.outlineFeatures.forEachFeature(outline => {
                    this.outlineFeatures.removeFeature(outline);
                    
                    // Deselect style
                    if (outline.feat.get('features')){
                        outline.feat.get('features').forEach(f => {
                            f.style = 'shot';
                        });
                    }

                    delete(outline.feat.outline);
            });
            this.clearLayerGroup(this.footprintRastersLayer);
            this.topLayers.setVisible(true);
            
            // Add selected
            let stop = false;
            this.map.forEachFeatureAtPixel(e.pixel, feat => {
                if (stop) return;

                if (!feat.outline){
                    let outline = null;

                    if (feat.get('features')){
                        // Geoimage (point cluster)
                        const file = feat.get('features')[0].file;
                        if (file.entry.polygon_geom){
                            const coords = coordAll(file.entry.polygon_geom);
                            outline = new Feature(new Polygon([coords]));
                            outline.getGeometry().transform('EPSG:4326', 'EPSG:3857');
                        }

                        // Clicked on panorama
                        if ([ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA].indexOf(file.entry.type) !== -1){
                            // Open panorama view
                            this.$emit('openItem', file, 'panorama');
                            return;
                        }

                        // Nothing else to do
                        if (!outline) return;
                        
                        // Set style
                        feat.get('features').forEach(f => {
                            f.style = 'shot-outlined';
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
                    }else{
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
      onPanelResized: function(){
        // Redraw when map is resized (via panels)
        if (this.map) this.map.updateSize();
      },
      onTabActivated: function(){
        if (!this.loaded){
            this.loadMap();
            this.reloadFileLayers();
        }else{
            this.$nextTick(() => {
                if (this.map) this.map.updateSize();
            });
        }
      },
      zoomToFilesExtent: function(){
        const ext = this.getSelectedFilesExtent();
        if (!isEmptyExtent(ext)){
            // Zoom to it
            setTimeout(() => {
                this.map.getView().fit(ext, { 
                    padding: [40, 40, 40, 40], 
                    duration: 500,
                    minResolution: 0.5
                });
            }, 10);
        }
      },
      getSelectedFilesExtent: function(){
          const ext = createEmptyExtent();
          if (this.fileFeatures.getFeatures().length){
            extendExtent(ext, this.fileFeatures.getExtent());
          }
          this.rasterLayer.getLayers().forEach(layer => {
              extendExtent(ext, layer.getExtent());
          });
          return ext;
      },
      clearLayerGroup: function(layerGroup){
        let count = layerGroup.getLayers().getLength();
        for (var j = 0; j < count; j++) {
            let layer = layerGroup.getLayers().pop();
            layer = {};
        }
      },
      setMouseInside: function(flag){
          this.mouseInside = flag;
      },
      reloadFileLayers: function(){
        if (!this.loaded) return;

        this.fileFeatures.clear();
        this.extentsFeatures.clear();
        this.outlineFeatures.clear();
        this.flightPathFeatures.clear();
        this.markerFeatures.clear();
        this.clearLayerGroup(this.rasterLayer);

        const features = [];
        const rasters = this.rasterLayer.getLayers();

        let flightPath = [];

        // Create features, add them to map
        this.files.forEach(f => {
            if (!f.entry) return;

            if (f.entry.type === ddb.entry.type.GEOIMAGE || f.entry.type === ddb.entry.type.GEOVIDEO){
                const coords = coordAll(f.entry.point_geom)[0];
                const point = new Point(coords);
                const feat = new Feature(point);
                feat.style = 'shot';
                feat.file = f;
                feat.getGeometry().transform('EPSG:4326', 'EPSG:3857');
                features.push(feat);

                if (f.entry.type === ddb.entry.type.GEOIMAGE){
                    if (f.entry.properties.captureTime){
                        flightPath.push({
                            point,
                            captureTime: f.entry.properties.captureTime
                        });
                    }
                }
            }else if (f.entry.polygon_geom && (f.entry.type === ddb.entry.type.GEORASTER || f.entry.type === ddb.entry.type.POINTCLOUD)){
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
            }else if (f.entry.type === ddb.entry.type.GEOPANORAMA){
                const coords = coordAll(f.entry.point_geom)[0];
                const point = new Point(coords);
                const feat = new Feature(point);
                feat.style = 'pano';
                feat.file = f;
                feat.getGeometry().transform('EPSG:4326', 'EPSG:3857');
                features.push(feat);
            }
        });

        if (features.length) this.fileFeatures.addFeatures(features);

        // Add flight path line
        if (flightPath.length >= 2){
            flightPath.sort((a, b) => a.captureTime < b.captureTime ? -1 : (a.captureTime === b.captureTime ? 0 : 1));
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
      },
      handleKeyDown: function(){
        if (Keyboard.isCtrlPressed() && this.mouseInside){
            if (Keyboard.isShiftPressed()){
                this.selectFeaturesByAreaKeyPressed = true;
                this.$refs.toolbar.selectTool('select-features-by-area');
            }else{
                this.$refs.toolbar.selectTool('select-features');
            }
        }
      },
      handleKeyUp: function(e){
        // ESC
        if (e.keyCode === 27){
            this.$refs.toolbar.selectTool('clear-selection');
            this.$refs.toolbar.deselectAll();
        }

        if (!Keyboard.isCtrlPressed() && this.mouseInside){
            if (!Keyboard.isShiftPressed() && this.selectFeaturesByAreaKeyPressed){
                this.$refs.toolbar.deselectTool('select-features-by-area');
            }
            this.$refs.toolbar.deselectTool('select-features');
        }
      },
      clearSelection: function(){
          this.files.forEach(f => f.selected = false);
      },
      updateRastersOpacity: function(){
          this.rasterLayer.getLayers().forEach(layer => {
              if (layer.file.selected) layer.setOpacity(0.8);
              else layer.setOpacity(1.0);
          });
      },
      updateBasemap: function(){
          const basemap = this.basemaps[this.selectedBasemap];
          const source = this.basemapLayer.getSource();
          source.setUrl(basemap.url);
          source.setAttributions(basemap.attributions);
      }
  }
}
</script>

<style scoped>
#map{
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}
.map-container{
    -webkit-tap-highlight-color:  rgba(255, 255, 255, 0); 
    position: relative;
    width: 100%;
    height: 100%;

    &.cursor-pointer{
        cursor: pointer;
    }
    &.cursor-crosshair{
        cursor: crosshair;
    }
    #basemap-selector{
        position: absolute;
        right: 8px;
        top: 8px;
        z-index: 1;
    }
}
</style>