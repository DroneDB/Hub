<template>
    <MapViewerPage :key="generation" @identity="id => current = id" />
</template>

<script setup>
/**
 * MapViewer - the route component of the map viewer, for a new view of a file
 * (/r/:org/:ds/view/:encodedPath/map) and a saved view (/r/:org/:ds/views/:uid).
 *
 * A page loads its view once. The router keeps this component, and the page in it, when the
 * route changes to another view of the same dataset (the two routes share it, and the app only
 * remounts a route when the dataset changes), so a route that names another identity - another
 * file, another saved view - makes a new page. A route change to the identity the page already
 * has, or moved itself to (a save that creates a view, another base file), is the page's own and
 * changes nothing: the page tells which identity it has before the route follows it.
 */
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { routeIdentity } from '@/composables/useSavedView';
import MapViewerPage from './MapViewerPage.vue';

defineOptions({ name: 'MapViewer' });

const route = useRoute();
const generation = ref(0);
// The identity of the page now shown
const current = ref('');

watch(() => routeIdentity(route), identity => {
    if (identity && identity !== current.value) generation.value++;
});
</script>
