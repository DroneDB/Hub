<template>
    <!-- The box has the height of the logo before the image is read, so the cover does not move when it comes -->
    <div class="report-logo" data-block="logo">
        <img v-if="!failed" class="report-logo-image" :src="block.url" :alt="block.alt" @error="failed = true">
    </div>
</template>

<script setup>
/**
 * The logo block of the cover: the custom logo of the template, else the logo of the organization (endpoints of the
 * Registry, read with the session as the thumbnails are), else the logo of the instance. The PDF draws the same block.
 * A logo that cannot be read leaves its place empty.
 */
import { ref, watch } from 'vue';

const props = defineProps({
    /** { source: 'template' | 'organization' | 'instance', url, alt } */
    block: { type: Object, required: true }
});

const failed = ref(false);
watch(() => props.block.url, () => { failed.value = false; });
</script>

<style scoped>
.report-logo {
    height: 4rem;
    margin-bottom: var(--ddb-spacing-md);
}

.report-logo-image {
    height: 100%;
    width: auto;
    max-width: min(16rem, 100%);
    object-fit: contain;
    object-position: left center;
}
</style>
