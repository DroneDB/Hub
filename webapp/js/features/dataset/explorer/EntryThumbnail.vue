<template>
    <!-- Not a tab stop, and its keys are the list's: the list holds the focus and names its active tile (useListNavigation, FR-EXP-09) -->
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/interactive-supports-focus -- the listbox is the focusable element (aria-activedescendant) -->
    <div class="thumbnail" :class="{ selected: file.selected, active }" :title="titleText"
         role="option" :aria-selected="!!file.selected"
         :style="tileStyle" @click="onClick" @contextmenu="onRightClick" @dblclick="onDblClick">
        <!-- A second cue of the selection besides the tint and the outline (FR-EXP-10) -->
        <span v-if="file.selected" class="selected-badge" aria-hidden="true"><i class="fa-solid fa-check" /></span>
        <div class="container" :class="{ bordered: thumbnail !== null }" :style="sizeStyle">
            <!-- Show thumbnail image if we have a thumbnail URL and not loading -->
            <img v-if="thumbnail && !loading && !buildLoading"
                 :src="thumbnail" alt="" style="max-width: 100%; max-height: 100%;" @load="handleImageLoad"
                 @error="handleImageError">

            <!-- The type icon: the fallback when there is no thumbnail, and under the spinner of a build, dimmed (FR-EXP-07) -->
            <i v-else-if="shownIcon && !loading" class="icon icon-file" :class="[shownIcon, { 'build-dimmed': buildLoading }]" :style="iconStyle" />

            <!-- Build loading spinner (highest priority) -->
            <i v-if="buildLoading" class="fa-solid fa-circle-notch fa-spin loading" />

            <!-- Regular loading spinner (when loading thumbnails) -->
            <i v-else-if="loading" class="fa-solid fa-circle-notch fa-spin loading" />

            <!-- Fallback spinner (when no thumbnail, no icon, and not loading) -->
            <i v-else-if="!thumbnail && !shownIcon" class="fa-solid fa-circle-notch fa-spin loading" />

            <!-- What the spinner stands for, in the words of the build states (the badge and the tooltip use them too) -->
            <span v-if="buildLoading" class="build-caption">{{ buildingWord }}</span>

            <!-- Build Status Badges: only for non-default states (queued/pending/failed) -->
            <div v-if="!buildLoading && !loading && shouldShowBuildBadge" class="build-badge" :class="buildBadgeClass">
                <i class="icon" :class="buildBadgeIcon" />
            </div>
        </div>
        <span class="thumbnail-label">{{ label }}</span>
    </div>
</template>

<script>
import { thumbs } from 'ddb';
import Mouse from '@/libs/mouse';
import Keyboard from '@/libs/keyboard';
import { isBuildableType, hasThumbnail } from '@/libs/entryTypeCapabilities';
import { describeEntryPendingBuild } from '@/libs/build/pendingBuild';
import { shownBuildStatus, isBuildStopped, isBuilt, BUILD_WORDS } from '@/libs/build/entryBuild';
import { useBuildCompletion } from '@/composables/useBuildCompletion';
import { tileTitle } from '@/libs/dataset/tileTitle';
import { shouldRetry, retryDelayMs, stripRetryParam } from '@/libs/build/thumbRetryPolicy';
import { thumbnailRequestSize } from '@/libs/thumbnailQueue';
import { tileCssVars } from './tileGeometry';
import { getCurrentInstance } from 'vue';

