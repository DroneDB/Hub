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
            <DataTable v-if="loading && tasks.length === 0" :value="skeletonRows" stripedRows>
                <Column header="State" style="width: 6rem;"><template #body><Skeleton width="2rem" height="1.5rem" /></template></Column>
                <Column header="Tool" style="width: 25%;"><template #body><Skeleton width="80%" /></template></Column>
                <Column header="Progress" style="width: 20%;"><template #body><Skeleton width="90%" /></template></Column>
                <Column header="Created" style="width: 18%;"><template #body><Skeleton width="70%" /></template></Column>
                <Column header="Duration" style="width: 10%;"><template #body><Skeleton width="60%" /></template></Column>
                <Column header="Actions" style="width: 15%;"><template #body><Skeleton width="90%" /></template></Column>
            </DataTable>

            <div v-else-if="filteredTasks.length === 0">
                <PrimeMessage severity="info" :closable="false">
                    <strong>No tasks found</strong>
                    <p>No processing tasks have been run for this dataset yet.</p>
                </PrimeMessage>
            </div>

            <DataTable v-else :value="filteredTasks" stripedRows rowHover paginator :rows="pageSize"
                sortField="createdAt" :sortOrder="-1" :pt="{ table: { style: 'min-width: 50rem' } }">
                <Column field="state" header="State" :sortable="true" style="width: 7rem;">
                    <template #body="slotProps">
                        <Tag :severity="getTagSeverity(slotProps.data.state)"
                            :pt="{ root: { title: slotProps.data.state } }">
                            <i :class="getStateIcon(slotProps.data.state)" style="font-size: 1rem;"></i>
                        </Tag>
                    </template>
                </Column>
                <Column field="toolId" header="Tool" :sortable="true" style="width: 25%;">
                    <template #body="slotProps">
                        <div :title="slotProps.data.path || ''">
                            <strong>{{ toolTitle(slotProps.data.toolId) }}</strong>
                            <span class="muted"> v{{ slotProps.data.version }}</span>
                            <br>
                            <small class="path-details">{{ slotProps.data.path || 'Whole dataset' }}</small>
                        </div>
                    </template>
                </Column>
                <Column header="Progress" style="width: 22%;">
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
                <Column field="createdAt" header="Created" :sortable="true" style="width: 16%;">
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
                <Column header="Actions" style="width: 16rem;">
                    <template #body="slotProps">
                        <div class="d-flex gap-1 flex-wrap">
                            <Button size="small" severity="secondary" icon="fa-solid fa-terminal" title="View log"
                                @click="openLog(slotProps.data)" />
                            <Button v-if="canDownload(slotProps.data)" size="small" icon="fa-solid fa-download"
                                label="Result" @click="downloadResult(slotProps.data)" />
                            <Button v-if="isActive(slotProps.data.state)" size="small" severity="warn"
                                icon="fa-solid fa-stop" title="Cancel" @click="cancelTask(slotProps.data)" />
                            <Button v-if="slotProps.data.state === 'Failed'" size="small" severity="secondary"
                                icon="fa-solid fa-rotate-right" title="Retry" @click="retryTask(slotProps.data)" />
                        </div>
                    </template>
                </Column>
            </DataTable>
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
        <Dialog v-model:visible="logDialogOpen" modal :header="`Log — ${logTaskTitle}`" :style="{ width: '48rem' }">
            <pre class="task-log">{{ logText || 'No log output.' }}</pre>
            <template #footer>
                <Button label="Refresh" severity="secondary" icon="fa-solid fa-arrows-rotate" @click="refreshLog" />
                <Button label="Close" @click="logDialogOpen = false" />
            </template>
        </Dialog>

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
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Skeleton from 'primevue/skeleton';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import ProgressBar from 'primevue/progressbar';

const TERMINAL_STATES = ['Succeeded', 'Failed', 'Deleted'];

