<template>
    <RouterView name="header" />
    <RouterView :key="contentKey" name="content" />
    <Toast position="bottom-left" />
    <HubUpdateNoticeDialog v-if="updateNotice"
                           :notice="updateNotice"
                           :hub-version="versions.hubVersion"
                           :registry-version="versions.registryVersion"
                           :ddb-version="versions.ddbVersion"
                           @close="updateNotice = null" />
</template>

<script setup>
/**
 * Root component: the header and content route views, the one toast host
 * and the one-shot "Hub was updated" notice.
 */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import Toast from 'primevue/toast';
import HubUpdateNoticeDialog from '@/components/HubUpdateNoticeDialog.vue';

const props = defineProps({
    // { from, to, at } when the previous page load reloaded for an update
    notice: { type: Object, default: null },
    // { hubVersion, registryVersion, ddbVersion } from /sys/features
    versions: { type: Object, default: () => ({}) }
});

const route = useRoute();
const updateNotice = ref(props.notice);

// Forces a remount when switching dataset: /r/:org/:ds is a single route
// record, so without a key Vue would reuse the instance and skip its hooks.
const contentKey = computed(() => {
    const p = route.params;
    return p.org && p.ds ? `${p.org}/${p.ds}` : route.path;
});
</script>
