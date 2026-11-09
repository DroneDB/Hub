<template>
    <div id="admin-tasks" class="admin-tasks-page page-scroll">

        <div class="top-banner d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
                <h1>Tasks</h1>
            </div>
            <div>
                <Button severity="secondary" icon="fa-solid fa-arrows-rotate" label="Refresh"
                        :loading="loading" @click="refreshData" />
            </div>
        </div>

        <div class="filters d-flex gap-2 flex-wrap mb-3">
            <Select v-model="selectedUser" aria-label="Filter by user" :options="userOptions" option-label="label" option-value="value"
                    placeholder="All users" filter show-clear class="filter-select" @change="onFilterChange" />
            <Select v-model="selectedTool" aria-label="Filter by tool" :options="toolOptions" option-label="label" option-value="value"
                    placeholder="All tools" show-clear class="filter-select" @change="onFilterChange" />
            <Select v-model="selectedState" aria-label="Filter by state" :options="stateOptions" option-label="label" option-value="value"
                    placeholder="All States" class="filter-select" @change="onFilterChange" />
        </div>

        <TasksTable :tasks="items" :tools="taskTools" :loading="loading" show-owner show-dataset lazy
                    :total-records="total" :rows="pageSize"
                    :downloading-task-id="downloadingTaskId"
                    style="flex: 1; min-height: 18rem;"
                    empty-message="No tasks match the current filters."
                    @page="onPage" @view-log="openLog" @download-result="downloadResult"
                    @cancel="taskActions.cancel" @retry="taskActions.retry" @delete="taskActions.remove" />

        <TaskLogDialog v-model:visible="logDialogOpen" :title="taskActions.logTitle(logTask)" :log-text="logText"
                       :is-active="logTask && isActive(logTask.state)" @refresh="refreshLog" />

        <DialogHost :dialogs="dialogs" />
    </div>
</template>

<script>
import { getCurrentInstance } from 'vue';
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

/**
 * Admin global tasks dashboard. Lists tasks across all users and
 * datasets with server-side paging and tool/state/user filters. Reuses the shared
 * presentational TasksTable and the per-dataset task endpoints for row actions.
 */
export default {
    name: 'TasksPage',

    components: { Button, Select, TasksTable, TaskLogDialog, DialogHost },

    setup() {
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
        return { dialogs, taskActions, ...formatting };
    },
    data() {
        return {
            items: [],
            total: 0,
            loading: false,
            pageSize: 10,
            skip: 0,

            users: [],
            selectedUser: '',
            selectedTool: '',
            selectedState: '',

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
        hasActiveTasks() {
            return this.items.some(t => this.isActive(t.state));
        }
    },

    async mounted() {
        await this.loadUsers();
        await this.loadTasks();
        this.scheduleAutoRefresh();
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

        async loadTasks() {
            this.loading = true;
            try {
                const res = await reg.admin.adminTasks({
                    toolId: this.selectedTool || undefined,
                    state: this.selectedState || undefined,
                    userId: this.selectedUser || undefined,
                    skip: this.skip,
                    take: this.pageSize
                });
                this.items = (res && res.items) || [];
                this.total = (res && res.total) || 0;
            } catch (e) {
                console.error('Failed to load tasks:', e);
                if (isForbidden(e)) {
                    this.$router.push({ name: 'Organizations' }).catch(() => { });
                    return;
                }
                this.items = [];
                this.total = 0;
            } finally {
                this.loading = false;
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

        onFilterChange() {
            this.skip = 0;
            this.loadTasks();
        },

        onPage({ skip, take }) {
            this.skip = skip;
            this.pageSize = take;
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
.admin-tasks-page {
    padding: var(--ddb-spacing-lg) var(--ddb-page-padding-x);
    display: flex;
    flex-direction: column;
}

.top-banner {
    margin-bottom: var(--ddb-spacing-lg);
}

.filter-select {
    min-width: 12rem;
}

/* On a phone each filter takes the whole row */
@media only screen and (max-width: 575.98px) {
    .filter-select {
        flex: 1 1 100%;
    }
}
</style>
