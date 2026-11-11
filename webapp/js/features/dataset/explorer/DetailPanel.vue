<template>
    <!-- Several items selected: the summary of the selection, not the properties of one file (FR-EXP-32) -->
    <div v-if="multiple" class="detail-panel" role="region" aria-label="Selection">
        <div class="detail-header">
            <h3 class="ui header">
                <i class="icon fa-regular fa-square-check" aria-hidden="true" />
                <div class="content">
                    {{ summary.summary }}
                </div>
            </h3>
            <Button severity="secondary" outlined title="Close" aria-label="Close" icon="fa-solid fa-xmark" @click="handleClose" />
        </div>
        <div ref="detailContent" class="detail-content selection-summary">
            <p v-if="summary.hasFolder" class="selection-note">The size does not count what is inside the folders.</p>
            <p class="selection-types">{{ summary.typesText }}</p>
            <ul class="selection-names text-selectable">
                <li v-for="name in summary.names" :key="name">{{ name }}</li>
                <li v-if="summary.more">and {{ summary.more }} more</li>
            </ul>
            <div class="actions-section">
                <div class="action-buttons">
                    <Button v-for="a in selectionActions" :key="a.id" :severity="a.danger ? 'danger' : 'secondary'" :outlined="a.danger"
                            :icon="a.icon" :label="a.label" :disabled="!a.enabled" :title="a.disabledReason || undefined" @click="a.run()" />
                </div>
            </div>
        </div>
    </div>
    <div v-else-if="file" class="detail-panel" role="region" aria-label="File details">
        <div class="detail-header">
            <h3 class="ui header">
                <i class="icon" :class="file.icon" />
                <div class="content">
                    {{ file.label }}
                </div>
            </h3>
            <Button severity="secondary" outlined title="Close" aria-label="Close" icon="fa-solid fa-xmark" @click="handleClose" />
        </div>

        <div ref="detailContent" class="detail-content">
            <!-- Thumbnail section -->
            <div v-if="hasThumbnailSupport" class="thumbnail-section">
                <div ref="thumbnailContainer" class="thumbnail-container">
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
                    <Button severity="secondary" :icon="openAction.icon" :label="openAction.label" @click="handleOpen" />
                    <Button v-if="!isDirectory" severity="secondary" icon="fa-solid fa-share-nodes" label="Share/Embed" @click="handleShare" />
                    <Button v-if="isBuildableFile && !hasActiveBuild" severity="secondary"
                            icon="fa-solid fa-gear" label="Build" @click="handleBuild" />
                    <Button v-if="isGeoraster" severity="secondary" icon="fa-solid fa-table-columns" label="Compare to..."
                            title="Compare this georaster with others of the dataset" @click="handleCompareTo" />
                </div>
            </div>

            <!-- Saved views that show this file -->
            <div v-if="usedInViews.length" class="views-section">
                <h4>Used in views</h4>
                <ul>
                    <li v-for="v in usedInViews" :key="v.uid">
                        <a :href="viewUrl(v)" target="_blank" rel="noopener">
                            <i class="fa-regular fa-map" aria-hidden="true" /> {{ v.name }}
                        </a>
                    </li>
                </ul>
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
import { thumbnailRequestSize } from '@/libs/thumbnailQueue';
import BuildManager from '@/libs/build/buildManager';
import { isBuildableType, hasThumbnail } from '@/libs/entryTypeCapabilities';
import { isGeoraster as isGeorasterEntry } from '@/libs/entryTypes';
import { openPresentation, resolveAction } from '@/libs/dataset/explorerActions';
import { describeSelection } from '@/libs/dataset/selection';
import { isFileBuilt } from '@/libs/build/buildHelpers';
import { describeEntryPendingBuild } from '@/libs/build/pendingBuild';
import { shownBuildStatus } from '@/libs/build/entryBuild';
import ddb from 'ddb';
import PropsTable from '@/features/dataset/explorer/PropsTable.vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { buildAllProperties, buildCopyableValues, buildRowNotes, isDirectory, getFileTypeName, getFileSizeDisplay, formatModifiedDate } from '@/libs/propertiesUtils';
import { usePreference } from '@/composables/usePreference';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { savedViewUrl, fileViewUrl, openInNewTab } from '@/libs/views/viewLinks';
import { viewsUsing } from '@/libs/views/viewStore';

