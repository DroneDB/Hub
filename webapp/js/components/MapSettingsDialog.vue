<template>
    <Window title="Map Settings" id="map-settings" @onClose="close" modal maxWidth="400px" fixedSize>
        <div class="map-settings-content">
            <div class="setting-row">
                <label class="setting-label"  style="align-items: baseline">
                    <i class="icon map"></i> Basemap
                </label>
                <select class="setting-select" :value="selectedBasemap" @change="onBasemapChange($event.target.value)">
                    <option v-for="(v, k) in basemaps" :key="k" :value="k">{{ v.label }}</option>
                </select>
            </div>

            <div v-if="selectedBasemap === 'custom'" class="custom-basemap-fields">
                <div class="setting-row">
                    <label class="setting-label" style="align-items: baseline">
                        Source Type
                    </label>
                    <select class="setting-select" v-model="customSourceType" @change="onSourceTypeChanged">
                        <option value="xyz">XYZ Tiles</option>
                        <option value="wms">WMS</option>
                    </select>
                </div>
                <div class="setting-row">
                    <label class="setting-label" style="align-items: baseline">
                        URL
                    </label>
                    <input class="setting-input" type="text" v-model="customUrl"
                        :placeholder="customSourceType === 'wms' ? 'https://example.com/wms' : 'https://example.com/{z}/{x}/{y}.png'"
                        @input="onUrlChanged" />
                </div>
                <div v-if="customSourceType === 'wms'" class="setting-row">
                    <label class="setting-label" style="align-items: baseline">
                        Layer
                    </label>
                    <div class="layer-select-wrapper">
                        <select class="setting-select" v-model="customLayerName" :disabled="wmsLayers.length === 0">
                            <option v-if="wmsLayers.length === 0" value="" disabled>{{ wmsLayersLoading ? 'Loading...' : 'Enter URL first' }}</option>
                            <option v-for="layer in wmsLayers" :key="layer.name" :value="layer.name">{{ layer.title || layer.name }}</option>
                        </select>
                        <button v-if="customUrl.trim()" class="ui mini icon button fetch-layers-btn" :disabled="wmsLayersLoading" @click="fetchLayers" title="Fetch layers">
                            <i :class="wmsLayersLoading ? 'icon spinner loading' : 'icon sync'"></i>
                        </button>
                    </div>
                </div>
                <div v-if="customError" class="custom-error">
                    <i class="icon exclamation triangle"></i> {{ customError }}
                </div>
                <div class="setting-row" style="justify-content: flex-end;">
                    <button class="ui mini primary button" :disabled="!isCustomConfigValid || customLoading" @click="applyCustomConfig">
                        <i :class="customLoading ? 'icon spinner loading' : 'icon check'"></i> {{ customLoading ? 'Checking...' : 'Apply' }}
                    </button>
                </div>
            </div>

            <div class="setting-row">
                <label class="setting-label" style="align-items: baseline">
                    <i class="icon pencil alternate"></i> Measurement Units
                </label>
                <select style="margin-left: 1rem;" class="setting-select" :value="unitPref" @change="onUnitsChange($event.target.value)">
                    <option value="metric">Metric</option>
                    <option value="imperial">Imperial</option>
                </select>
            </div>

            <div class="setting-row">
                <label class="setting-label setting-toggle" @click="onFlightPathToggle">
                    <i class="icon route"></i> Show drone flight path
                    <input type="checkbox" :checked="showFlightPath" @click.stop="onFlightPathToggle" />
                </label>
            </div>
        </div>
    </Window>
</template>

<script>
import Keyboard from '../libs/keyboard';
import Window from './Window.vue';

