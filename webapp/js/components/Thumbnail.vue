<template>
    <div class="thumbnail" :class="{ selected: file.selected }" :title="getTitleText"
        :style="{ 'maxWidth': size + 'px' }" @click="onClick" @contextmenu="onRightClick" @dblclick="onDblClick">
        <div class="container" :class="{ bordered: thumbnail !== null }" :style="sizeStyle">
            <img v-if="!icon" :class="{ hide: thumbnail !== null && (loading || buildLoading) }" @load="imageLoaded"
                @error="handleImageError" :src="thumbnail" />
            <i v-if="icon && !loading && !buildLoading" class="icon icon-file " :class="icon" :style="iconStyle" />

            <!-- Priority: Build loading > Thumbnail loading > Build status badges -->
            <i class="icon circle notch spin loading" v-if="buildLoading" />
            <i class="icon circle notch spin loading" v-else-if="loading || (thumbnail === null && icon === null)" />

            <!-- Build Status Badges - Only show errors -->
            <div v-if="!buildLoading && !loading && buildState && shouldShowBuildBadge" class="build-badge" :class="buildBadgeClass">
                <i class="icon" :class="buildBadgeIcon"></i>
            </div>
        </div>
        {{ label }}
    </div>
</template>

<script>
import { thumbs, pathutils } from 'ddb';
import Mouse from '../libs/mouse';
import Keyboard from '../libs/keyboard';
import BuildManager from '../libs/buildManager';
import ddb from 'ddb';

