<template>
    <div class="pdf-viewer-wrapper">
        <Window :title="windowTitle" id="pdfViewerDialog" @onClose="close" modal width="85%" height="90%">
            <div class="pdf-viewer-dialog">
                <div class="toolbar">
                    <div class="file-info">
                        <i class="icon file pdf outline"></i>
                        <span class="filename">{{ fileName }}</span>
                    </div>
                    <div class="actions">
                        <button @click="openInNewTab" class="ui mini basic button" title="Open in new tab">
                            <i class="icon external alternate"></i> Open in new tab
                        </button>
                        <button @click="downloadFile" class="ui mini basic button" title="Download">
                            <i class="icon download"></i> Download
                        </button>
                    </div>
                </div>
                <div class="pdf-container">
                    <iframe
                        ref="pdfFrame"
                        :src="pdfUrl"
                        frameborder="0"
                        class="pdf-iframe"
                    ></iframe>
                </div>
            </div>
        </Window>
    </div>
</template>

<script>
import Window from './Window.vue';
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
    beforeDestroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
    },
    methods: {
        close() {
            this.$emit('close');
        },
        handleKeyDown(e) {
            if (e.key === 'Escape') {
                this.close();
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

.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f9f9f9;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0;
}

.file-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.file-info .filename {
    font-weight: 500;
}

.actions {
    display: flex;
    gap: 8px;
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
