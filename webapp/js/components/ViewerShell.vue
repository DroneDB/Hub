<template>
    <div class="viewer-shell" :class="{ dark }">
        <Message v-model="error" no-dismiss />
        <div v-if="loading" class="viewer-loading">
            <slot name="loading">
                <p v-if="loadingText">{{ loadingText }}</p>
                <i class="fa-solid fa-circle-notch fa-spin" />
            </slot>
        </div>

        <div class="container-wrapper">
            <slot />
            <button v-if="settingsButton && ready" class="btn-settings" :class="settingsButton" :title="settingsTitle"
                    :aria-label="settingsTitle" @click="settingsOpen = !settingsOpen">
                <i class="fa-solid fa-gear" />
            </button>
        </div>

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
 * ViewerShell - the frame every file viewer shares (HQ-08): the error message, the
 * loading indicator, the viewer area and an optional settings button and window.
 *
 *   <ViewerShell id="nexus" v-model:error="error" v-model:settings-open="showSettings" :loading="loading"
 *                loading-text="Loading model..." :ready="loaded" settings-title="Lighting" settings-button="bottom-left">
 *       <canvas ref="canvas" />
 *       <template #settings>…</template>
 *   </ViewerShell>
 */
import Message from '@/components/Message.vue';
import Window from '@/components/Window.vue';

const error = defineModel('error', { type: String, default: '' });
const settingsOpen = defineModel('settingsOpen', { type: Boolean, default: false });
defineProps({
    loading: { type: Boolean, default: false },
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
    border: var(--ddb-border-width) solid rgba(255, 255, 255, 0.25);
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
    background: rgba(0, 0, 0, 0.85);
    border-color: rgba(255, 255, 255, 0.5);
}

.viewer-settings {
    padding: 0.25rem 0;
}
</style>
