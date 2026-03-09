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

                    <div v-if="buildState && shouldShowBuildBadge" class="build-status" :class="buildBadgeClass">
                        <i class="icon" :class="buildBadgeIcon"></i>
                        <span>{{ buildState.currentState }}</span>
                    </div>
                </div>
            </div>

            <!-- Properties section -->
            <div class="properties-section text-selectable">
                <h4 class="ui dividing header">Properties</h4>

                <div class="ui relaxed divided list">
                    <div class="item" v-if="!isDirectory">
                        <div class="content">
                            <div class="header">Size</div>
                            <div class="description">{{ getFileSize(file) }}</div>
                        </div>
                    </div>

                    <div class="item">
                        <div class="content">
                            <div class="header">Type</div>
                            <div class="description">{{ getFileType(file) }}</div>
                        </div>
                    </div>

                    <div class="item" v-if="file.entry.mtime">
                        <div class="content">
                            <div class="header">Modified</div>
                            <div class="description">{{ getModifiedDate(file) }}</div>
                        </div>
                    </div>

                    <div class="item">
                        <div class="content">
                            <div class="header">Path</div>
                            <div class="description path-text">{{ file.entry.path }}</div>
                        </div>
                    </div>

                    <!-- Additional metadata -->
                    <div class="item" v-if="file.entry.hash">
                        <div class="content">
                            <div class="header">Hash</div>
                            <div class="description hash-text">{{ file.entry.hash }}</div>
                        </div>
                    </div>

                    <div class="item" v-if="file.entry && file.entry.point_geom && file.entry.point_geom.geometry && file.entry.point_geom.geometry.coordinates">
                        <div class="content">
                            <div class="header">Coordinates</div>
                            <div class="description hash-text"><div v-if="file.entry.point_geom.crs && file.entry.point_geom.crs.properties && file.entry.point_geom.crs.properties.name">{{ file.entry.point_geom.crs.properties.name }}</div>{{ file.entry.point_geom.geometry.coordinates[0] }}, {{ file.entry.point_geom.geometry.coordinates[1] }}<span v-if="file.entry.point_geom.geometry.coordinates[2] !== undefined">, {{ file.entry.point_geom.geometry.coordinates[2].toFixed(2) }}m</span></div>
                        </div>
                    </div>

                    <div class="item" v-if="file.entry.properties && file.entry.properties.meta">
                        <div class="content">
                            <div class="header">Metadata</div>
                            <div class="metadata-list">
                                <div v-for="(value, key) in file.entry.properties.meta" :key="key" class="metadata-item">
                                    <strong>{{ formatMetaKey(key) }}:</strong> {{ formatMetaValue(value) }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Extended Properties -->
                <div v-if="extendedProperties && Object.keys(extendedProperties).length > 0" class="extended-properties">
                    <h5 class="ui dividing header">Extended Properties</h5>
                    <ObjTable :obj="extendedProperties" />
                </div>
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
import BuildManager from '../libs/buildManager';
import ddb from 'ddb';
import ObjTable from './ObjTable.vue';
import Button from 'primevue/button';
import Message from 'primevue/message';

export default {
    components: { ObjTable, Button, Message },
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
            error: null
        }
    },
    computed: {
        isDirectory() {
            return this.file && ddb.entry.isDirectory(this.file.entry);
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
        shouldShowBuildBadge() {
            if (!this.buildState) return false;
            const state = this.buildState.currentState;
            return state === 'Failed' || state === 'Processing';
        },
        buildBadgeClass() {
            if (!this.buildState) return '';
            const state = this.buildState.currentState;
            switch (state) {
                case 'Failed':
                    return 'error';
                case 'Processing':
                    return 'processing';
                default:
                    return '';
            }
        },
        buildBadgeIcon() {
            if (!this.buildState) return '';
            const state = this.buildState.currentState;
            switch (state) {
                case 'Failed':
                    return 'fa-solid fa-xmark fa-circle';
                case 'Processing':
                    return 'fa-solid fa-circle-notch fa-spin';
                default:
                    return '';
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
                    this.thumbnail = await thumbs.fetch(this.file.path);
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
                await BuildManager.startBuild(this.dataset, this.file.entry.path, true);
                this.buildLoading = true;
                this.$emit('buildStarted', this.file);
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

.properties-section {
    margin-bottom: 1.5rem;
}

.ui.list .item .content .header {
    font-weight: bold;
    margin-bottom: 0.25rem;
}

.ui.list .item .content .description {
    color: var(--ddb-text-secondary);
    word-break: break-all;
}

.path-text,
.hash-text {
    font-family: monospace;
    font-size: var(--ddb-font-size-base);
}

.metadata-list {
    margin-top: 0.5rem;
}

.metadata-item {
    padding: var(--ddb-spacing-xs) 0;
    font-size: var(--ddb-font-size-base);
}

.metadata-item strong {
    font-weight: bold;
    margin-right: 0.5rem;
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

.extended-properties {
    margin-top: var(--ddb-spacing-lg);
}

.extended-properties h5.ui.header {
    margin-bottom: var(--ddb-spacing-sm);
}

.extended-properties :deep(.ui.table) {
    font-size: var(--ddb-font-size-sm);
}

.extended-properties :deep(.ui.table td) {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
}
</style>