export default {
    name: 'EntryThumbnail',
    components: {
    },
    // Provided by the Explorer: load when visible, a few at a time
    inject: { thumbnailLoader: { default: null } },
    props: {
        file: {
            type: Object,
            required: true
        },
        size: {
            type: Number,
            required: false,
            default: 128
        },
        lazyLoad: {
            type: Boolean,
            default: false
        },
        dataset: {
            type: Object,
            default: null
        },
        // The tile the keyboard is on (the list's aria-activedescendant)
        active: {
            type: Boolean,
            default: false
        }
    },
    emits: ['clicked', 'open'],
    setup(props) {
        // The wait for the build of the file is the shared one (FR-XC-16): the build the tile shows is the BuildManager's, and
        // the end of a build comes through onBuildEnd. A file that is not built by libddb waits for nothing
        const instance = getCurrentInstance();
        const buildable = () => isBuildableType(props.file.entry.type);
        const { buildState, building } = useBuildCompletion(
            () => (buildable() ? props.dataset : null),
            () => [props.file.entry.path],
            end => /** @type {any} */ (instance?.proxy)?.onBuildEnd(end));
        return { buildState, buildLoading: building };
    },
    data: function () {
        const label = this.file.label;

        return {
            label,
            thumbnail: null,
            icon: null,
            error: null,
            loading: false,
            // Bounded retry state (see libs/build/thumbRetryPolicy)
            retryNumber: 0,
            loadTimeout: null,
            // Within the scroll viewport (plus margin) as the Explorer's visibility tracker says; every tile is without one
            inView: true,
            // The size changed while the tile was out of view: its thumbnail comes again at the new size when it is back
            stale: false
        }
    },
    computed: {
        // The box of the thumbnail and its fallback icon follow the size (the user changes it: S, M, L)
        iconStyle() {
            return { fontSize: (parseInt(this.size / 3) / 16) + 'rem' };
        },
        sizeStyle() {
            return { width: (this.size / 16) + 'rem', height: (this.size / 16) + 'rem' };
        },
        // The spacing and the name height come from the tile geometry the virtual grid sizes its rows by
        tileStyle() {
            return { ...tileCssVars(), maxWidth: (this.size / 16) + 'rem' };
        },
        // Effective badge status: the job gives failure (a running build shows the spinner), the
        // entry says whether the build exists. "ready" (built) is the default and never produces
        // a badge - only queued/pending/failed do.
        effectiveBuildStatus() {
            return shownBuildStatus(this.buildState, this.file.entry);
        },
        // The type icon shown: the one the tile set, and while the file builds the file's own (dimmed under the spinner)
        shownIcon() {
            return this.icon || (this.buildLoading ? this.file.icon : null);
        },
        buildingWord() {
            return BUILD_WORDS.building;
        },
        // Name, type, size and build state in plain words (FR-EXP-21), or the error of the tile
        titleText() {
            if (this.error) return this.error;
            const title = tileTitle(this.file.entry, this.buildState ? { currentState: this.buildState.currentState } : null);
            // A build on hold says what it waits for
            return this.effectiveBuildStatus === 'pending'
                ? `${title}\n${describeEntryPendingBuild(this.file.entry).text}`
                : title;
        },
        shouldShowBuildBadge() {
            return !!this.effectiveBuildStatus;
        },
        buildBadgeClass() {
            switch (this.effectiveBuildStatus) {
                case 'failed':
                    return 'error';
                case 'pending':
                    return 'pending';
                case 'queued':
                    return 'queued';
                default:
                    return '';
            }
        },
        buildBadgeIcon() {
            switch (this.effectiveBuildStatus) {
                case 'failed':
                    return 'fa-solid fa-xmark';
                case 'pending':
                    return 'fa-solid fa-triangle-exclamation';
                case 'queued':
                    return 'fa-solid fa-clock';
                default:
                    return '';
            }
        }
    },
    watch: {
        // A build started or running: no thumbnail is on show and none is asked for (a build that starts again takes the
        // image away; no load or error event will come, so its turn goes to the next tile)
        buildLoading(running) {
            if (!running) return;
            this.cancelImageRequest();
            this.loading = false;
            this.error = null;
            this.thumbnail = null;
            this.icon = this.file.icon;
        },
        // Another tile size: a thumbnail shown comes again at the step of the new size (FR-EXP-43, FR-XC-32), now
        // when the tile is in view, else when it comes into view. A tile still waiting for its turn needs nothing:
        // its URL is built when the turn comes.
        size(size, before) {
            if (!this.thumbnail || thumbnailRequestSize(size) === thumbnailRequestSize(before)) return;
            if (this.inView) this.refreshSize();
            else this.stale = true;
        }
    },
    mounted: async function () {
        if (!this.lazyLoad) await this.loadThumbnail();
        else if (this.thumbnailLoader) {
            this.thumbnailLoader.visibility.observe(this.$el, visible => {
                this.inView = visible;
                if (visible) {
                    if (this.stale) this.refreshSize();
                    else this.loadThumbnail();
                } else if (this.imageTicket?.state === 'waiting') {
                    // Scrolled away before its turn: it asks again when it comes back (at the size of then)
                    if (this.thumbnail) this.stale = true;
                    this.cancelImageRequest();
                }
            });
        }
    },
    beforeUnmount() {
        this.thumbnailLoader?.visibility.unobserve(this.$el);
        this.cancelImageRequest();
        if (this.loadTimeout) clearTimeout(this.loadTimeout);
    },
    methods: {
        // The thumbnail URL at the size the tile has now: the tile's size times the pixel ratio, not a fixed 256 px
        thumbnailUrl: function () {
            return thumbs.fetch(this.file.path, thumbnailRequestSize(this.size), this.file.entry.hash);
        },
        // Shows the thumbnail once the loader grants a slot (at once without a loader). The URL is built then, not
        // before: the size may change while the tile waits for its turn (FR-EXP-43).
        showImage: function () {
            this.cancelImageRequest();
            if (!this.thumbnailLoader) {
                try {
                    this.applyImage(this.thumbnailUrl());
                } catch (e) {
                    this.failLoad(e);
                }
                return;
            }
            // The queue may grant the slot at once, inside enqueue()
            let ticket = null;
            let ended = false;
            ticket = this.thumbnailLoader.queue.enqueue(() => {
                let url;
                try {
                    url = this.thumbnailUrl();
                } catch (e) {
                    this.failLoad(e);
                    throw e; // the queue gives the slot to the next tile
                }
                if (this.applyImage(url)) return;
                // Nothing to load: the slot goes to the next tile
                ended = true;
                ticket?.release();
            });
            if (ended) ticket.release();
            else this.imageTicket = ticket;
        },
        // The <img> takes `url`, false when it already has it. A thumbnail shown stays until the new one has
        // loaded (the browser keeps the current image while the next one loads): a size change draws no spinner.
        applyImage: function (url) {
            this.loading = false;
            if (url === this.thumbnail) return false;
            this.thumbnail = url;
            return true;
        },
        // The size changed: the thumbnail shown comes again at the new size, the old one shown meanwhile. A request
        // still waiting for its turn takes the size of then.
        refreshSize: function () {
            this.stale = false;
            if (!this.thumbnail || this.imageTicket?.state === 'waiting') return;
            this.retryNumber = 0;
            if (this.loadTimeout) {
                clearTimeout(this.loadTimeout);
                this.loadTimeout = null;
            }
            this.showImage();
        },
        cancelImageRequest: function () {
            if (!this.imageTicket) return;
            const waiting = this.imageTicket.state === 'waiting';
            this.imageTicket.cancel();
            this.imageTicket = null;
            // Never shown: the next visibility asks again
            if (waiting) this.loading = false;
        },
        // The image request ended (loaded or failed): its slot goes to the next tile
        releaseImageSlot: function () {
            // Not a request still waiting for its turn (the image of before ended meanwhile)
            if (this.imageTicket?.state === 'waiting') return;
            this.imageTicket?.release();
            this.imageTicket = null;
        },
        handleImageError: function () {
            this.releaseImageSlot();
            // Bounded retry: MAX_RETRIES retries with backoff (thumbRetryPolicy),
            // so a server-side failure costs <= 4 requests per tile instead of an
            // unbounded 5s retry loop that amplifies outages. A build that failed or
            // is on hold makes no thumbnail while the tile waits: the fallback shows
            // at once (a build that starts or succeeds later reloads the tile).
            if (this.thumbnail && this.thumbnail.startsWith("/orgs") && shouldRetry(this.retryNumber)
                && !isBuildStopped(this.buildState, this.file.entry)) {
                if (this.loadTimeout) {
                    clearTimeout(this.loadTimeout);
                    this.loadTimeout = null;
                }
                const nextRetry = this.retryNumber + 1;
                this.loadTimeout = setTimeout(() => {
                    // Cache-buster: stripRetryParam + fresh &retry=N busts the
                    // browser cache of the failed response (server ignores it).
                    this.thumbnail = `${stripRetryParam(this.thumbnail)}&retry=${nextRetry}`;
                    this.retryNumber = nextRetry;
                }, retryDelayMs(this.retryNumber));
                return;
            }

            // Retries exhausted (or non-API URL): terminal fallback.
            if (this.loadTimeout) {
                clearTimeout(this.loadTimeout);
                this.loadTimeout = null;
            }
            if (this.dataset && isBuildableType(this.file.entry.type)) {
                // Buildable entry: show the file icon and let the
                // queued/pending/failed badge explain the state (same rule as
                // the loadThumbnail catch branch).
                this.thumbnail = null;
                this.icon = this.file.icon;
                this.loading = false;
            } else {
                this.showError(new Error("Cannot load thumbnail (retries exceeded)"));
            }
        },
        handleImageLoad: function () {
            this.releaseImageSlot();
            // Confirmed load: recharge the retry budget ONLY. Deliberately does
            // NOT rewrite the bound URL — reassigning thumbnail would re-render
            // the <img>, refetch the stripped URL and re-arm the budget against
            // a possibly-still-broken server.
            this.retryNumber = 0;
        },
        showError: function (e) {
            console.warn(e);
            this.error = e.message;
            this.icon = "fa-solid fa-triangle-exclamation";
            this.loading = false;
        },
        loadThumbnail: async function (force = false) {
            if (force) {
                // Forced reload (e.g. build Succeeded): a file that exhausted its
                // retry budget while unbuilt gets a fresh budget now.
                this.retryNumber = 0;
                if (this.loadTimeout) {
                    clearTimeout(this.loadTimeout);
                    this.loadTimeout = null;
                }
            }

            // Use single loading flag to prevent multiple calls
            if (this.loading) {
                return; // Already loading
            }
            if (!force && this.thumbnail && !this.error) {
                return; // Already loaded (unless forced)
            }
            if (!force && this.error) {
                return; // Skip if error (unless forced)
            }

            // A buildable file whose build runs shows its icon under the spinner, and asks for no thumbnail: the end of the
            // build brings it (onBuildEnd)
            if (this.dataset && isBuildableType(this.file.entry.type)) {
                if (this.buildLoading) {
                    this.icon = this.file.icon;
                    return;
                }
                // No build of its own to explain it: the icon, until the thumbnail is there
                if (!this.buildState && !isBuilt(this.file.entry)) this.icon = this.file.icon;
            }

            this.loading = true;

            try {
                if (hasThumbnail(this.file.entry.type)) {
                    this.showImage();
                } else {
                    this.icon = this.file.icon;
                    this.loading = false;
                }
            } catch (e) {
                this.failLoad(e);
            }
        },
        // No thumbnail URL for the file
        failLoad: function (e) {
            this.loading = false; // Reset loading state on error

            // For buildable files without a build yet, show the icon and let the
            // queued/pending badge explain the state instead of a perpetual spinner.
            if (this.dataset && isBuildableType(this.file.entry.type) && !this.buildState) {
                this.icon = this.file.icon;
            } else {
                this.showError(e);
            }
        },
        onClick: function (e) {
            Keyboard.updateState(e);
            this.$emit('clicked', this, Mouse.LEFT);
        },
        onRightClick: function (e) {
            Keyboard.updateState(e);
            this.$emit('clicked', this, Mouse.RIGHT);
        },
        onDblClick: function () {
            this.$emit("open", this);
        },

        // A build of the file ended (the shared wait of FR-XC-16): a build that succeeded makes the thumbnail, so it loads
        // again with a fresh retry budget; one that failed leaves the icon, which the badge of the build explains
        onBuildEnd(end) {
            this.cancelImageRequest();
            this.thumbnail = null;
            this.error = null;
            this.loading = false;
            if (end.succeeded) {
                this.icon = null;
                this.loadThumbnail(true);
            } else {
                this.icon = this.file.icon;
            }
        }
    }
}
</script>

