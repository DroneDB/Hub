<template>
    <div class="share-url-row">
        <InputText :model-value="value" readonly title="Copy to clipboard" style="flex: 1;" @click="$emit('copy')" />
        <Button title="Copy to clipboard" aria-label="Copy to clipboard" :icon="copyIcon" text @click="$emit('copy')" />
    </div>
</template>

<script setup>
// A read-only URL with a copy button (ShareEmbed's link, embed and OGC rows).
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

defineProps({
    value: { type: String, default: '' },
    copyIcon: { type: String, default: 'fa-regular fa-copy' }
});
defineEmits(['copy']);
</script>
