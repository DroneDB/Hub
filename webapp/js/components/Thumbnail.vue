<template>
    <div class="thumbnail" :class="{ selected: file.selected }" :title="getTitleText"
        :style="{ 'maxWidth': size + 'px' }" @click="onClick" @contextmenu="onRightClick" @dblclick="onDblClick">
        <div class="container" :class="{ bordered: thumbnail !== null }" :style="sizeStyle">
            <!-- Show thumbnail image if we have a thumbnail URL and not loading -->
            <img v-if="thumbnail && !loading && !buildLoading"
                @error="handleImageError" :src="thumbnail"
                style="padding-right: 8px; padding-left: 8px; max-width: 100%; max-height: 100%;" />

            <!-- Show icon if we have an icon and not loading (only as fallback when no thumbnail) -->
            <i v-else-if="icon && !loading && !buildLoading" class="icon icon-file" :class="icon" :style="iconStyle" />

            <!-- Build loading spinner (highest priority) -->
            <i class="icon circle notch spin loading" v-if="buildLoading" />

            <!-- Regular loading spinner (when loading thumbnails) -->
            <i class="icon circle notch spin loading" v-else-if="loading" />

            <!-- Fallback spinner (when no thumbnail, no icon, and not loading) -->
            <i class="icon circle notch spin loading" v-else-if="!thumbnail && !icon" />

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

        // Setup build listeners if dataset is available
        if (this.dataset) {
            this.setupBuildListeners();
        }
    },
    beforeDestroy() {
        this.cleanupBuildListeners();
    },
    methods: {
        getBoundingRect: function () {
            return this.$el.getBoundingClientRect();
        },
        handleImageError: function (e) {
            console.log('Image error for:', this.file.entry.path, 'URL:', this.thumbnail, 'Error:', e);
            // Retry
            if (!this.retryNumber) this.retryNumber = 0;
            if (this.retryNumber < 1000 && this.thumbnail.startsWith("/orgs")) {
                console.log('Retrying thumbnail load, attempt:', this.retryNumber + 1);
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
                console.log('Retry limit exceeded for:', this.file.entry.path);
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
            console.log('loadThumbnail called for:', this.file.entry.path, 'force:', force);

            // Use single loading flag to prevent multiple calls
            if (this.loading) {
                console.log('Already loading, skipping');
                return; // Already loading
            }
            if (!force && this.thumbnail && !this.error) {
                console.log('Already loaded, skipping');
                return; // Already loaded (unless forced)
            }
            if (!force && this.error) {
                console.log('Has error, skipping');
                return; // Skip if error (unless forced)
            }

            // For buildable files, check if there's an active build or if it needs building
            if (this.dataset && BuildManager.isBuildableType(this.file.entry.type)) {
                try {
                    // Check BuildManager cache first (more reliable)
                    const buildState = BuildManager.getBuildState(this.dataset, this.file.entry.path);

                    if (buildState) {
                        const activeStates = ['Processing', 'Enqueued', 'Scheduled', 'Awaiting', 'Created'];

                        if (activeStates.includes(buildState.currentState)) {
                            console.log('Active build found for', this.file.entry.path, '- state:', buildState.currentState);
                            this.buildLoading = true;
                            this.buildState = buildState;
                            this.icon = this.file.icon;
                            return;
                        }

                        // If build failed or succeeded, continue with thumbnail load
                        this.buildState = buildState;
                    } else {
                        // No build state found - might be a new file that needs building
                        // Direct API call to check current builds - no cache
                        const builds = await this.dataset.getBuilds(1, 200);
                        const activeBuild = builds.find(build =>
                            build.path === this.file.entry.path &&
                            (build.currentState === 'Processing' ||
                             build.currentState === 'Enqueued' ||
                             build.currentState === 'Scheduled' ||
                             build.currentState === 'Awaiting' ||
                             build.currentState === 'Created')
                        );

                        if (activeBuild) {
                            console.log('Active build found via API for', this.file.entry.path, '- showing build loading');
                            this.buildLoading = true;
                            this.buildState = activeBuild;
                            this.icon = this.file.icon;
                            return;
                        }

                        // For buildable types without a successful build, show build loading initially
                        // This covers newly uploaded files that need processing
                        const hasSuccessfulBuild = builds.find(build =>
                            build.path === this.file.entry.path &&
                            build.currentState === 'Succeeded'
                        );

                        if (!hasSuccessfulBuild) {
                            console.log('Buildable file without successful build - showing build loading initially');
                            this.buildLoading = true;
                            this.icon = this.file.icon;
                            // Don't return here - let it fall through to try thumbnail generation
                        }
                    }
                } catch (e) {
                    console.log('Error checking builds, proceeding with thumbnail:', e);
                    // If build check fails, continue with thumbnail load
                }
            }

            this.loading = true;
            console.log('Starting thumbnail load');

            try {
                if (thumbs.supportedForType(this.file.entry.type)) {
                    console.log('Type supported, fetching thumbnail for:', this.file.path);
                    this.thumbnail = await thumbs.fetch(this.file.path);
                    console.log('Thumbnail fetch completed:', this.thumbnail);

                    this.loading = false;
                    this.buildLoading = false; // Clear build loading when thumbnail succeeds
                } else {
                    console.log('Type not supported, using icon');
                    this.icon = this.file.icon;
                    this.loading = false;
                    this.buildLoading = false; // Clear build loading when using icon
                }
            } catch (e) {
                console.log('Thumbnail fetch error:', e);
                this.loading = false; // Reset loading state on error

                // For buildable files that fail thumbnail generation, keep showing build loading
                if (this.dataset && BuildManager.isBuildableType(this.file.entry.type) && !this.buildState) {
                    console.log('Thumbnail failed for buildable file - keeping build loading state');
                    this.buildLoading = true;
                    this.icon = this.file.icon;
                } else {
                    this.buildLoading = false;
                    this.showError(e);
                }
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

        setupBuildListeners() {
            if (!this.dataset) return;

            // Listen to build events (only for UI feedback)
            BuildManager.on('buildStateChanged', this.onBuildStateChanged);
            BuildManager.on('buildStarted', this.onBuildStarted);
        },

        cleanupBuildListeners() {
            BuildManager.off('buildStateChanged', this.onBuildStateChanged);
            BuildManager.off('buildStarted', this.onBuildStarted);
        },

        onBuildStateChanged(data) {
            if (data.dataset === this.dataset && data.filePath === this.file.entry.path) {
                console.log('Build state changed for', this.file.entry.path, ':', data.newState);
                this.buildState = data.buildInfo;
                this.buildLoading = false;

                // If build succeeded, refresh the thumbnail
                if (data.newState === 'Succeeded') {
                    console.log('Build succeeded - refreshing thumbnail');
                    // Clear existing state and reload
                    this.thumbnail = null;
                    this.error = null;
                    this.icon = null;
                    this.loading = false;
                    this.loadThumbnail(true);
                }
            }
        },

        onBuildStarted(data) {
            if (data.dataset === this.dataset && data.filePath === this.file.entry.path) {
                console.log('Build started for', this.file.entry.path);
                this.buildLoading = true;
                this.loading = false;
                this.error = null;
                this.thumbnail = null;
                this.icon = this.file.icon;
            }
        },


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
