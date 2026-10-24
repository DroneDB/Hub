<template>
    <div class="pdf-viewer-wrapper">
        <Window id="pdfViewerDialog" :title="windowTitle" modal width="85%" height="90%" @close="$emit('close')">
            <div class="pdf-viewer-dialog">
                <div class="pdf-container">
                    <iframe
                        ref="pdfFrame"
                        :src="pdfUrl"
                        :title="windowTitle"
                        frameborder="0"
                        class="pdf-iframe"
                    />
                </div>
            </div>
        </Window>
    </div>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import ddb from 'ddb';
const { pathutils } = ddb;

export default {
    components: {
        Window
    },
    props: {
        dataset: {
            type: Object,
            required: true
        },
        entry: {
            type: Object,
            required: true
        }
    },
    emits: ['close'],
    computed: {
        fileName() {
            return pathutils.basename(this.entry.path);
        },
        windowTitle() {
            return this.fileName;
        },
        pdfUrl() {
            return this.dataset.downloadUrl(this.entry.path, { inline: true });
        },
        downloadLink() {
            return this.dataset.downloadUrl(this.entry.path);
        }
    },
    mounted() {
        document.addEventListener('keydown', this.handleKeyDown);
    },
    beforeUnmount() {
        document.removeEventListener('keydown', this.handleKeyDown);
    },
    methods: {
        handleKeyDown(e) {
            if (e.key === 'Escape') {
                this.$emit('close');
            }
        },
        openInNewTab() {
            window.open(this.pdfUrl, '_blank');
        },
        downloadFile() {
            window.open(this.downloadLink, '_blank');
        }
    }
};
</script>

<style scoped>
.pdf-viewer-dialog {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.pdf-container {
    flex: 1;
    overflow: hidden;
}

.pdf-iframe {
    width: 100%;
    height: 100%;
    border: none;
}
</style>