// The preview box is as wide as the panel, and as high as 18.75rem at most (css); a box that is not measured
// yet (the panel is not on the page) is taken as 400 CSS px wide
const PREVIEW_FALLBACK_CSS_PX = 400;
const PREVIEW_MAX_HEIGHT_CSS_PX = 300;

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
        },
        // The dataset's saved views (libs/views/viewStore listViews)
        views: {
            type: Array,
            default: () => []
        },
        // The items selected now (listing.selected): with several, the panel summarizes them
        selection: {
            type: Array,
            default: () => []
        },
        canWrite: {
            type: Boolean,
            default: false
        }
    },
    emits: ['close', 'open', 'share', 'buildStarted', 'buildError', 'downloadItems', 'deleteSelecteditems'],
    setup() {
        // Lengths, speeds and areas follow the measurement units preference as it changes
        return { measureUnit: usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]) };
    },
    data: function () {
        return {
            thumbnail: null,
            // The size the shown thumbnail was requested at (the long side, px)
            thumbnailSize: 0,
            loading: false,
            buildState: null,
            buildLoading: false,
            error: null
        }
    },
    computed: {
        multiple() {
            return this.selection.length > 1;
        },
        summary() {
            return describeSelection(this.selection);
        },
        // The registry's Download and Delete, as the panel shows them for the selection
        selectionActions() {
            const ctx = {
                getSelectedEntries: () => this.selection,
                canWrite: this.canWrite,
                emit: (event, ...args) => this.$emit(event, ...args)
            };
            return ['download', 'delete'].map(id => resolveAction(id, ctx, 'panel')).filter(a => a.visible);
        },
        // Open says where the file opens, as the toolbar's Open does (the viewer table)
        openAction() {
            return openPresentation(this.file);
        },
        isGeoraster() {
            return !!this.dataset && !!this.file && isGeorasterEntry(this.file.entry);
        },
        usedInViews() {
            return this.isGeoraster ? viewsUsing(this.views, this.file.entry.path) : [];
        },
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
        // A job that succeeded can leave a build on hold: the entry's reason wins over the job's state
        buildBadgeLabel() {
            if (this.effectiveBuildStatus === 'pending') return this.pendingBuild.label;
            if (this.buildState) return this.buildState.currentState;
            switch (this.effectiveBuildStatus) {
                case 'queued':
                    return 'Queued';
                case 'failed':
                    return 'Failed';
                default:
                    return '';
            }
        },
        pendingBuild() {
            return describeEntryPendingBuild(this.file && this.file.entry);
        },
        // Human-readable explanation of the current build status, shown below the
        // thumbnail so the user understands why the file isn't ready yet.
        buildExplanation() {
            if (!this.isBuildableFile) return null;

            switch (this.effectiveBuildStatus) {
                case 'pending':
                    return { severity: 'warn', text: this.pendingBuild.text };
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
                // Another file starts at the top: the scroll position of the one before would show its preview cropped (FR-EXP-34)
                this.scrollToTop();
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
        this.observePreviewBox();
    },
    updated() {
        // The box exists once a file is selected, and is another element when the panel changes its root
        this.observePreviewBox();
    },
    beforeUnmount() {
        this.cleanupBuildListeners();
        this._boxObserver?.disconnect();
    },
    methods: {
        // The content scrolls inside the panel (.detail-content); a panel that has no content yet has nothing to reset
        scrollToTop() {
            const reset = () => { if (this.$refs.detailContent) this.$refs.detailContent.scrollTop = 0; };
            reset();
            // The element of the new file is rendered after this change: the same reset once it is there
            this.$nextTick(reset);
        },

        // The size to request for the preview: the box's width times the pixel ratio, in the steps of
        // FR-XC-32 (a bitmap of the box's CSS size is soft on a 2x screen, FR-EXP-41)
        previewRequestSize() {
            const box = this.$refs.thumbnailContainer;
            const width = box ? box.clientWidth : 0;
            return thumbnailRequestSize(Math.max(width > 0 ? width : PREVIEW_FALLBACK_CSS_PX, PREVIEW_MAX_HEIGHT_CSS_PX));
        },

        // The panel can be dragged wider (or the window resized) after the preview came: a box that needs
        // a larger step loads that one (a smaller box keeps the bitmap it has)
        observePreviewBox() {
            const box = this.$refs.thumbnailContainer || null;
            if (box === this._observedBox) return;
            this._boxObserver?.disconnect();
            this._boxObserver = null;
            this._observedBox = box;
            if (!box || typeof ResizeObserver === 'undefined') return;
            this._boxObserver = new ResizeObserver(() => this.onPreviewBoxResize());
            this._boxObserver.observe(box);
        },

        onPreviewBoxResize() {
            if (!this.thumbnail || this.loading || !this.file || !hasThumbnail(this.file.entry.type)) return;
            const size = this.previewRequestSize();
            if (size <= this.thumbnailSize) return;
            this.thumbnailSize = size;
            this.thumbnail = thumbs.fetch(this.file.path, size, this.file.entry.hash);
        },

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
            this.thumbnailSize = 0;
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
                    // The box is on the page after a render: measure it, not the fallback
                    if (!this.$refs.thumbnailContainer) await this.$nextTick();
                    const size = this.previewRequestSize();
                    this.thumbnail = await thumbs.fetch(this.file.path, size, this.file.entry.hash);
                    this.thumbnailSize = size;
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

        handleCompareTo() {
            openInNewTab(fileViewUrl(this.dataset, this.file.entry.path, { pick: true }));
        },
        viewUrl(view) {
            return savedViewUrl(this.dataset, view.uid);
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
    min-width: 0;
    overflow-x: hidden;
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
    color: var(--ddb-text-on-color);
    font-weight: bold;
    display: flex;
    gap: var(--ddb-spacing-sm);
}

.build-status.error {
    background-color: var(--ddb-danger);
}

/* Work that runs or waits its turn is the brand blue; a build that waits for files the user
   must add is the warning yellow, with dark text */
.build-status.processing,
.build-status.queued {
    background-color: var(--ddb-primary);
}

.build-status.pending {
    background-color: var(--ddb-warning);
    color: var(--ddb-text-on-warning);
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

.views-section {
    margin-bottom: 1rem;

    h4 {
        font-size: var(--ddb-font-size-base);
        margin: 0 0 0.35rem;
    }

    ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    li {
        padding: 0.15rem 0;
        overflow-wrap: anywhere;
    }
}

.selection-summary {
    padding: var(--ddb-spacing-lg);
}

.selection-note {
    color: var(--ddb-text-muted);
    font-size: var(--ddb-font-size-sm);
}

.selection-names {
    padding-left: 1.25rem;
    overflow-wrap: anywhere;
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
