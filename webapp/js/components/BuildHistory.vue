<template>
    <div id="build-history" class="build-history-page">
        <div class="filters">
            <div class="filter-bar">
                <div class="d-flex gap-2 align-items-center">
                    <div class="mb-0">
                        <Select v-model="selectedState" :options="stateOptions" optionLabel="label" optionValue="value" placeholder="All States" @change="applyFilters" class="w-100" />
                    </div>
                    <div class="mb-0">
                        <Button @click="refreshData" icon="fa-solid fa-arrows-rotate" label="Refresh" severity="secondary" :loading="loading" />
                    </div>
                    <div class="mb-0">
                        <Button severity="danger" @click="showClearDialog" :disabled="completedBuildsCount === 0" icon="fa-solid fa-trash" label="Clear Concluded" />
                    </div>
                </div>
            </div>
        </div>

        <div class="content">
            <!-- Skeleton loading state -->
            <DataTable v-if="loading" :value="skeletonRows" stripedRows>
                <Column header="State" style="width: 3rem;">
                    <template #body><Skeleton width="2rem" height="1.5rem" /></template>
                </Column>
                <Column header="File Path" style="width: 35%;">
                    <template #body><Skeleton width="80%" /><Skeleton width="60%" height="0.75rem" class="mt-1" /></template>
                </Column>
                <Column header="Started" style="width: 20%;">
                    <template #body><Skeleton width="70%" /><Skeleton width="50%" height="0.75rem" class="mt-1" /></template>
                </Column>
                <Column header="Duration" style="width: 15%;">
                    <template #body><Skeleton width="3rem" /></template>
                </Column>
                <Column header="Job Details" style="width: 15%;">
                    <template #body><Skeleton width="90%" height="0.75rem" /></template>
                </Column>
            </DataTable>

            <div v-else-if="filteredBuilds.length === 0">
                <PrimeMessage severity="info" :closable="false">
                    <strong>No builds found</strong>
                    <p>No build history available for this dataset.</p>
                </PrimeMessage>
            </div>

            <DataTable v-else :value="filteredBuilds" stripedRows rowHover paginator :rows="pageSize"
                sortField="createdAt" :sortOrder="-1" :pt="{ table: { style: 'min-width: 50rem' } }">
                <Column field="currentState" header="State" :sortable="true" style="width: 5rem;">
                    <template #body="slotProps">
                        <Tag :severity="getTagSeverity(slotProps.data.currentState)" :pt="{ root: { title: slotProps.data.currentState } }">
                            <i :class="getStateIcon(slotProps.data.currentState)" style="font-size: 1.1em;"></i>
                        </Tag>
                        <div v-if="canRetryBuild(slotProps.data)" style="margin-top: 5px;">
                            <Button size="small" @click="retryBuild(slotProps.data)"
                                    :disabled="retryingBuilds[slotProps.data.jobId]" style="font-size: 10px;"
                                    icon="fa-solid fa-rotate-right" label="Retry" />
                        </div>
                    </template>
                </Column>
                <Column field="path" header="File Path" :sortable="true" style="width: 35%;">
                    <template #body="slotProps">
                        <div class="build-path" :title="slotProps.data.path">
                            <strong>{{ getFileName(slotProps.data.path) }}</strong>
                            <br>
                            <small class="path-details">{{ getFilePath(slotProps.data.path) }}</small>
                        </div>
                    </template>
                </Column>
                <Column field="createdAt" header="Started" :sortable="true" style="width: 20%;">
                    <template #body="slotProps">
                        <div class="date-time">
                            <div>{{ formatDateTime(slotProps.data.createdAt) }}</div>
                            <small class="relative-time">{{ getRelativeTime(slotProps.data.createdAt) }}</small>
                        </div>
                    </template>
                </Column>
                <Column header="Duration" style="width: 15%;">
                    <template #body="slotProps">
                        <div v-if="getBuildDuration(slotProps.data)" class="duration-info">
                            <div class="duration">{{ getBuildDuration(slotProps.data) }}</div>
                            <small class="muted">Build Time</small>
                        </div>
                        <div v-if="getQueueTime(slotProps.data)" class="duration-info" style="margin-top: 5px;">
                            <div class="duration">{{ getQueueTime(slotProps.data) }}</div>
                            <small class="muted">Queue Time</small>
                        </div>
                        <div v-if="!getBuildDuration(slotProps.data) && !getQueueTime(slotProps.data)" class="muted">-</div>
                    </template>
                </Column>
                <Column header="Job Details" style="width: 15%;">
                    <template #body="slotProps">
                        <div class="job-details">
                            <small>
                                <strong>ID: </strong>
                                <code style="font-size: 10px;">{{ slotProps.data.jobId }}</code>
                            </small>
                            <div v-if="slotProps.data.processingAt" style="margin-top: 3px;">
                                <small class="muted">Processing: {{ formatDateTime(slotProps.data.processingAt) }}</small>
                            </div>
                            <div v-if="slotProps.data.succeededAt || slotProps.data.failedAt" style="margin-top: 3px;">
                                <small class="muted">
                                    {{ slotProps.data.succeededAt ? 'Completed' : 'Failed' }}:
                                    {{ formatDateTime(slotProps.data.succeededAt || slotProps.data.failedAt) }}
                                </small>
                            </div>
                        </div>
                    </template>
                </Column>
                <template #empty>
                    <div class="text-center p-4">
                        <strong>No builds found</strong>
                        <p>No build history available for this dataset.</p>
                    </div>
                </template>
            </DataTable>
        </div>

        <ConfirmDialog v-if="clearDialogOpen"
            title="Clear Concluded Builds"
            :message="`Are you sure you want to delete all completed and failed builds?<br/><strong>${completedBuildsCount} build(s)</strong> will be removed from the history.`"
            confirmText="Clear"
            cancelText="Cancel"
            confirmButtonClass="danger"
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
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Skeleton from 'primevue/skeleton';

export default {
    components: {
        ConfirmDialog, Button, PrimeMessage, Select, Tag, DataTable, Column, Skeleton
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
            pageSize: 20,
            retryingBuilds: {},
            clearDialogOpen: false,
            skeletonRows: Array.from({ length: 8 }, (_, i) => ({ id: i })),
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

            this.filteredBuilds = filtered;
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
    background: var(--ddb-bg-secondary);
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
    color: var(--ddb-text-muted);
    font-size: 0.85em;
    margin-top: 0.125rem;
    word-break: break-all;
}

.date-time {
    white-space: nowrap;
}

.relative-time {
    display: block;
    color: var(--ddb-text-muted);
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
    background: var(--ddb-bg-secondary);
    padding: 0.125rem 0.25rem;
    border-radius: 0.125rem;
    word-break: break-all;
}

.muted {
    color: var(--ddb-text-muted);
}

.filter-bar {
    display: flex;
    align-items: center;
}
</style>