<template>
    <div id="admin-tasks" ref="page" class="admin-tasks-page page-scroll page-scroll-column">

        <div class="top-banner d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
                <h1>Tasks</h1>
            </div>
            <div>
                <Button severity="secondary" icon="fa-solid fa-arrows-rotate" label="Refresh"
                        :loading="loading" @click="refreshData" />
            </div>
        </div>

        <!-- The three filters clear the same way (their x, or Clear filters), and stay in the address -->
        <div class="filters d-flex gap-2 flex-wrap mb-3">
            <Select v-model="selectedUser" aria-label="Filter by user" :options="userOptions" option-label="label" option-value="value"
                    placeholder="All users" filter show-clear class="filter-select" @change="onFilterChange" />
            <Select v-model="selectedTool" aria-label="Filter by tool" :options="toolOptions" option-label="label" option-value="value"
                    placeholder="All tools" show-clear class="filter-select" @change="onFilterChange" />
            <Select v-model="selectedState" aria-label="Filter by state" :options="stateOptions" option-label="label" option-value="value"
                    placeholder="All States" show-clear class="filter-select" @change="onFilterChange" />
            <Button v-if="filtered" severity="secondary" text icon="fa-solid fa-filter-circle-xmark" label="Clear filters"
                    class="clear-filters" @click="clearFilters" />
        </div>

        <!-- The rows fill the height (the page size follows it) and the paginator is right below them (FR-ADM-29) -->
        <TasksTable ref="table" :tasks="items" :tools="taskTools" :loading="loading" show-owner show-dataset lazy
                    :total-records="total" :first="skip" :rows="pageSize" :filtered="filtered"
                    :sort-field="sortField" :sort-order="sortOrder"
                    :downloading-task-id="downloadingTaskId" :busy-task-ids="[...taskActions.busyIds]"
                    class="tasks-list"
                    empty-message="No tasks match the current filters."
                    @page="onPage" @sort="onSort" @clear-filters="clearFilters" @view-log="openLog" @download-result="downloadResult"
                    @cancel="taskActions.cancel" @retry="taskActions.retry" @delete="taskActions.remove">
            <!-- The size that fits reads "N (fit)": picking it stores no size (FR-XC-34) -->
            <template #paginatorend>
                <Select :model-value="pageSize" :options="pageSizeChoices" option-label="label" option-value="value"
                        aria-label="Tasks per page" class="page-size-select" @update:model-value="take => onPage({ skip, take })" />
            </template>
        </TasksTable>

        <TaskLogDialog v-model:visible="logDialogOpen" :title="taskActions.logTitle(logTask)" :log-text="logText"
                       :is-active="logTask && isActive(logTask.state)" @refresh="refreshLog" />

        <DialogHost :dialogs="dialogs" />
    </div>
</template>

<script>
import { getCurrentInstance, ref } from 'vue';
import { useTaskFormatting } from '@/composables/useTaskFormatting';
import { useTaskActions } from '@/composables/useTaskActions';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import TasksTable from '@/features/tasks/TasksTable.vue';
import TaskLogDialog from '@/features/tasks/TaskLogDialog.vue';
import DialogHost from '@/components/DialogHost.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import reg from '@/libs/api/sharedRegistry';
import { isForbidden } from '@/libs/ddb/apiError';
import { deniedLocation } from '@/libs/authRoutes';
import { readTaskFilters, taskFilterKeys, hasTaskFilters, lastPageSkip, TASK_PAGE_SIZES } from '@/libs/tasks/taskFilters';
import { currentLocation, replaceQueryKeys } from '@/libs/routeQuery';
import { usePageSize, visibleListHeight, heightOfFirst, averageRowHeight } from '@/composables/usePageSize';
import { pageStart } from '@/libs/pageSize';
import { PREF } from '@/libs/preferences';
import { getAdminPageSize, saveAdminPageSize } from '@/libs/storageUtils';

/**
 * Admin global tasks dashboard. Lists tasks across all users and
 * datasets with server-side paging and tool/state/user filters. Reuses the shared
 * presentational TasksTable and the per-dataset task endpoints for row actions.
 */
