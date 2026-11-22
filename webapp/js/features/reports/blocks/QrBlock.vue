<template>
    <p class="report-qr" data-block="qr">
        {{ block.label }}: <a :href="block.url">{{ block.url }}</a>
    </p>
</template>

<script setup>
/**
 * The QR block: the address of the live report or of an item. The QR code is drawn by the renderer of the PDF; the page
 * shows the address as a link.
 */
defineProps({
    /** { url, label } */
    block: { type: Object, required: true }
});
</script>

<style scoped>
.report-qr {
    margin-bottom: var(--ddb-spacing-md);
    font-size: var(--ddb-font-size-sm);
    overflow-wrap: anywhere;
}
</style>
