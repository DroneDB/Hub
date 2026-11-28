<template>
    <div class="mb-3">
        <label :id="`${id}-label`" :for="id" class="d-block mb-1 fw-semibold">{{ label }}</label>
        <slot :described-by="describedBy" :invalid="!!error" />
        <FieldError :id="`${id}-error`" :message="error" />
        <small v-if="hint" :id="`${id}-hint`" class="d-block mt-1 text-muted">{{ hint }}</small>
        <small v-if="count" :id="`${id}-count`" class="field-count">{{ count }}</small>
    </div>
</template>

<script setup>
/**
 * One labelled field of the report settings: the label, the control (the default slot, which gets the
 * aria-describedby and the invalid state to put on it), the error under it, a hint and a character counter.
 *
 *   <ReportSettingsField id="name" label="Name" :error="problem" count="3/60" v-slot="{ describedBy, invalid }">
 *       <InputText id="name" :invalid="invalid" :aria-describedby="describedBy" />
 *   </ReportSettingsField>
 */
import { computed } from 'vue';
import FieldError from '@/components/FieldError.vue';

const props = defineProps({
    /** The id of the control, which the label names */
    id: { type: String, required: true },
    label: { type: String, required: true },
    error: { type: String, default: '' },
    hint: { type: String, default: '' },
    /** The length against its limit, "12/200" */
    count: { type: String, default: '' }
});

const describedBy = computed(() => [
    props.error ? `${props.id}-error` : '',
    props.hint ? `${props.id}-hint` : '',
    props.count ? `${props.id}-count` : ''
].filter(Boolean).join(' ') || undefined);
</script>

<style scoped>
.field-count {
    display: block;
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
    text-align: right;
}
</style>
