<template>
    <div ref="shellEl" class="viewer-shell" :class="{ dark, 'has-fullscreen-overlay': fullscreenOverlay }">
        <div v-if="!embed" class="viewer-bar">
            <RouterLink v-if="datasetLocation" :to="datasetLocation" class="viewer-back"
                        title="Back to the dataset" aria-label="Back to the dataset">
                <i class="fa-solid fa-arrow-left" />
            </RouterLink>
            <slot name="bar">
                <span class="viewer-name" :title="shownName">{{ shownName }}</span>
            </slot>
            <!-- A viewer without the navigation toolbar (the point cloud and the splat) has its fullscreen button here -->
            <button v-if="fullscreenButton && canFullscreen" type="button" class="viewer-fullscreen" :title="fullscreenTitle"
                    :aria-label="fullscreenLabel" :aria-pressed="isFullscreen" @click="toggleFullscreen">
                <i class="fa-solid" :class="isFullscreen ? 'fa-compress' : 'fa-expand'" />
            </button>
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
                <!-- Embedded there is no view bar: the same button stands over the view, in the corner the viewer leaves free -->
                <button v-if="fullscreenOverlay" type="button" class="viewer-fullscreen-overlay" :class="fullscreenCorner"
                        :title="fullscreenTitle" :aria-label="fullscreenLabel" :aria-pressed="isFullscreen" @click="toggleFullscreen">
                    <i class="fa-solid" :class="isFullscreen ? 'fa-compress' : 'fa-expand'" />
                </button>
                <button v-if="settingsButton && ready" class="btn-settings" :class="settingsButton" :title="settingsTitle"
                        :aria-label="settingsTitle" :aria-expanded="settingsOpen" :aria-controls="panelId" @click="settingsOpen = !settingsOpen">
                    <i class="fa-solid fa-gear" />
                </button>

                <!-- Navigation toolbar (opt-in): Home, fullscreen, what the viewer adds in `nav`, and the help -->
                <div v-if="navToolbar && ready" class="viewer-nav" :class="navSide" role="toolbar" aria-label="View controls">
                    <button type="button" class="viewer-nav-button" title="Home: back to the framed view (Home, H or 0)"
                            aria-label="Home" @click="goHome">
                        <i class="fa-solid fa-house" />
                    </button>
                    <button v-if="canFullscreen" type="button" class="viewer-nav-button"
                            :title="fullscreenTitle" :aria-label="fullscreenLabel"
                            :aria-pressed="isFullscreen" @click="toggleFullscreen">
                        <i class="fa-solid" :class="isFullscreen ? 'fa-compress' : 'fa-expand'" />
                    </button>
                    <slot name="nav" />
                    <button ref="helpButton" type="button" class="viewer-nav-button" title="Controls" aria-label="Controls"
                            aria-haspopup="dialog" :aria-expanded="helpOpen" :aria-controls="helpId" @click="helpOpen = !helpOpen">
                        <i class="fa-solid fa-question" />
                    </button>
                    <div v-if="helpOpen" :id="helpId" ref="helpEl" class="viewer-help" role="dialog" aria-modal="false"
                         aria-label="Controls" tabindex="-1">
                        <div class="viewer-help-title">Controls</div>
                        <dl class="viewer-help-list">
                            <template v-for="gesture in helpRows" :key="gesture.input">
                                <dt>{{ gesture.input }}</dt>
                                <dd>{{ gesture.action }}</dd>
                            </template>
                        </dl>
                    </div>
                </div>

                <!-- The settings, docked on the side of their button: not modal, and it leaves the centre of the view clear -->
                <aside v-if="settingsOpen" :id="panelId" ref="panelEl" class="viewer-settings-panel" :class="panelPlace" role="dialog"
                       aria-modal="false" :aria-label="settingsTitle" tabindex="-1">
                    <div class="viewer-panel-head">
                        <span class="viewer-panel-title">{{ settingsTitle }}</span>
                        <button type="button" class="viewer-panel-close" title="Close" aria-label="Close" @click="settingsOpen = false">
                            <i class="fa-solid fa-xmark" />
                        </button>
                    </div>
                    <div class="viewer-settings">
                        <slot name="settings" />
                    </div>
                </aside>
            </div>
        </template>
    </div>