export default {
    name: 'TasksPage',

    components: { Button, Select, TasksTable, TaskLogDialog, DialogHost },

    setup() {
        // The size the user chose: the address (a link) or what the user kept; none: the rows that fit the height (FR-XC-34)
        const table = ref(null);
        const page = ref(null);
        const sizing = usePageSize({
            height: () => visibleListHeight({
                area: page.value, list: table.value,
                reserved: () => heightOfFirst(table.value, '.p-datatable-thead', 45) + heightOfFirst(table.value, '.p-paginator', 56)
            }),
            // The placeholder rows shown while the first page loads are not the height of task rows: the known one until rows are there
            rowHeight: () => (/** @type {any} */ (table.value)?.tasks?.length ? averageRowHeight(table.value, 'tbody tr', 72) : 72),
            sizes: TASK_PAGE_SIZES,
            initial: readTaskFilters(currentLocation().query).take ?? getAdminPageSize(PREF.ADMIN_TASKS)
        });
        const dialogs = useDialogs();
        const formatting = useTaskFormatting();
        // The same row actions as the dataset Tasks tab (FR-XC-15), on the task's own dataset
        const vm = /** @type {any} */ (getCurrentInstance()?.proxy);
        const taskActions = useTaskActions({
            datasetOf: task => reg.Organization(task.orgSlug).Dataset(task.dsSlug),
            deleteTask: task => reg.admin.adminDeleteTask(task.taskId),
            refresh: async () => {
                await vm.loadTasks();
                vm.scheduleAutoRefresh();
            },
            confirm: useConfirm(dialogs),
            toolTitle: task => formatting.toolTitle(task.toolId),
            datasetName: task => `${task.orgSlug}/${task.dsSlug}`
        });
        return { dialogs, taskActions, ...formatting, ...sizing, table, page };
    },
    data() {
        // The list as the address has it: a reload or a link opens the same filters, page and order
        const read = readTaskFilters(currentLocation().query);
        return {
            items: [],
            total: 0,
            loading: false,
            skip: read.skip,
            sortField: read.sortField,
            sortOrder: read.sortOrder,

            users: [],
            selectedUser: read.userId,
            selectedTool: read.toolId,
            selectedState: read.state,

            logDialogOpen: false,
            logTask: null,
            logText: '',

            downloadingTaskId: null
        };
    },

    computed: {
        userOptions() {
            const opts = [{ label: 'All users', value: '' }];
            this.users.forEach(u => {
                const label = u.email ? `${u.userName} (${u.email})` : u.userName;
                opts.push({ label, value: u.id });
            });
            return opts;
        },
        toolOptions() {
            return [{ label: 'All tools', value: '' }]
                .concat(this.taskTools.map(t => ({ label: t.title || t.id, value: t.id })));
        },
        /** A filter hides tasks: the empty state offers Clear filters, and so does the toolbar */
        filtered() {
            return hasTaskFilters({ toolId: this.selectedTool || '', state: this.selectedState || '', userId: this.selectedUser || '' });
        },
        hasActiveTasks() {
            return this.items.some(t => this.isActive(t.state));
        }
    },

    watch: {
        // The size that fits changed (the window was resized): the page that holds the first task shown
        pageSize(size) {
            if (!this._started || size === this._requestedSize) return;
            this.skip = pageStart(this.skip, size);
            this.keepInAddress();
            this.loadTasks();
        }
    },

    async mounted() {
        // The table and its header are on the page (placeholder rows) while the users load: the first page is
        // measured on them, so it asks for the size that fits once (FR-ADM-29)
        this.loading = true;
        await this.loadUsers();
        await this.$nextTick();
        // An address without a page size holds the offset of its first task: the page of the size that fits holds it
        this.measurePageSize();
        const start = pageStart(this.skip, this.pageSize);
        if (start !== this.skip) {
            this.skip = start;
            this.keepInAddress();
        }
        this._started = true;
        await this.loadTasks();
        this.scheduleAutoRefresh();
        // The rows are on the page: their height may differ from the one expected, and so the size that fits
        await this.$nextTick();
        this.measurePageSize();
    },

    beforeUnmount() {
        this._unmounted = true;
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
    },

    methods: {
        async loadUsers() {
            try {
                this.users = await reg.admin.usersDetailed() || [];
            } catch (e) {
                console.error('Failed to load users:', e);
                this.users = [];
            }
        },

        // One page of tasks. A resize, the auto-refresh, a page or a filter may ask while another request is in
        // flight: only the answer of the latest request is shown, an older one arriving later is dropped
        async loadTasks() {
            const request = (this._tasksRequest = (this._tasksRequest ?? 0) + 1);
            const latest = () => request === this._tasksRequest && !this._unmounted;
            this._requestedSize = this.pageSize;
            this.loading = true;
            try {
                const res = await reg.admin.adminTasks({
                    toolId: this.selectedTool || undefined,
                    state: this.selectedState || undefined,
                    userId: this.selectedUser || undefined,
                    skip: this.skip,
                    take: this.pageSize,
                    sortField: this.sortField,
                    sortOrder: this.sortOrder === 1 ? 'asc' : 'desc'
                });
                if (!latest()) return;
                this.items = (res && res.items) || [];
                this.total = (res && res.total) || 0;
                // Past the end (a link to a page the list no longer has): the last page, in the address too
                if (this.total > 0 && this.skip >= this.total) {
                    this.skip = lastPageSkip(this.total, this.pageSize);
                    this.keepInAddress();
                    await this.loadTasks();
                    return;
                }
            } catch (e) {
                if (!latest()) return;
                console.error('Failed to load tasks:', e);
                // The server refuses the admin rights the client believed in: home, saying why
                if (isForbidden(e)) {
                    this.$router.push(deniedLocation('AdminTasks')).catch(() => { });
                    return;
                }
                this.items = [];
                this.total = 0;
            } finally {
                if (latest()) this.loading = false;
            }
        },

        async refreshData() {
            await this.loadTasks();
        },

        scheduleAutoRefresh() {
            if (this._refreshTimer) clearTimeout(this._refreshTimer);
            // A cancel or retry that ends after the page has gone must not start polling again.
            if (this._unmounted) return;
            const delay = this.hasActiveTasks ? 2500 : 15000;
            this._refreshTimer = setTimeout(async () => {
                await this.loadTasks();
                this.scheduleAutoRefresh();
            }, delay);
        },

        /** Writes the filters, the page and the order in the address (no new history entry) */
        keepInAddress() {
            replaceQueryKeys(taskFilterKeys({
                toolId: this.selectedTool || '', state: this.selectedState || '', userId: this.selectedUser || '',
                skip: this.skip, take: this.pageChoice, sortField: this.sortField, sortOrder: this.sortOrder === 1 ? 1 : -1
            }));
        },

        onFilterChange() {
            this.skip = 0;
            this.keepInAddress();
            this.loadTasks();
        },

        /** Every filter back to all, the same for the three (FR-PRC-28) */
        clearFilters() {
            this.selectedUser = '';
            this.selectedTool = '';
            this.selectedState = '';
            this.onFilterChange();
        },

        /** A page, or a page size: the user's choice is kept, and the page that holds the first task shown stays shown */
        onPage({ skip, take }) {
            const resized = take !== this.pageSize;
            if (resized) {
                this.choosePageSize(take);
                saveAdminPageSize(PREF.ADMIN_TASKS, this.pageChoice);
            }
            this.skip = resized ? pageStart(this.skip, take) : skip;
            this.keepInAddress();
            this.loadTasks();
        },

        /** A column to order by (createdAt, state, toolId): back to the first page */
        onSort({ field, order }) {
            this.sortField = field;
            this.sortOrder = order === 1 ? 1 : -1;
            this.skip = 0;
            this.keepInAddress();
            this.loadTasks();
        },

        // Per-task actions (cancel, retry, delete: useTaskActions) reuse the per-dataset endpoints, which
        // authorize admins via dataset ownership.
        datasetFor(task) {
            return reg.Organization(task.orgSlug).Dataset(task.dsSlug);
        },

        async downloadResult(task) {
            // Navigate to the authenticated result URL (cookie auth); the server
            // sends Content-Disposition: attachment so the browser downloads it.
            window.location.href = this.datasetFor(task).taskResultUrl(task.taskId);
        },

        async openLog(task) {
            this.logTask = task;
            this.logText = '';
            this.logDialogOpen = true;
            await this.refreshLog();
        },

        async refreshLog() {
            if (!this.logTask) return;
            try {
                const status = await this.datasetFor(this.logTask).getTask(this.logTask.taskId);
                this.logText = (status.logTail || []).join('\n');
            } catch (e) {
                this.logText = `Failed to load log: ${e.message}`;
            }
        },

    }
};
</script>

<style scoped>
/* The side padding is .page-scroll-column's: the content keeps the width of --ddb-page-max-width (FR-ADM-27) */
.admin-tasks-page {
    padding-block: var(--ddb-spacing-lg);
    display: flex;
    flex-direction: column;
}

.top-banner {
    margin-bottom: var(--ddb-spacing-lg);
}

.filter-select {
    min-width: 12rem;
}

/* The rows keep their height: the paginator is right below the last one. The table shrinks, and its
   rows scroll above the paginator, only when they are more than the screen holds */
.tasks-list {
    flex: 0 1 auto;
    min-height: 18rem;
}

/* On a phone each filter takes the whole row */
@media only screen and (max-width: 575.98px) {
    .filter-select {
        flex: 1 1 100%;
    }
}
</style>
