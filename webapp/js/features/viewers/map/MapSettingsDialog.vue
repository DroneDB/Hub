<template>
    <Window id="map-settings" title="Map Settings" modal size-class="dialog-sm" fixed-size close-button cancel-label="Close"
            @close="$emit('close')">
        <div class="map-settings-content">
            <div class="setting-field">
                <label id="map-settings-dialog-basemap-label" for="map-settings-dialog-basemap" class="setting-label">
                    <i class="fa-solid fa-map fa-fw" aria-hidden="true" /> Basemap
                </label>
                <Select v-model="choice" input-id="map-settings-dialog-basemap" aria-labelledby="map-settings-dialog-basemap-label"
                        :options="basemapOptions" option-label="label" option-value="value" class="setting-select" />
                <CustomBasemapEditor v-if="editingCustom" id-prefix="map-settings-dialog-custom" class="custom-basemap-editor"
                                     @applied="onApplied" @cleared="onCleared" />
            </div>

            <div class="setting-field">
                <span id="map-settings-dialog-measurement-units-label" class="setting-label">
                    <i class="fa-solid fa-ruler fa-fw" aria-hidden="true" /> Measurement units
                </span>
                <SelectButton id="map-settings-dialog-measurement-units" aria-labelledby="map-settings-dialog-measurement-units-label"
                              :model-value="unitPref" :options="UNIT_OPTIONS" option-label="label" option-value="value"
                              :allow-empty="false" class="setting-units" @update:model-value="onUnitsChange" />
            </div>
        </div>
    </Window>
</template>

<script setup>
/**
 * MapSettingsDialog - the basemap and the measurement units of a map. The units are a switch that
 * shows both choices, one click apart. "Custom" opens the editor of the custom basemap; the map
 * switches to it once a source is saved. The basemap is emitted, not
 * stored here: the map draws it and saves it as the user's preference (useMapBasemap), which also
 * draws the basemap of a saved view without saving it.
 */
import { computed } from 'vue';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
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
/* Each setting is its label above its control, the controls the whole width of the window: they
   line up whatever the length of their label, in the small window and on a phone alike */
.map-settings-content {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-lg);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
}

.setting-field {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
}

.setting-label {
    color: var(--ddb-text);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.setting-label i {
    color: var(--ddb-text-secondary);
}

.setting-select {
    width: 100%;
}

/* The two units share the width */
.setting-units {
    display: flex;
}

.setting-units :deep(.p-togglebutton) {
    flex: 1 1 0;
}
</style>
