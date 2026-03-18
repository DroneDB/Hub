<template>
    <Window title="Map Settings" id="map-settings" @onClose="close" modal sizeClass="dialog-sm" fixedSize>
        <div class="map-settings-content">
            <div class="setting-row">
                <label class="setting-label align-items-baseline">
                    <i class="fa-solid fa-map"></i> Basemap
                </label>
                <Select :modelValue="selectedBasemap" @update:modelValue="onBasemapChange" :options="basemapOptions" optionLabel="label" optionValue="value" class="setting-select" />
            </div>

            <div v-if="selectedBasemap === 'custom'" class="custom-basemap-fields">
                <div class="setting-row">
                    <label class="setting-label align-items-baseline">
                        Source Type
                    </label>
                    <Select v-model="customSourceType" @change="onSourceTypeChanged" :options="sourceTypeOptions" optionLabel="label" optionValue="value" class="setting-select" />
                </div>
                <div class="setting-row">
                    <label class="setting-label align-items-baseline">
                        URL
                    </label>
                    <InputText v-model="customUrl" class="setting-input"
                        :placeholder="customSourceType === 'wms' ? 'https://example.com/wms' : 'https://example.com/{z}/{x}/{y}.png'"
                        @input="onUrlChanged" />
                </div>
                <div v-if="customSourceType === 'wms'" class="setting-row">
                    <label class="setting-label align-items-baseline">
                        Layer
                    </label>
                    <div class="layer-select-wrapper">
                        <Select v-model="customLayerName" :disabled="wmsLayers.length === 0" :options="wmsLayerOptions" optionLabel="label" optionValue="value" :placeholder="wmsLayers.length === 0 ? (wmsLayersLoading ? 'Loading...' : 'Enter URL first') : ''" class="setting-select" style="flex: 1; min-width: 0;" />
                        <Button v-if="customUrl.trim()" :disabled="wmsLayersLoading" @click="fetchLayers" title="Fetch layers"
                            :icon="wmsLayersLoading ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-arrows-rotate'" text />
                    </div>
                </div>
                <div v-if="customSourceType === 'wms'" class="setting-row">
                    <label class="setting-label align-items-baseline">
                        Tile Size
                    </label>
                    <Select v-model="customTileSize" :options="tileSizeOptions" optionLabel="label" optionValue="value" class="setting-select" />
                </div>
                <div v-if="customError" class="custom-error">
                    <i class="fa-solid fa-triangle-exclamation"></i> {{ customError }}
                </div>
                <div class="setting-row" style="justify-content: flex-end;">
                    <Button severity="info" :disabled="!isCustomConfigValid || customLoading" @click="applyCustomConfig"
                        :icon="customLoading ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-check'" :label="customLoading ? 'Checking...' : 'Apply'" />
                </div>
            </div>

            <div class="setting-row">
                <label class="setting-label align-items-baseline">
                    <i class="fa-solid fa-pencil"></i> Measurement Units
                </label>
                <Select :modelValue="unitPref" @update:modelValue="onUnitsChange" :options="unitOptions" optionLabel="label" optionValue="value" class="setting-select ms-3" />
            </div>

        </div>
        <div class="d-flex justify-content-end mt-3" style="padding: 0 0.75rem;">
            <Button @click="close" severity="secondary" label="Close" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '@/libs/keyboard';
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';

export default {
    components: {
        Window, Button, Select, InputText
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
    emits: ['onClose'],

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
        isCustomConfigValid: function () {
            if (!this.customUrl || !this.customUrl.trim()) return false;
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

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },

    beforeUnmount: function () {
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
                                // Extract TIME dimension default value if present
                                let defaultTime = '';
                                const dims = el.querySelectorAll(':scope > Dimension');
                                dims.forEach(dim => {
                                    if ((dim.getAttribute('name') || '').toLowerCase() === 'time') {
                                        defaultTime = dim.getAttribute('default') || '';
                                        if (!defaultTime) {
                                            // Fallback: use last value from extent text
                                            const extent = (dim.textContent || '').trim();
                                            if (extent) {
                                                const parts = extent.split(',');
                                                const last = parts[parts.length - 1].trim();
                                                // Extract first ISO date from range (e.g. "2026-03-12T12:28:18Z/...")
                                                defaultTime = last.split('/')[0];
                                            }
                                        }
                                    }
                                });
                                layers.push({
                                    name: nameEl.textContent,
                                    title: titleEl ? titleEl.textContent : '',
                                    defaultTime: defaultTime
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
            const attribution = this.getAttributionFromUrl(url);

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

.setting-toggle {
    cursor: pointer;
    width: 100%;
    justify-content: space-between;
    user-select: none;
}

.setting-toggle input[type="checkbox"] {
    cursor: pointer;
    width: 1rem;
    height: 1rem;
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

.custom-error {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    color: var(--ddb-danger);
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.custom-error .icon {
    margin: 0;
    font-size: 0.75rem;
}

.layer-select-wrapper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
    margin-left: 0.5rem;
}

.fetch-layers-btn {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-xs) !important;
    margin: 0 !important;
    min-height: 0 !important;
}

.fetch-layers-btn .icon {
    margin: 0 !important;
}
</style>
