<template>
    <div class="tasks-table">
        <!-- Skeleton while first load is in flight -->
        <DataTable v-if="loading && tasks.length === 0" :value="skeletonRows" striped-rows>
            <Column header="State" style="width: 5rem;"><template #body><Skeleton width="2rem" height="1.5rem" /></template></Column>
            <Column header="Tool"><template #body><Skeleton width="80%" /></template></Column>
            <Column v-if="showDataset" header="Dataset" v-bind="columnFrom('md')"><template #body><Skeleton width="70%" /></template></Column>
            <Column v-if="showOwner" header="Owner" v-bind="columnFrom('xl')"><template #body><Skeleton width="60%" /></template></Column>
            <Column header="Progress" v-bind="columnFrom('md')"><template #body><Skeleton width="90%" /></template></Column>
            <Column header="Created" v-bind="columnFrom('lg')"><template #body><Skeleton width="70%" /></template></Column>
            <Column header="Duration" style="width: 9rem;" v-bind="columnFrom('lg')"><template #body><Skeleton width="60%" /></template></Column>
            <Column header="Actions" style="width: 10rem;"><template #body><Skeleton width="90%" /></template></Column>
        </DataTable>

        <!-- Empty state -->
        <PrimeMessage v-else-if="tasks.length === 0" severity="info" :closable="false">
            <strong>No tasks found</strong>
            <p>{{ emptyMessage }}</p>
        </PrimeMessage>

        <!-- Task table -->
        <DataTable v-else :value="slicedTasks" striped-rows row-hover
                   :lazy="lazy" :total-records="lazy ? totalRecords : undefined"
                   :sort-field="lazy ? undefined : 'createdAt'" :sort-order="-1"
                   scrollable scroll-height="flex"
                   :paginator="lazy"
                   paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
                   :rows="lazy ? rows : undefined"
                   :rows-per-page-options="lazy ? rowsPerPageOptions : undefined"
                   :page-link-size="3" @page="onPage">
            <Column field="state" header="State" :sortable="!lazy" style="width: 5rem;">
                <template #body="slotProps">
                    <Tag :severity="getTagSeverity(slotProps.data.state)"
                         :pt="{ root: { title: slotProps.data.state } }">
                        <i :class="getStateIcon(slotProps.data.state)" style="font-size: 1rem;" />
                    </Tag>
                </template>
            </Column>
            <Column field="toolId" header="Tool" :sortable="!lazy">
                <template #body="slotProps">
                    <div :title="slotProps.data.path || ''">
                        <strong>{{ toolTitle(slotProps.data.toolId, tools) }}</strong>
                        <span class="muted"> v{{ slotProps.data.version }}</span>
                        <small class="path-details">{{ formatPath(slotProps.data.path) }}</small>
                    </div>
                </template>
            </Column>
            <Column v-if="showDataset" header="Dataset" v-bind="columnFrom('md')">
                <template #body="slotProps">
                    <span class="dataset-cell" :title="`${slotProps.data.orgSlug}/${slotProps.data.dsSlug}`">{{ slotProps.data.orgSlug }}/{{ slotProps.data.dsSlug }}</span>
                </template>
            </Column>
            <Column v-if="showOwner" header="Owner" v-bind="columnFrom('xl')">
                <template #body="slotProps">
                    <span class="owner-cell" :title="slotProps.data.owner || slotProps.data.userId || 'System'">{{ slotProps.data.owner || slotProps.data.userId || 'System' }}</span>
                </template>
            </Column>
            <Column header="Progress" v-bind="columnFrom('md')">
                <template #body="slotProps">
                    <template v-if="progressKind(slotProps.data) === 'bar'">
                        <ProgressBar :value="progressValue(slotProps.data)" :mode="barMode(slotProps.data)"
                                     :show-value="true" style="height: 1rem;" />
                        <small v-if="slotProps.data.phaseMessage" class="muted">{{ slotProps.data.phaseMessage }}</small>
                        <small v-if="slotProps.data.state === 'Failed'" class="error-text" :title="slotProps.data.errorType">
                            <i class="fa-solid fa-triangle-exclamation" /> {{ slotProps.data.errorType || 'Failed' }}
                        </small>
                    </template>
                    <div v-else class="muted">-</div>
                </template>
            </Column>
            <Column field="createdAt" header="Created" :sortable="!lazy" v-bind="columnFrom('lg')">
                <template #body="slotProps">
                    <div class="date-time">
                        <div>{{ formatDateTime(slotProps.data.createdAt) }}</div>
                        <small class="relative-time">{{ getRelativeTime(slotProps.data.createdAt) }}</small>
                    </div>
                </template>
            </Column>
            <Column header="Duration" style="width: 9rem;" v-bind="columnFrom('lg')">
                <template #body="slotProps">
                    <div v-if="isActive(slotProps.data.state)" class="duration running" title="Running time">
                        <i class="fa-solid fa-stopwatch" /> {{ runningTime(slotProps.data) }}
                    </div>
                    <div v-else-if="taskDuration(slotProps.data)" class="duration" title="Total duration">
                        {{ taskDuration(slotProps.data) }}
                    </div>
                    <div v-else class="muted">-</div>
                </template>
            </Column>
            <Column header="Actions" style="width: 10rem;">
                <template #body="slotProps">
                    <div class="d-flex gap-1 flex-wrap">
                        <Button size="small" severity="secondary" icon="fa-solid fa-terminal" title="View log" aria-label="View log"
                                @click="$emit('view-log', slotProps.data)" />
                        <Button v-if="canDownloadResult(slotProps.data, tools)" size="small" icon="fa-solid fa-download"
                                label="Result" :title="resultAvailabilityHint(slotProps.data)"
                                :loading="slotProps.data.taskId === downloadingTaskId"
                                :disabled="slotProps.data.taskId === downloadingTaskId"
                                @click="$emit('download-result', slotProps.data)" />
                        <Button v-if="isActive(slotProps.data.state)" size="small" severity="warn"
                                icon="fa-solid fa-stop" title="Cancel" aria-label="Cancel" @click="$emit('cancel', slotProps.data)" />
                        <Button v-if="slotProps.data.state === 'Failed'" size="small" severity="secondary"
                                icon="fa-solid fa-rotate-right" title="Retry" aria-label="Retry" @click="$emit('retry', slotProps.data)" />
                        <Button v-if="!isActive(slotProps.data.state)" size="small" severity="danger"
                                icon="fa-solid fa-trash" title="Delete from history" aria-label="Delete from history" @click="$emit('delete', slotProps.data)" />
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>
</template>

