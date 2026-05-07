<template>
    <Teleport to="body">
        <div v-if="visible" class="video-lightbox-overlay" @click.self="close" @keydown.esc="close" tabindex="-1"
            ref="overlay">
            <div class="video-lightbox-toolbar">
                <div class="video-lightbox-name" v-if="entry">{{ entryName }}</div>
                <div class="video-lightbox-actions">
                    <a class="video-lightbox-action" :href="src" target="_blank" rel="noopener" title="Open in new tab">
                        <i class="fa-solid fa-up-right-from-square"></i>
                    </a>
                    <div class="video-lightbox-action" @click="close" title="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>
            <div class="video-lightbox-content" @click.self="close">
                <video ref="videoEl" :src="src" controls preload="metadata" class="video-lightbox-player"
                    @error="handleError"></video>
                <div v-if="error" class="video-lightbox-error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Could not play video. Your browser may not support this format.
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script>
import ddb from 'ddb';

const { pathutils } = ddb;

export default {
    name: 'VideoLightbox',
    emits: ['close'],
    props: {
        visible: { type: Boolean, default: false },
        src: { type: String, default: '' },
        entry: { type: Object, default: null }
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
        visible(v) {
            this.error = false;
            if (v) {
                this.$nextTick(() => {
                    if (this.$refs.overlay) this.$refs.overlay.focus();
                });
            } else {
                if (this.$refs.videoEl) {
                    try { this.$refs.videoEl.pause(); } catch (_) { /* noop */ }
                }
            }
        }
    },
    mounted() {
        document.addEventListener('keydown', this.onKey);
    },
    beforeUnmount() {
        document.removeEventListener('keydown', this.onKey);
    },
    methods: {
        close() {
            this.$emit('close');
        },
        handleError() {
            this.error = true;
        },
        onKey(e) {
            if (this.visible && e.key === 'Escape') this.close();
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
    color: #fff;
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
    color: #fff;
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
    color: #fff;
    background: rgba(180, 30, 30, 0.85);
    padding: 12px 18px;
    border-radius: 6px;
    font-size: 0.95rem;
}

.video-lightbox-error i {
    margin-right: 8px;
}
</style>
