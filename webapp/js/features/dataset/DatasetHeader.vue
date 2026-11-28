<template>
    <h1 v-if="entry" class="visually-hidden">{{ name }}</h1>
</template>

<script setup>
/**
 * DatasetHeader - the heading of the dataset page: the name of the dataset, from its root entry (the name as
 * the tree shows it: the display name, else the slug), for screen readers only. The header of the Hub shows the name
 * in its breadcrumb, with the visibility (VisibilityButton) and the tagline (the tooltip of the name), so the page
 * keeps its height for the files and the map. It shows nothing until the root entry is read.
 */
import { computed } from 'vue';
import ddb from 'ddb';

defineOptions({ name: 'DatasetHeader' });
const props = defineProps({
    /** The dataset's root entry ({ path, properties: { meta } }) */
    entry: { type: Object, default: null }
});

const name = computed(() => (props.entry ? ddb.utils.entryLabel(props.entry) : ''));
</script>
