<template>
    <Window id="splat-scale" title="Set the scale" modal fixed-size confirm-label="Set scale"
            @close="emit('close')" @confirm="confirm">
        <div class="scale-dialog">
            <p>
                The two points you picked are {{ apart }} units apart in this splat. How long is that in reality?
                Distances, heights and areas will then be shown in metres.
            </p>
            <label for="splat-scale-length">Real length (metres)</label>
            <InputText id="splat-scale-length" ref="field" v-model="text" inputmode="decimal" autocomplete="off"
                       :invalid="!!error" :aria-invalid="error ? 'true' : undefined"
                       :aria-describedby="error ? 'splat-scale-length-error' : 'splat-scale-preview'"
                       data-autofocus @input="error = ''" />
            <small v-if="error" id="splat-scale-length-error" class="field-error">{{ error }}</small>
            <small v-else id="splat-scale-preview" class="scale-preview">{{ preview }}</small>
        </div>
    </Window>
</template>

<script setup>
/**
 * ScaleDialog - asks for the real length of the two points picked on a splat that has no scale:
 * closes with the length in metres, or with nothing when it is cancelled. The scale itself (metres
 * per unit) is worked out from it by measureMath.
 *
 * The length is typed as text and read with parseNumber (libs/format.js, D-025): "12.5" and "12,5"
 * are 12.5 in every locale. Set scale stays enabled while the user types (D-046): a Set with a value
 * that is not a positive length shows the rule at the field and keeps the dialog open.
 */
import { ref, computed, nextTick } from 'vue';
import InputText from 'primevue/inputtext';
import Window from '@/components/HubWindow.vue';
import { formatNumber, parseNumber } from '@/libs/format';

/** The rule the length follows, shown at the field when a Set breaks it */
const LENGTH_RULE = 'Enter a length in metres greater than 0, such as 12.5.';

const props = defineProps({
    /** The distance between the two points, in the units of the file */
    unitsApart: { type: Number, required: true }
});
const emit = defineEmits(['close']);
const field = ref(null);
const text = ref('');
const error = ref('');
const length = computed(() => parseNumber(text.value));
const valid = computed(() => Number.isFinite(length.value) && length.value > 0);
const apart = computed(() => formatNumber(props.unitsApart, 0, { significant: 4 }));
// What one unit of the file will measure, once a valid length is typed
const preview = computed(() => (valid.value && props.unitsApart > 0
    ? `1 unit = ${formatNumber(length.value / props.unitsApart, 0, { significant: 4 })} m`
    : ''));

function confirm() {
    if (valid.value) {
        emit('close', length.value);
        return;
    }
    error.value = LENGTH_RULE;
    nextTick(() => field.value?.$el?.focus());
}
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

.field-error {
    color: var(--ddb-danger);
}

.scale-preview {
    color: var(--ddb-text-muted);
    min-height: 1.2em;
}
</style>
