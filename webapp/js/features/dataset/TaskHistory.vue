<template>
    <div id="task-history" class="task-history-page">
        <div class="filters">
            <div class="filter-bar">
                <div class="d-flex gap-2 align-items-center flex-wrap">
                    <Select v-model="selectedState" :options="stateOptions" optionLabel="label" optionValue="value"
                        placeholder="All States" @change="applyFilters" />
                    <Select v-model="selectedTool" :options="toolFilterOptions" optionLabel="label" optionValue="value"
                        placeholder="All Tools" @change="applyFilters" />
                    <Button @click="refreshData" icon="fa-solid fa-arrows-rotate" label="Refresh" severity="secondary"
                        :loading="loading" />
                    <Button severity="danger" @click="showClearDialog" :disabled="concludedCount === 0"
                        icon="fa-solid fa-trash" label="Clear Concluded" />
                </div>
            </div>
        </div>

        <div class="content">
            <TasksTable :tasks="filteredTasks" :tools="tools" :loading="loading" :rows="pageSize"
                :downloading-task-id="downloadingTaskId"
                empty-message="No processing tasks have been run for this dataset yet."
                @view-log="openLog" @download-result="downloadResult"
                @cancel="cancelTask" @retry="retryTask" />
        </div>

        <!-- Photogrammetry launcher -->
        <Dialog v-model:visible="photogrammetryDialogOpen" modal header="Run Photogrammetry (NodeODM)"
            :style="{ width: '32rem' }">
            <div class="mb-3">
                <label class="d-block mb-1"><strong>Image folder</strong> <span class="muted">(optional)</span></label>
                <InputText v-model="photogrammetryForm.folder" class="w-100"
                    placeholder="Leave empty to use the whole dataset" />
                <small class="muted">All images under this folder will be processed.</small>
            </div>
            <div v-if="photogrammetryNodes.length > 1" class="mb-3">
                <label class="d-block mb-1"><strong>Processing node</strong></label>
                <Select v-model="photogrammetryForm.nodeId" :options="photogrammetryNodes"
                    optionLabel="label" optionValue="value" class="w-100" />
            </div>
            <div class="mb-3">
                <label class="d-block mb-1"><strong>Task name</strong> <span class="muted">(optional)</span></label>
                <InputText v-model="photogrammetryForm.name" class="w-100" placeholder="Auto-generated" />
            </div>
            <div class="mb-2">
                <label class="d-block mb-1"><strong>NodeODM options</strong> <span class="muted">(optional, JSON array)</span></label>
                <Textarea v-model="photogrammetryForm.optionsText" class="w-100" rows="4"
                    placeholder='[{"name":"fast-orthophoto","value":true}]' />
                <small v-if="optionsError" class="error-text">{{ optionsError }}</small>
            </div>
            <template #footer>
                <Button label="Cancel" severity="secondary" @click="photogrammetryDialogOpen = false" />
                <Button label="Start" icon="fa-solid fa-play" :loading="submitting" @click="submitPhotogrammetry" />
            </template>
        </Dialog>

        <!-- Log viewer -->
        <TaskLogDialog v-model:visible="logDialogOpen" :title="logTaskTitle" :log-text="logText"
            @refresh="refreshLog" />

        <ConfirmDialog v-if="clearDialogOpen"
            title="Clear Concluded Tasks"
            :message="`Delete all concluded tasks?<br/><strong>${concludedCount} task(s)</strong> will be removed from the history.`"
            confirmText="Clear" cancelText="Cancel" confirmButtonClass="danger"
            warningTitle="Warning" warningMessage="This action cannot be undone."
            @onClose="handleClearDialogClose">
        </ConfirmDialog>
    </div>
</template>

<script>
import useHeavyTask from '@/composables/useHeavyTask';
import useTaskFormatting from '@/composables/useTaskFormatting';
import emitter from '@/libs/eventBus';
import TasksTable from '@/features/tasks/TasksTable.vue';
import TaskLogDialog from '@/features/tasks/TaskLogDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';

