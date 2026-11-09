<template>
    <div class="viewer-shell" :class="{ dark }">
        <div v-if="!embed" class="viewer-bar">
            <RouterLink v-if="datasetLocation" :to="datasetLocation" class="viewer-back"
                        title="Back to the dataset" aria-label="Back to the dataset">
                <i class="fa-solid fa-arrow-left" />
            </RouterLink>
            <slot name="bar">
                <span class="viewer-name" :title="shownName">{{ shownName }}</span>
            </slot>
        </div>

        <!-- The file or its dataset did not load: not found, no access, sign in, a link that cannot be read -->
        <ResourceState v-if="loadKind" :kind="loadKind" :resource="stateResource" :name="stateName" :message="stateMessage"
                       :back-to="datasetLocation" back-label="Back to the dataset" />
        <template v-else>
            <!-- A viewer that cannot open is an error, not a warning -->
            <Message v-model="error" severity="error" no-dismiss />
            <!-- Any other failure to load: the message above, and the way back -->
            <div v-if="loadError && datasetLocation" class="viewer-failed">
                <!-- Embedded: the dataset opens in a new tab, not in the frame (ResourceState does the same) -->
                <RouterLink :to="datasetLocation" :target="embed ? '_blank' : undefined" :rel="embed ? 'noopener' : undefined">
                    <i class="fa-solid fa-arrow-left" /> Back to the dataset
                </RouterLink>
            </div>
            <div v-if="loading" class="viewer-loading">
                <slot name="loading">
                    <LoadingSpinner :label="loadingText" />
                </slot>
            </div>

            <div class="container-wrapper">
                <slot />
                <button v-if="settingsButton && ready" class="btn-settings" :class="settingsButton" :title="settingsTitle"
                        :aria-label="settingsTitle" @click="settingsOpen = !settingsOpen">
                    <i class="fa-solid fa-gear" />
                </button>
            </div>
        </template>

        <Window v-if="settingsOpen" :id="settingsId" :title="settingsTitle" fixed-size size-class="dialog-xs"
                @close="settingsOpen = false">
            <div class="viewer-settings">
                <slot name="settings" />
            </div>
        </Window>
    </div>
</template>

<script setup>
/**
 * ViewerShell - the frame every file viewer shares: the view bar (the way back to the dataset
 * and the file name, or the viewer's own content in its `bar` slot; none when embedded), the
 * error message, the page state of a file that did not load (ResourceState, from `load-error`),
 * the loading indicator, the viewer area and an optional settings button and window.
 *
 *   <ViewerShell id="model" v-model:error="error" v-model:settings-open="showSettings" :loading="loading"
 *                :load-error="loadError" loading-text="Loading model..." :ready="loaded" settings-title="Lighting"
 *                settings-button="bottom-left">
 *       <canvas ref="canvas" />
 *       <template #settings>…</template>
 *   </ViewerShell>
 */
import { computed, inject } from 'vue';
import { useRoute } from 'vue-router';
import ddb from 'ddb';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Message from '@/components/HubMessage.vue';
import Window from '@/components/HubWindow.vue';
import ResourceState from '@/components/ResourceState.vue';
import { b64decode } from '@/libs/base64';
import { LoadErrorKind, loadErrorKind } from '@/libs/ddb/apiError';

const error = defineModel('error', { type: String, default: '' });
const settingsOpen = defineModel('settingsOpen', { type: Boolean, default: false });
const props = defineProps({
    loading: { type: Boolean, default: false },
    /** The error the file did not load with (useViewerEntry's `loadError`): its page state, or the message and the way back */
    loadError: { type: null, default: null },
    /** The name in the view bar; the file the address names by default */
    name: { type: String, default: null },
    /** Dark viewer background (3D and panorama viewers) */
    dark: { type: Boolean, default: false },
    loadingText: { type: String, default: '' },
    /** The viewer has loaded: show its settings button */
    ready: { type: Boolean, default: false },
    /** Where the settings button goes ('bottom-left', 'bottom-right'); none when empty */
    settingsButton: { type: String, default: '' },
    settingsTitle: { type: String, default: 'Settings' },
    settingsId: { type: String, default: undefined }
});

// Provided by the app: true on a page embedded in another one, which has no view bar
const embed = inject('embed', false);
const route = useRoute();

const datasetLocation = computed(() => {
    const { org, ds } = route?.params ?? {};
    return org && ds ? { name: 'ViewDataset', params: { org: String(org), ds: String(ds) } } : null;
});

// The dataset path the address names, or '' (a saved view names none; a cut link cannot be read)
const routePath = computed(() => {
    const encoded = route?.params?.encodedPath;
    if (!encoded) return '';
    try {
        return b64decode(String(encoded));
    } catch {
        return '';
    }
});
const shownName = computed(() => props.name ?? (routePath.value ? ddb.pathutils.basename(routePath.value) : ''));

const loadKind = computed(() => loadErrorKind(props.loadError));
// A missing thing is the file (or its dataset); access is the dataset's
const stateResource = computed(() => (loadKind.value === LoadErrorKind.NOT_FOUND ? 'file' : 'dataset'));
const stateName = computed(() => (loadKind.value === LoadErrorKind.NOT_FOUND
    ? routePath.value || shownName.value
    : String(route?.params?.ds ?? '')));
const stateMessage = computed(() => (loadKind.value === LoadErrorKind.INVALID_LINK
    ? 'The file path in the address cannot be read. Check that the link was copied whole.'
    : ''));
</script>

<style scoped>
.viewer-shell {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.viewer-shell.dark {
    background: var(--ddb-viewer-bg);
}

.viewer-bar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    min-width: 0;
    padding: 0.4rem 0.75rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg);
    color: var(--ddb-text);
}

.viewer-back {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--ddb-radius-sm);
    color: var(--ddb-text);
}

.viewer-back:hover {
    background: var(--ddb-bg-hover);
}

/* The name, or the viewer's own bar content, takes the rest of the line */
.viewer-bar > :deep(:not(.viewer-back)) {
    flex: 1 1 0;
    min-width: 0;
}

.viewer-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.viewer-failed {
    padding: 0 var(--ddb-spacing-md) var(--ddb-spacing-md);
}

.dark .viewer-failed a {
    color: var(--ddb-text-on-dark);
}

.viewer-loading {
    margin: 0.5rem;
    text-align: center;
    font-size: var(--ddb-font-size-base);
}

.dark .viewer-loading {
    color: var(--ddb-text-on-dark);
}

.container-wrapper {
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
    position: relative;
}

.btn-settings {
    position: absolute;
    bottom: var(--ddb-spacing-md);
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(var(--ddb-glass-rgb), 0.25);
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-base);
    cursor: pointer;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn-settings.bottom-left {
    left: var(--ddb-spacing-md);
}

.btn-settings.bottom-right {
    right: var(--ddb-spacing-md);
}

.btn-settings:hover {
    background: rgba(var(--ddb-shade-rgb), 0.85);
    border-color: rgba(var(--ddb-glass-rgb), 0.5);
}

.viewer-settings {
    padding: 0.25rem 0;
}
</style>
