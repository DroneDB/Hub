<template>
    <div id="build-history" class="build-history-page">
        <div class="filters">
            <div class="ui form">
                <div class="fields">
                    <div class="field">
                        <select v-model="selectedState" class="ui dropdown" @change="applyFilters">
                            <option value="">All States</option>
                            <option value="Succeeded">Succeeded</option>
                            <option value="Failed">Failed</option>
                            <option value="Processing">Processing</option>
                            <option value="Enqueued">Enqueued</option>
                            <option value="Scheduled">Scheduled</option>
                            <option value="Awaiting">Awaiting</option>
                        </select>
                    </div>
                    <div class="field">
                        <button class="ui button" @click="refreshData">
                            <i class="icon refresh"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="content">
            <div v-if="loading" class="ui active centered inline loader"></div>

            <div v-else-if="filteredBuilds.length === 0" class="ui message">
                <div class="header">No builds found</div>
                <p>No build history available for this dataset.</p>
            </div>

            <table v-else class="ui celled striped table">
                <thead>
                    <tr>
                        <th class="sortable" @click="sort('path')" style="width: 35%;">
                            File Path
                            <i v-if="sortBy === 'path'" class="icon"
                               :class="sortDesc ? 'sort down' : 'sort up'"></i>
                        </th>
                        <th class="sortable" @click="sort('currentState')" style="width: 15%;">
                            State
                            <i v-if="sortBy === 'currentState'" class="icon"
                               :class="sortDesc ? 'sort down' : 'sort up'"></i>
                        </th>
                        <th class="sortable" @click="sort('createdAt')" style="width: 20%;">
                            Started
                            <i v-if="sortBy === 'createdAt'" class="icon"
                               :class="sortDesc ? 'sort down' : 'sort up'"></i>
                        </th>
                        <th style="width: 15%;">Duration</th>
                        <th style="width: 15%;">Job Details</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="build in paginatedBuilds" :key="build.jobId">
                        <td>
                            <div class="build-path" :title="build.path">
                                <strong>{{ getFileName(build.path) }}</strong>
                                <br>
                                <small class="path-details">{{ getFilePath(build.path) }}</small>
                            </div>
                        </td>
                        <td>
                            <div class="ui label" :class="getStateClass(build.currentState)">
                                <i class="icon" :class="getStateIcon(build.currentState)"></i>
                                {{ build.currentState }}
                            </div>
                            <div v-if="canRetryBuild(build)" style="margin-top: 5px;">
                                <button class="ui mini button" @click="retryBuild(build)"
                                        :disabled="retryingBuilds[build.jobId]" style="font-size: 10px;">
                                    <i class="icon redo"></i> Retry
                                </button>
                            </div>
                        </td>
                        <td>
                            <div class="date-time">
                                <div>{{ formatDateTime(build.createdAt) }}</div>
                                <small class="relative-time">{{ getRelativeTime(build.createdAt) }}</small>
                            </div>
                        </td>
                        <td>
                            <div v-if="getBuildDuration(build)" class="duration-info">
                                <div class="duration">{{ getBuildDuration(build) }}</div>
                                <small class="muted">Build Time</small>
                            </div>
                            <div v-if="getQueueTime(build)" class="duration-info" style="margin-top: 5px;">
                                <div class="duration">{{ getQueueTime(build) }}</div>
                                <small class="muted">Queue Time</small>
                            </div>
                            <div v-if="!getBuildDuration(build) && !getQueueTime(build)" class="muted">-</div>
                        </td>
                        <td>
                            <div class="job-details">
                                <small>
                                    <strong>Job ID:</strong><br>
                                    <code style="font-size: 10px;">{{ build.jobId }}</code>
                                </small>
                                <div v-if="build.processingAt" style="margin-top: 3px;">
                                    <small class="muted">Processing: {{ formatDateTime(build.processingAt) }}</small>
                                </div>
                                <div v-if="build.succeededAt || build.failedAt" style="margin-top: 3px;">
                                    <small class="muted">
                                        {{ build.succeededAt ? 'Completed' : 'Failed' }}:
                                        {{ formatDateTime(build.succeededAt || build.failedAt) }}
                                    </small>
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <!-- Pagination -->
            <div v-if="totalPages > 1" class="ui pagination menu">
                <a class="icon item" :class="{ disabled: currentPage === 1 }"
                   @click="currentPage > 1 && changePage(currentPage - 1)">
                    <i class="left chevron icon"></i>
                </a>
                <a v-for="page in displayedPages" :key="page" class="item"
                   :class="{ active: page === currentPage }" @click="changePage(page)">
                    {{ page }}
                </a>
                <a class="icon item" :class="{ disabled: currentPage === totalPages }"
                   @click="currentPage < totalPages && changePage(currentPage + 1)">
                    <i class="right chevron icon"></i>
                </a>
            </div>
        </div>
    </div>