export default {
    components: {
    },
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
            required: false
        }
    },
    data: function () {
        const label = this.file.label;

        return {
            label,
            thumbnail: null,
            icon: null,
            error: null,
            buildState: null,
            buildLoading: false,
            iconStyle: {
                fontSize: parseInt(this.size / 3) + 'px'
            },
            sizeStyle: {
                width: this.size + 'px',
                height: this.size + 'px'
            },
            loading: false
        }
    },
    computed: {
        getTitleText() {
            if (this.error) return this.error;
            if (this.buildState) {
                return `${this.file.path}\nBuild Status: ${this.buildState.currentState}`;
            }
            return this.file.path;
        },
        shouldShowBuildBadge() {
            if (!this.buildState) return false;
            const state = this.buildState.currentState;
            // Only show badges for errors/failures
            return state === 'Failed';
        },
        buildBadgeClass() {
            if (!this.buildState) return '';

            const state = this.buildState.currentState;
            switch (state) {
                case 'Failed':
                    return 'error';
                default:
                    return '';
            }
        },
        buildBadgeIcon() {
            if (!this.buildState) return '';

            const state = this.buildState.currentState;
            switch (state) {
                case 'Failed':
                    return 'times';
                default:
                    return '';
            }
        }
    },
    mounted: async function () {
        if (!this.lazyLoad) await this.loadThumbnail();

        // Initialize build state if dataset is available
        if (this.dataset) {
            this.updateBuildState();
            this.setupBuildListeners();

            // Trigger automatic polling monitoring for this file if it's buildable
            if (BuildManager.isBuildableType(this.file.entry.type)) {
                BuildManager.onFilesAdded(this.dataset, [this.file.entry]);
            }
        }
    },
    beforeDestroy() {
        this.cleanupBuildListeners();
    },
    methods: {
        imageLoaded: function () {
            this.loading = false;
        },
        getBoundingRect: function () {
            return this.$el.getBoundingClientRect();
        },
        handleImageError: function (e) {
            // Retry
            if (!this.retryNumber) this.retryNumber = 0;
            if (this.retryNumber < 1000 && this.thumbnail.startsWith("/orgs")) {
                if (this.loadTimeout) {
                    clearTimeout(this.loadTimeout);
                    this.loadTimeout = null;
                }
                this.loadTimeout = setTimeout(() => {
                    if (this.retryNumber > 0 && this.thumbnail.endsWith(`&retry=${this.retryNumber}`)) {
                        this.thumbnail = this.thumbnail.replace(new RegExp("&retry=" + this.retryNumber) + "$", `&retry=${this.retryNumber + 1}`);
                    } else {
                        this.thumbnail += "&retry=1";
                    }
                    this.retryNumber += 1;
                }, 5000);
            } else {
                this.showError(new Error("Cannot load thumbnail (retries exceeded)"));
            }
        },
        showError: function (e) {
            console.warn(e);
            this.error = e.message;
            this.icon = "exclamation triangle";
            this.loading = false;
        },
        loadThumbnail: async function (force = false) {
            if (this.loadingThumbnail) return; // Already loading
            if (!force && this.thumbnail && !this.error) return; // Already loaded (unless forced)
            if (!force && this.error) return; // Skip if error (unless forced)

            // Check build state before generating thumbnail
            if (this.dataset && BuildManager.isBuildableType(this.file.entry.type)) {
                const buildState = BuildManager.getBuildState(this.dataset, this.file.entry.path);

                // If there's an active build that hasn't succeeded, don't generate thumbnail
                if (buildState && buildState.currentState !== 'Succeeded') {
                    this.icon = this.file.icon;
                    return;
                }
            }

            this.loadingThumbnail = true;

            try {
                if (thumbs.supportedForType(this.file.entry.type)) {
                    this.loading = true;
                    this.thumbnail = await thumbs.fetch(this.file.path);
                } else {
                    this.icon = this.file.icon;
                }
                this.loadingThumbnail = false;
            } catch (e) {
                this.loadingThumbnail = false;
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

        // Build management methods
        updateBuildState() {
            if (!this.dataset) return;

            this.buildState = BuildManager.getBuildState(this.dataset, this.file.entry.path);
        },

        setupBuildListeners() {
            if (!this.dataset) return;

            // Listen to build state changes
            BuildManager.on('buildStateChanged', this.onBuildStateChanged);
            BuildManager.on('buildStarted', this.onBuildStarted);
            BuildManager.on('newBuildableFilesDetected', this.onNewBuildableFilesDetected);
        },

        cleanupBuildListeners() {
            BuildManager.off('buildStateChanged', this.onBuildStateChanged);
            BuildManager.off('buildStarted', this.onBuildStarted);
            BuildManager.off('newBuildableFilesDetected', this.onNewBuildableFilesDetected);
        },

        onBuildStateChanged(data) {
            if (data.dataset === this.dataset && data.filePath === this.file.entry.path) {
                this.buildState = data.buildInfo;
                this.buildLoading = false;

                // If build succeeded, refresh the thumbnail
                if (data.newState === 'Succeeded') {
                    console.log('Build succeeded for', this.file.entry.path, '- refreshing thumbnail');

                    // Clear existing thumbnail and error state to force refresh
                    this.thumbnail = null;
                    this.error = null;
                    this.icon = null;
                    this.loadingThumbnail = false;

                    // Force load fresh thumbnail
                    this.loadThumbnail(true);
                }
            }
        },

        onBuildStarted(data) {
            if (data.dataset === this.dataset && data.filePath === this.file.entry.path) {
                this.buildLoading = true;
            }
        },

        onNewBuildableFilesDetected(data) {
            if (data.dataset === this.dataset && data.filePaths.includes(this.file.entry.path)) {
                console.log('This file is now being monitored for build changes:', this.file.entry.path);

                // Update build state immediately
                this.updateBuildState();

                // If we don't have a thumbnail and the file might be building, show loading
                if (!this.thumbnail && !this.error && !this.icon) {
                    this.buildLoading = true;
                }
            }
        }
    }
}
</script>

<style scoped>
.thumbnail {
    margin: 2px;
    padding-top: 6px;
    padding-bottom: 6px;
    text-align: center;
    word-break: break-all;
    border-radius: 4px;
    transition: 0.25s background-color ease;
}

.thumbnail:hover {
    background: #eee;
    cursor: pointer;
}

.thumbnail:focus,
.thumbnail:active {
    background: #dadada;
}

.thumbnail.selected {
    background: #ddd;
}

.thumbnail .container {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    position: relative;
    pointer-events: none;
    margin-bottom: 4px;
}

/* .thumbnail .container.bordered - drop shadow removed */

.thumbnail .container img {
    padding-right: 8px;
    padding-left: 8px;
    max-width: 100%;
    max-height: 100%;
}

.thumbnail .container img.hide {
    visibility: hidden;
}

.thumbnail .container i.icon-file {
    display: inline-block;
    margin-top: auto;
}

.thumbnail .icon.badge {
    font-size: 11px;
}

.thumbnail i.icon {
    margin: 0;
}

.thumbnail i.loading {
    position: absolute;
    top: 63%;
    left: 50%;
    margin-left: -10px;
}

/* Build Status Badges */
.build-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: white;
    z-index: 10;
}

.build-badge.success {
    background-color: #21ba45;
}

.build-badge.error {
    background-color: #db2828;
}

.build-badge.processing {
    background-color: #f2711c;
}

.build-badge i.icon {
    margin: 0;
    font-size: 10px;
}
</style>