export default {
    components: {
        Window
    },

    props: {
        basemaps: {
            type: Object,
            required: true
        },
        selectedBasemap: {
            type: String,
            required: true
        },
        unitPref: {
            type: String,
            required: true,
            validator: (value) => ['metric', 'imperial'].includes(value)
        },
        showFlightPath: {
            type: Boolean,
            required: true
        },
        customBasemapConfig: {
            type: Object,
            default: () => null
        }
    },

    data: function () {
        const config = this.customBasemapConfig;
        return {
            customSourceType: config ? config.sourceType : 'xyz',
            customUrl: config ? config.url : '',
            customLayerName: config ? config.layerName : '',
            wmsLayers: config && config.wmsLayers ? config.wmsLayers : [],
            wmsLayersLoading: false,
            customLoading: false,
            customError: null
        };
    },

    computed: {
        isCustomConfigValid: function () {
            if (!this.customUrl || !this.customUrl.trim()) return false;
            if (this.customSourceType === 'wms' && !this.customLayerName) return false;
            return true;
        }
    },

    watch: {
        customBasemapConfig: function (config) {
            if (config) {
                this.customSourceType = config.sourceType || 'xyz';
                this.customUrl = config.url || '';
                this.customLayerName = config.layerName || '';
            }
        }
    },

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },

    beforeDestroy: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
    },

    methods: {
        close: function () {
            this.$emit('onClose');
        },

        onBasemapChange: function (value) {
            this.$emit('basemapChanged', value);
        },

        onUnitsChange: function (value) {
            const oldUnit = this.unitPref;
            if (value !== oldUnit) {
                this.$emit('unitsChanged', value, oldUnit);
            }
        },

        onFlightPathToggle: function () {
            this.$emit('flightPathChanged', !this.showFlightPath);
        },

        /**
         * Extract hostname from a URL for auto-generated attribution
         */
        getAttributionFromUrl: function (url) {
            try {
                const hostname = new URL(url).hostname;
                return '&copy; ' + hostname;
            } catch (e) {
                return '';
            }
        },

        /**
         * Reset WMS layer state when URL or source type changes
         */
        onSourceTypeChanged: function () {
            this.wmsLayers = [];
            this.customLayerName = '';
            this.customError = null;
        },

        onUrlChanged: function () {
            this.wmsLayers = [];
            this.customLayerName = '';
            this.customError = null;
        },

        /**
         * Fetch WMS GetCapabilities and populate the layers dropdown
         */
        fetchLayers: async function () {
            if (!this.customUrl.trim() || this.wmsLayersLoading) return;

            this.wmsLayersLoading = true;
            this.wmsLayers = [];
            this.customLayerName = '';
            this.customError = null;

            try {
                const layers = await this.fetchWmsCapabilities(this.customUrl.trim());
                this.wmsLayers = layers;
                if (layers.length > 0) {
                    this.customLayerName = layers[0].name;
                } else {
                    this.customError = 'No layers found in WMS capabilities.';
                }
            } catch (e) {
                this.customError = e.message || 'Could not retrieve WMS layers. Please check the URL.';
            } finally {
                this.wmsLayersLoading = false;
            }
        },

        /**
         * Fetch WMS GetCapabilities and return all layer names and titles
         */
        fetchWmsCapabilities: function (url) {
            return new Promise((resolve, reject) => {
                const separator = url.includes('?') ? '&' : '?';
                const capUrl = url + separator + 'SERVICE=WMS&REQUEST=GetCapabilities';
                const xhr = new XMLHttpRequest();
                xhr.open('GET', capUrl, true);
                xhr.timeout = 15000;
                xhr.onload = () => {
                    try {
                        const parser = new DOMParser();
                        const xml = parser.parseFromString(xhr.responseText, 'text/xml');

                        // Check for parse errors
                        if (xml.querySelector('parsererror')) {
                            reject(new Error('Invalid XML response from WMS server.'));
                            return;
                        }

                        const layers = [];
                        // Find all Layer elements that have a Name child (queryable layers)
                        const layerElements = xml.querySelectorAll('Layer');
                        layerElements.forEach(el => {
                            const nameEl = el.querySelector(':scope > Name');
                            if (nameEl) {
                                const titleEl = el.querySelector(':scope > Title');
                                layers.push({
                                    name: nameEl.textContent,
                                    title: titleEl ? titleEl.textContent : ''
                                });
                            }
                        });

                        if (layers.length > 0) {
                            resolve(layers);
                        } else {
                            reject(new Error('No layers found in WMS capabilities.'));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse WMS capabilities.'));
                    }
                };
                xhr.onerror = () => reject(new Error('Could not connect to WMS server.'));
                xhr.ontimeout = () => reject(new Error('WMS capabilities request timed out.'));
                xhr.send();
            });
        },

        /**
         * Build a test URL for verifying the custom source is reachable
         */
        buildTestUrl: function (config) {
            if (config.sourceType === 'wms') {
                const separator = config.url.includes('?') ? '&' : '?';
                return config.url + separator +
                    'SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
                    '&LAYERS=' + encodeURIComponent(config.layerName) +
                    '&SRS=EPSG:3857&BBOX=0,0,20037508,20037508' +
                    '&WIDTH=256&HEIGHT=256&FORMAT=image/png&TILED=true';
            } else {
                return config.url
                    .replace('{z}', '0')
                    .replace('{x}', '0')
                    .replace('{y}', '0');
            }
        },

        /**
         * Test that a tile image loads successfully
         */
        testTileLoad: function (testUrl) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const timeout = setTimeout(() => {
                    img.onload = null;
                    img.onerror = null;
                    img.src = '';
                    reject(new Error('Connection timed out'));
                }, 10000);

                img.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                img.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Failed to load tile'));
                };
                img.crossOrigin = 'anonymous';
                img.src = testUrl;
            });
        },

        /**
         * Verify the custom basemap source loads correctly, then emit config
         */
        applyCustomConfig: async function () {
            if (!this.isCustomConfigValid || this.customLoading) return;

            this.customLoading = true;
            this.customError = null;

            const url = this.customUrl.trim();
            const attribution = this.getAttributionFromUrl(url);

            try {
                const config = {
                    sourceType: this.customSourceType,
                    url: url,
                    layerName: this.customSourceType === 'wms' ? this.customLayerName : '',
                    attribution: attribution,
                    wmsLayers: this.customSourceType === 'wms' ? this.wmsLayers : []
                };

                // Test that a tile actually loads
                const testUrl = this.buildTestUrl(config);
                await this.testTileLoad(testUrl);

                this.customLoading = false;
                this.customError = null;
                this.$emit('customBasemapConfigChanged', config);
            } catch (e) {
                this.customLoading = false;
                this.customError = 'Failed to load tiles. Please check the URL and try again.';
            }
        },

        handleKeyDown: function (e) {
            if (e.key === 'Escape') this.close();
        }
    }
}
</script>