export default {
    mixins: [useHeavyTask, useTaskFormatting],

    components: {
        ConfirmDialog, Button, Select, Dialog, InputText, Textarea, TasksTable, TaskLogDialog
    },

    props: {
        dataset: { type: Object, required: true },
        canWrite: { type: Boolean, default: false }
    },

    data() {
        return {
            tasks: [],
            filteredTasks: [],
            tools: [],
            loading: false,
            submitting: false,
            selectedState: '',
            selectedTool: '',
            pageSize: 20,
            _refreshTimer: null,
            downloadingTaskId: null,

            photogrammetryDialogOpen: false,
            photogrammetryNodes: [],
            photogrammetryForm: { folder: '', nodeId: undefined, name: '', optionsText: '' },
            optionsError: '',

            logDialogOpen: false,
            logTask: null,
            logText: '',

            clearDialogOpen: false
        };
    },

    computed: {
        concludedCount() {
            return this.tasks.filter(t => !this.isActive(t.state)).length;
        },
        hasActiveTasks() {
            return this.tasks.some(t => this.isActive(t.state));
        },
        hasPhotogrammetry() {
            return this.tools.some(t => t.id === 'photogrammetry');
        },
        toolFilterOptions() {
            const opts = [{ label: 'All Tools', value: '' }];
            const seen = new Set();
            this.tasks.forEach(t => {
                if (t.toolId && !seen.has(t.toolId)) {
                    seen.add(t.toolId);
                    opts.push({ label: this.toolTitle(t.toolId, this.tools), value: t.toolId });
                }
            });
            return opts;
        },
        logTaskTitle() {
            return this.logTask ? this.toolTitle(this.logTask.toolId, this.tools) : '';
        }
    },

    async mounted() {
        await this.loadTools();
        await this.loadTasks();
        this.scheduleAutoRefresh();
    },

    beforeUnmount() {
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        // Clear the global flag so the download button re-enables when leaving the dataset.
        emitter.emit('setActiveBulkDownload', false);
    },

    methods: {
        async loadTools() {
            try {
                this.tools = await this.dataset.getTaskTools() || [];
            } catch (e) {
                console.error('Failed to load task tools:', e);
                this.tools = [];
            }
        },

        async loadTasks() {
            this.loading = true;
            try {
                this.tasks = await this.dataset.getTasks({ take: 200 }) || [];
                this.applyFilters();
            } catch (e) {
                console.error('Failed to load tasks:', e);
                this.tasks = [];
                this.filteredTasks = [];
            } finally {
                this.loading = false;
            }
        },

        async refreshData() {
            await this.loadTasks();
        },

        scheduleAutoRefresh() {
            if (this._refreshTimer) clearTimeout(this._refreshTimer);
            // Poll more aggressively while tasks are in flight.
            const delay = this.hasActiveTasks ? 2500 : 15000;
            this._refreshTimer = setTimeout(async () => {
                await this.loadTasks();
                this.scheduleAutoRefresh();
            }, delay);
        },

        applyFilters() {
            let filtered = [...this.tasks];
            if (this.selectedState) filtered = filtered.filter(t => t.state === this.selectedState);
            if (this.selectedTool) filtered = filtered.filter(t => t.toolId === this.selectedTool);
            this.filteredTasks = filtered;

            // Broadcast whether there is an active (queued/running) bulk-download task so
            // Header.vue and ViewDataset.vue can disable the download button globally.
            const hasActiveBulkDownload = this.tasks.some(
                t => t.toolId === 'bulk-download' && this.isActive(t.state));
            emitter.emit('setActiveBulkDownload', hasActiveBulkDownload);
        },


        // ---- photogrammetry launcher ----

        openPhotogrammetryDialog() {
            this.optionsError = '';
            this.photogrammetryForm = { folder: '', nodeId: undefined, name: '', optionsText: '' };
            this.photogrammetryDialogOpen = true;
        },

        async submitPhotogrammetry() {
            this.optionsError = '';
            let options;
            const text = (this.photogrammetryForm.optionsText || '').trim();
            if (text) {
                try {
                    options = JSON.parse(text);
                    if (!Array.isArray(options)) throw new Error('Options must be a JSON array');
                } catch (e) {
                    this.optionsError = `Invalid options: ${e.message}`;
                    return;
                }
            }

            this.submitting = true;
            try {
                const params = {};
                if (this.photogrammetryForm.folder) params.folder = this.photogrammetryForm.folder;
                if (this.photogrammetryForm.nodeId) params.nodeId = this.photogrammetryForm.nodeId;
                if (this.photogrammetryForm.name) params.name = this.photogrammetryForm.name;
                if (options) params.options = options;

                // Fire-and-track: the mixin polls in the background; the table also
                // auto-refreshes, so we just need to kick it off and reload.
                this.runHeavyTask(this.dataset, 'photogrammetry', { params })
                    .catch(e => console.warn('Photogrammetry task ended with error:', e.message));

                this.photogrammetryDialogOpen = false;
                this._toast('info', 'Photogrammetry started', 'The task is now queued on the processing node.');
                await this.loadTasks();
                this.scheduleAutoRefresh();
            } catch (e) {
                this._toast('error', 'Submit failed', e.message);
            } finally {
                this.submitting = false;
            }
        },

        // ---- per-task actions ----

        async cancelTask(task) {
            try {
                await this.dataset.cancelTask(task.taskId);
                await this.loadTasks();
            } catch (e) {
                this._toast('error', 'Cancel failed', e.message);
            }
        },

        async retryTask(task) {
            try {
                await this.dataset.retryTask(task.taskId);
                await this.loadTasks();
                this.scheduleAutoRefresh();
            } catch (e) {
                this._toast('error', 'Retry failed', e.message);
            }
        },

        async downloadResult(task) {
            if (this.downloadingTaskId) return; // guard against repeated clicks
            this.downloadingTaskId = task.taskId;
            const url = this.dataset.taskResultUrl(task.taskId);
            try {
                // Fetch with auth (Authorization header) then trigger a native download.
                const blob = await this.dataset.registry.makeRequest(url, 'GET', null, null, 'blob');
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = this.resultFileName(task);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                this._toast('error', 'Download failed', e.message);
            } finally {
                this.downloadingTaskId = null;
            }
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
                const status = await this.dataset.getTask(this.logTask.taskId);
                this.logText = (status.logTail || []).join('\n');
            } catch (e) {
                this.logText = `Failed to load log: ${e.message}`;
            }
        },

        showClearDialog() {
            this.clearDialogOpen = true;
        },

        async handleClearDialogClose(buttonId) {
            this.clearDialogOpen = false;
            if (buttonId !== 'confirm') return;
            try {
                this.loading = true;
                await this.dataset.clearTasks(this.selectedTool || undefined);
                await this.loadTasks();
            } catch (e) {
                this._toast('error', 'Clear failed', e.message);
            } finally {
                this.loading = false;
            }
        },

        // ---- formatting helpers are provided by the useTaskFormatting mixin ----
    }
};
</script>

<style scoped>
.task-history-page {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.filters {
    padding: var(--ddb-spacing-lg);
    background: var(--ddb-bg-secondary);
}

.content {
    flex: 1;
    overflow: auto;
    padding: var(--ddb-spacing-lg);
}

.muted {
    color: var(--ddb-text-muted, #888);
}

.error-text {
    color: var(--ddb-danger, #d9534f);
}

.path-details {
    color: var(--ddb-text-muted, #888);
    word-break: break-all;
}

.duration {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.duration.running {
    color: var(--ddb-warning, #f0ad4e);
}

.task-log {
    max-height: 24rem;
    overflow: auto;
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
