<template>
    <Teleport to="body">
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -- a click beside the video closes it; Escape (the overlay stack) and the Close button are the keyboard way -->
        <div v-if="visible" ref="overlay" v-focustrap class="video-lightbox-overlay" role="dialog" aria-modal="true"
             :aria-label="entryName || 'Video'" tabindex="-1" @click="onBackdropClick">
            <div class="video-lightbox-toolbar">
                <div v-if="entry" class="video-lightbox-name">{{ entryName }}</div>
                <div class="video-lightbox-actions">
                    <a class="video-lightbox-action" :href="src" target="_blank" rel="noopener"
                       title="Open in new tab" aria-label="Open in new tab">
                        <i class="fa-solid fa-up-right-from-square" aria-hidden="true" />
                    </a>
                    <button type="button" class="btn-reset video-lightbox-action" title="Close" aria-label="Close" data-autofocus
                            @click="$emit('close')">
                        <i class="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
            </div>
            <div ref="content" class="video-lightbox-content">
                <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -- uploaded footage comes without caption files -->
                <video v-show="!error" ref="videoEl" :src="src" controls preload="metadata" class="video-lightbox-player"
                       @error="handleError" />
                <!-- Beside the player, never over its controls: a video that fails is hidden -->
                <div v-if="error" class="video-lightbox-error" role="alert">
                    <p class="video-lightbox-error-text">
                        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                        {{ errorMessage }}
                    </p>
                    <div class="video-lightbox-error-actions">
                        <button v-if="dataset && entry" type="button" class="btn-reset video-lightbox-error-button video-lightbox-download"
                                :disabled="downloading" @click="download">
                            <i class="fa-solid fa-download" aria-hidden="true" /> Download
                        </button>
                        <a class="video-lightbox-error-button video-lightbox-open" :href="src" target="_blank" rel="noopener">
                            <i class="fa-solid fa-up-right-from-square" aria-hidden="true" /> Open in new tab
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script>
/**
 * VideoLightbox - a video over the whole page. It is an overlay of the overlay stack
 * (composables/useOverlay): the focus goes to its Close button and stays inside (focus trap),
 * Escape closes it when it is the topmost overlay, and the focus goes back to the file that
 * opened it.
 */
import { ref } from 'vue';
import ddb from 'ddb';
import { useOverlay, vFocusTrap } from '@/composables/useOverlay';
import { notifyDownloadError } from '@/libs/datasetDownloads';

const { pathutils } = ddb;

// MediaError codes: the network failed (2), no source the browser can play (4)
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export default {
    name: 'VideoLightbox',
    directives: { focustrap: vFocusTrap },
    props: {
        visible: { type: Boolean, default: false },
        src: { type: String, default: '' },
        entry: { type: Object, default: null },
        // The dataset of the video: with it the error box offers the Download of the file
        dataset: { type: Object, default: null }
    },
    emits: ['close'],
    setup(props, { emit }) {
        const overlay = ref(null);
        useOverlay({
            active: () => props.visible,
            container: () => overlay.value,
            onEscape: e => { e.preventDefault(); emit('close'); },
            autoFocus: true,
            modal: true
        });
        return { overlay };
    },
    data() {
        return {
            error: false,
            // The MediaError code of the failure (MediaError.MEDIA_ERR_*), 0 when unknown
            errorCode: 0,
            downloading: false
        };
    },
    computed: {
        entryName() {
            if (!this.entry) return '';
            return pathutils.basename(this.entry.path || '');
        },
        // The codec, when the entry says it (the video properties of the index)
        codec() {
            const p = (this.entry && this.entry.properties) || {};
            const codec = p.codec || p.videoCodec || p.codecName;
            return typeof codec === 'string' ? codec : '';
        },
        errorMessage() {
            if (this.errorCode === MEDIA_ERR_SRC_NOT_SUPPORTED) {
                const codec = this.codec ? ` (codec ${this.codec})` : '';
                return `This video format is not supported by this browser${codec}. `
                    + 'Videos in H.265/HEVC may not play in this browser. Download the file or open it in a new tab to play it with another player.';
            }
            if (this.errorCode === MEDIA_ERR_NETWORK) return 'Network error: the video could not be loaded. Check the connection and try again.';
            return 'Could not play this video.';
        }
    },
    watch: {
        // Immediate: the lightbox is usually mounted already visible
        visible: {
            immediate: true,
            handler(v) {
                this.error = false;
                this.errorCode = 0;
                if (v) {
                    this.$nextTick(() => {
                        if (this.$refs.videoEl) {
                            this.$refs.videoEl.play().catch(() => { /* autoplay blocked by browser */ });
                        }
                    });
                } else if (this.$refs.videoEl) {
                    try { this.$refs.videoEl.pause(); } catch { /* noop */ }
                }
            }
        }
    },
    methods: {
        handleError(e) {
            const media = (e && e.target) || this.$refs.videoEl;
            this.errorCode = (media && media.error && media.error.code) || 0;
            this.error = true;
        },
        // The whole file as a download, with the download slot check of the dataset page
        async download() {
            if (!this.dataset || !this.entry || this.downloading) return;
            this.downloading = true;
            try {
                await this.dataset.downloadWithCheck([this.entry.path]);
            } catch (err) {
                // The download limit (429) has its own message
                notifyDownloadError(err);
            } finally {
                this.downloading = false;
            }
        },
        // Only the empty space around the video and toolbar
        onBackdropClick(e) {
            if (e.target === this.$refs.overlay || e.target === this.$refs.content) this.$emit('close');
        }
    }
};
</script>

<style scoped>
.video-lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(var(--ddb-shade-rgb), 0.92);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    outline: none;
}

.video-lightbox-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    color: var(--ddb-text-on-dark);
    background: rgba(var(--ddb-shade-rgb), 0.4);
}

.video-lightbox-name {
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: 12px;
}

.video-lightbox-actions {
    display: flex;
    gap: 8px;
}

.video-lightbox-action {
    color: var(--ddb-text-on-dark);
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 4px;
    text-decoration: none;
    line-height: 1;
}

.video-lightbox-action:hover {
    background: rgba(var(--ddb-glass-rgb), 0.15);
}

.video-lightbox-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    overflow: hidden;
}

.video-lightbox-player {
    max-width: 100%;
    max-height: 100%;
    background: rgb(var(--ddb-shade-rgb));
    outline: none;
}

.video-lightbox-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: min(560px, 100%);
    color: var(--ddb-text-on-dark);
    background: var(--ddb-viewer-btn-danger);
    padding: 14px 18px;
    border-radius: 6px;
    font-size: 0.95rem;
    text-align: center;
}

.video-lightbox-error-text {
    margin: 0;
}

.video-lightbox-error i {
    margin-right: 6px;
}

.video-lightbox-error-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
}

.video-lightbox-error-button {
    color: var(--ddb-text-on-dark);
    background: rgba(var(--ddb-shade-rgb), 0.35);
    border: 1px solid rgba(var(--ddb-glass-rgb), 0.5);
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    text-decoration: none;
}

.video-lightbox-error-button:hover:not(:disabled) {
    background: rgba(var(--ddb-shade-rgb), 0.55);
}

.video-lightbox-error-button:disabled {
    opacity: 0.6;
    cursor: default;
}
</style>
