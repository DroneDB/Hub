<template>
    <Window id="splat-scale" title="Set the scale" modal fixed-size confirm-label="Set scale" :confirm-disabled="!valid"
            @close="emit('close')" @confirm="emit('close', length)">
        <div class="scale-dialog">
            <p>
                The two points you picked are {{ apart }} units apart in this splat. How long is that in reality?
                Distances, heights and areas will then be shown in metres.
            </p>
            <label for="splat-scale-length">Real length (metres)</label>
            <InputNumber v-model="length" input-id="splat-scale-length" :min="0.0001" :max-fraction-digits="4" :min-fraction-digits="0"
                         data-autofocus />
        </div>
    </Window>
</template>

<script setup>
/**
 * ScaleDialog - asks for the real length of the two points picked on a splat that has no scale:
 * closes with the length in metres, or with nothing when it is cancelled. The scale itself (metres
 * per unit) is worked out from it by measureMath.
 */
import { ref, computed } from 'vue';
import InputNumber from 'primevue/inputnumber';
import Window from '@/components/HubWindow.vue';

const props = defineProps({
    /** The distance between the two points, in the units of the file */
    unitsApart: { type: Number, required: true }
});
const emit = defineEmits(['close']);
const length = ref(null);
const valid = computed(() => typeof length.value === 'number' && length.value > 0);
const apart = computed(() => String(Number(props.unitsApart.toPrecision(4))));
</script>

<style scoped>
.scale-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
    min-width: min(22rem, var(--window-content-width, 100%));
}

.scale-dialog p {
    margin: 0;
}
</style>