<style scoped>
.thumbnail {
    position: relative;
    width: 100%;
    margin: var(--tile-spacing);
    padding-top: var(--tile-spacing);
    padding-bottom: var(--tile-spacing);
    text-align: center;
    border-radius: var(--ddb-radius-sm);
    transition: 0.25s background-color ease;
}

/* A name wraps at its words (inside one only when it is longer than the tile) and stops after two lines.
   It always takes two lines, in em so that they follow the font size: the tile height is fixed. */
.thumbnail .thumbnail-label {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--tile-label-lines);
    line-clamp: var(--tile-label-lines);
    line-height: var(--tile-label-line-height);
    height: calc(var(--tile-label-lines) * var(--tile-label-line-height) * 1em);
    overflow: hidden;
    overflow-wrap: anywhere;
}

.thumbnail:hover {
    background: var(--ddb-bg-hover);
    cursor: pointer;
}

.thumbnail:active {
    background: var(--ddb-border);
}

.thumbnail:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: -2px;
}

/* Selected (FR-EXP-10): the primary tint, a 2px primary outline (3:1 or more against the page and
   against the hover grey) and a check badge; it is declared after :hover, so a selected tile keeps its tint
   under the pointer and never reads as hovered */
.thumbnail.selected {
    background: var(--ddb-selected-bg);
    outline: 2px solid var(--ddb-primary);
    outline-offset: -2px;
}

