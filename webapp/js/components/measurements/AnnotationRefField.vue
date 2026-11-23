<template>
    <div class="annotation-ref-field">
        <label :for="`${idPrefix}-ref`" class="d-block mb-1 fw-semibold">Reference</label>
        <InputText :id="`${idPrefix}-ref`" :model-value="refText(modelValue.ref)" placeholder="Auto" :title="refText(modelValue.ref) ? undefined : 'Numbered when saved'" maxlength="8" autocomplete="off"
                   class="w-100" :invalid="!!refError" :aria-invalid="refError ? 'true' : undefined"
                   :aria-describedby="refError ? `${idPrefix}-ref-error` : undefined" @update:model-value="set" />
        <FieldError :id="`${idPrefix}-ref-error`" :message="refError" />
    </div>
</template>

<script setup>
/**
 * The reference of an annotation (the number its label and the reports show), in both properties dialogs: next to the
 * name, as it names the item too. `v-model` is the annotation fields (see AnnotationFields); only `ref` is changed, an
 * empty one being absent (an annotation with none is numbered when it is saved: the field says Auto).
 * `update:valid` says whether it can be saved: well formed and not another annotation's.
 */
import { computed, watch } from 'vue';
import InputText from 'primevue/inputtext';
import FieldError from '@/components/FieldError.vue';
import { isValidRef, refTakenMessage, refText } from '@/libs/map/annotationIds';

const props = defineProps({
    modelValue: { type: Object, default: () => ({}) },
    /** Prefix of the id of the field (a page can have two forms) */
    idPrefix: { type: String, default: 'af' },
    /** Says whether another annotation of the file has this reference (the one being edited does not count) */
    isRefTaken: { type: Function, default: () => false }
});
const emit = defineEmits(['update:modelValue', 'update:valid']);

const refError = computed(() => {
    const ref = refText(props.modelValue?.ref).trim();
    if (!ref) return '';
    if (!isValidRef(ref)) return 'A reference has 1 to 8 letters, digits or dashes';
    return props.isRefTaken(ref) ? refTakenMessage(ref) : '';
});

watch(refError, error => emit('update:valid', !error), { immediate: true });

/** @param {string} value */
function set(value) {
    emit('update:modelValue', { ...(props.modelValue || {}), ref: value === '' ? undefined : value });
}
</script>
