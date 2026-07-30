<template>
    <div class="detail-panel" v-if="file">
        <div class="detail-header">
            <h3 class="ui header">
                <i class="icon" :class="file.icon"></i>
                <div class="content">
                    {{ file.label }}
                </div>
            </h3>
            <Button severity="secondary" outlined @click="handleClose" title="Close" icon="fa-solid fa-xmark" />
        </div>

        <div class="detail-content">
            <!-- Thumbnail section -->
            <div class="thumbnail-section" v-if="hasThumbnailSupport">
                <div class="thumbnail-container">
                    <img v-if="thumbnail && !loading && !buildLoading"
                        @error="handleImageError"
                        :src="thumbnail"
                        class="detail-thumbnail" />

                    <i v-else-if="file.icon && !loading && !buildLoading"
                        class="icon massive"
                        :class="file.icon" />

                    <i class="fa-solid fa-circle-notch fa-spin loading massive" v-if="buildLoading || loading" />

                    <div v-if="shouldShowBuildBadge" class="build-status" :class="buildBadgeClass">
                        <i class="icon" :class="buildBadgeIcon"></i>
                        <span>{{ buildBadgeLabel }}</span>
                    </div>
                </div>
            </div>

            <!-- Build status explanation (queued/pending/failed) -->
            <div class="build-explanation-section" v-if="buildExplanation">
                <Message :severity="buildExplanation.severity" :closable="false">
                    {{ buildExplanation.text }}
                </Message>
            </div>

            <!-- Properties section -->
            <div class="properties-section text-selectable">
                <h4 class="ui dividing header">Properties</h4>
                <PropsTable v-if="allProperties" :obj="allProperties" :preserveOrder="true" :copyableValues="copyableValues" />
            </div>

            <!-- Actions section -->
            <div class="actions-section">
                <h4 class="ui dividing header">Actions</h4>
                <div class="action-buttons">
                    <Button severity="secondary" @click="handleOpen" icon="fa-regular fa-folder-open" label="Open" />
                    <Button severity="secondary" @click="handleShare" v-if="!isDirectory" icon="fa-solid fa-share-nodes" label="Share/Embed" />
                    <Button severity="secondary" @click="handleBuild"
                        v-if="isBuildableFile && !hasActiveBuild" icon="fa-solid fa-gear" label="Build" />
                </div>
            </div>
        </div>
        <BuildConfirmDialog v-if="buildConfirmDialogOpen"
            @confirm="handleBuildConfirmOk"
            @cancel="buildConfirmDialogOpen = false" />
    </div>
    <div class="detail-panel-empty" v-else>
        <Message severity="info" :closable="false" icon="fa-solid fa-circle-info">
            <strong>No Selection</strong><br />
            Select an item to view its details
        </Message>
    </div>
</template>

<script>
import { thumbs } from 'ddb';
import BuildManager from '@/libs/build/buildManager';
import { isFileBuilt, formatMissingDeps } from '@/libs/build/buildHelpers';
import ddb from 'ddb';
import PropsTable from '@/components/PropsTable.vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { buildAllProperties, isDirectory } from '@/libs/propertiesUtils';
import BuildConfirmDialog from '@/features/dataset/dialogs/BuildConfirmDialog.vue';

