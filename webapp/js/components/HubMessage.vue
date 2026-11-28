<template>
    <PrimeMessage v-if="modelValue" :severity="severity" :closable="!noDismiss" @close="$emit('update:modelValue', '')">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised with libs/sanitize.js, and only when the host asks for markup -->
        <span v-if="html" class="hub-message-text" v-html="safeContent" />
        <span v-else class="hub-message-text">{{ modelValue }}</span>
    </PrimeMessage>
</template>

<script setup>
/**
 * Message - a dismissible message box bound with v-model.
 *
 *   <Message v-model="error" />            shows `error` while it is not empty;
 *                                          dismissing sets it to ''
 *   <Message v-model="error" no-dismiss />
 *
 * The text is shown as text, with its line breaks: it is often the name of a file or the answer of a server, which must
 * never make an element. A host whose own message holds markup passes `html`: then it is sanitised before rendering.
 */
import { computed } from 'vue';
import PrimeMessage from 'primevue/message';
import { sanitizeHtml } from '@/libs/sanitize';

defineOptions({ name: 'HubMessage' });

const props = defineProps({
    modelValue: { type: String, default: '' },
    severity: { type: String, default: 'warn', validator: v => ['success', 'info', 'warn', 'error', 'secondary', 'contrast'].includes(v) },
    noDismiss: { type: Boolean, default: false },
    html: { type: Boolean, default: false }
});
defineEmits(['update:modelValue']);

const safeContent = computed(() => sanitizeHtml(props.modelValue));
</script>

<style scoped>
.hub-message-text {
    white-space: pre-line;
}
</style>
