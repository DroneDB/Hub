<template>
    <Button v-bind="$attrs" :icon="icon" :label="showLabel ? label : undefined" :aria-label="label" :title="tooltip"
            :aria-disabled="disabled ? 'true' : undefined" :aria-describedby="describedBy"
            :aria-pressed="pressed === undefined ? undefined : String(!!pressed)"
            :class="{ 'action-disabled': disabled }" @click="onClick" />
    <span v-if="describedBy" :id="reasonId" class="visually-hidden">{{ disabledReason }}</span>
</template>

<script>
import { useId } from 'vue';
import Button from 'primevue/button';

/**
 * ActionButton - a button of an action that may not apply now: the one pattern of a disabled
 * action (FR-XC-22). A disabled action stays focusable (aria-disabled, not disabled) and says why,
 * through aria-describedby (a hidden text) and its tooltip; a click on it does nothing. A toggle
 * gives `pressed` (aria-pressed).
 *
 * Props:
 *   label          - the action's name (the accessible name; shown with `showLabel`)
 *   icon           - a Font Awesome class
 *   disabled       - the action does not apply now
 *   disabledReason - why (read by screen readers and shown as the tooltip)
 *   pressed        - a toggle's state; leave undefined for a plain button
 *   showLabel      - show the label next to the icon
 * Other attributes (severity, size, text...) go to the PrimeVue Button.
 */
export default {
    name: 'ActionButton',
    components: { Button },
    inheritAttrs: false,
    props: {
        label: { type: String, required: true },
        icon: { type: String, default: undefined },
        disabled: { type: Boolean, default: false },
        disabledReason: { type: String, default: '' },
        pressed: { type: Boolean, default: undefined },
        showLabel: { type: Boolean, default: false }
    },
    emits: ['click'],
    setup() {
        return { reasonId: useId() };
    },
    computed: {
        describedBy() {
            return this.disabled && this.disabledReason ? this.reasonId : undefined;
        },
        tooltip() {
            return this.disabled && this.disabledReason ? `${this.label}: ${this.disabledReason}` : this.label;
        }
    },
    methods: {
        onClick(e) {
            if (this.disabled) {
                e.preventDefault();
                return;
            }
            this.$emit('click', e);
        }
    }
};
</script>

<style scoped>
.action-disabled {
    opacity: var(--p-disabled-opacity, 0.6);
    cursor: default;
}
</style>
