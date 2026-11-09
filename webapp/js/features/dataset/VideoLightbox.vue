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
                <video ref="videoEl" :src="src" controls preload="metadata" class="video-lightbox-player"
                       @error="handleError" />
                <div v-if="error" class="video-lightbox-error">
                    <i class="fa-solid fa-triangle-exclamation" />
                    Could not play video. Your browser may not support this format.
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

const { pathutils } = ddb;

export default {
    name: 'VideoLightbox',
    directives: { focustrap: vFocusTrap },
    props: {
        visible: { type: Boolean, default: false },
        src: { type: String, default: '' },
        entry: { type: Object, default: null }
    },
    emits: ['close'],
    setup(props, { emit }) {
        const overlay = ref(null);
        useOverlay({
            active: () => props.visible,
            container: () => overlay.value,
            onEscape: e => { e.preventDefault(); emit('close'); },
            autoFocus: true
        });
        return { overlay };
    },
    data() {
        return {
            error: false
        };
    },
    computed: {
        entryName() {
            if (!this.entry) return '';
            return pathutils.basename(this.entry.path || '');
        }
    },
    watch: {
        // Immediate: the lightbox is usually mounted already visible
        visible: {
            immediate: true,
            handler(v) {
                this.error = false;
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
        handleError() {
            this.error = true;
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
    background: rgba(0, 0, 0, 0.92);
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
    background: rgba(0, 0, 0, 0.4);
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
    background: rgba(255, 255, 255, 0.15);
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
    background: #000;
    outline: none;
}

.video-lightbox-error {
    position: absolute;
    color: var(--ddb-text-on-dark);
    background: rgba(180, 30, 30, 0.85);
    padding: 12px 18px;
    border-radius: 6px;
    font-size: 0.95rem;
}

.video-lightbox-error i {
    margin-right: 8px;
}
</style>
