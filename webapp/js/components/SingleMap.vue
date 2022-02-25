<template>
    <div class="singleMap">
        <Message bindTo="error" noDismiss />
        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else-if="!error" ref="map-container" class="map-container">
            <select id="basemap-selector" v-model="selectedBasemap" @change="updateBasemap">
                <option v-for="(v, k) in basemaps" :value="k">
                    {{ v.label }}
                </option>
            </select>
        </div>
    </div>
</template>

<script>
import Message from './Message';
import { setTitle } from '../libs/utils';

import 'ol/ol.css';
import {Map, View} from 'ol';
import bbox from '@turf/bbox';
import {Tile as TileLayer,  Group as LayerGroup} from 'ol/layer';
import {createEmpty as createEmptyExtent, isEmpty as isEmptyExtent, extend as extendExtent} from 'ol/extent';

import ddb from 'ddb';
import HybridXYZ from '../libs/olHybridXYZ';
import XYZ from 'ol/source/XYZ';
import {transformExtent} from 'ol/proj';
import { Basemaps } from '../libs/basemaps';
import reg from '../libs/sharedRegistry';
import { b64encode, b64decode } from '../libs/base64';

export default {
  components: {
      Map, Message
  },
  props: ["file"],
  data: function(){
      return {
        error: "",
        selectedBasemap: "satellite",
        basemaps: Basemaps,
        loading: true,
        entry: {},
        ddbURI: null,
      };
  },
  mounted: async function(){
      if (this.$route.params.encodedPath){
        // Load file info from network
        const path = b64decode(this.$route.params.encodedPath);
        const ds = reg.Organization(this.$route.params.org)
                               .Dataset(this.$route.params.ds);
        try{
            const entries = await ds.list(path);
            if (entries.length){
                this.entry = entries[0];
                this.ddbURI = ds.remoteUri(path);
            }else{
                this.error = `Cannot find: ${path}. It might have been renamed or moved.`;
            }

        }catch(e){
            this.error = e.message;
        }

        setTitle(`${ddb.pathutils.basename(this.entry.path)} - Map`);
      }else if (this.file){
          // We already have the file info
          this.entry = this.file.entry;
          this.ddbURI = this.file.path;
      }else{
          this.error = "Invalid file";
          return;
      }

      this.loading = false;
      this.$nextTick(() => {
        this.loadMap();
      });
  },
  beforeDestroy: function(){
  },
  methods: {
      loadMap: function(){
        if (this.loaded) return;

        const { entry } = this;

        this.loaded = true;
        this._updateMap = null;

        this.basemapLayer = new TileLayer({
            source: new XYZ({
                url: this.basemaps[this.selectedBasemap].url,
                attributions: this.basemaps[this.selectedBasemap].attributions
            })
        });

        this.rasterLayer = new LayerGroup();
        const rasters = this.rasterLayer.getLayers();
        const ext = createEmptyExtent();

        if (entry.polygon_geom && (entry.type === ddb.entry.type.GEORASTER || entry.type === ddb.entry.type.POINTCLOUD)){
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
        }

        // this.footprintRastersLayer = new LayerGroup();

        this.map = new Map({
            target: this.$refs['map-container'],
            layers: [
                this.basemapLayer,
                this.rasterLayer,
                // this.footprintRastersLayer,
            ],
            view: new View({
                center: [0, 0],
                zoom: 2
            })
        });

        setTimeout(() => this.map.updateSize(), 1);

        if (!isEmptyExtent(ext)){
            setTimeout(() => {
                this.map.getView().fit(ext, { 
                    padding: [40, 40, 40, 40], 
                    duration: 500,
                    minResolution: 0.5
                });
            }, 10);
        }
      },
      onPanelResized: function(){
        // Redraw when map is resized (via panels)
        this.map.updateSize();
      },
      onTabActivated: function(){
        if (!this.loaded){
            this.loadMap();
        }else{
            this.$nextTick(() => {
                if (this.map) this.map.updateSize();
            });
        }
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
.singleMap{
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

    #basemap-selector{
        position: absolute;
        right: 8px;
        top: 8px;
        z-index: 1;
    }
}
.loading{
    padding: 12px;
    text-align: center;
}
.message.warning{
    margin: 12px;
}
</style>