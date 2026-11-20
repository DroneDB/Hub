<template>
    <small v-if="message" :id="id" class="field-error">{{ message }}</small>
</template>

<script setup>
/**
 * The error of one form field, under it (FR-XC-11): the field names it with aria-describedby
 * (its id) and aria-invalid.
 */
defineProps({
    /** DOM id, for the field's aria-describedby */
    id: { type: String, required: true },
    /** The text; nothing is drawn when it is empty */
    message: { type: String, default: '' }
});
</script>

<style scoped>
.field-error {
    display: block;
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-danger);
    text-align: left;
}
</style>
