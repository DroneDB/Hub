<template>
    <div class="custom-basemap-editor">
        <div class="editor-fields">
            <div class="editor-row">
                <label :id="`${idPrefix}-source-type-label`" :for="`${idPrefix}-source-type`" class="editor-label">Source type</label>
                <Select v-model="sourceType" :input-id="`${idPrefix}-source-type`" :aria-labelledby="`${idPrefix}-source-type-label`"
                        :options="SOURCE_TYPE_OPTIONS" option-label="label" option-value="value" class="editor-control"
                        @change="onSourceTypeChanged" />
            </div>
            <div class="editor-row">
                <label :for="`${idPrefix}-url`" class="editor-label">URL</label>
                <InputText :id="`${idPrefix}-url`" v-model="url" class="editor-control"
                           :placeholder="sourceType === 'wms' ? 'https://example.com/wms' : 'https://example.com/{z}/{x}/{y}.png'"
                           @input="onUrlChanged" />
            </div>
            <template v-if="sourceType === 'wms'">
                <div class="editor-row">
                    <label :id="`${idPrefix}-layer-label`" :for="`${idPrefix}-layer`" class="editor-label">Layer</label>
                    <div class="editor-control layer-control">
                        <Select v-model="layerName" :input-id="`${idPrefix}-layer`" :aria-labelledby="`${idPrefix}-layer-label`"
                                :disabled="layerOptions.length === 0" :options="layerOptions" option-label="label" option-value="value"
                                :placeholder="layerOptions.length === 0 ? (layersLoading ? 'Loading...' : 'None yet') : ''"
                                class="layer-select" />
                        <Button :disabled="layersLoading || !isUrlValid" title="Fetch layers" aria-label="Fetch layers"
                                icon="fa-solid fa-arrows-rotate" :loading="layersLoading" text @click="fetchLayers" />
                    </div>
                </div>
                <div class="editor-row">
                    <label :id="`${idPrefix}-tile-size-label`" :for="`${idPrefix}-tile-size`" class="editor-label">Tile size</label>
                    <Select v-model="tileSize" :input-id="`${idPrefix}-tile-size`" :aria-labelledby="`${idPrefix}-tile-size-label`"
                            :options="TILE_SIZE_OPTIONS" option-label="label" option-value="value" class="editor-control" />
                </div>
            </template>
        </div>
        <PrimeMessage v-if="shownError" severity="error" :closable="false" icon="fa-solid fa-triangle-exclamation" size="small">
            {{ shownError }}
        </PrimeMessage>
        <p class="editor-hint">Apply loads one tile to check the source, then saves it to your account.</p>
        <div class="editor-actions">
            <Button v-if="stored" severity="secondary" size="small" icon="fa-solid fa-xmark" label="Clear" @click="clear" />
            <Button :disabled="!isValid || checking" size="small" icon="fa-solid fa-check" :loading="checking"
                    :label="checking ? 'Checking...' : 'Apply'" @click="apply" />
        </div>
    </div>
</template>

<script setup>
/**
 * CustomBasemapEditor - sets up the custom basemap (an XYZ or WMS tile source) of the account.
 * It shows the stored source and follows its changes; Apply loads one tile of the source and
 * saves it only when the tile loads. Used by the map settings and the User preferences window.
 *
 * Emits `applied` after a source is saved and `cleared` after the source is removed.
 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import Select from 'primevue/select';
import { usePreference } from '@/composables/usePreference';
import {
    CUSTOM_TILE_SIZES, buildCustomBasemapConfig, customBasemapTestUrl, getCustomBasemapConfig, isAbsoluteHttpUrl,
    loadTestTile, saveCustomBasemapConfig
} from '@/libs/map/basemaps';
import { fetchWmsLayers } from '@/libs/map/wmsCapabilities';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';

defineOptions({ name: 'CustomBasemapEditor' });
defineProps({
    /** Prefix of the element ids, unique in the window */
    idPrefix: { type: String, default: 'custom-basemap' }
});
const emit = defineEmits(['applied', 'cleared']);

const SOURCE_TYPE_OPTIONS = [{ label: 'XYZ tiles', value: 'xyz' }, { label: 'WMS', value: 'wms' }];
const TILE_SIZE_OPTIONS = CUSTOM_TILE_SIZES.map(size => ({ label: `${size} x ${size}`, value: size }));

const stored = usePreference(PREF.CUSTOM_BASEMAP, PREF_DEFAULTS[PREF.CUSTOM_BASEMAP]);

