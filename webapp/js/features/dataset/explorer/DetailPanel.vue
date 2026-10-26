<template>
    <div v-if="file" class="detail-panel">
        <div class="detail-header">
            <h3 class="ui header">
                <i class="icon" :class="file.icon" />
                <div class="content">
                    {{ file.label }}
                </div>
            </h3>
            <Button severity="secondary" outlined title="Close" aria-label="Close" icon="fa-solid fa-xmark" @click="handleClose" />
        </div>

        <div class="detail-content">
            <!-- Thumbnail section -->
            <div v-if="hasThumbnailSupport" class="thumbnail-section">
                <div class="thumbnail-container">
                    <img v-if="thumbnail && !loading && !buildLoading"
                         :src="thumbnail" alt="Preview"
                         class="detail-thumbnail"
                         @error="handleImageError">

                    <i v-else-if="file.icon && !loading && !buildLoading"
                       class="icon massive"
                       :class="file.icon" />

                    <i v-if="buildLoading || loading" class="fa-solid fa-circle-notch fa-spin loading massive" />

                    <div v-if="shouldShowBuildBadge" class="build-status" :class="buildBadgeClass">
                        <i class="icon" :class="buildBadgeIcon" />
                        <span>{{ buildBadgeLabel }}</span>
                    </div>
                </div>
            </div>

            <!-- Build status explanation (queued/pending/failed) -->
            <div v-if="buildExplanation" class="build-explanation-section">
                <Message :severity="buildExplanation.severity" :closable="false">
                    {{ buildExplanation.text }}
                </Message>
            </div>

            <!-- Properties section -->
            <div class="properties-section text-selectable">
                <PropsTable v-if="allProperties" :obj="allProperties" :preserve-order="true" :copyable-values="copyableValues"
                            :row-notes="rowNotes" :entry-type="file.entry.type" />
            </div>

            <!-- Actions section -->
            <div class="actions-section">
                <div class="action-buttons">
                    <Button severity="secondary" icon="fa-regular fa-folder-open" label="Open" @click="handleOpen" />
                    <Button v-if="!isDirectory" severity="secondary" icon="fa-solid fa-share-nodes" label="Share/Embed" @click="handleShare" />
                    <Button v-if="isBuildableFile && !hasActiveBuild" severity="secondary"
                            icon="fa-solid fa-gear" label="Build" @click="handleBuild" />
                </div>
            </div>
        </div>
    </div>
    <div v-else class="detail-panel-empty">
        <Message severity="info" :closable="false" icon="fa-solid fa-circle-info">
            <strong>No Selection</strong><br>
            Select an item to view its details
        </Message>
    </div>
</template>

<script>
import { thumbs } from 'ddb';
import BuildManager from '@/libs/build/buildManager';
import { isBuildableType, hasThumbnail } from '@/libs/entryTypeCapabilities';
import { isFileBuilt, formatMissingDeps } from '@/libs/build/buildHelpers';
import { shownBuildStatus } from '@/libs/build/entryBuild';
import ddb from 'ddb';
import PropsTable from '@/features/dataset/explorer/PropsTable.vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { buildAllProperties, buildCopyableValues, buildRowNotes, isDirectory, getFileTypeName, getFileSizeDisplay, formatModifiedDate } from '@/libs/propertiesUtils';
import { usePreference } from '@/composables/usePreference';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';

export default {
    components: { PropsTable, Button, Message },
    // The page asks before rebuilding (useDatasetActions.confirmBuild)
    inject: { showBuildConfirm: { default: null } },
    props: {
        file: {
            type: Object,
            required: false,
            default: null
        },
        dataset: {
            type: Object,
            default: null
        }
    },
    emits: ['close', 'open', 'share', 'buildStarted', 'buildError'],
    setup() {
        // Lengths, speeds and areas follow the measurement units preference as it changes
        return { measureUnit: usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]) };
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
            return this.file && isDirectory(this.file.entry);
        },
        hasThumbnailSupport() {
            if (!this.file || this.isDirectory) return false;
            return hasThumbnail(this.file.entry.type);
        },
        isBuildableFile() {
            if (!this.file || !this.dataset) return false;
            return isBuildableType(this.file.entry.type);
        },
        hasActiveBuild() {
            if (!this.file || !this.dataset) return false;
            return BuildManager.hasActiveBuild(this.dataset, this.file.entry.path);
        },
        // Effective badge status: the job gives progress and failure, the entry says whether the
        // build exists. "ready" (built) is the default and never produces a badge - only
        // queued/processing/pending/failed do.
        effectiveBuildStatus() {
            if (this.buildState && this.buildState.currentState === 'Processing') return 'processing';
            return shownBuildStatus(this.buildState, this.file && this.file.entry);
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
        allProperties() {
            if (!this.file) return null;
            return buildAllProperties(this.file, this.measureUnit);
        },
        copyableValues() {
            return buildCopyableValues(this.file);
        },
        rowNotes() {
            return buildRowNotes(this.file);
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
            if (this.dataset && isBuildableType(this.file.entry.type)) {
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
                if (hasThumbnail(this.file.entry.type)) {
                    this.thumbnail = await thumbs.fetch(this.file.path, 512, this.file.entry.hash);
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
            return getFileTypeName(file.entry.type);
        },

        getFileSize(file) {
            return getFileSizeDisplay(file.entry);
        },

        getModifiedDate(file) {
            return formatModifiedDate(file.entry.mtime);
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
                if (await isFileBuilt(this.dataset, this.file) && this.showBuildConfirm) this.showBuildConfirm(this.file, () => this.startBuild());
                else await this.startBuild();
            } catch (error) {
                this.$emit('buildError', { file: this.file, error: error.message });
            }
        },

        async startBuild() {
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
    background-color: var(--ddb-build-pending);
}

.build-explanation-section {
    margin-bottom: 1.5rem;
}

.properties-section {
    margin-bottom: 1.5rem;
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

</style>
