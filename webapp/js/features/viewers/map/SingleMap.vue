<template>
    <div class="single-map">
        <TabViewLoader title-suffix="Map" @loaded="onLoaded" />
        <MapViewer v-if="files.length" :files="files" :dataset="dataset" :can-write="canWrite" :can-delete="canDelete" standalone />
    </div>
</template>

<script>
/**
 * SingleMap - the map of one file (route /r/:org/:ds/view/:encodedPath/map).
 * The map itself is MapViewer (Map.vue) in standalone mode (HQ-07): this view only
 * loads the entry and its permissions.
 */
import ddb from 'ddb';
import TabViewLoader from '@/features/viewers/TabViewLoader';
import MapViewer from './Map.vue';

export default {
    name: 'SingleMap',
    components: { TabViewLoader, MapViewer },
    props: {
        uri: { type: String, default: null }
    },
    data: function () {
        return {
            // Filled by TabViewLoader
            ddbURI: null,
            entry: null,
            dataset: null,
            canWrite: false,
            canDelete: false,
            canRead: false,
            files: []
        };
    },
    methods: {
        onLoaded: function () {
            this.files = [{
                path: this.ddbURI,
                entry: this.entry,
                label: ddb.pathutils.basename(this.entry.path),
                selected: false
            }];
        }
    }
};
</script>

<style scoped>
.single-map {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}
</style>