</template>

<script>
import BuildManager from '../libs/buildManager';

export default {
    props: {
        dataset: {
            type: Object,
            required: true
        }
    },

    data: function () {
        return {
            builds: [],
            filteredBuilds: [],
            loading: false,
            selectedState: '',
            sortBy: 'createdAt',
            sortDesc: true,
            currentPage: 1,
            pageSize: 20,
            retryingBuilds: {}
        };
    },

    computed: {
        paginatedBuilds() {
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            return this.filteredBuilds.slice(start, end);
        },

        totalPages() {
            return Math.ceil(this.filteredBuilds.length / this.pageSize);
        },

        displayedPages() {
            const current = this.currentPage;
            const total = this.totalPages;
            const delta = 2;

            let start = Math.max(1, current - delta);
            let end = Math.min(total, current + delta);

            const pages = [];
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            return pages;
        }
    },

    mounted: async function () {
        await this.loadBuilds();
        this.setupBuildListeners();

        // Start monitoring this dataset for builds
        BuildManager.monitorDatasetForBuilds(this.dataset);
    },

    beforeDestroy() {
        this.cleanupBuildListeners();
    },

    methods: {
        async loadBuilds() {
            this.loading = true;
            try {
                // Load builds from dataset
                this.builds = await this.dataset.getBuilds(1, 200); // Load the first 200 builds
                this.applyFilters();
            } catch (error) {
                console.error('Error loading builds:', error);
                this.builds = [];
                this.filteredBuilds = [];
            } finally {
                this.loading = false;
            }
        },

        async refreshData() {
            await this.loadBuilds();
        },

        applyFilters() {
            let filtered = [...this.builds];

            // Filter by state
            if (this.selectedState) {
                filtered = filtered.filter(build => build.currentState === this.selectedState);
            }

            // Sort
            filtered.sort((a, b) => {
                let aVal = a[this.sortBy];
                let bVal = b[this.sortBy];

                if (this.sortBy === 'createdAt' || this.sortBy.includes('At')) {
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                }

                if (aVal < bVal) return this.sortDesc ? 1 : -1;
                if (aVal > bVal) return this.sortDesc ? -1 : 1;
                return 0;
            });

            this.filteredBuilds = filtered;
            this.currentPage = 1; // Reset to first page when applying a filter
        },

        sort(column) {
            if (this.sortBy === column) {
                this.sortDesc = !this.sortDesc;
            } else {
                this.sortBy = column;
                this.sortDesc = true;
            }
            this.applyFilters();
        },

        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
            }
        },

        getFileName(path) {
            if (!path) return 'Unknown';
            return path.split('/').pop() || path;
        },

        getFilePath(path) {
            if (!path) return '';
            const parts = path.split('/');
            if (parts.length <= 1) return '';
            return parts.slice(0, -1).join('/');
        },



        getStateClass(state) {
            switch (state) {
                case 'Succeeded':
                    return 'green';
                case 'Failed':
                    return 'red';
                case 'Processing':
                    return 'yellow';
                case 'Enqueued':
                case 'Scheduled':
                case 'Awaiting':
                    return 'blue';
                default:
                    return 'grey';
            }
        },

        getStateIcon(state) {
            switch (state) {
                case 'Succeeded':
                    return 'check';
                case 'Failed':
                    return 'times';
                case 'Processing':
                    return 'cog spin';
                case 'Enqueued':
                case 'Scheduled':
                case 'Awaiting':
                    return 'clock outline';
                default:
                    return 'question';
            }
        },

        formatDateTime(dateString) {
            if (!dateString) return '';
            // Parse UTC date and convert to local timezone for display
            const date = new Date(dateString);
            return date.toLocaleDateString('it-IT') + ' ' + date.toLocaleTimeString('it-IT');
        },

        getRelativeTime(dateString) {
            if (!dateString) return '';
            // Parse UTC date and calculate relative time in local timezone
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;

            const minutes = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMs / 3600000);
            const days = Math.floor(diffMs / 86400000);

            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes} minutes ago`;
            if (hours < 24) return `${hours} hours ago`;
            if (days < 30) return `${days} days ago`;
            return 'Over a month ago';
        },

        getBuildDuration(build) {
            if (!build.processingAt) return null;

            // All dates from server are UTC, calculate duration correctly
            const start = new Date(build.processingAt);
            const end = build.succeededAt ? new Date(build.succeededAt) :
                       (build.failedAt ? new Date(build.failedAt) : new Date());

            const durationMs = end - start;
            return this.formatDuration(durationMs);
        },

        getQueueTime(build) {
            if (!build.createdAt || !build.processingAt) return null;

            // All dates from server are UTC, calculate queue time correctly
            const created = new Date(build.createdAt);
            const processing = new Date(build.processingAt);

            const queueMs = processing - created;
            return this.formatDuration(queueMs);
        },

        formatDuration(ms) {
            if (ms < 1000) return `${ms}ms`;
            if (ms < 60000) return `${Math.round(ms / 1000)}s`;
            if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
            return `${Math.round(ms / 3600000)}h`;
        },

        canRetryBuild(build) {
            return build.currentState === 'Failed' || build.currentState === 'Deleted';
        },

        async retryBuild(build) {
            if (!build.path) return;

            this.$set(this.retryingBuilds, build.jobId, true);

            try {
                await this.dataset.build(build.path, true); // Force rebuild
                await this.refreshData(); // Reload data
                this.$emit('buildRetried', build);
            } catch (error) {
                console.error('Error retrying build:', error);
                this.$emit('buildRetryError', { build, error: error.message });
            } finally {
                this.$set(this.retryingBuilds, build.jobId, false);
            }
        },

        setupBuildListeners() {
            // Listen to build state changes for real-time updates
            BuildManager.on('buildStateChanged', this.onBuildStateChanged);
            BuildManager.on('newBuildableFilesDetected', this.onNewBuildableFilesDetected);
        },

        cleanupBuildListeners() {
            BuildManager.off('buildStateChanged', this.onBuildStateChanged);
            BuildManager.off('newBuildableFilesDetected', this.onNewBuildableFilesDetected);
        },

        onBuildStateChanged(data) {
            if (data.dataset === this.dataset) {
                console.log('Build state changed for file:', data.filePath, 'New state:', data.newState);

                // Refresh the build list to show updated states
                this.refreshData();
            }
        },

        onNewBuildableFilesDetected(data) {
            if (data.dataset === this.dataset) {
                console.log('New buildable files detected, refreshing build history');

                // Refresh the build list to show new builds
                this.refreshData();
            }
        }
    }
}
</script>

<style scoped>
.build-history-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 20px;
}

.filters {
    margin-bottom: 20px;
    padding: 15px;
    background: #f8f8f9;
    border-radius: 4px;
    flex-shrink: 0;
}

.content {
    flex: 1;
    overflow: auto;
}

.build-path {
    word-break: break-word;
    line-height: 1.4;
}

.path-details {
    display: block;
    color: #999;
    font-size: 0.85em;
    margin-top: 2px;
    word-break: break-all;
}

.date-time {
    white-space: nowrap;
}

.relative-time {
    display: block;
    color: #999;
    font-size: 0.85em;
    margin-top: 2px;
}

.duration {
    font-family: monospace;
    font-weight: bold;
}

.duration-info {
    text-align: center;
}

.job-details {
    font-size: 0.9em;
    line-height: 1.3;
}

.job-details code {
    background: #f8f8f8;
    padding: 2px 4px;
    border-radius: 2px;
    word-break: break-all;
}

.muted {
    color: #999;
}

.sortable {
    cursor: pointer;
    user-select: none;
}

.sortable:hover {
    background-color: rgba(0,0,0,.05);
}

.ui.pagination.menu {
    margin-top: 20px;
}
</style>