</template>

<script setup>
/**
 * ViewerShell - the frame every file viewer shares: the view bar (the way back to the dataset
 * and the file name, or the viewer's own content in its `bar` slot; none when embedded), the
 * error message, the page state of a file that did not load (ResourceState, from `load-error`),
 * the loading indicator, the viewer area, an optional settings button with its panel, and an
 * optional navigation toolbar.
 *
 * The settings open in a panel docked inside the viewer area, on the side of the settings button
 * (a default side when there is none, as in the splat viewer, which has its own button and sets
 * `settings-open`): not modal, Escape closes it, and it leaves the centre of the view clear.
 *
 * The navigation toolbar (`nav-toolbar`, once `ready`) has Home (the `home` event, also on the keys
 * Home, H and 0 unless a field has the focus), fullscreen of the shell and a "?" help that lists
 * the `gestures` the viewer passes in. A viewer adds its own buttons in the `nav` slot.
 *
 * Fullscreen of the shell is on the toolbar, and on the F key (FR-VWR-38) unless a field has the focus. A viewer
 * that has no navigation toolbar (`fullscreen-button`) has the same button, at the end of its view bar, and the F key;
 * embedded (no view bar) the button stands over the view, in its `fullscreen-corner`. The F key is not taken while a
 * modal dialog has the focus, when a handler before the shell has taken the key, or when the viewer's
 * `fullscreen-key` says the key is its own (it returns false: Potree's fly mode flies down on F).
 *
 *   <ViewerShell id="model" v-model:error="error" v-model:settings-open="showSettings" :loading="loading"
 *                :load-error="loadError" loading-text="Loading model..." :ready="loaded" settings-title="Lighting"
 *                settings-button="bottom-left">
 *       <canvas ref="canvas" />
 *       <template #settings>…</template>
 *   </ViewerShell>
 */
import { computed, inject, ref, watch, useId, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import ddb from 'ddb';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Message from '@/components/HubMessage.vue';
import ResourceState from '@/components/ResourceState.vue';
import { useOverlay } from '@/composables/useOverlay';
import { b64decode } from '@/libs/base64';
import { LoadErrorKind, loadErrorKind } from '@/libs/ddb/apiError';
import keyboard from '@/libs/keyboard';
import { requestFullScreen, exitFullScreen, isFullScreenCurrently, supportsFullScreen } from '@/libs/utils';

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
    settingsId: { type: String, default: undefined },
    /** Show the navigation toolbar (Home, fullscreen, help) once `ready`, and take the keys Home, H and 0 */
    navToolbar: { type: Boolean, default: false },
    /** Show a fullscreen button in the view bar, and take the key F, for a viewer that has no navigation toolbar */
    fullscreenButton: { type: Boolean, default: false },
    /** Embedded, the corner of the view where the fullscreen button of `fullscreen-button` stands: the one the viewer leaves free */
    fullscreenCorner: {
        type: String,
        default: 'top-right',
        validator: corner => ['top-right', 'bottom-right'].includes(String(corner))
    },
    /** Asked on the key F: false leaves the key to the viewer (a key of its own mode), anything else toggles fullscreen */
    fullscreenKey: { type: Function, default: null },
    /** The gestures the viewer understands, listed in the help of the toolbar: [{ input: 'Left drag', action: 'Rotate' }] */
    gestures: { type: Array, default: () => [] }
});
const emit = defineEmits(['home']);

// The side the settings panel takes when the viewer has no settings button of the shell (the splat viewer has its own)
const DEFAULT_PANEL_SIDE = 'right';
const HOME_KEYS = ['Home', 'h', 'H', '0'];
const FULLSCREEN_KEYS = ['f', 'F'];

// Provided by the app: true on a page embedded in another one, which has no view bar
const embed = inject('embed', false);
const route = useRoute();
const uid = useId();

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

const shellEl = ref(null);
const panelEl = ref(null);
const helpEl = ref(null);
const helpButton = ref(null);
const helpOpen = ref(false);
const isFullscreen = ref(false);
const panelId = computed(() => props.settingsId || `${uid}-settings`);
const helpId = `${uid}-help`;

