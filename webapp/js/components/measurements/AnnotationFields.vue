<template>
    <fieldset class="annotation-fields">
        <legend class="fw-semibold">Inspection</legend>

        <div class="mb-3">
            <label :for="`${idPrefix}-ref`" class="d-block mb-1 fw-semibold">Reference</label>
            <InputText :id="`${idPrefix}-ref`" :model-value="values.ref ?? ''" :placeholder="refPlaceholder" maxlength="8" autocomplete="off"
                       class="w-100" :invalid="!!refError" :aria-invalid="refError ? 'true' : undefined"
                       :aria-describedby="refError ? `${idPrefix}-ref-error` : undefined" @update:model-value="set('ref', $event)" />
            <FieldError :id="`${idPrefix}-ref-error`" :message="refError" />
        </div>

        <div class="mb-3">
            <label :id="`${idPrefix}-category-label`" :for="`${idPrefix}-category`" class="d-block mb-1 fw-semibold">Category</label>
            <Select :model-value="values.category ?? null" :input-id="`${idPrefix}-category`" :aria-labelledby="`${idPrefix}-category-label`"
                    :options="options.categories" option-label="label" option-value="value" placeholder="None" show-clear class="w-100"
                    @update:model-value="set('category', $event)" />
        </div>

        <div v-if="schema.severities.length || values.severity" class="mb-3">
            <label :id="`${idPrefix}-severity-label`" :for="`${idPrefix}-severity`" class="d-block mb-1 fw-semibold">Severity</label>
            <Select :model-value="values.severity ?? null" :input-id="`${idPrefix}-severity`" :aria-labelledby="`${idPrefix}-severity-label`"
                    :options="options.severities" option-label="label" option-value="value" placeholder="None" show-clear class="w-100"
                    @update:model-value="set('severity', $event)" />
        </div>

        <div class="mb-3">
            <label :id="`${idPrefix}-status-label`" :for="`${idPrefix}-status`" class="d-block mb-1 fw-semibold">Status</label>
            <Select :model-value="values.status ?? null" :input-id="`${idPrefix}-status`" :aria-labelledby="`${idPrefix}-status-label`"
                    :options="options.statuses" option-label="label" option-value="value" placeholder="None" show-clear class="w-100"
                    @update:model-value="set('status', $event)" />
        </div>

        <div class="mb-3">
            <label :for="`${idPrefix}-assignee`" class="d-block mb-1 fw-semibold">Assignee</label>
            <InputText :id="`${idPrefix}-assignee`" :model-value="values.assignee ?? ''" placeholder="Optional" :maxlength="FIELD_LIMITS.assignee"
                       autocomplete="off" class="w-100" @update:model-value="set('assignee', $event)" />
        </div>

        <div class="mb-3">
            <label :for="`${idPrefix}-due`" class="d-block mb-1 fw-semibold">Due date</label>
            <InputText :id="`${idPrefix}-due`" type="date" :model-value="values.dueDate ?? ''" class="w-100" :invalid="!!dueError"
                       :aria-invalid="dueError ? 'true' : undefined" :aria-describedby="dueError ? `${idPrefix}-due-error` : undefined"
                       @update:model-value="set('dueDate', $event)" />
            <FieldError :id="`${idPrefix}-due-error`" :message="dueError" />
        </div>

        <div class="mb-1 d-flex align-items-center gap-2">
            <Checkbox :input-id="`${idPrefix}-report`" :model-value="values.report !== false" binary @update:model-value="set('report', $event ? undefined : false)" />
            <label :for="`${idPrefix}-report`">Include in reports</label>
        </div>
    </fieldset>
</template>

<script setup>
/**
 * The annotation fields of both properties dialogs (the 2D map's and the 3D viewer's): reference, category, severity,
 * status, assignee, due date and whether the annotation is in reports. The one place that has them, so that the two
 * views offer the same fields with the same rules.
 *
 * `v-model` is an object with the keys of FIELD_KEYS; a field with no value is absent (undefined), and the
 * model is what the file stores (see storedFields). The choices are the organization's schema; a stored id that the
 * schema does not have stays selectable as `Unknown (<id>)`, so editing an item does not drop its value.
 * `update:valid` says whether the fields can be saved: the reference is free (`isRefTaken`) and well formed, and the
 * due date is a date.
 */
import { computed, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Checkbox from 'primevue/checkbox';
import FieldError from '@/components/FieldError.vue';
import { FIELD_LIMITS, choiceLabel, isDueDate, isValidRef, refTakenMessage } from '@/libs/map/annotationIds';

const props = defineProps({
    modelValue: { type: Object, default: () => ({}) },
    /** The organization's annotation schema: { categories, severities, statuses } */
    schema: { type: Object, required: true },
    /** Prefix of the ids of the fields (a page can have two forms) */
    idPrefix: { type: String, default: 'af' },
    /** Says whether another annotation of the file has this reference (the one being edited does not count) */
    isRefTaken: { type: Function, default: () => false },
    /** What the reference field says while it is empty (an annotation not numbered yet is numbered when it is saved) */
    refPlaceholder: { type: String, default: 'Assigned when saved' }
});
const emit = defineEmits(['update:modelValue', 'update:valid']);

const values = computed(() => props.modelValue || {});

/** The options of a list: the schema's entries, and the stored id when the schema does not have it. */
function optionsOf(key, current) {
    const choices = props.schema[key] || [];
    const options = choices.map(choice => ({ label: choice.name, value: choice.id }));
    if (current && !choices.some(choice => choice.id === current)) options.push({ label: choiceLabel(choices, current), value: current });
    return options;
}

const options = computed(() => ({
    categories: optionsOf('categories', values.value.category),
    severities: optionsOf('severities', values.value.severity),
    statuses: optionsOf('statuses', values.value.status)
}));

const refError = computed(() => {
    const ref = (values.value.ref ?? '').trim();
    if (!ref) return '';
    if (!isValidRef(ref)) return 'A reference has 1 to 8 letters, digits or dashes';
    return props.isRefTaken(ref) ? refTakenMessage(ref) : '';
});
const dueError = computed(() => (!values.value.dueDate || isDueDate(values.value.dueDate) ? '' : 'Enter a valid date'));

watch([refError, dueError], () => emit('update:valid', !refError.value && !dueError.value), { immediate: true });

/** @param {string} key @param {any} value */
function set(key, value) {
    emit('update:modelValue', { ...values.value, [key]: value === null || value === '' ? undefined : value });
}
</script>

<style scoped>
.annotation-fields {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
}

.annotation-fields legend {
    float: none;
    width: auto;
    padding: 0;
    margin: 0 0 var(--ddb-spacing-sm);
    font-size: 1rem;
}
</style>
