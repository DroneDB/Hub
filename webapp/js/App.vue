<template>
    <!-- The first Tab stop: past the header, to the page -->
    <a href="#main" class="skip-link" @click.prevent="skipToMain">Skip to main content</a>
    <RouterView name="header" />
    <main id="main" ref="main" tabindex="-1">
        <RouterView :key="contentKey" name="content" />
    </main>
    <NotifyToasts />
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
 * <main> landmark), the toast hosts and the one-shot "Hub was updated" notice.
 */
import { computed, onScopeDispose, ref } from 'vue';
import { useRoute } from 'vue-router';
import NotifyToasts from '@/components/NotifyToasts.vue';
import HubUpdateNoticeDialog from '@/components/HubUpdateNoticeDialog.vue';
import { setToastGroupResolver, VIEWER_GROUP } from '@/libs/notify';

const props = defineProps({
    // { from, to, at } when the previous page load reloaded for an update
    notice: { type: Object, default: null },
    // { hubVersion, registryVersion, ddbVersion } from /sys/features
    versions: { type: Object, default: () => ({}) }
});

const route = useRoute();

// A viewer route has its own corner for the toasts, off the viewer's controls
setToastGroupResolver(() => (route.meta.viewer ? VIEWER_GROUP : undefined));
onScopeDispose(() => setToastGroupResolver(null));

const updateNotice = ref(props.notice);
const main = ref(null);

// Focus moves to the page; the address keeps no #main (the router would take it for a navigation)
function skipToMain() {
    main.value?.focus();
}

// Forces a remount when switching dataset: /r/:org/:ds is a single route
// record, so without a key Vue would reuse the instance and skip its hooks. A page that is one thing of the dataset
// (a report: `meta.pageParam` names the parameter) is another page for another value of it: the report page reads
// its report once, so "Save as new", which goes to the new report, must get a new instance.
const contentKey = computed(() => {
    const p = route.params;
    if (!(p.org && p.ds)) return route.path;
    const own = /** @type {string | undefined} */ (route.meta.pageParam);
    return own ? `${p.org}/${p.ds}/${String(route.name)}/${p[own]}` : `${p.org}/${p.ds}`;
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
