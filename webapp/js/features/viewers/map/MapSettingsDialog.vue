<template>
    <Window id="map-settings" title="Map Settings" modal size-class="dialog-sm" fixed-size @close="$emit('close')">
        <div class="map-settings-content">
            <div class="setting-row">
                <label id="map-settings-dialog-basemap-label" for="map-settings-dialog-basemap" class="setting-label align-items-baseline">
                    <i class="fa-solid fa-map" /> Basemap
                </label>
                <Select v-model="choice" input-id="map-settings-dialog-basemap" aria-labelledby="map-settings-dialog-basemap-label"
                        :options="basemapOptions" option-label="label" option-value="value" class="setting-select" />
            </div>

            <CustomBasemapEditor v-if="editingCustom" id-prefix="map-settings-dialog-custom" class="custom-basemap-editor"
                                 @applied="onApplied" @cleared="onCleared" />

            <div class="setting-row">
                <label id="map-settings-dialog-measurement-units-label" for="map-settings-dialog-measurement-units" class="setting-label align-items-baseline">
                    <i class="fa-solid fa-pencil" /> Measurement Units
                </label>
                <Select input-id="map-settings-dialog-measurement-units" aria-labelledby="map-settings-dialog-measurement-units-label" :model-value="unitPref"
                        :options="UNIT_OPTIONS" option-label="label" option-value="value" class="setting-select ms-3" @update:model-value="onUnitsChange" />
            </div>
        </div>
        <div class="d-flex justify-content-end mt-3" style="padding: 0 0.75rem;">
            <Button severity="secondary" label="Close" @click="$emit('close')" />
        </div>
    </Window>
</template>

<script setup>
/**
 * MapSettingsDialog - the basemap and the measurement units of a map. "Custom" opens the editor of
 * the custom basemap; the map switches to it once a source is saved. The basemap is emitted, not
 * stored here: a comparison keeps its own basemap instead of the user's preference.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Window from '@/components/HubWindow.vue';
import { useBasemapChoice } from '@/composables/useBasemapChoice';
import CustomBasemapEditor from './CustomBasemapEditor.vue';

defineOptions({ name: 'MapSettingsDialog' });
const props = defineProps({
    basemaps: { type: Object, required: true },
    selectedBasemap: { type: String, required: true },
    unitPref: { type: String, required: true, validator: value => ['metric', 'imperial'].includes(String(value)) }
});
const emit = defineEmits(['close', 'basemapChanged', 'unitsChanged']);

const UNIT_OPTIONS = [{ label: 'Metric', value: 'metric' }, { label: 'Imperial', value: 'imperial' }];

const basemapOptions = computed(() => Object.entries(props.basemaps).map(([value, { label }]) => ({ value, label })));

const { choice, editingCustom, onApplied, onCleared } = useBasemapChoice(computed({
    get: () => props.selectedBasemap,
    set: value => emit('basemapChanged', value)
}));

/** @param {string} value */
function onUnitsChange(value) {
    if (value !== props.unitPref) emit('unitsChanged', value, props.unitPref);
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

.setting-select {
    font-size: 0.75rem;
}

.custom-basemap-editor {
    margin: 0 var(--ddb-spacing-md);
}
</style>
