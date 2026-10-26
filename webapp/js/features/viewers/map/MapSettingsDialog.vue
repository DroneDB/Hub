<template>
    <Window id="map-settings" title="Map Settings" modal size-class="dialog-sm" fixed-size @close="$emit('close')">
        <div class="map-settings-content">
            <div class="setting-row">
                <label id="map-settings-dialog-basemap-label" for="map-settings-dialog-basemap" class="setting-label align-items-baseline">
                    <i class="fa-solid fa-map" /> Basemap
                </label>
                <Select input-id="map-settings-dialog-basemap" aria-labelledby="map-settings-dialog-basemap-label" :model-value="selectedBasemap" :options="basemapOptions" option-label="label" option-value="value" class="setting-select" @update:model-value="onBasemapChange" />
            </div>

            <div v-if="selectedBasemap === 'custom'" class="custom-basemap-fields">
                <div class="setting-row">
                    <label id="map-settings-dialog-source-type-label" for="map-settings-dialog-source-type" class="setting-label align-items-baseline">
                        Source Type
                    </label>
                    <Select v-model="customSourceType" input-id="map-settings-dialog-source-type" aria-labelledby="map-settings-dialog-source-type-label" :options="sourceTypeOptions" option-label="label" option-value="value" class="setting-select" @change="onSourceTypeChanged" />
                </div>
                <div class="setting-row">
                    <label for="map-settings-dialog-url" class="setting-label align-items-baseline">
                        URL
                    </label>
                    <InputText id="map-settings-dialog-url" v-model="customUrl" class="setting-input"
                               :placeholder="customSourceType === 'wms' ? 'https://example.com/wms' : 'https://example.com/{z}/{x}/{y}.png'"
                               @input="onUrlChanged" />
                </div>
                <div v-if="customSourceType === 'wms'" class="setting-row">
                    <label id="map-settings-dialog-layer-label" for="map-settings-dialog-layer" class="setting-label align-items-baseline">
                        Layer
                    </label>
                    <div class="layer-select-wrapper">
                        <Select v-model="customLayerName" input-id="map-settings-dialog-layer" aria-labelledby="map-settings-dialog-layer-label" :disabled="wmsLayers.length === 0" :options="wmsLayerOptions" option-label="label" option-value="value" :placeholder="wmsLayers.length === 0 ? (wmsLayersLoading ? 'Loading...' : 'Enter URL first') : ''" class="setting-select" style="flex: 1; min-width: 0;" />
                        <Button v-if="customUrl.trim()" :disabled="wmsLayersLoading || !isCustomUrlValid" title="Fetch layers" icon="fa-solid fa-arrows-rotate" :loading="wmsLayersLoading" aria-label="Fetch layers"
                                text @click="fetchLayers" />
                    </div>
                </div>
                <div v-if="customSourceType === 'wms'" class="setting-row">
                    <label id="map-settings-dialog-tile-size-label" for="map-settings-dialog-tile-size" class="setting-label align-items-baseline">
                        Tile Size
                    </label>
                    <Select v-model="customTileSize" input-id="map-settings-dialog-tile-size" aria-labelledby="map-settings-dialog-tile-size-label" :options="tileSizeOptions" option-label="label" option-value="value" class="setting-select" />
                </div>
                <PrimeMessage v-if="customUrlError || customError" severity="error" :closable="false" icon="fa-solid fa-triangle-exclamation" size="small">
                    {{ customUrlError || customError }}
                </PrimeMessage>
                <div class="setting-row" style="justify-content: flex-end;">
                    <Button severity="info" :disabled="!isCustomConfigValid || customLoading" icon="fa-solid fa-check" :loading="customLoading"
                            :label="customLoading ? 'Checking...' : 'Apply'" @click="applyCustomConfig" />
                </div>
            </div>

            <div class="setting-row">
                <label id="map-settings-dialog-measurement-units-label" for="map-settings-dialog-measurement-units" class="setting-label align-items-baseline">
                    <i class="fa-solid fa-pencil" /> Measurement Units
                </label>
                <Select input-id="map-settings-dialog-measurement-units" aria-labelledby="map-settings-dialog-measurement-units-label" :model-value="unitPref" :options="unitOptions" option-label="label" option-value="value" class="setting-select ms-3" @update:model-value="onUnitsChange" />
            </div>

        </div>
        <div class="d-flex justify-content-end mt-3" style="padding: 0 0.75rem;">
            <Button severity="secondary" label="Close" @click="$emit('close')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import { fetchWmsLayers } from '@/libs/map/wmsCapabilities';
import { getAttributionFromUrl, isAbsoluteHttpUrl } from '@/libs/map/basemaps';