<style scoped>
.map-settings-content {
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
}

.setting-label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
}

.setting-label .icon {
    margin: 0;
    color: #555;
}

.setting-toggle {
    cursor: pointer;
    width: 100%;
    justify-content: space-between;
    user-select: none;
}

.setting-toggle input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
}

.setting-select {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 13px;
    background: white;
    cursor: pointer;
}

.setting-select:hover {
    border-color: #999;
}

.custom-basemap-fields {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 8px 0;
    margin: 0 12px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background: #fafafa;
}

.setting-input {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 13px;
    background: white;
    flex: 1;
    min-width: 0;
    margin-left: 8px;
}

.setting-input:hover {
    border-color: #999;
}

.setting-input:focus {
    border-color: #2185d0;
    outline: none;
}

.custom-error {
    padding: 4px 12px;
    font-size: 12px;
    color: #db2828;
    display: flex;
    align-items: center;
    gap: 4px;
}

.custom-error .icon {
    margin: 0;
    font-size: 12px;
}

.layer-select-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    margin-left: 8px;
}

.layer-select-wrapper .setting-select {
    flex: 1;
    min-width: 0;
}

.fetch-layers-btn {
    padding: 4px 6px !important;
    margin: 0 !important;
    min-height: 0 !important;
}

.fetch-layers-btn .icon {
    margin: 0 !important;
}
</style>
