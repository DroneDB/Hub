<template>
    <!-- aria-disabled with a focus stop, the reason as the description and as the tooltip: the same pattern as ActionButton, for a
         disabled item that is not a button element (a row of a list). The role says what the item is, so that a screen
         reader announces it as dimmed: aria-disabled means nothing on a span without one -->
    <span v-if="reason" class="disabled-reason" :role="role" tabindex="0" aria-disabled="true" :aria-describedby="reasonId" :title="reason">
        <slot />
    </span>
    <span v-if="reason" :id="reasonId" class="visually-hidden">{{ reason }}</span>
    <slot v-else />
</template>

<script setup>
/**
 * DisabledReason - wraps what a disabled item shows and says why it is disabled (FR-XC-22): with a `reason`, the content
 * stays focusable (aria-disabled, not removed from the tab order) and the reason is its description (aria-describedby,
 * read by screen readers) and its tooltip. Without a reason it is the content alone. `role` is what the item is in its
 * context (a button by default; a row of a list passes the role of what a click on the row does), one of the roles
 * that support aria-disabled.
 */
import { useId } from 'vue';

defineProps({
    // Why the item is disabled; empty when it is not
    reason: { type: String, default: '' },
    // What the item is in its context: a role on which aria-disabled is announced (WAI-ARIA 1.2)
    role: {
        type: String,
        default: 'button',
        validator: (/** @type {string} */ v) =>
            ['button', 'link', 'menuitem', 'option', 'tab', 'treeitem', 'gridcell', 'row', 'checkbox', 'radio', 'switch'].includes(v)
    }
});

const reasonId = useId();
</script>

<style scoped>
.disabled-reason {
    cursor: default;
}

.disabled-reason:focus-visible {
    outline: var(--ddb-focus-ring-width) solid var(--ddb-focus-ring-color);
    outline-offset: 2px;
}
</style>
