<template>
    <div class="splat-settings">
        <div class="form-group">
            <label class="checkbox-row">
                <input v-model="flipped" type="checkbox">
                <span>Flip up axis</span>
            </label>
            <small>Toggle if the scene appears upside down.</small>
        </div>

        <RangeSetting v-model="pointScale" label="Point size" :min="0.25" :max="3" :step="0.05" :format="v => `${v.toFixed(2)}x`" />

        <div class="form-group">
            <div class="calib-header">
                <span>Ground plane calibration</span>
                <button type="button" class="calib-reset" @click="tiltRoll = 0; tiltPitch = 0">Reset</button>
            </div>
            <small>Drag until vertical lines (walls, doors) look vertical.</small>
            <RangeSetting v-model="tiltRoll" label="Roll" :min="-45" :max="45" :step="0.5" :format="degrees" />
            <RangeSetting v-model="tiltPitch" label="Pitch" :min="-45" :max="45" :step="0.5" :format="degrees" />
        </div>

        <div class="settings-actions">
            <Button label="Close" severity="secondary" text @click="emit('close')" />
        </div>
    </div>
</template>

<script setup>
/**
 * View settings of the splat viewer: up-axis flip, point size, ground-plane calibration.
 */
import Button from 'primevue/button';
import RangeSetting from '@/components/RangeSetting.vue';

const flipped = defineModel('flipped', { type: Boolean, required: true });
const pointScale = defineModel('pointScale', { type: Number, required: true });
const tiltRoll = defineModel('tiltRoll', { type: Number, required: true });
const tiltPitch = defineModel('tiltPitch', { type: Number, required: true });
const emit = defineEmits(['close']);
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

.checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
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