// The settings panel docks on the side of its button, above it; without a button, at the top of the default side
const panelPlace = computed(() => {
    const side = props.settingsButton.endsWith('left') ? 'left' : props.settingsButton.endsWith('right') ? 'right' : DEFAULT_PANEL_SIDE;
    return [`side-${side}`, props.settingsButton ? 'from-bottom' : 'from-top'];
});
// The toolbar stands in the other bottom corner than the settings button
const navSide = computed(() => (props.settingsButton === 'bottom-left' ? 'bottom-right' : 'bottom-left'));
const helpRows = computed(() => [...props.gestures, { input: 'Home, H or 0', action: 'Back to the framed view' }]);
const canFullscreen = supportsFullScreen();
const fullscreenLabel = computed(() => (isFullscreen.value ? 'Exit fullscreen' : 'Fullscreen'));
const fullscreenTitle = computed(() => `${fullscreenLabel.value} (F)`);
// Embedded, the fullscreen button of the view bar has no bar: it stands over the view (the frame of ShareEmbed allows fullscreen)
const fullscreenOverlay = computed(() => !!embed && props.fullscreenButton && canFullscreen);

// Escape closes the panel and the help, the topmost first (and returns the focus to what opened it)
useOverlay({
    active: settingsOpen,
    container: () => panelEl.value,
    onEscape: e => { e.preventDefault(); settingsOpen.value = false; },
    autoFocus: true
});
useOverlay({
    active: helpOpen,
    container: () => helpEl.value,
    returnTo: () => helpButton.value,
    onEscape: e => { e.preventDefault(); helpOpen.value = false; }
});

function goHome() {
    emit('home');
}

function toggleFullscreen() {
    if (isFullScreenCurrently()) exitFullScreen();
    else requestFullScreen(shellEl.value ?? undefined);
}
const syncFullscreen = () => { isFullscreen.value = isFullScreenCurrently(); };

/** Typing in a field: the keys belong to it (a slider's Home goes to its start) */
function isTyping(target) {
    return target instanceof Element && (!!target.closest('input, textarea, select, [role="combobox"]') || target.isContentEditable);
}

/** A modal dialog has the focus: the keys belong to it (a non-modal Window of the viewers is a PrimeVue dialog too) */
function inDialog(target) {
    return target instanceof Element && !!target.closest('[role="dialog"][aria-modal="true"], .p-dialog');
}

/** The viewer leaves the key F to the shell: it has no `fullscreen-key`, or that does not return false */
function fullscreenKeyFree(e) {
    return !props.fullscreenKey || props.fullscreenKey(e) !== false;
}

// Home, H and 0 reset the view and F toggles fullscreen, whatever has the focus but a field
function onNavKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (props.navToolbar && props.ready && HOME_KEYS.includes(e.key)) {
        e.preventDefault();
        goHome();
    } else if (canFullscreen && FULLSCREEN_KEYS.includes(e.key) && ((props.navToolbar && props.ready) || props.fullscreenButton)
        && !e.defaultPrevented && !inDialog(e.target) && fullscreenKeyFree(e)) {
        e.preventDefault();
        // A held key repeats: one toggle per press
        if (!e.repeat) toggleFullscreen();
    }
}

// A click away from the help closes it
function onPointerDown(e) {
    if (!(e.target instanceof Node)) return;
    if (helpEl.value?.contains(e.target) || helpButton.value?.contains(e.target)) return;
    helpOpen.value = false;
}
watch(helpOpen, open => {
    if (open) document.addEventListener('pointerdown', onPointerDown, true);
    else document.removeEventListener('pointerdown', onPointerDown, true);
});

onMounted(() => {
    keyboard.onKeyDown(onNavKey);
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
});
onBeforeUnmount(() => {
    keyboard.offKeyDown(onNavKey);
    document.removeEventListener('fullscreenchange', syncFullscreen);
    document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    document.removeEventListener('pointerdown', onPointerDown, true);
});

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