const sourceType = ref('xyz');
const url = ref('');
const layerName = ref('');
const tileSize = ref(CUSTOM_TILE_SIZES[0]);
/** @type {import('vue').Ref<{ name: string, title?: string, defaultTime?: string }[]>} */
const wmsLayers = ref([]);
const layersLoading = ref(false);
const checking = ref(false);
/** @type {import('vue').Ref<string|null>} */
const error = ref(null);

// Each change of the form counts: an answer (layers, tile check) for an older form is dropped
let edits = 0;

/** Shows a configuration as the map reads it (an invalid stored one shows as an empty form). */
function fill() {
    const config = getCustomBasemapConfig();
    edits++;
    sourceType.value = config?.sourceType ?? 'xyz';
    url.value = config?.url ?? '';
    layerName.value = config?.layerName ?? '';
    tileSize.value = config?.tileSize ?? CUSTOM_TILE_SIZES[0];
    wmsLayers.value = config?.wmsLayers ?? [];
    error.value = null;
}
fill();
watch(stored, fill, { deep: true });

/** The map drops a URL that is not absolute http(s), so the editor refuses it too */
const isUrlValid = computed(() => isAbsoluteHttpUrl(url.value.trim()));
const isValid = computed(() => isUrlValid.value && (sourceType.value !== 'wms' || !!layerName.value));
const urlError = computed(() => (url.value.trim() && !isUrlValid.value
    ? 'The URL must be absolute and start with http:// or https://.'
    : null));
const shownError = computed(() => urlError.value || error.value);

// A stored layer stays choosable before the layers of the server are fetched again
const layerOptions = computed(() => {
    if (wmsLayers.value.length) return wmsLayers.value.map(l => ({ value: l.name, label: l.title || l.name }));
    return layerName.value ? [{ value: layerName.value, label: layerName.value }] : [];
});

function onSourceTypeChanged() {
    edits++;
    wmsLayers.value = [];
    layerName.value = '';
    tileSize.value = CUSTOM_TILE_SIZES[0];
    error.value = null;
}

function onUrlChanged() {
    edits++;
    wmsLayers.value = [];
    layerName.value = '';
    error.value = null;
}

/** Reads the layers of the WMS server and chooses the first. */
async function fetchLayers() {
    if (!isUrlValid.value || layersLoading.value) return;
    const at = ++edits;
    layersLoading.value = true;
    wmsLayers.value = [];
    layerName.value = '';
    error.value = null;
    try {
        const layers = await fetchWmsLayers(url.value.trim());
        if (at !== edits) return;
        wmsLayers.value = layers;
        if (layers.length > 0) layerName.value = layers[0].name;
        else error.value = 'No layers found in WMS capabilities.';
    } catch (e) {
        if (at === edits) error.value = e?.message || 'Could not retrieve WMS layers. Please check the URL.';
    } finally {
        layersLoading.value = false;
    }
}

/** Loads one tile of the source and saves the source when it loads. */
async function apply() {
    if (!isValid.value || checking.value) return;
    const at = edits;
    const config = buildCustomBasemapConfig({
        sourceType: sourceType.value, url: url.value, layerName: layerName.value, tileSize: tileSize.value, wmsLayers: wmsLayers.value
    });
    checking.value = true;
    error.value = null;
    try {
        await loadTestTile(customBasemapTestUrl(config));
    } catch {
        if (at === edits) error.value = 'Failed to load tiles. Please check the URL and try again.';
        return;
    } finally {
        checking.value = false;
    }
    // The form changed while the tile loaded: the check was for another source
    if (at !== edits) return;
    saveCustomBasemapConfig(config);
    emit('applied');
}

function clear() {
    stored.value = null;
    emit('cleared');
}
</script>

<style scoped>
.custom-basemap-editor {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border: var(--ddb-border-width) solid var(--ddb-border-separator);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-light);
}

/* Labels in one column, the controls in another of one width: 17rem when there is room,
   narrower (never past the edge) in a small window or on a phone */
.editor-fields {
    display: grid;
    grid-template-columns: max-content minmax(0, 17rem);
    justify-content: space-between;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.editor-row {
    display: contents;
}

.editor-label {
    color: var(--ddb-text);
}

.editor-control {
    min-width: 0;
}

.layer-control {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.layer-select {
    flex: 1;
    min-width: 0;
}

.editor-hint {
    margin: 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}

.editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--ddb-spacing-sm);
}
</style>