export default {
    mixins: [useHeavyTask],

    components: {
        ConfirmDialog, Button, PrimeMessage, Select, Tag, DataTable, Column, Skeleton,
        Dialog, InputText, Textarea, ProgressBar
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
            skeletonRows: Array.from({ length: 8 }, (_, i) => ({ id: i })),
            _refreshTimer: null,
            now: Date.now(),
            _clockTimer: null,

            photogrammetryDialogOpen: false,
            photogrammetryNodes: [],
            photogrammetryForm: { folder: '', nodeId: undefined, name: '', optionsText: '' },
            optionsError: '',

            logDialogOpen: false,
            logTask: null,
            logText: '',

            clearDialogOpen: false,

            stateOptions: [
                { label: 'All States', value: '' },
                { label: 'Succeeded', value: 'Succeeded' },
                { label: 'Failed', value: 'Failed' },
                { label: 'Processing', value: 'Processing' },
                { label: 'Enqueued', value: 'Enqueued' },
                { label: 'Scheduled', value: 'Scheduled' }
            ]
        };
    },

    computed: {
        concludedCount() {
            return this.tasks.filter(t => TERMINAL_STATES.includes(t.state)).length;
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
                    opts.push({ label: this.toolTitle(t.toolId), value: t.toolId });
                }
            });
            return opts;
        },
        logTaskTitle() {
            return this.logTask ? this.toolTitle(this.logTask.toolId) : '';
        }
    },

    async mounted() {
        await this.loadTools();
        await this.loadTasks();
        this.scheduleAutoRefresh();
        this._clockTimer = setInterval(() => { this.now = Date.now(); }, 1000);
    },

    beforeUnmount() {
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        if (this._clockTimer) clearInterval(this._clockTimer);
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
        },

        isActive(state) {
            return !TERMINAL_STATES.includes(state);
        },

        canDownload(task) {
            return task.state === 'Succeeded' && this.tools.some(t => t.id === task.toolId && t.producesArtifact);
        },

        toolTitle(toolId) {
            const tool = this.tools.find(t => t.id === toolId);
            return tool ? tool.title : (toolId || 'Task');
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
            }
        },

        resultFileName(task) {
            const ext = task.toolId === 'photogrammetry' ? 'zip'
                : (task.toolId === 'raster-export' ? 'tif' : 'bin');
            return `${task.toolId || 'task'}_${task.taskId}.${ext}`;
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

        // ---- formatting ----

        getTagSeverity(state) {
            switch (state) {
                case 'Succeeded': return 'success';
                case 'Failed': return 'danger';
                case 'Processing': return 'warn';
                case 'Enqueued':
                case 'Scheduled':
                case 'Reused': return 'info';
                case 'Deleted': return 'secondary';
                default: return 'secondary';
            }
        },

        getStateIcon(state) {
            switch (state) {
                case 'Succeeded': return 'fa-solid fa-check';
                case 'Failed': return 'fa-solid fa-xmark';
                case 'Processing': return 'fa-solid fa-gear fa-spin';
                case 'Deleted': return 'fa-solid fa-ban';
                default: return 'fa-regular fa-clock';
            }
        },

        formatDateTime(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).format(date);
        },

        getRelativeTime(dateString) {
            if (!dateString) return '';
            const diffMs = Date.now() - new Date(dateString).getTime();
            const minutes = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMs / 3600000);
            const days = Math.floor(diffMs / 86400000);
            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes} minutes ago`;
            if (hours < 24) return `${hours} hours ago`;
            if (days < 30) return `${days} days ago`;
            return 'Over a month ago';
        },

        // Elapsed time for a task still in flight.
        runningTime(task) {
            const start = task.startedAt || task.createdAt;
            if (!start) return '';
            // `now` is reactive (ticks every second) so this updates live.
            return this.formatDurationMs(this.now - new Date(start).getTime());
        },

        // Total length of a concluded task.
        taskDuration(task) {
            if (!task.finishedAt) return '';
            const start = task.startedAt || task.createdAt;
            if (!start) return '';
            const ms = new Date(task.finishedAt).getTime() - new Date(start).getTime();
            if (ms < 0) return '';
            return this.formatDurationMs(ms);
        },

        formatDurationMs(ms) {
            if (ms == null || ms < 0) return '';
            const totalSeconds = Math.floor(ms / 1000);
            const seconds = totalSeconds % 60;
            const minutes = Math.floor(totalSeconds / 60) % 60;
            const hours = Math.floor(totalSeconds / 3600);
            if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
            if (minutes > 0) return `${minutes}m ${seconds}s`;
            return `${seconds}s`;
        }
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