<style scoped lang="scss">
@use '../../css/overlay-button' as *;

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
.viewer-bar > :deep(:not(.viewer-back, .viewer-fullscreen)) {
    flex: 1 1 0;
    min-width: 0;
}

.viewer-fullscreen {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    margin-left: auto;
    border: none;
    border-radius: var(--ddb-radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.viewer-fullscreen:hover {
    background: var(--ddb-bg-hover);
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

/* Embedded: the fullscreen button over the view, in the corner the viewer leaves free (`fullscreen-corner`) */
.viewer-fullscreen-overlay {
    @include toolbar-button;

    position: absolute;
    z-index: 100;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(var(--ddb-glass-rgb), 0.25);
}

.viewer-fullscreen-overlay.top-right {
    top: var(--ddb-spacing-md);
    right: var(--ddb-spacing-md);
}

.viewer-fullscreen-overlay.bottom-right {
    bottom: var(--ddb-spacing-md);
    right: var(--ddb-spacing-md);
}

/* The settings panel docked at the top right starts below the button (2.25rem), not over it */
.viewer-fullscreen-overlay.top-right ~ .viewer-settings-panel.from-top.side-right {
    top: calc(2 * var(--ddb-spacing-md) + 2.25rem);
    max-height: calc(100% - 3 * var(--ddb-spacing-md) - 2.25rem);
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

/* The toolbar of the shell: Home, fullscreen, the viewer's own buttons, help */
.viewer-nav {
    position: absolute;
    bottom: var(--ddb-spacing-md);
    display: flex;
    gap: 0.25rem;
    z-index: 100;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(var(--ddb-glass-rgb), 0.25);
    border-radius: var(--ddb-border-radius, 4px);
    padding: 0.25rem;
}

.viewer-nav.bottom-left {
    left: var(--ddb-spacing-md);
}

.viewer-nav.bottom-right {
    right: var(--ddb-spacing-md);
}

.viewer-nav-button {
    @include toolbar-button;
}

.viewer-help {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    width: 17rem;
    max-width: calc(100vw - 2 * var(--ddb-spacing-md));
    padding: 0.6rem 0.75rem;
    border-radius: var(--ddb-border-radius, 4px);
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(var(--ddb-glass-rgb), 0.25);
    color: var(--ddb-text-on-dark);
    font-size: 0.8rem;
}

.bottom-left > .viewer-help {
    left: 0;
}

.bottom-right > .viewer-help {
    right: 0;
}

.viewer-help-title {
    margin-bottom: 0.4rem;
    font-weight: 600;
    opacity: 0.85;
}

.viewer-help-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.75rem;
    margin: 0;
}

.viewer-help-list dt {
    font-weight: 600;
}

.viewer-help-list dd {
    margin: 0;
}

/* The settings panel: docked at the edge of the view, on the side of its button, up to 18rem wide */
.viewer-settings-panel {
    position: absolute;
    z-index: 110;
    display: flex;
    flex-direction: column;
    width: min(18rem, calc(100% - 2 * var(--ddb-spacing-md)));
    overflow: hidden;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg);
    color: var(--ddb-text);
    box-shadow: var(--ddb-shadow-md);
}

.viewer-settings-panel.side-left {
    left: var(--ddb-spacing-md);
}

.viewer-settings-panel.side-right {
    right: var(--ddb-spacing-md);
}

/* Above the button (2.25rem) that opened it */
.viewer-settings-panel.from-bottom {
    bottom: calc(var(--ddb-spacing-md) + 2.25rem + 0.5rem);
    max-height: calc(100% - 2.25rem - 0.5rem - 2 * var(--ddb-spacing-md));
}

.viewer-settings-panel.from-top {
    top: var(--ddb-spacing-md);
    max-height: calc(100% - 2 * var(--ddb-spacing-md));
}

.viewer-panel-head {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.4rem 0.4rem 0.75rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
}

.viewer-panel-title {
    font-weight: 600;
}

.viewer-panel-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: var(--ddb-radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.viewer-panel-close:hover {
    background: var(--ddb-bg-hover);
}

.viewer-settings {
    min-height: 0;
    overflow-y: auto;
    padding: 0.75rem;
}
</style>
