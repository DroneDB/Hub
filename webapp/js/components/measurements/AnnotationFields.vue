<template>
    <fieldset class="annotation-fields">
        <!-- The section around it is titled Inspection: the legend names the group for a screen reader -->
        <legend class="visually-hidden">Inspection</legend>

        <div class="annotation-field">
            <label :id="`${idPrefix}-category-label`" :for="`${idPrefix}-category`" class="d-block mb-1 fw-semibold">Category</label>
            <Select :model-value="values.category ?? null" :input-id="`${idPrefix}-category`" :aria-labelledby="`${idPrefix}-category-label`"
                    :options="options.categories" option-label="label" option-value="value" placeholder="None" show-clear class="w-100"
                    @update:model-value="set('category', $event)" />
        </div>

        <div v-if="schema.severities.length || values.severity" class="annotation-field">
            <label :id="`${idPrefix}-severity-label`" :for="`${idPrefix}-severity`" class="d-block mb-1 fw-semibold">Severity</label>
            <Select :model-value="values.severity ?? null" :input-id="`${idPrefix}-severity`" :aria-labelledby="`${idPrefix}-severity-label`"
                    :options="options.severities" option-label="label" option-value="value" placeholder="None" show-clear class="w-100"
                    @update:model-value="set('severity', $event)" />
        </div>

        <div class="annotation-field">
            <label :id="`${idPrefix}-status-label`" :for="`${idPrefix}-status`" class="d-block mb-1 fw-semibold">Status</label>
            <Select :model-value="values.status ?? null" :input-id="`${idPrefix}-status`" :aria-labelledby="`${idPrefix}-status-label`"
                    :options="options.statuses" option-label="label" option-value="value" placeholder="None" show-clear class="w-100"
                    @update:model-value="set('status', $event)" />
        </div>

        <div class="annotation-field">
            <label :for="`${idPrefix}-due`" class="d-block mb-1 fw-semibold">Due date</label>
            <InputText :id="`${idPrefix}-due`" type="date" :model-value="values.dueDate ?? ''" class="w-100" :invalid="!!dueError"
                       :aria-invalid="dueError ? 'true' : undefined" :aria-describedby="dueError ? `${idPrefix}-due-error` : undefined"
                       @update:model-value="set('dueDate', $event)" />
            <FieldError :id="`${idPrefix}-due-error`" :message="dueError" />
        </div>

        <div class="annotation-field">
            <label :for="`${idPrefix}-assignee`" class="d-block mb-1 fw-semibold">Assignee</label>
            <InputText :id="`${idPrefix}-assignee`" :model-value="values.assignee ?? ''" placeholder="Optional" :maxlength="FIELD_LIMITS.assignee"
                       autocomplete="off" class="w-100" @update:model-value="set('assignee', $event)" />
        </div>

        <div class="annotation-field annotation-field--check">
            <Checkbox :input-id="`${idPrefix}-report`" :model-value="values.report !== false" binary @update:model-value="set('report', $event ? undefined : false)" />
            <label :for="`${idPrefix}-report`">Include in reports</label>
        </div>
    </fieldset>
</template>

<script setup>
/**
 * The inspection fields of both properties dialogs (the 2D map's and the 3D viewer's): category, severity, status,
 * due date, assignee and whether the annotation is in reports, two to a row where there is room. The one place that
 * has them, so that the two views offer the same fields with the same rules. The reference, which names the item, is
 * AnnotationRefField, next to the name.
 *
 * `v-model` is an object with the keys of FIELD_KEYS; a field with no value is absent (undefined), and the
 * model is what the file stores (see storedFields). The choices are the organization's schema; a stored id that the
 * schema does not have stays selectable as `Unknown (<id>)`, so editing an item does not drop its value.
 * `update:valid` says whether the fields can be saved: the due date is a date.
 */
import { computed, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Checkbox from 'primevue/checkbox';
import FieldError from '@/components/FieldError.vue';
import { FIELD_LIMITS, choiceLabel, isDueDate } from '@/libs/map/annotationIds';

const props = defineProps({
    modelValue: { type: Object, default: () => ({}) },
    /** The organization's annotation schema: { categories, severities, statuses } */
    schema: { type: Object, required: true },
    /** Prefix of the ids of the fields (a page can have two forms) */
    idPrefix: { type: String, default: 'af' }
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

const dueError = computed(() => (!values.value.dueDate || isDueDate(values.value.dueDate) ? '' : 'Enter a valid date'));

watch(dueError, error => emit('update:valid', !error), { immediate: true });

/** @param {string} key @param {any} value */
function set(key, value) {
    emit('update:modelValue', { ...values.value, [key]: value === null || value === '' ? undefined : value });
}
</script>

<style scoped>
.annotation-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
    gap: var(--ddb-spacing-md) var(--ddb-spacing-md);
    align-items: start;
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
}

.annotation-field {
    min-width: 0;
}

/* The check box sits where a field's input does, under the labels of its row */
.annotation-field--check {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    align-self: end;
    min-height: 2.5rem;
}
</style>
