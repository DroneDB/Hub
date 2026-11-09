<template>
    <div class="tasks-table page-column">
        <!-- Skeleton while first load is in flight -->
        <DataTable v-if="loading && tasks.length === 0" :value="skeletonRows" striped-rows :class="STACKED_TABLE_CLASS">
            <Column header="State" v-bind="stackedColumn('State')" style="width: 5rem;"><template #body><Skeleton width="2rem" height="1.5rem" /></template></Column>
            <Column header="Tool" v-bind="stackedColumn()"><template #body><Skeleton width="80%" /></template></Column>
            <Column v-if="showDataset" header="Dataset" v-bind="stackedColumn('Dataset', 'md')"><template #body><Skeleton width="70%" /></template></Column>
            <Column v-if="showOwner" header="Owner" v-bind="stackedColumn('Owner', 'xl')"><template #body><Skeleton width="60%" /></template></Column>
            <Column header="Progress" v-bind="stackedColumn('Progress', 'md')"><template #body><Skeleton width="90%" /></template></Column>
            <Column header="Created" v-bind="stackedColumn('Created', 'lg')"><template #body><Skeleton width="70%" /></template></Column>
            <Column header="Duration" style="width: 9rem;" v-bind="stackedColumn('Duration', 'lg')"><template #body><Skeleton width="60%" /></template></Column>
            <Column header="Actions" style="width: 10rem;" v-bind="stackedColumn()"><template #body><Skeleton width="90%" /></template></Column>
        </DataTable>

        <!-- Empty state -->
        <EmptyState v-else-if="tasks.length === 0" title="No tasks found" :filtered="filtered" :clear-label="filtered ? 'Clear filters' : ''"
                    @clear="$emit('clear-filters')">
            <p>{{ emptyMessage }}</p>
        </EmptyState>

        <!-- Task table -->
        <DataTable v-else :value="slicedTasks" striped-rows row-hover :class="STACKED_TABLE_CLASS"
                   :lazy="lazy" :total-records="lazy ? totalRecords : undefined" :first="lazy ? first : undefined"
                   :sort-field="lazy ? sortField : 'createdAt'" :sort-order="lazy ? sortOrder : -1"
                   scrollable scroll-height="flex"
                   :paginator="lazy"
                   :paginator-template="`FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink${$slots.paginatorend ? '' : ' RowsPerPageDropdown'}`"
                   :rows="lazy ? rows : undefined"
                   :rows-per-page-options="lazy && !$slots.paginatorend ? rowsPerPageOptions : undefined"
                   :page-link-size="3" @page="onPage" @sort="onSort">
            <!-- The parent's own page size select in place of the paginator's (Admin > Tasks labels the size that fits) -->
            <template v-if="$slots.paginatorend" #paginatorend><slot name="paginatorend" /></template>
            <Column field="state" header="State" sortable v-bind="stackedColumn('State', undefined, {}, sortableHeaderPt(stacked))" style="width: 5rem;">
                <template #body="slotProps">
                    <Tag :severity="stateTag(slotProps.data).severity"
                         :pt="{ root: { title: stateTag(slotProps.data).title, 'aria-label': stateTag(slotProps.data).label } }">
                        <i :class="stateTag(slotProps.data).icon" style="font-size: 1rem;" />
                    </Tag>
                </template>
            </Column>
            <Column field="toolId" header="Tool" sortable v-bind="stackedColumn(undefined, undefined, {}, sortableHeaderPt(stacked))">
                <template #body="slotProps">
                    <div :title="slotProps.data.path || ''">
                        <strong>{{ toolTitle(slotProps.data.toolId, tools) }}</strong>
                        <span class="muted"> v{{ slotProps.data.version }}</span>
                        <small class="path-details">{{ formatPath(slotProps.data.path) }}</small>
                        <!-- On a phone the card has the room for the whole path -->
                        <small class="path-full">{{ fullPath(slotProps.data.path) }}</small>
                    </div>
                </template>
            </Column>
            <Column v-if="showDataset" header="Dataset" class="col-dataset" v-bind="stackedColumn('Dataset', 'md')">
                <template #body="slotProps">
                    <span class="dataset-cell" :title="`${slotProps.data.orgSlug}/${slotProps.data.dsSlug}`">{{ slotProps.data.orgSlug }}/{{ slotProps.data.dsSlug }}</span>
                </template>
            </Column>
            <Column v-if="showOwner" header="Owner" class="col-owner" v-bind="stackedColumn('Owner', 'xl')">
                <template #body="slotProps">
                    <span class="owner-cell" :title="slotProps.data.owner || slotProps.data.userId || 'System'">{{ slotProps.data.owner || slotProps.data.userId || 'System' }}</span>
                </template>
            </Column>
            <Column header="Progress" class="col-progress" v-bind="stackedColumn('Progress', 'md')">
                <template #body="slotProps">
                    <div v-if="progressKind(slotProps.data) === 'waiting'" class="waiting-for-files"
                         :title="stateTag(slotProps.data).title">
                        <Tag severity="warn" icon="fa-solid fa-hourglass-half" :value="stateTag(slotProps.data).label" />
                        <small v-if="stateTag(slotProps.data).files.length" class="missing-files">{{ stateTag(slotProps.data).files.join(', ') }}</small>
                    </div>
                    <div v-else-if="progressKind(slotProps.data) === 'failed'" class="task-failed">
                        <Tag severity="danger" icon="fa-solid fa-triangle-exclamation" value="Failed" />
                        <small class="error-text" :title="slotProps.data.errorType || undefined">{{ failureText(slotProps.data) }}</small>
                    </div>
                    <div v-else-if="progressKind(slotProps.data) === 'bar'" class="task-progress">
                        <ProgressBar :value="progressValue(slotProps.data)" :mode="barMode(slotProps.data)"
                                     :show-value="true" style="height: 1rem;" />
                        <small v-if="slotProps.data.phaseMessage" class="muted">{{ slotProps.data.phaseMessage }}</small>
                    </div>
                    <div v-else class="muted">-</div>
                </template>
            </Column>
            <Column field="createdAt" header="Created" sortable class="col-created" v-bind="stackedColumn('Created', 'lg', {}, sortableHeaderPt(stacked))">
                <template #body="slotProps">
                    <div class="date-time">
                        <div>{{ formatDateTime(slotProps.data.createdAt) }}</div>
                        <small class="relative-time">{{ getRelativeTime(slotProps.data.createdAt) }}</small>
                    </div>
                </template>
            </Column>
            <Column header="Duration" style="width: 9rem;" v-bind="stackedColumn('Duration', 'lg')">
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
            <Column header="Actions" style="width: 10rem;" v-bind="stackedColumn()">
                <template #body="slotProps">
                    <div class="d-flex gap-1 flex-wrap">
                        <Button size="small" severity="secondary" icon="fa-solid fa-terminal" title="View log" aria-label="View log"
                                @click="$emit('view-log', slotProps.data)" />
                        <Button v-if="canDownloadResult(slotProps.data, tools)" size="small" icon="fa-solid fa-download"
                                label="Result" :title="resultAvailabilityHint(slotProps.data)"
                                :loading="slotProps.data.taskId === downloadingTaskId"
                                :disabled="slotProps.data.taskId === downloadingTaskId"
                                @click="$emit('download-result', slotProps.data)" />
                        <Button v-if="canCancel(slotProps.data)" size="small" severity="secondary"
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
import Tag from 'primevue/tag';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Skeleton from 'primevue/skeleton';
import ProgressBar from 'primevue/progressbar';
import EmptyState from '@/components/EmptyState.vue';
import { stackedColumn, sortableHeaderPt, STACKED_TABLE_CLASS } from '@/libs/responsiveColumns';
import { useStackedLayout } from '@/composables/useStackedLayout';
import { isWaitingForFiles } from '@/libs/tasks/taskFormat';