export default {
    components: {
        Window, Button, Select, InputText, PrimeMessage
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
        customBasemapConfig: {
            type: Object,
            default: () => null
        }
    },
    emits: ['close', 'basemapChanged', 'unitsChanged', 'customBasemapConfigChanged'],

    data: function () {
        const config = this.customBasemapConfig;
        return {
            customSourceType: config ? config.sourceType : 'xyz',
            customUrl: config ? config.url : '',
            customLayerName: config ? config.layerName : '',
            customTileSize: config && config.tileSize ? config.tileSize : 256,
            wmsLayers: config && config.wmsLayers ? config.wmsLayers : [],
            wmsLayersLoading: false,
            customLoading: false,
            customError: null,
            sourceTypeOptions: [
                { label: 'XYZ Tiles', value: 'xyz' },
                { label: 'WMS', value: 'wms' }
            ],
            tileSizeOptions: [
                { label: '256 x 256', value: 256 },
                { label: '512 x 512', value: 512 }
            ],
            unitOptions: [
                { label: 'Metric', value: 'metric' },
                { label: 'Imperial', value: 'imperial' }
            ]
        };
    },

    computed: {
        /** The map drops a custom basemap whose URL is not absolute http(s), so the dialog refuses it too */
        isCustomUrlValid: function () {
            return isAbsoluteHttpUrl((this.customUrl || '').trim());
        },
        /** Hint for a typed URL the map would not draw; null while the field is empty */
        customUrlError: function () {
            if (!this.customUrl || !this.customUrl.trim() || this.isCustomUrlValid) return null;
            return 'The URL must be absolute and start with http:// or https://.';
        },
        isCustomConfigValid: function () {
            if (!this.isCustomUrlValid) return false;
            if (this.customSourceType === 'wms' && !this.customLayerName) return false;
            return true;
        },
        basemapOptions: function () {
            return Object.entries(this.basemaps).map(([k, v]) => ({
                value: k,
                label: v.label
            }));
        },
        wmsLayerOptions: function () {
            return this.wmsLayers.map(l => ({
                value: l.name,
                label: l.title || l.name
            }));
        }
    },

    watch: {
        customBasemapConfig: function (config) {
            if (config) {
                this.customSourceType = config.sourceType || 'xyz';
                this.customUrl = config.url || '';
                this.customLayerName = config.layerName || '';
                this.customTileSize = config.tileSize || 256;
            }
        }
    },



    methods: {

        onBasemapChange: function (value) {
            this.$emit('basemapChanged', value);
        },

        onUnitsChange: function (value) {
            const oldUnit = this.unitPref;
            if (value !== oldUnit) {
                this.$emit('unitsChanged', value, oldUnit);
            }
        },

        /**
         * Reset WMS layer state when URL or source type changes
         */
        onSourceTypeChanged: function () {
            this.wmsLayers = [];
            this.customLayerName = '';
            this.customTileSize = 256;
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
            if (!this.isCustomUrlValid || this.wmsLayersLoading) return;

            this.wmsLayersLoading = true;
            this.wmsLayers = [];
            this.customLayerName = '';
            this.customError = null;

            try {
                const layers = await fetchWmsLayers(this.customUrl.trim());
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
         * Build a test URL for verifying the custom source is reachable
         */
        buildTestUrl: function (config) {
            if (config.sourceType === 'wms') {
                const separator = config.url.includes('?') ? '&' : '?';
                const size = config.tileSize || 256;
                let testParams = config.url + separator +
                    'SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
                    '&LAYERS=' + encodeURIComponent(config.layerName) +
                    '&STYLES=' +
                    '&SRS=EPSG:3857&BBOX=0,0,20037508,20037508' +
                    '&WIDTH=' + size + '&HEIGHT=' + size + '&FORMAT=image/png&TILED=true';
                if (config.defaultTime) {
                    testParams += '&TIME=' + encodeURIComponent(config.defaultTime);
                }
                return testParams;
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
            const attribution = getAttributionFromUrl(url);

            try {
                // Find the selected layer's defaultTime if available
                let defaultTime = '';
                if (this.customSourceType === 'wms' && this.wmsLayers.length > 0) {
                    const sel = this.wmsLayers.find(l => l.name === this.customLayerName);
                    if (sel && sel.defaultTime) defaultTime = sel.defaultTime;
                }

                const config = {
                    sourceType: this.customSourceType,
                    url: url,
                    layerName: this.customSourceType === 'wms' ? this.customLayerName : '',
                    tileSize: this.customSourceType === 'wms' ? this.customTileSize : 256,
                    defaultTime: defaultTime,
                    attribution: attribution,
                    wmsLayers: this.customSourceType === 'wms' ? this.wmsLayers : []
                };

                // Test that a tile actually loads
                const testUrl = this.buildTestUrl(config);
                await this.testTileLoad(testUrl);

                this.customLoading = false;
                this.customError = null;
                this.$emit('customBasemapConfigChanged', config);
            } catch {
                this.customLoading = false;
                this.customError = 'Failed to load tiles. Please check the URL and try again.';
            }
        }
    }
}
</script>

<style scoped>
.map-settings-content {
    padding: 0.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.75rem;
}

.setting-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ddb-text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.setting-label .icon {
    margin: 0;
    color: var(--ddb-text-secondary);
}

.setting-select {
    font-size: 0.75rem;
}

.custom-basemap-fields {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm) 0;
    margin: 0 var(--ddb-spacing-md);
    border: var(--ddb-border-width) solid var(--ddb-border-separator);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-light);
}

.setting-input {
    font-size: var(--ddb-font-size-base);
    flex: 1;
    min-width: 0;
    margin-left: var(--ddb-spacing-sm);
}



.layer-select-wrapper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
    margin-left: 0.5rem;
}

</style>
