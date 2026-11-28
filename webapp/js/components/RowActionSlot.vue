<template>
    <slot v-if="shown" />
    <span v-else class="row-action-placeholder" aria-hidden="true" />
</template>

<script>
/**
 * RowActionSlot - the place of one action button in the actions of a table row. A row the action does not apply to
 * keeps the place empty, as wide as a small icon-only button, so the buttons of every row line up. Hidden from
 * assistive technology: the row has no such action.
 *
 * Props:
 *   shown - the action applies to this row: the slot (the button) is shown, else the empty place
 */
export default {
    name: 'RowActionSlot',
    props: {
        shown: { type: Boolean, default: false }
    }
};
</script>

<style scoped>
.row-action-placeholder {
    display: inline-block;
    flex: none;
    width: var(--p-button-sm-icon-only-width, 2rem);
}
</style>
