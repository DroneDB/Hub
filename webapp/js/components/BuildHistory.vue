<template>
    <div id="build-history" class="build-history-page">
        <div class="filters">
            <div class="filter-bar">
                <div class="d-flex gap-2 align-items-center">
                    <div class="mb-0">
                        <Select v-model="selectedState" :options="stateOptions" optionLabel="label" optionValue="value" placeholder="All States" @change="applyFilters" class="w-100" />
                    </div>
                    <div class="mb-0">
                        <Button @click="refreshData" icon="fa-solid fa-arrows-rotate" label="Refresh" />
                    </div>
                    <div class="mb-0">
                        <Button severity="danger" @click="showClearDialog" :disabled="completedBuildsCount === 0" icon="fa-solid fa-trash" label="Clear Concluded" />
                    </div>
                </div>
            </div>
        </div>

        <div class="content">
            <div v-if="loading" class="ui active centered inline loader"></div>

            <div v-else-if="filteredBuilds.length === 0">
                <PrimeMessage severity="info" :closable="false">
                    <strong>No builds found</strong>
                    <p>No build history available for this dataset.</p>
                </PrimeMessage>
            </div>

            <table v-else class="ui celled striped table">
                <thead>
                    <tr>
                        <th class="sortable" @click="sort('currentState')" style="width: 15%;">
                            State
                            <i v-if="sortBy === 'currentState'"
                               :class="sortDesc ? 'fa-solid fa-sort-down' : 'fa-solid fa-sort-up'"></i>
                        </th>
                        <th class="sortable" @click="sort('path')" style="width: 35%;">
                            File Path
                            <i v-if="sortBy === 'path'"
                               :class="sortDesc ? 'fa-solid fa-sort-down' : 'fa-solid fa-sort-up'"></i>
                        </th>

                        <th class="sortable" @click="sort('createdAt')" style="width: 20%;">
                            Started
                            <i v-if="sortBy === 'createdAt'"
                               :class="sortDesc ? 'fa-solid fa-sort-down' : 'fa-solid fa-sort-up'"></i>
                        </th>
                        <th style="width: 15%;">Duration</th>
                        <th style="width: 15%;">Job Details</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="build in paginatedBuilds" :key="build.jobId">
                        <td>
                            <Tag :severity="getTagSeverity(build.currentState)" :pt="{ root: { title: build.currentState } }">
                                <i :class="getStateIcon(build.currentState)" style="font-size: 1.1em;"></i>
                            </Tag>
                            <div v-if="canRetryBuild(build)" style="margin-top: 5px;">
                                <Button size="small" @click="retryBuild(build)"
                                        :disabled="retryingBuilds[build.jobId]" style="font-size: 10px;"
                                        icon="fa-solid fa-rotate-right" label="Retry" />
                            </div>
                        </td>
                        <td>
                            <div class="build-path" :title="build.path">
                                <strong>{{ getFileName(build.path) }}</strong>
                                <br>
                                <small class="path-details">{{ getFilePath(build.path) }}</small>
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
                                    <strong>Job ID: </strong>
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
            <Paginator v-if="filteredBuilds.length > pageSize"
                :rows="pageSize"
                :totalRecords="filteredBuilds.length"
                :first="(currentPage - 1) * pageSize"
                @page="onPageChange" />
        </div>

        <ConfirmDialog v-if="clearDialogOpen"
            title="Clear Concluded Builds"
            :message="`Are you sure you want to delete all completed and failed builds?<br/><strong>${completedBuildsCount} build(s)</strong> will be removed from the history.`"
            confirmText="Clear"
            cancelText="Cancel"
            confirmButtonClass="negative"
            warningTitle="Warning"
            warningMessage="This action cannot be undone."
            @onClose="handleClearDialogClose">
        </ConfirmDialog>
    </div>
</template>

<script>
import BuildManager from '../libs/buildManager';
import ConfirmDialog from './ConfirmDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Paginator from 'primevue/paginator';

export default {
    components: {
        ConfirmDialog, Button, PrimeMessage, Select, Tag, Paginator
    },

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
            retryingBuilds: {},
            clearDialogOpen: false,
            stateOptions: [
                { label: 'All States', value: '' },
                { label: 'Succeeded', value: 'Succeeded' },
                { label: 'Failed', value: 'Failed' },
                { label: 'Processing', value: 'Processing' },
                { label: 'Enqueued', value: 'Enqueued' },
                { label: 'Scheduled', value: 'Scheduled' },
                { label: 'Awaiting', value: 'Awaiting' }
            ]
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
        },

        completedBuildsCount() {
            return this.builds.filter(build =>
                build.currentState === 'Succeeded' || build.currentState === 'Failed'
            ).length;
        }
    },

    mounted: async function () {
        await this.loadBuilds();
        this.setupBuildListeners();

        // Start monitoring this dataset for builds
        BuildManager.monitorDatasetForBuilds(this.dataset);
    },

    beforeUnmount() {
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

        onPageChange(event) {
            this.currentPage = event.page + 1;
        },

        getFileName(path) {
            if (!path) return 'Dataset';
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

        getTagSeverity(state) {
            switch (state) {
                case 'Succeeded':
                    return 'success';
                case 'Failed':
                    return 'danger';
                case 'Processing':
                    return 'warn';
                case 'Enqueued':
                case 'Scheduled':
                case 'Awaiting':
                    return 'info';
                default:
                    return 'secondary';
            }
        },

        getStateIcon(state) {
            switch (state) {
                case 'Succeeded':
                    return 'fa-solid fa-check';
                case 'Failed':
                    return 'fa-solid fa-xmark';
                case 'Processing':
                    return 'fa-solid fa-gear fa-spin';
                case 'Enqueued':
                case 'Scheduled':
                case 'Awaiting':
                case 'Created':
                    return 'fa-regular fa-clock';
                default:
                    return 'fa-solid fa-question';
            }
        },

        formatDateTime(dateString) {
            if (!dateString) return '';
            // Parse UTC date and convert to local timezone for display
            const date = new Date(dateString);
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).format(date);
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

            this.retryingBuilds[build.jobId] = true;

            try {
                await this.dataset.build(build.path, true); // Force rebuild
                await this.refreshData(); // Reload data
                this.$emit('buildRetried', build);
            } catch (error) {
                console.error('Error retrying build:', error);
                this.$emit('buildRetryError', { build, error: error.message });
            } finally {
                this.retryingBuilds[build.jobId] = false;
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
        },

        showClearDialog() {
            this.clearDialogOpen = true;
        },

        async handleClearDialogClose(buttonId) {
            this.clearDialogOpen = false;

            if (buttonId === 'confirm') {
                try {
                    this.loading = true;
                    const result = await this.dataset.clearCompletedBuilds();
                    console.log('Cleared completed builds:', result);

                    // Reload the build list
                    await this.loadBuilds();

                    this.$emit('buildsCleared', result);
                } catch (error) {
                    console.error('Error clearing completed builds:', error);
                    this.$emit('clearBuildsError', { error: error.message });
                } finally {
                    this.loading = false;
                }
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
}

.filters {
    padding: 0.9375rem;
    background: #f8f8f9;
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
    margin-top: 0.125rem;
    word-break: break-all;
}

.date-time {
    white-space: nowrap;
}

.relative-time {
    display: block;
    color: #999;
    font-size: 0.85em;
    margin-top: 0.125rem;
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
    padding: 0.125rem 0.25rem;
    border-radius: 0.125rem;
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

.filter-bar {
    display: flex;
    align-items: center;
}
</style>