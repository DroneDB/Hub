<template>
    <PrimeMessage v-if="modelValue" :severity="severity" :closable="!noDismiss" @close="$emit('update:modelValue', '')">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised with libs/sanitize.js -->
        <span v-html="safeContent" />
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
 * The text may contain simple HTML; it is sanitised before rendering.
 */
import { computed } from 'vue';
import PrimeMessage from 'primevue/message';
import { sanitizeHtml } from '@/libs/sanitize';

defineOptions({ name: 'HubMessage' });

const props = defineProps({
    modelValue: { type: String, default: '' },
    severity: { type: String, default: 'warn', validator: v => ['success', 'info', 'warn', 'error', 'secondary', 'contrast'].includes(v) },
    noDismiss: { type: Boolean, default: false }
});
defineEmits(['update:modelValue']);

const safeContent = computed(() => sanitizeHtml(props.modelValue));
</script>