export default {
    components: { PropsTable, Button, Message, BuildConfirmDialog },
    emits: ['close', 'open', 'share', 'buildStarted', 'buildError'],
    props: {
        file: {
            type: Object,
            required: false,
            default: null
        },
        dataset: {
            type: Object,
            required: false
        }
    },
    data: function () {
        return {
            thumbnail: null,
            loading: false,
            buildState: null,
            buildLoading: false,
            error: null,
            buildConfirmDialogOpen: false
        }
    },
    computed: {
        isDirectory() {
            return this.file && isDirectory(this.file.entry);
        },
        hasThumbnailSupport() {
            if (!this.file || this.isDirectory) return false;
            return thumbs.supportedForType(this.file.entry.type);
        },
        isBuildableFile() {
            if (!this.file || !this.dataset) return false;
            return BuildManager.isBuildableType(this.file.entry.type);
        },
        hasActiveBuild() {
            if (!this.file || !this.dataset) return false;
            return BuildManager.hasActiveBuild(this.dataset, this.file.entry.path);
        },
        // Effective badge status: the live Hangfire state (once a job exists) takes
        // priority over the static list-API status. "ready" (built) is the default
        // and never produces a badge - only queued/processing/pending/failed do.
        effectiveBuildStatus() {
            if (this.buildState) {
                const state = this.buildState.currentState;
                if (state === 'Failed') return 'failed';
                if (state === 'Processing') return 'processing';
                return null;
            }
            const status = this.file && this.file.entry && this.file.entry.buildStatus;
            return status === 'pending' || status === 'queued' || status === 'failed' ? status : null;
        },
        shouldShowBuildBadge() {
            return !!this.effectiveBuildStatus;
        },
        buildBadgeClass() {
            switch (this.effectiveBuildStatus) {
                case 'failed':
                    return 'error';
                case 'processing':
                    return 'processing';
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
                    return 'fa-solid fa-xmark fa-circle';
                case 'processing':
                    return 'fa-solid fa-circle-notch fa-spin';
                case 'pending':
                    return 'fa-solid fa-triangle-exclamation';
                case 'queued':
                    return 'fa-solid fa-clock';
                default:
                    return '';
            }
        },
        buildBadgeLabel() {
            if (this.buildState) return this.buildState.currentState;
            switch (this.effectiveBuildStatus) {
                case 'pending':
                    return 'On Hold';
                case 'queued':
                    return 'Queued';
                case 'failed':
                    return 'Failed';
                default:
                    return '';
            }
        },
        // Human-readable explanation of the current build status, shown below the
        // thumbnail so the user understands why the file isn't ready yet.
        buildExplanation() {
            if (!this.isBuildableFile) return null;

            switch (this.effectiveBuildStatus) {
                case 'pending': {
                    const deps = this.file.entry.buildMissingDependencies;
                    return {
                        severity: 'warn',
                        text: `Processing is on hold - waiting for: ${formatMissingDeps(deps)}.`
                    };
                }
                case 'queued':
                    return { severity: 'info', text: 'This file is queued for processing.' };
                default:
                    return null;
            }
        },
        extendedProperties() {
            if (!this.file || !this.file.entry || !this.file.entry.properties) return null;
            const props = this.file.entry.properties;
            // Exclude meta and permissions (already shown or internal)
            const excluded = ['meta', 'permissions'];
            const filtered = {};
            for (const key in props) {
                if (!excluded.includes(key)) {
                    filtered[key] = props[key];
                }
            }
            return Object.keys(filtered).length > 0 ? filtered : null;
        },
        allProperties() {
            if (!this.file) return null;
            return buildAllProperties(this.file);
        },
        copyableValues() {
            if (!this.file || !this.file.entry || !this.file.entry.hash) return {};
            return { size: this.file.entry.hash };
        }
    },
    watch: {
        file: {
            immediate: true,
            handler(newFile) {
                if (newFile) {
                    this.loadDetails();
                } else {
                    this.resetDetails();
                }
            }
        }
    },
    mounted() {
        if (this.dataset && this.file) {
            this.setupBuildListeners();
        }
    },
    beforeUnmount() {
        this.cleanupBuildListeners();
    },
    methods: {
        async loadDetails() {
            this.resetDetails();

            if (!this.file) return;

            // Check for builds if applicable
            if (this.dataset && BuildManager.isBuildableType(this.file.entry.type)) {
                const buildState = BuildManager.getBuildState(this.dataset, this.file.entry.path);
                if (buildState) {
                    this.buildState = buildState;
                    const activeStates = ['Processing', 'Enqueued', 'Scheduled', 'Awaiting', 'Created'];
                    if (activeStates.includes(buildState.currentState)) {
                        this.buildLoading = true;
                    }
                }
            }

            // Load thumbnail
            if (!ddb.entry.isDirectory(this.file.entry)) {
                await this.loadThumbnail();
            }
        },

        resetDetails() {
            this.thumbnail = null;
            this.loading = false;
            this.buildState = null;
            this.buildLoading = false;
            this.error = null;
        },

        async loadThumbnail() {
            if (this.loading) return;

            this.loading = true;

            try {
                if (thumbs.supportedForType(this.file.entry.type)) {
                    this.thumbnail = await thumbs.fetch(this.file.path, 512);
                    this.buildLoading = false;
                }
            } catch (e) {
                console.warn('Failed to load thumbnail:', e);
                this.error = e.message;
            } finally {
                this.loading = false;
            }
        },

        handleImageError(e) {
            console.warn('Image error:', e);
            this.error = 'Failed to load thumbnail';
        },

        getFileType(file) {
            const typeMap = {
                [ddb.entry.type.DIRECTORY]: 'Folder',
                [ddb.entry.type.GENERIC]: 'File',
                [ddb.entry.type.GEOIMAGE]: 'GeoImage',
                [ddb.entry.type.GEORASTER]: 'GeoRaster',
                [ddb.entry.type.POINTCLOUD]: 'Point Cloud',
                [ddb.entry.type.IMAGE]: 'Image',
                [ddb.entry.type.DRONEDB]: 'DroneDB',
                [ddb.entry.type.MARKDOWN]: 'Markdown',
                [ddb.entry.type.VIDEO]: 'Video',
                [ddb.entry.type.MODEL]: '3D Model',
                [ddb.entry.type.PANORAMA]: 'Panorama',
                [ddb.entry.type.GEOPANORAMA]: 'GeoPanorama'
            };
            return typeMap[file.entry.type] || 'Unknown';
        },

        getFileSize(file) {
            if (ddb.entry.isDirectory(file.entry)) return '--';
            if (!file.entry.size) return '--';

            const bytes = file.entry.size;
            if (bytes === 0) return '0 B';

            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));

            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        getModifiedDate(file) {
            if (!file.entry.mtime) return '--';

            const date = new Date(file.entry.mtime * 1000);
            return date.toLocaleString();
        },

        formatMetaKey(key) {
            return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        },

        formatMetaValue(value) {
            if (typeof value === 'object' && value !== null) {
                if (value.data !== undefined) return value.data;
                return JSON.stringify(value);
            }
            return value;
        },

        handleClose() {
            this.$emit('close');
        },

        handleOpen() {
            this.$emit('open', this.file);
        },

        handleShare() {
            this.$emit('share', this.file);
        },

        async handleBuild() {
            if (!this.dataset || !this.file) return;

            try {
                if (await isFileBuilt(this.dataset, this.file)) {
                    this.buildConfirmDialogOpen = true;
                } else {
                    await BuildManager.startBuild(this.dataset, this.file.entry.path, true);
                    this.buildLoading = true;
                }
            } catch (error) {
                this.$emit('buildError', { file: this.file, error: error.message });
            }
        },

        async handleBuildConfirmOk() {
            this.buildConfirmDialogOpen = false;
            if (!this.dataset || !this.file) return;
            try {
                await BuildManager.startBuild(this.dataset, this.file.entry.path, true);
                this.buildLoading = true;
            } catch (error) {
                this.$emit('buildError', { file: this.file, error: error.message });
            }
        },

        setupBuildListeners() {
            BuildManager.on('buildStateChanged', this.onBuildStateChanged);
            BuildManager.on('buildStarted', this.onBuildStarted);
        },

        cleanupBuildListeners() {
            BuildManager.off('buildStateChanged', this.onBuildStateChanged);
            BuildManager.off('buildStarted', this.onBuildStarted);
        },

        onBuildStateChanged(data) {
            if (this.file && data.dataset === this.dataset && data.filePath === this.file.entry.path) {
                this.buildState = data.buildInfo;
                this.buildLoading = false;

                if (data.newState === 'Succeeded') {
                    this.thumbnail = null;
                    this.error = null;
                    this.loadThumbnail();
                }
            }
        },

        onBuildStarted(data) {
            if (this.file && data.dataset === this.dataset && data.filePath === this.file.entry.path) {
                this.buildLoading = true;
                this.error = null;
                this.thumbnail = null;
            }
        }
    }
}
</script>

