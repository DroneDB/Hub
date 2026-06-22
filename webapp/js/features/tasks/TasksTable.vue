<template>
    <div class="tasks-table">
        <!-- Skeleton while first load is in flight -->
        <DataTable v-if="loading && tasks.length === 0" :value="skeletonRows" stripedRows
            :pt="{ table: { style: 'table-layout: fixed; min-width: 50rem' } }">
            <Column header="State" style="width: 5rem;"><template #body><Skeleton width="2rem" height="1.5rem" /></template></Column>
            <Column header="Tool"><template #body><Skeleton width="80%" /></template></Column>
            <Column v-if="showDataset" header="Dataset"><template #body><Skeleton width="70%" /></template></Column>
            <Column v-if="showOwner" header="Owner"><template #body><Skeleton width="60%" /></template></Column>
            <Column header="Progress"><template #body><Skeleton width="90%" /></template></Column>
            <Column header="Created"><template #body><Skeleton width="70%" /></template></Column>
            <Column header="Duration" style="width: 9rem;"><template #body><Skeleton width="60%" /></template></Column>
            <Column header="Actions" style="width: 10rem;"><template #body><Skeleton width="90%" /></template></Column>
        </DataTable>

        <!-- Empty state -->
        <PrimeMessage v-else-if="tasks.length === 0" severity="info" :closable="false">
            <strong>No tasks found</strong>
            <p>{{ emptyMessage }}</p>
        </PrimeMessage>

        <!-- Task table -->
        <DataTable v-else :value="tasks" stripedRows rowHover paginator :rows="rows"
            :lazy="lazy" :totalRecords="lazy ? totalRecords : undefined"
            :sortField="lazy ? undefined : 'createdAt'" :sortOrder="-1"
            scrollable scrollHeight="flex"
            paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
            :rowsPerPageOptions="rowsPerPageOptions"
            @page="onPage" :pt="{ table: { style: 'table-layout: fixed; min-width: 50rem' } }">
            <Column field="state" header="State" :sortable="!lazy" style="width: 5rem;">
                <template #body="slotProps">
                    <Tag :severity="getTagSeverity(slotProps.data.state)"
                        :pt="{ root: { title: slotProps.data.state } }">
                        <i :class="getStateIcon(slotProps.data.state)" style="font-size: 1rem;"></i>
                    </Tag>
                </template>
            </Column>
            <Column field="toolId" header="Tool" :sortable="!lazy">
                <template #body="slotProps">
                    <div :title="slotProps.data.path || ''">
                        <strong>{{ toolTitle(slotProps.data.toolId, tools) }}</strong>
                        <span class="muted"> v{{ slotProps.data.version }}</span>
                        <br>
                        <small class="path-details">{{ formatPath(slotProps.data.path) }}</small>
                    </div>
                </template>
            </Column>
            <Column v-if="showDataset" header="Dataset">
                <template #body="slotProps">
                    <span class="dataset-cell">{{ slotProps.data.orgSlug }}/{{ slotProps.data.dsSlug }}</span>
                </template>
            </Column>
            <Column v-if="showOwner" header="Owner">
                <template #body="slotProps">
                    <span class="owner-cell">{{ slotProps.data.owner || slotProps.data.userId || 'System' }}</span>
                </template>
            </Column>
            <Column header="Progress">
                <template #body="slotProps">
                    <div v-if="isActive(slotProps.data.state)">
                        <ProgressBar :value="slotProps.data.progressPercent || 0" :showValue="true" style="height: 1rem;" />
                        <small v-if="slotProps.data.phaseMessage" class="muted">{{ slotProps.data.phaseMessage }}</small>
                    </div>
                    <div v-else-if="slotProps.data.state === 'Failed'" class="error-text" :title="slotProps.data.errorType">
                        <i class="fa-solid fa-triangle-exclamation"></i> {{ slotProps.data.errorType || 'Failed' }}
                    </div>
                    <div v-else class="muted">-</div>
                </template>
            </Column>
            <Column field="createdAt" header="Created" :sortable="!lazy">
                <template #body="slotProps">
                    <div class="date-time">
                        <div>{{ formatDateTime(slotProps.data.createdAt) }}</div>
                        <small class="relative-time">{{ getRelativeTime(slotProps.data.createdAt) }}</small>
                    </div>
                </template>
            </Column>
            <Column header="Duration" style="width: 9rem;">
                <template #body="slotProps">
                    <div v-if="isActive(slotProps.data.state)" class="duration running" title="Running time">
                        <i class="fa-solid fa-stopwatch"></i> {{ runningTime(slotProps.data) }}
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
                        <Button size="small" severity="secondary" icon="fa-solid fa-terminal" title="View log"
                            @click="$emit('view-log', slotProps.data)" />
                        <Button v-if="canDownloadResult(slotProps.data, tools)" size="small" icon="fa-solid fa-download"
                            label="Result" :title="resultAvailabilityHint(slotProps.data)"
                            :loading="slotProps.data.taskId === downloadingTaskId"
                            :disabled="slotProps.data.taskId === downloadingTaskId"
                            @click="$emit('download-result', slotProps.data)" />
                        <Button v-if="isActive(slotProps.data.state)" size="small" severity="warn"
                            icon="fa-solid fa-stop" title="Cancel" @click="$emit('cancel', slotProps.data)" />
                        <Button v-if="slotProps.data.state === 'Failed'" size="small" severity="secondary"
                            icon="fa-solid fa-rotate-right" title="Retry" @click="$emit('retry', slotProps.data)" />
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>
</template>

<script>
import useTaskFormatting from '@/composables/useTaskFormatting';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Tag from 'primevue/tag';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Skeleton from 'primevue/skeleton';
import ProgressBar from 'primevue/progressbar';

/**
 * Presentational task table shared by the per-dataset Task History tab and the
 * admin Tasks dashboard (spec §B.3). Contains no fetch logic: data, loading and
 * paging are driven by the parent via props/events.
 */
export default {
    name: 'TasksTable',

    mixins: [useTaskFormatting],

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
        downloadingTaskId: { type: String, default: null }
    },

    emits: ['view-log', 'download-result', 'cancel', 'retry', 'page'],

    data() {
        return {
            skeletonRows: Array.from({ length: 8 }, (_, i) => ({ id: i }))
        };
    },

    methods: {
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

.tasks-table :deep(.p-datatable-table-container) {
    flex: 1;
    min-height: 0;
}

.muted {
    color: var(--ddb-text-muted, #888);
}

.error-text {
    color: var(--ddb-danger, #d9534f);
}

.path-details {
    color: var(--ddb-text-muted, #888);
}

.dataset-cell,
.owner-cell {
    word-break: break-all;
}

.duration {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.duration.running {
    color: var(--ddb-warning, #f0ad4e);
}
</style>
