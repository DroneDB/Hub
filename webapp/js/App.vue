<template>
    <!-- The first Tab stop: past the header, to the page -->
    <a href="#main" class="skip-link" @click.prevent="skipToMain">Skip to main content</a>
    <RouterView name="header" />
    <main id="main" ref="main" tabindex="-1">
        <RouterView :key="contentKey" name="content" />
    </main>
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
 * Root component: the skip link, the header and content route views (the page in the one
 * <main> landmark), the one toast host and the one-shot "Hub was updated" notice.
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
const main = ref(null);

// Focus moves to the page; the address keeps no #main (the router would take it for a navigation)
function skipToMain() {
    main.value?.focus();
}

// Forces a remount when switching dataset: /r/:org/:ds is a single route
// record, so without a key Vue would reuse the instance and skip its hooks.
const contentKey = computed(() => {
    const p = route.params;
    return p.org && p.ds ? `${p.org}/${p.ds}` : route.path;
});
</script>

<style scoped>
/* Off screen until it has the focus */
.skip-link {
    position: absolute;
    top: var(--ddb-spacing-sm);
    left: var(--ddb-spacing-sm);
    z-index: 1100;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg);
    color: var(--ddb-link);
    box-shadow: var(--ddb-shadow-md);
    transform: translateY(-200%);
}

.skip-link:focus {
    transform: none;
}

/* The page fills the space under the header, as it did as the last child of #app */
main {
    display: flex;
    flex-direction: column;
    outline: none;
}
</style>
