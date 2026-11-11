<template>
    <!-- The page itself: it scrolls in <main> (.page-scroll, app.scss) -->
    <ResourceState kind="not-found" resource="page" :name="$route.path" class="page-scroll" />
</template>

<script setup>
/**
 * NotFound - the page of an address that matches no route: the "not found" state of
 * ResourceState, with the ways out of every missing thing (FR-XC-13).
 */
import ResourceState from '@/components/ResourceState.vue';

defineOptions({ name: 'NotFound' });
</script>