/**
 * Presentational task table shared by the per-dataset Task History tab and the
 * admin Tasks dashboard. Contains no fetch logic: data, loading and
 * paging are driven by the parent via props/events.
 */
export default {
    name: 'TasksTable',

    components: { Button, EmptyState, Tag, DataTable, Column, Skeleton, ProgressBar },


    props: {
        tasks: { type: Array, default: () => [] },
        tools: { type: Array, default: () => [] },
        loading: { type: Boolean, default: false },
        showOwner: { type: Boolean, default: false },
        showDataset: { type: Boolean, default: false },
        lazy: { type: Boolean, default: false },
        totalRecords: { type: Number, default: 0 },
        // The offset of the page the lazy table shows (the parent's skip): the paginator marks that page
        first: { type: Number, default: 0 },
        rows: { type: Number, default: 10 },
        emptyMessage: { type: String, default: 'No processing tasks have been run yet.' },
        // The list is empty because filters hide tasks: the empty state offers 'Clear filters' (FR-PRC-28)
        filtered: { type: Boolean, default: false },
        // The server-side order of a lazy table: a field of the whitelist (createdAt, state, toolId) and 1 / -1
        sortField: { type: String, default: 'createdAt' },
        sortOrder: { type: Number, default: -1 },
        rowsPerPageOptions: { type: Array, default: () => [10, 25, 50, 100] },
        // Task id whose result download is currently in flight: its Result button is
        // disabled + spinning to prevent repeated clicks overloading the server.
        downloadingTaskId: { type: String, default: null },
        // Current page offset (0-based), controlled by parent for client-side pagination.
        currentPageFirst: { type: Number, default: 0 }
    },

    emits: ['view-log', 'download-result', 'cancel', 'retry', 'delete', 'page', 'page-reset', 'sort', 'clear-filters'],

    setup() {
        // Secondary columns leave a narrow table; below `sm` every row is a stacked card with all of them (D-026),
        // and the hidden header's sortable cells leave the tab order
        return { ...useTaskFormatting(), stackedColumn, sortableHeaderPt, STACKED_TABLE_CLASS, stacked: useStackedLayout() };
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
         * Whether the row offers Cancel: an active task, unless the Registry says that it cannot be
         * cancelled (`cancellable` false: a committed task, whose rollback would lose its output;
         * FR-XC-27). The action is hidden then, not disabled. A Registry that does not send the
         * field (an older one) keeps Cancel for every active task.
         */
        canCancel(task) {
            return this.isActive(task.state) && task.cancellable !== false;
        },

        /**
         * What the Progress column renders for a row: 'waiting', 'failed', 'bar' or 'none'.
         * A build that succeeded without building, its entry waiting for files, shows
         * what it waits for. A failed task shows a red Failed tag and why it failed (the
         * task's error), never a bar. Only Processing and Succeeded (100%) render a bar.
         * Queued states (Created/Enqueued/Scheduled/Reused/Awaiting) and Deleted (reached
         * by the Cancel button) show a muted placeholder.
         */
        progressKind(task) {
            if (isWaitingForFiles(task)) return 'waiting';
            if (task.state === 'Failed') return 'failed';
            if (task.state === 'Processing' || task.state === 'Succeeded') return 'bar';
            return 'none';
        },

        /**
         * Why a failed task failed: the server's message (scrubbed of server paths). A task that
         * failed before the server recorded messages has only its exception type.
         */
        failureText(task) {
            return task.error || task.errorType || 'The task failed';
        },

        /** Bar fill: reported percent while Processing, full once it succeeded. */
        progressValue(task) {
            if (task.state === 'Processing') return task.progressPercent || 0;
            return 100; // Succeeded
        },

        /** A succeeded task shows a full determinate bar; Processing shows one only with a real percent. */
        barMode(task) {
            const ended = task.state === 'Succeeded';
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

        /** The whole path of a task, which may break after a slash (the card of a phone shows it) */
        fullPath(path) {
            return path ? path.split('/').join('/\u200B') : 'Whole dataset';
        },

        /** A click on a sortable header of a lazy table: the parent asks the server in that order */
        onSort(event) {
            if (this.lazy) {
                this.$emit('sort', { field: event.sortField, order: event.sortOrder });
            }
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

<style scoped lang="scss">
@use '../../../css/breakpoints' as *;

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

/* A page size select of the parent follows the page links */
.tasks-table :deep(.p-paginator-content-end) {
    margin-inline-start: 0;
}

.muted {
    color: var(--ddb-text-muted);
}

.error-text {
    color: var(--ddb-danger);
}

.task-failed {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ddb-spacing-xs);
    min-width: 0;
}

.task-failed .error-text {
    max-width: 100%;
    overflow-wrap: anywhere;
}

/* The bar is at most 20rem wide, whatever the column (FR-EXP-42) */
.task-progress {
    min-width: 0;
    max-width: 20rem;
}

/* On a very wide screen only Tool is flexible: the other columns have the width of their content, so a row reads
   in one look and the name and its data are not 2000 px apart (FR-EXP-42, FR-ADM-27) */
@include xwide-up {
    .tasks-table :deep(.col-progress) { width: 16rem; }
    .tasks-table :deep(.col-created) { width: 11rem; }
    .tasks-table :deep(.col-dataset),
    .tasks-table :deep(.col-owner) { width: 14rem; }
}

.waiting-for-files {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ddb-spacing-xs);
    min-width: 0;
}

.missing-files {
    max-width: 100%;
    color: var(--ddb-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.path-full {
    display: none;
    color: var(--ddb-text-muted);
    overflow-wrap: anywhere;
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

/* A phone card: the whole path, wrapped, in place of the cut one; its buttons take their own width */
@media only screen and (max-width: 575.98px) {
    .path-details {
        display: none;
    }

    .path-full {
        display: block;
    }

    .tasks-table :deep(.p-datatable-table .p-button) {
        flex: 0 0 auto;
    }
}

.duration {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.duration.running {
    color: var(--ddb-warning-text);
}
</style>
