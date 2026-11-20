<template>
    <!-- The body of a toast, as PrimeVue draws it by default (the icon of the severity, the summary, the detail), and
         the one action a toast may carry (FR-XC-23). PrimeVue's own classes: the theme styles them -->
    <component :is="icon" class="p-toast-message-icon" aria-hidden="true" />
    <div class="p-toast-message-text">
        <span class="p-toast-summary">{{ message.summary }}</span>
        <div v-if="message.detail" class="p-toast-detail">{{ message.detail }}</div>
        <button v-if="action" type="button" class="toast-action" @click="runToastAction(message)">{{ action.label }}</button>
    </div>
</template>

<script setup>
/**
 * NotifyToastContent - the content of every toast of the app (NotifyToasts passes it to each <Toast> host as its
 * `message` template). Without an action it looks as PrimeVue's default content; with one (notify.*(..., { action }))
 * the action is a button under the text, in the colour of the toast's text. A click runs the action and closes the toast.
 */
import { computed } from 'vue';
import CheckIcon from '@primevue/icons/check';
import InfoCircleIcon from '@primevue/icons/infocircle';
import ExclamationTriangleIcon from '@primevue/icons/exclamationtriangle';
import TimesCircleIcon from '@primevue/icons/timescircle';
import { runToastAction } from '@/libs/notify';

const props = defineProps({
    // The message PrimeVue holds: { severity, summary, detail, data: { action } }
    message: { type: Object, required: true }
});

const ICONS = { success: CheckIcon, info: InfoCircleIcon, warn: ExclamationTriangleIcon, error: TimesCircleIcon };

const icon = computed(() => ICONS[props.message.severity] ?? InfoCircleIcon);
const action = computed(() => props.message.data?.action ?? null);
</script>

<style scoped>
.toast-action {
    margin-top: var(--ddb-spacing-xs);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
}

.toast-action:focus-visible {
    outline: var(--ddb-focus-ring-width) solid var(--ddb-focus-ring-color);
    outline-offset: 2px;
}
</style>