<script>
import { useTaskFormatting } from '@/composables/useTaskFormatting';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Tag from 'primevue/tag';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Skeleton from 'primevue/skeleton';
import ProgressBar from 'primevue/progressbar';
import { columnFrom } from '@/libs/responsiveColumns';

/**
 * Presentational task table shared by the per-dataset Task History tab and the
 * admin Tasks dashboard. Contains no fetch logic: data, loading and
 * paging are driven by the parent via props/events.
 */
export default {
    name: 'TasksTable',

    components: { Button, PrimeMessage, Tag, DataTable, Column, Skeleton, ProgressBar },


    props: {
        tasks: { type: Array, default: () => [] },
        tools: { type: Array, default: () => [] },
        loading: { type: Boolean, default: false },
        showOwner: { type: Boolean, default: false },
        showDataset: { type: Boolean, default: false },
        lazy: { type: Boolean, default: false },
        totalRecords: { type: Number, default: 0 },
        rows: { type: Number, default: 10 },
        emptyMessage: { type: String, default: 'No processing tasks have been run yet.' },
        rowsPerPageOptions: { type: Array, default: () => [10, 25, 50, 100] },
        // Task id whose result download is currently in flight: its Result button is
        // disabled + spinning to prevent repeated clicks overloading the server.
        downloadingTaskId: { type: String, default: null },
        // Current page offset (0-based), controlled by parent for client-side pagination.
        currentPageFirst: { type: Number, default: 0 }
    },

    emits: ['view-log', 'download-result', 'cancel', 'retry', 'delete', 'page', 'page-reset'],

    setup() {
        // Secondary columns leave a narrow screen, so a phone keeps the state, the tool and the actions
        return { ...useTaskFormatting(), columnFrom };
    },
    data() {
        return {
            skeletonRows: Array.from({ length: 8 }, (_, i) => ({ id: i }))
        };
    },

    computed: {
        /** Slice tasks array for client-side pagination. Lazy mode returns full array. */
        slicedTasks() {
            if (this.lazy) return this.tasks;
            return this.tasks.slice(this.currentPageFirst, this.currentPageFirst + this.rows);
        }
    },

    watch: {
        /** Reset to first page when tasks change (e.g. after filter or reload). */
        tasks() {
            this.$emit('page-reset');
        }
    },

    methods: {
        /**
         * Whether the progress bar renders at all for a row: 'bar' or 'none'.
         * Only Processing, Succeeded (100%) and Failed (100% + error text) render
         * a bar. Queued states (Created/Enqueued/Scheduled/Reused/Awaiting) and
         * Deleted (reached by the Cancel button) show a muted placeholder.
         */
        progressKind(task) {
            if (task.state === 'Processing' || task.state === 'Succeeded' || task.state === 'Failed') return 'bar';
            return 'none';
        },

        /** Bar fill: reported percent while Processing, full for ended tasks. */
        progressValue(task) {
            if (task.state === 'Processing') return task.progressPercent || 0;
            return 100; // Succeeded / Failed
        },

        /** Ended tasks show a full determinate bar; Processing shows one only with a real percent. */
        barMode(task) {
            const ended = task.state === 'Succeeded' || task.state === 'Failed';
            const percent = task.progressPercent;
            const determinate = ended || (task.state === 'Processing' && percent != null && percent > 0);
            return determinate ? 'determinate' : 'indeterminate';
        },

        /**
         * Format a file path for display: truncate long paths with ... and insert
         * zero-width spaces after slashes so line breaks only occur at "/" boundaries.
         */
        formatPath(path) {
            if (!path) return 'Whole dataset';
            const parts = path.split('/');
            if (parts.length <= 4) {
                return parts.join('/\u200B');
            }
            // Keep last 3 segments, truncate the rest with ...
            const kept = parts.slice(-3);
            return '.../' + kept.join('/\u200B');
        },

        onPage(event) {
            // Only the admin (lazy) dashboard needs server-side paging.
            if (this.lazy) {
                this.$emit('page', { skip: event.first, take: event.rows });
            }
        }
    }
};
</script>

<style scoped>
.tasks-table {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}

.tasks-table :deep(.p-datatable) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

/* Fixed columns: a cell never grows the table, long values are cut with an ellipsis */
.tasks-table :deep(.p-datatable-table) {
    table-layout: fixed;
}

.tasks-table :deep(.p-datatable-table-container) {
    flex: 1;
    min-height: 0;
}

.tasks-table :deep(.p-paginator) {
    flex-wrap: wrap;
}

.muted {
    color: var(--ddb-text-muted);
}

.error-text {
    color: var(--ddb-danger);
}

.path-details {
    display: block;
    color: var(--ddb-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dataset-cell,
.owner-cell {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.paginator-wrapper {
    flex-shrink: 0;
    position: sticky;
    bottom: 0;
    z-index: 10;
    background: var(--p-content-background);
    border-top: 1px solid var(--p-content-border-color);
    padding: var(--ddb-spacing-xs) 0;
}

.duration {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.duration.running {
    color: var(--ddb-warning);
}
</style>
