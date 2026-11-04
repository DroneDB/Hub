<template>
    <ViewerShell id="model" v-model:error="error" v-model:settings-open="settingsOpen" dark :loading="loading"
                 loading-text="Loading model..." :ready="loaded" settings-button="bottom-left" settings-title="Lighting"
                 settings-id="model-lighting">
        <slot />
        <template #settings>
            <RangeSetting v-model="lighting.ambientIntensity" label="Ambient" :max="3" />
            <RangeSetting v-model="lighting.directionalIntensity" label="Directional" :max="3" />
            <RangeSetting v-if="!hasTexture" v-model="lighting.shininess" label="Shininess" :max="100" :step="5"
                          :format="v => String(v)" />
            <Button label="Reset" text @click="$emit('reset')" />
            <Button label="Close" severity="secondary" text @click="settingsOpen = false" />
        </template>
    </ViewerShell>
</template>

<script setup>
/**
 * ModelViewerShell - the frame of the 3D model viewers: the error, the loading text, the canvas
 * (the default slot) and the window of the lighting settings, on ViewerShell.
 */
import Button from 'primevue/button';
import ViewerShell from '@/components/ViewerShell.vue';
import RangeSetting from '@/components/RangeSetting.vue';

const props = defineProps({
    /** The lighting from useViewerSettings: the sliders edit this reactive object, which saves itself */
    settings: { type: Object, required: true },
    loading: { type: Boolean, default: false },
    /** The model has loaded: show the settings button */
    loaded: { type: Boolean, default: false },
    /** The model has a texture: the shininess of the shaded material does not apply */
    hasTexture: { type: Boolean, default: false }
});
defineEmits(['reset']);
const error = defineModel('error', { type: String, default: '' });
const settingsOpen = defineModel('settingsOpen', { type: Boolean, default: false });

// The same object as the prop: the sliders are meant to change it (see `settings`)
const lighting = props.settings;
</script>