.thumbnail .selected-badge {
    position: absolute;
    top: var(--ddb-spacing-xs);
    left: var(--ddb-spacing-xs);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: var(--ddb-primary);
    color: var(--ddb-text-on-color);
    font-size: var(--ddb-font-size-sm);
    pointer-events: none;
}

.thumbnail .selected-badge i {
    margin: 0;
    line-height: 1;
}

.thumbnail .container {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    position: relative;
    pointer-events: none;
    margin-bottom: var(--tile-spacing);
}

/* .thumbnail .container.bordered - drop shadow removed */

.thumbnail .container img {
    max-width: 100%;
    max-height: 100%;
}

.thumbnail .container img.hide {
    visibility: hidden;
}

.thumbnail .container i.icon-file {
    display: inline-block;
}

.thumbnail .icon.badge {
    font-size: var(--ddb-font-size-sm);
}

.thumbnail i.icon {
    margin: 0;
}

.thumbnail i.loading {
    position: absolute;
    top: 63%;
    left: 50%;
    margin-left: -0.5rem;
}

/* A file that builds: its type icon dimmed under the spinner, and the state in words at the foot of the tile (FR-EXP-07) */
.thumbnail .container i.icon-file.build-dimmed {
    opacity: 0.35;
}

.thumbnail .build-caption {
    position: absolute;
    bottom: var(--ddb-spacing-xs);
    left: 0;
    right: 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text);
}

/* Build Status Badges */
.build-badge {
    position: absolute;
    top: var(--ddb-spacing-xs);
    right: var(--ddb-spacing-xs);
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-on-color);
    z-index: 10;
}

.build-badge.success {
    background-color: var(--ddb-success);
}

.build-badge.error {
    background-color: var(--ddb-danger);
}

/* Work that runs or waits its turn is the brand blue; a build that waits for files the user
   must add is the warning yellow, with dark text */
.build-badge.processing,
.build-badge.queued {
    background-color: var(--ddb-primary);
}

.build-badge.pending {
    background-color: var(--ddb-warning);
    color: var(--ddb-text-on-warning);
}

.build-badge i.icon {
    margin: 0 !important;
    font-size: var(--ddb-font-size-sm);
    width: auto;
    height: auto;
    line-height: 1;
}
</style>