<style scoped>
.detail-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--ddb-bg-surface);
}

.detail-header {
    padding: var(--ddb-spacing-lg);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border-medium);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.detail-header h3.ui.header {
    margin: 0;
    flex: 1;
    word-break: break-all;
}

.detail-header .ui.button {
    margin-left: 0.5rem;
}

.detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
}

.thumbnail-section {
    margin-bottom: 1.5rem;
}

.thumbnail-container {
    width: 100%;
    min-height: 12.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.detail-thumbnail {
    max-width: 100%;
    max-height: 18.75rem;
    object-fit: contain;
}

.thumbnail-container .icon.massive {
    font-size: var(--ddb-font-size-xl);
    color: var(--ddb-text-muted);
}

.build-status {
    position: absolute;
    top: var(--ddb-spacing-sm);
    right: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-lg);
    border-radius: var(--ddb-radius-sm);
    color: white;
    font-weight: bold;
    display: flex;
    gap: var(--ddb-spacing-sm);
}

.build-status.error {
    background-color: var(--ddb-danger);
}

.build-status.processing {
    background-color: var(--ddb-warning);
}

.build-status.queued {
    background-color: var(--ddb-warning);
}

.build-status.pending {
    background-color: #e67e22;
}

.build-explanation-section {
    margin-bottom: 1.5rem;
}

.properties-section {
    margin-bottom: 1.5rem;
}

.properties-section :deep(.ui.table) {
    font-size: var(--ddb-font-size-sm);
}

.properties-section :deep(.ui.table td) {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
}

.actions-section {
    margin-bottom: 1rem;
}

.action-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.detail-panel-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ddb-bg-surface);
    padding: 2rem;
}

.detail-panel-empty .ui.message {
    text-align: center;
}
</style>
