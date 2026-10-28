<template>
    <div class="splat-settings">
        <div class="form-group">
            <label :id="`${upAxisId}-label`" :for="upAxisId">Up axis</label>
            <Select v-model="upAxis" :input-id="upAxisId" :aria-labelledby="`${upAxisId}-label`" :options="choices" option-label="label" option-value="id" class="up-axis-select" />
            <small>The axis of the scene that points up. Change it if the scene appears upside down or on its side.<template v-if="autoUp"> Auto follows the up estimated when the splat was built.</template></small>
        </div>

        <RangeSetting v-model="pointScale" label="Point size" :min="POINT_SCALE_RANGE.min" :max="POINT_SCALE_RANGE.max" :step="0.05" :format="v => `${v.toFixed(2)}x`" />

        <div class="form-group">
            <div class="calib-header">
                <span>Ground plane calibration</span>
                <button type="button" class="calib-reset" @click="tiltRoll = 0; tiltPitch = 0">Reset</button>
            </div>
            <small>A fine adjustment on top of the up axis: drag until vertical lines (walls, doors) look vertical.</small>
            <RangeSetting v-model="tiltRoll" label="Roll" :min="-TILT_LIMIT" :max="TILT_LIMIT" :step="0.5" :format="degrees" />
            <RangeSetting v-model="tiltPitch" label="Pitch" :min="-TILT_LIMIT" :max="TILT_LIMIT" :step="0.5" :format="degrees" />
        </div>

        <div class="settings-actions">
            <Button label="Close" severity="secondary" text @click="emit('close')" />
        </div>
    </div>
</template>

<script setup>
/**
 * View settings of the splat viewer: up axis (or the estimated up), point size, ground-plane calibration.
 */
import { computed, useId } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import RangeSetting from '@/components/RangeSetting.vue';
import { upChoices } from './upAxis';
import { POINT_SCALE_RANGE, TILT_LIMIT } from './viewSettings';

const upAxis = defineModel('upAxis', { type: String, required: true });
// The up the build estimated ({ label }), when it is confident: offered as the Auto choice
const props = defineProps({ autoUp: { type: Object, default: null } });
const choices = computed(() => upChoices(props.autoUp));
const pointScale = defineModel('pointScale', { type: Number, required: true });
const tiltRoll = defineModel('tiltRoll', { type: Number, required: true });
const tiltPitch = defineModel('tiltPitch', { type: Number, required: true });
const emit = defineEmits(['close']);
const upAxisId = useId();
const degrees = v => `${v.toFixed(1)}°`;
</script>

<style scoped>
.settings-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.3rem;
    margin-top: var(--ddb-spacing-sm);
}

.form-group {
    margin-bottom: var(--ddb-spacing-md);
}

.form-group > label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    color: var(--ddb-viewer-label-color);
}

.up-axis-select {
    width: 100%;
}

small {
    display: block;
    color: var(--ddb-text-muted);
    margin: 0.15rem 0 0.4rem;
}

.calib-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.calib-reset {
    border: none;
    background: transparent;
    color: var(--ddb-primary);
    cursor: pointer;
    font-size: var(--ddb-font-size-sm);
    padding: 0;
}
</style>
