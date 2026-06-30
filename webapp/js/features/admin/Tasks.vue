<template>
    <div id="admin-tasks" class="admin-tasks-page">
        <Toast position="bottom-left" />

        <div class="top-banner d-flex justify-content-between align-items-center">
            <div>
                <h1>Tasks</h1>
            </div>
            <div>
                <Button @click="refreshData" severity="secondary" icon="fa-solid fa-arrows-rotate"
                    label="Refresh" :loading="loading" />
            </div>
        </div>

        <div class="filters d-flex gap-2 flex-wrap mb-3">
            <Select v-model="selectedUser" :options="userOptions" optionLabel="label" optionValue="value"
                placeholder="All users" filter showClear class="filter-select" @change="onFilterChange" />
            <Select v-model="selectedTool" :options="toolOptions" optionLabel="label" optionValue="value"
                placeholder="All tools" showClear class="filter-select" @change="onFilterChange" />
            <Select v-model="selectedState" :options="stateOptions" optionLabel="label" optionValue="value"
                placeholder="All States" class="filter-select" @change="onFilterChange" />
        </div>

        <TasksTable :tasks="items" :tools="taskTools" :loading="loading" show-owner show-dataset lazy
            :total-records="total" :rows="pageSize"
            :downloading-task-id="downloadingTaskId"
            style="flex: 1; min-height: 0;"
            empty-message="No tasks match the current filters."
            @page="onPage" @view-log="openLog" @download-result="downloadResult"
            @cancel="cancelTask" @retry="retryTask" />

        <TaskLogDialog v-model:visible="logDialogOpen" :title="logTaskTitle" :log-text="logText"
            @refresh="refreshLog" />
    </div>
</template>

<script>
import useTaskFormatting from '@/composables/useTaskFormatting';
import TasksTable from '@/features/tasks/TasksTable.vue';
import TaskLogDialog from '@/features/tasks/TaskLogDialog.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Toast from 'primevue/toast';
import reg from '@/libs/api/sharedRegistry';

/**
 * Admin global tasks dashboard (spec §B.4). Lists tasks across all users and
 * datasets with server-side paging and tool/state/user filters. Reuses the shared
 * presentational TasksTable and the per-dataset task endpoints for row actions.
 */
export default {
    mixins: [useTaskFormatting],

    components: { Button, Select, Toast, TasksTable, TaskLogDialog },

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

            downloadingTaskId: null,

            _refreshTimer: null
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
        },
        logTaskTitle() {
            return this.logTask ? this.toolTitle(this.logTask.toolId) : '';
        }
    },

    async mounted() {
        // No global route-guard: gate admin access here (consistent with the rest of the app).
        if (!reg.isAdmin()) {
            this.$router.push('/').catch(() => { });
            return;
        }

        await this.loadUsers();
        await this.loadTasks();
        this.scheduleAutoRefresh();
    },

    beforeUnmount() {
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
    },

    methods: {
        async loadUsers() {
            try {
                this.users = await reg.usersDetailed() || [];
            } catch (e) {
                console.error('Failed to load users:', e);
                this.users = [];
            }
        },

        async loadTasks() {
            this.loading = true;
            try {
                const res = await reg.adminTasks({
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
                if (e.status === 401 || e.status === 403) {
                    this.$router.push('/').catch(() => { });
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

        // Per-task actions reuse the existing per-dataset endpoints, which already
        // authorize admins via dataset ownership (spec §B.2).
        datasetFor(task) {
            return reg.Organization(task.orgSlug).Dataset(task.dsSlug);
        },

        async cancelTask(task) {
            try {
                await this.datasetFor(task).cancelTask(task.taskId);
                await this.loadTasks();
            } catch (e) {
                this._toast('error', 'Cancel failed', e.message);
            }
        },

        async retryTask(task) {
            try {
                await this.datasetFor(task).retryTask(task.taskId);
                await this.loadTasks();
                this.scheduleAutoRefresh();
            } catch (e) {
                this._toast('error', 'Retry failed', e.message);
            }
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

        _toast(severity, summary, detail) {
            if (this.$toast && typeof this.$toast.add === 'function') {
                this.$toast.add({ severity, summary, detail, life: severity === 'error' ? 6000 : 3000 });
            }
        }
    }
};
</script>

<style scoped>
.admin-tasks-page {
    padding: var(--ddb-spacing-lg);
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
}

.top-banner {
    margin-bottom: var(--ddb-spacing-lg);
}

.filter-select {
    min-width: 12rem;
}
</style>
