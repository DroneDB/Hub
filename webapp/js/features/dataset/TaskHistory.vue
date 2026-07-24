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
                    <span v-if="showPhotogrammetryButton" class="d-inline-block"
                        :title="photogrammetryGatingDisabled ? photogrammetryDisabledMsg : ''">
                        <Button severity="success" @click="openPhotogrammetryDialog"
                            :disabled="photogrammetryGatingDisabled"
                            icon="fa-solid fa-camera" label="Run Photogrammetry" />
                    </span>
                    <Button severity="danger" @click="showClearDialog" :disabled="concludedCount === 0"
                        icon="fa-solid fa-trash" label="Clear Concluded" />
                </div>
            </div>
        </div>

        <div class="content">
            <TasksTable :tasks="filteredTasks" :tools="tools" :loading="loading" :rows="pageSize"
                :total-items="filteredTasks.length"
                :current-page-first="currentPageFirst"
                :downloading-task-id="downloadingTaskId"
                empty-message="No processing tasks have been run for this dataset yet."
                @view-log="openLog" @download-result="downloadResult"
                @cancel="cancelTask" @retry="retryTask"
                @page-reset="onPageReset" />
        </div>

        <!-- Standalone paginator (outside scrollable area, hidden when < 10 items) -->
        <div v-if="filteredTasks.length >= 10" class="paginator-wrapper">
            <Paginator :rows="pageSize" :totalRecords="filteredTasks.length" :first="currentPageFirst"
                @page="onPageChange" :rowsPerPageOptions="[10, 20, 25, 50, 100]"
                paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown" />
        </div>

        <!-- Photogrammetry launcher -->
        <Dialog v-model:visible="photogrammetryDialogOpen" modal header="Run Photogrammetry (NodeODX)"
            :style="{ width: '52rem' }">
            <div class="mb-3">
                <label class="d-block mb-1"><strong>Image folder</strong> <span class="muted">(optional)</span></label>
                <div class="d-flex gap-2">
                    <InputText v-model="photogrammetryForm.folder" class="flex-grow-1" style="min-width: 0"
                        placeholder="Leave empty to use dataset root" @input="folderPathError = ''" />
                    <Button @click="openImageFolderPicker" icon="fa-regular fa-folder-open"
                        severity="secondary" title="Browse dataset" />
                </div>
                <small v-if="folderPathError" class="error-text d-block">{{ folderPathError }}</small>
                <small v-else class="muted">All images under this folder will be processed.</small>
            </div>

            <!-- Processing node: dropdown when several are configured, details for a single one -->
            <div class="mb-3">
                <label class="d-block mb-1"><strong>Processing node</strong></label>
                <Select v-if="photogrammetryNodes.length > 1" v-model="photogrammetryForm.nodeId"
                    :options="photogrammetryNodes" optionLabel="label" optionValue="value"
                    class="w-100" @change="onNodeChanged" />
                <div v-else-if="photogrammetryNodes.length === 1" class="pg-node-details">
                    <div><strong>{{ photogrammetryNodes[0].title }}</strong></div>
                    <div class="muted">ID: {{ photogrammetryNodes[0].id }}</div>
                </div>
            </div>

            <!-- Node status (populated by "Check Node") -->
            <div v-if="nodeStatus" class="mb-3">
                <PrimeMessage :severity="nodeStatus.reachable ? 'success' : 'error'" :closable="false">
                    <template v-if="nodeStatus.reachable">
                        Node reachable - {{ nodeStatus.taskQueueCount }} task(s) queued,
                        max {{ nodeStatus.maxParallelTasks }} parallel.<span v-if="nodeStatus.engine">
                        Engine: {{ nodeStatus.engine }}<span v-if="nodeStatus.engineVersion"> {{ nodeStatus.engineVersion }}</span>.</span>
                    </template>
                    <template v-else>
                        Node unreachable: {{ nodeStatus.errorMessage }}
                    </template>
                </PrimeMessage>
            </div>
            <div class="mb-3">
                <label class="d-block mb-1"><strong>Task name</strong> <span class="muted">(optional)</span></label>
                <InputText v-model="photogrammetryForm.name" class="w-100" placeholder="Auto-generated" />
            </div>
            <!-- Processing profile -->
            <div class="mb-3">
                <label class="d-block mb-1"><strong>Processing profile</strong></label>
                <Select v-model="photogrammetryForm.preset"
                    :options="odmPresetOptions" optionLabel="label" optionValue="id"
                    class="w-100" />
                <small class="d-block muted mt-1">{{ selectedPreset.description }}</small>
            </div>

            <!-- Options editor (non-custom presets) -->
            <template v-if="photogrammetryForm.preset !== 'custom'">
                <OdxOptionsEditor v-if="availableOdmOptions.length > 0"
                    ref="odmEditor"
                    v-model="customOptions"
                    :available-options="availableOdmOptions"
                    :preset-options="selectedPreset.options" class="mb-3" />
                <div v-if="customOptions.length > 0" class="mb-3 pg-preset-tags">
                    <label class="d-block mb-1"><strong>Customized options ({{ customOptions.length }})</strong></label>
                    <div class="d-flex flex-wrap gap-1">
                        <span v-for="opt in customOptions" :key="opt.name"
                            class="pg-option-chip pg-option-chip-clickable"
                            @click="scrollToPresetOption(opt.name)"
                            title="Click to scroll to option">
                            {{ opt.name }}: {{ opt.value }}
                        </span>
                    </div>
                </div>
            </template>

            <!-- Custom JSON (only when Custom preset is selected) -->
            <div v-if="photogrammetryForm.preset === 'custom'" class="mb-2">
                <label class="d-block mb-1"><strong>Options</strong> <span class="muted">(JSON array)</span></label>
                <Textarea v-model="photogrammetryForm.optionsText" class="w-100" rows="5"
                    placeholder='[{"name":"fast-orthophoto","value":true},{"name":"dsm","value":true}]' />
            </div>
            <small v-if="optionsError" class="error-text">{{ optionsError }}</small>

            <!-- Output destination -->
            <div class="mb-3">
                <Checkbox v-model="photogrammetryForm.createNewDataset" :binary="true"
                    input-id="pg-create-new-dataset" />
                <label for="pg-create-new-dataset" class="d-inline-block ms-2"><strong>Create new dataset for results</strong></label>
                <small class="d-block muted mt-1">If unchecked, results are extracted into a folder in this dataset.</small>
            </div>

            <div v-if="!photogrammetryForm.createNewDataset" class="mb-3">
                <label class="d-block mb-1"><strong>Output folder</strong></label>
                <div class="d-flex gap-2">
                    <InputText v-model="photogrammetryForm.destPath" class="flex-grow-1" style="min-width: 0"
                        placeholder="photogrammetry_output" @input="destPathError = ''" />
                    <Button @click="openOutputFolderPicker" icon="fa-regular fa-folder-open"
                        severity="secondary" title="Browse dataset" />
                </div>
                <small v-if="destPathError" class="error-text d-block">{{ destPathError }}</small>
                <small v-else class="muted">Extracted files will be placed in this folder.</small>
            </div>

            <template v-if="photogrammetryForm.createNewDataset">
                <div class="mb-3">
                    <label class="d-block mb-1"><strong>New dataset name</strong></label>
                    <InputText v-model="photogrammetryForm.newDatasetName" class="w-100"
                        placeholder="photogrammetry-results" />
                    <small class="muted">Kebab-case slug, max 128 chars.</small>
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1"><strong>Visibility</strong></label>
                    <Select v-model="photogrammetryForm.newDatasetVisibility"
                        :options="visibilityOptions" optionLabel="label" optionValue="value"
                        class="w-100" />
                </div>
            </template>

            <template #footer>
                <Button label="Cancel" severity="secondary" @click="photogrammetryDialogOpen = false" />
                <Button label="Check Node" icon="fa-solid fa-heart-pulse" severity="secondary"
                    :loading="checkingNode" @click="checkNode" />
                <Button label="Start" icon="fa-solid fa-play" :loading="submitting" @click="submitPhotogrammetry" />
            </template>
        </Dialog>

        <!-- Log viewer -->
        <TaskLogDialog v-model:visible="logDialogOpen" :title="logTaskTitle" :log-text="logText"
            :is-active="logTask && isActive(logTask.state)" @refresh="refreshLog" />

        <ConfirmDialog v-if="clearDialogOpen"
            title="Clear Concluded Tasks"
            :message="`Delete all concluded tasks?<br/><strong>${concludedCount} task(s)</strong> will be permanently removed from the history, together with any downloadable results they produced.`"
            confirmText="Clear" cancelText="Cancel" confirmButtonClass="danger"
            warningTitle="Warning" warningMessage="This action cannot be undone. Any task results still available for download will be deleted."
            @onClose="handleClearDialogClose">
        </ConfirmDialog>

        <!-- Invalid path error (#5) -->
        <ConfirmDialog v-if="errorDialogOpen"
            title="Invalid path"
            :message="errorDialogMessage"
            confirmText="OK" cancelText="Close" confirmButtonClass="primary"
            @onClose="errorDialogOpen = false">
        </ConfirmDialog>

        <!-- Unreachable node confirmation before starting (#6) -->
        <ConfirmDialog v-if="unreachableConfirmOpen"
            title="Processing node unreachable"
            :message="`The selected processing node did not respond${nodeStatus && nodeStatus.errorMessage ? ` (${nodeStatus.errorMessage})` : ''}.<br/>Do you want to start the task anyway?`"
            confirmText="Start anyway" cancelText="Cancel" confirmButtonClass="primary"
            warningTitle="Warning" warningMessage="The task may fail immediately if the node is offline."
            @onClose="handleUnreachableConfirmClose">
        </ConfirmDialog>

        <!-- Cancel task confirmation -->
        <ConfirmDialog v-if="cancelDialogOpen"
            title="Cancel Task"
            :message="`Are you sure you want to cancel this task?<br/><strong>${toolTitle(cancellingTask.toolId, tools)}</strong>${cancellingTask.path ? ' (path: ' + cancellingTask.path + ')' : ''} will be stopped.`"
            confirmText="Cancel Task" cancelText="Don't Cancel" confirmButtonClass="danger"
            @onClose="handleCancelDialogClose">
        </ConfirmDialog>

        <!-- Folder picker for output folder -->
        <FolderPicker v-if="outputFolderPickerOpen" :dataset="dataset" mode="folder"
            :initialPath="photogrammetryForm.destPath || ''" title="Select output folder"
            @onClose="handleOutputFolderPickerClose" />

        <!-- Folder picker for image folder -->
        <FolderPicker v-if="imageFolderPickerOpen" :dataset="dataset" mode="folder"
            :initialPath="photogrammetryForm.folder || ''" title="Select image folder"
            @onClose="handleImageFolderPickerClose" />
    </div>
</template>

<script>
import useHeavyTask from '@/composables/useHeavyTask';
import useTaskFormatting from '@/composables/useTaskFormatting';
import emitter from '@/libs/eventBus';
import taskMonitor from '@/libs/tasks/taskMonitor';
import TasksTable from '@/features/tasks/TasksTable.vue';
import TaskLogDialog from '@/features/tasks/TaskLogDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Checkbox from 'primevue/checkbox';
import PrimeMessage from 'primevue/message';
import OdxOptionsEditor from '@/components/OdxOptionsEditor.vue';
import FolderPicker from '@/components/FolderPicker.vue';
import Paginator from 'primevue/paginator';

// Curated processing profiles based on standard OpenDroneMap presets.
const ODM_PRESETS = [
    {
        id: 'default',
        label: 'Default - Orthophoto + DSM',
        description: 'Standard processing: high-quality orthophoto and Digital Surface Model.',
        options: [{ name: 'auto-boundary', value: true }, { name: 'dsm', value: true }]
    },
    {
        id: 'fast',
        label: 'Fast Orthophoto',
        description: 'Quick orthophoto only. Faster processing, lower quality. No 3D products generated.',
        options: [{ name: 'auto-boundary', value: true }, { name: 'fast-orthophoto', value: true }]
    },
    {
        id: 'high-res',
        label: 'High Resolution (1 cm/px)',
        description: 'Maximum resolution orthophoto and DSM at 1 cm/pixel. Significantly slower processing.',
        options: [{ name: 'auto-boundary', value: true }, { name: 'dsm', value: true }, { name: 'dem-resolution', value: '1.0' }, { name: 'orthophoto-resolution', value: '1.0' }]
    },
    {
        id: '3d-model',
        label: '3D Model (mesh)',
        description: 'High-quality 3D mesh model with dense point cloud. Best for structures and buildings.',
        options: [{ name: 'auto-boundary', value: true }, { name: 'use-3dmesh', value: true }, { name: 'pc-quality', value: 'high' }, { name: 'mesh-octree-depth', value: '12' }, { name: 'mesh-size', value: '300000' }]
    },
    {
        id: 'dsm-dtm',
        label: 'DSM + DTM (terrain)',
        description: 'Digital Surface Model and Digital Terrain Model. For topographic analysis and volume calculations.',
        options: [{ name: 'auto-boundary', value: true }, { name: 'dsm', value: true }, { name: 'dtm', value: true }]
    },
    {
        id: 'volume',
        label: 'Volume Analysis',
        description: 'High-quality DSM with dense point cloud. Optimized for stockpile volume measurements.',
        options: [{ name: 'auto-boundary', value: true }, { name: 'dsm', value: true }, { name: 'dem-resolution', value: '2' }, { name: 'pc-quality', value: 'high' }]
    },
    {
        id: 'multispectral',
        label: 'Multispectral',
        description: 'For multispectral cameras. Applies radiometric calibration and generates DSM.',
        options: [{ name: 'auto-boundary', value: true }, { name: 'radiometric-calibration', value: 'camera' }, { name: 'dsm', value: true }]
    },
    {
        id: 'custom',
        label: 'Custom (JSON array)',
        description: 'Manually specify processing options as a JSON array for advanced control.',
        options: []
    }
];

export default {
    mixins: [useHeavyTask, useTaskFormatting],

    components: {
        ConfirmDialog, Button, Select, Dialog, InputText, Textarea, Checkbox, PrimeMessage, TasksTable, TaskLogDialog, OdxOptionsEditor, FolderPicker, Paginator
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
            currentPageFirst: 0,
            _refreshTimer: null,
            downloadingTaskId: null,

            photogrammetryDialogOpen: false,
            photogrammetryNodes: [],
            photogrammetryForm: {
                folder: '',
                nodeId: undefined,
                name: '',
                preset: 'default',
                optionsText: '',

                destPath: 'photogrammetry_output',
                createNewDataset: false,
                newDatasetName: '',
                newDatasetVisibility: 'PRIVATE'
            },
            optionsError: '',
            folderPathError: '',
            destPathError: '',
            errorDialogOpen: false,
            errorDialogMessage: '',
            checkingNode: false,
            nodeStatus: null,
            unreachableConfirmOpen: false,
            _pendingParams: null,
            availableOdmOptions: [],
            customOptions: [],
            visibilityOptions: [
                { label: 'Private', value: 'PRIVATE' },
                { label: 'Unlisted', value: 'UNLISTED' },
                { label: 'Public', value: 'PUBLIC' }
            ],

            logDialogOpen: false,
            logTask: null,
            logText: '',

            clearDialogOpen: false,

            cancelDialogOpen: false,
            cancellingTask: null,

            outputFolderPickerOpen: false,
            imageFolderPickerOpen: false
        };
    },

    inject: {
        registerTabChild: { default: null },
        unregisterTabChild: { default: null }
    },

    computed: {
        concludedCount() {
            return this.tasks.filter(t => !this.isActive(t.state)).length;
        },
        hasActiveTasks() {
            return this.tasks.some(t => this.isActive(t.state));
        },
        // Photogrammetry tool descriptor from the org-scoped catalog (carries gating flags).
        photogrammetryTool() {
            return this.tools.find(t => t.id === 'photogrammetry') || null;
        },
        // Show the button only when the tool exists, is not hidden by gating,
        // the user can write, and at least one NodeODX node is configured.
        showPhotogrammetryButton() {
            const t = this.photogrammetryTool;
            return t !== null && !t.hidden && this.canWrite && this.photogrammetryNodes.length > 0;
        },
        // Render the button greyed out when the tool is gated as disabled.
        photogrammetryGatingDisabled() {
            const t = this.photogrammetryTool;
            return t !== null && !t.hidden && !!t.disabled;
        },
        photogrammetryDisabledMsg() {
            return this.photogrammetryTool?.disabledMessage || 'Photogrammetry is not available.';
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
        selectedPreset() {
            return ODM_PRESETS.find(p => p.id === this.photogrammetryForm.preset) || ODM_PRESETS[0];
        },
        odmPresetOptions() {
            // sort by label for better UX
            return [...ODM_PRESETS].sort((a, b) => a.label.localeCompare(b.label));;
        },
        logTaskTitle() {
            return this.logTask ? this.toolTitle(this.logTask.toolId, this.tools) : '';
        }
    },

    async mounted() {
        await this.loadTools();
        await this.loadProcessingNodes();
        await this.loadTasks();

        // Register with TabSwitcher so onTabActivated() is called on tab switch
        if (this.registerTabChild) this.registerTabChild('tasks', this);
    },

    beforeUnmount() {
        // Unregister from TabSwitcher
        if (this.unregisterTabChild) this.unregisterTabChild('tasks');

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

        async loadProcessingNodes() {
            try {
                const nodes = await this.dataset.registry.getRequest('/sys/processingNodes') || [];
                this.photogrammetryNodes = nodes.map(n => ({
                    value: n.id,
                    id: n.id,
                    title: n.title,
                    label: `${n.title} (${n.id})`
                }));
                // Always default to the first node so a selection is present.
                if (this.photogrammetryNodes.length > 0 && !this.photogrammetryForm.nodeId) {
                    this.photogrammetryForm.nodeId = this.photogrammetryNodes[0].value;
                }
            } catch (e) {
                console.warn('Failed to load processing nodes:', e);
                this.photogrammetryNodes = [];
            }
        },

        async loadTasks() {
            this.loading = true;
            try {
                // Read from taskMonitor shared store to avoid duplicate DB roundtrips.
                this.tasks = taskMonitor.getTasks(this.dataset) || [];
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
            // Trigger an immediate fetch from taskMonitor
            taskMonitor.forceRefresh(this.dataset);
            await this.loadTasks();
        },

        // Called by TabSwitcher when the Tasks tab is activated. Refreshes the task list.
        async onTabActivated() {
            taskMonitor.forceRefresh(this.dataset);
            await this.loadTasks();
        },

        applyFilters() {
            let filtered = [...this.tasks];
            if (this.selectedState) filtered = filtered.filter(t => t.state === this.selectedState);
            if (this.selectedTool) filtered = filtered.filter(t => t.toolId === this.selectedTool);
            this.filteredTasks = filtered;
            // Reset to first page when filters change
            this.currentPageFirst = 0;

            // Broadcast whether there is an active (queued/running) bulk-download task so
            // Header.vue and ViewDataset.vue can disable the download button globally.
            const hasActiveBulkDownload = this.tasks.some(
                t => t.toolId === 'bulk-download' && this.isActive(t.state));
            emitter.emit('setActiveBulkDownload', hasActiveBulkDownload);
        },


        // ---- photogrammetry launcher ----

        // Called from customized-option pill click. Delegates to OdxOptionsEditor.
        scrollToPresetOption(optionName) {
            const editor = this.$refs?.odmEditor;
            if (editor && typeof editor.scrollToOption === 'function') {
                editor.scrollToOption(optionName);
            }
        },

        openPhotogrammetryDialog() {
            this.optionsError = '';
            this.folderPathError = '';
            this.destPathError = '';
            this.nodeStatus = null;
            this.customOptions = [];
            this.availableOdmOptions = [];
            this.photogrammetryForm = {
                folder: '',
                nodeId: this.photogrammetryNodes.length > 0 ? this.photogrammetryNodes[0].value : undefined,
                name: '',
                preset: 'default',
                optionsText: '',

                destPath: 'photogrammetry_output',
                createNewDataset: false,
                newDatasetName: '',
                newDatasetVisibility: 'PRIVATE'
            };
            this.photogrammetryDialogOpen = true;

            // Load NodeODX options for the selected node
            this.loadOdmOptions();
        },

        async loadOdmOptions() {
            try {
                const nodeId = this.photogrammetryForm.nodeId || 'default';
                this.availableOdmOptions = await this.dataset.registry.getRequest(
                    `/sys/processingNodes/${nodeId}/options`
                ) || [];
            } catch (e) {
                console.warn('Failed to load ODM options:', e);
                this.availableOdmOptions = [];
            }
        },

        // Reload options and clear cached status when the target node changes.
        onNodeChanged() {
            this.nodeStatus = null;
            this.loadOdmOptions();
        },

        // Validates a dataset-relative path: no leading slash, not rooted, and no
        // "." / ".." segments. Returns an error message, or null when valid. An
        // empty path is valid here (the caller decides whether it is required).
        validateDatasetPath(path, label) {
            const raw = (path || '').trim();
            if (!raw) return null;
            if (raw.startsWith('/') || raw.startsWith('\\')) {
                return `${label} must not start with "/" or "\\" - use a path relative to the dataset root.`;
            }
            // Windows drive letter (C:\) or UNC (\\server)
            if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) {
                return `${label} must not be an absolute path.`;
            }
            const segments = raw.split(/[\\/]+/);
            if (segments.some(s => s === '.' || s === '..')) {
                return `${label} must not contain "." or ".." segments.`;
            }
            return null;
        },

        // Queries the server for the selected node's availability and queue stats.
        // Returns the status object (also stored in this.nodeStatus).
        async checkNode() {
            const nodeId = this.photogrammetryForm.nodeId
                || (this.photogrammetryNodes[0] && this.photogrammetryNodes[0].value);
            if (!nodeId) {
                this._toast('warn', 'No processing node', 'No NodeODX node is configured.');
                return null;
            }
            this.checkingNode = true;
            this.nodeStatus = null;
            try {
                const status = await this.dataset.registry.getRequest(
                    `/sys/processingNodes/${encodeURIComponent(nodeId)}/status`);
                this.nodeStatus = status;
                if (status.reachable) {
                    this._toast('success', 'Node reachable',
                        `${status.taskQueueCount} task(s) queued, max ${status.maxParallelTasks} parallel.`);
                } else {
                    this._toast('error', 'Node unreachable', status.errorMessage || 'The node did not respond.');
                }
                return status;
            } catch (e) {
                this.nodeStatus = { reachable: false, errorMessage: e.message };
                this._toast('error', 'Check failed', e.message);
                return this.nodeStatus;
            } finally {
                this.checkingNode = false;
            }
        },

        // Builds the submit params, surfacing option/destination validation errors.
        // Returns the params object, or null when validation failed.
        _buildSubmitParams() {
            let options;
            if (this.photogrammetryForm.preset === 'custom') {
                const text = (this.photogrammetryForm.optionsText || '').trim();
                if (text) {
                    try {
                        options = JSON.parse(text);
                        if (!Array.isArray(options)) throw new Error('Options must be a JSON array');
                    } catch (e) {
                        this.optionsError = `Invalid options: ${e.message}`;
                        return null;
                    }
                }
            } else {
                // Merge preset defaults with user customizations
                const preset = this.selectedPreset;
                const presetOpts = preset.options || [];
                const merged = [...presetOpts];
                for (const custom of this.customOptions) {
                    const idx = merged.findIndex(o => o.name === custom.name);
                    if (idx >= 0) merged[idx] = custom;
                    else merged.push(custom);
                }
                options = merged.length ? merged : null;
            }

            // Validate output destination
            if (!this.photogrammetryForm.createNewDataset) {
                if (!this.photogrammetryForm.destPath || !this.photogrammetryForm.destPath.trim()) {
                    this.destPathError = 'An output folder path is required.';
                    return null;
                }
            } else {
                if (!this.photogrammetryForm.newDatasetName || !this.photogrammetryForm.newDatasetName.trim()) {
                    this.optionsError = 'A new dataset name is required.';
                    return null;
                }
                // Basic kebab-case validation
                if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(this.photogrammetryForm.newDatasetName)) {
                    this.optionsError = 'Dataset name must be kebab-case (lowercase letters, digits, hyphens).';
                    return null;
                }
            }

            const params = {};
            if (this.photogrammetryForm.folder) params.folder = this.photogrammetryForm.folder.trim();
            if (this.photogrammetryForm.nodeId) params.nodeId = this.photogrammetryForm.nodeId;
            if (this.photogrammetryForm.name) params.name = this.photogrammetryForm.name;
            if (options) params.options = options;

            params.createNewDataset = this.photogrammetryForm.createNewDataset;
            if (!this.photogrammetryForm.createNewDataset) {
                params.destPath = this.photogrammetryForm.destPath.trim();
            } else {
                params.newDatasetName = this.photogrammetryForm.newDatasetName;
                params.newDatasetVisibility = this.photogrammetryForm.newDatasetVisibility;
            }
            return params;
        },

        _showPathError(message) {
            this.errorDialogMessage = message;
            this.errorDialogOpen = true;
        },

        async submitPhotogrammetry() {
            this.optionsError = '';
            this.folderPathError = '';
            this.destPathError = '';

            // #5: clean dataset-relative path validation.
            const folderErr = this.validateDatasetPath(this.photogrammetryForm.folder, 'Image folder');
            if (folderErr) {
                this.folderPathError = folderErr;
                this._showPathError(folderErr);
                return;
            }
            if (!this.photogrammetryForm.createNewDataset) {
                const destErr = this.validateDatasetPath(this.photogrammetryForm.destPath, 'Output folder');
                if (destErr) {
                    this.destPathError = destErr;
                    this._showPathError(destErr);
                    return;
                }
            }

            const params = this._buildSubmitParams();
            if (!params) return;
            this._pendingParams = params;

            // #6: pre-flight node check. We never hard-block on a full queue, but we
            // do ask for confirmation when the node appears unreachable.
            const status = await this.checkNode();
            if (status && !status.reachable) {
                this.unreachableConfirmOpen = true;
                return;
            }
            await this._doSubmit();
        },

        async handleUnreachableConfirmClose(buttonId) {
            this.unreachableConfirmOpen = false;
            if (buttonId === 'confirm') {
                await this._doSubmit();
            } else {
                this._pendingParams = null;
            }
        },

        async _doSubmit() {
            const params = this._pendingParams;
            if (!params) return;

            this.submitting = true;
            try {
                // Submit the task on the server first, so loadTasks() can pick it up.
                const submit = await this.dataset.submitTask('photogrammetry', {
                    params: params,
                    force: false,
                });
                if (submit && submit.error) {
                    throw new Error(submit.error);
                }

                // Start background polling (fire-and-forget).
                this.trackHeavyTask(this.dataset, submit.taskId, { params })
                    .catch(e => {
                        if (e && e.status === 403) {
                            this._toast('error', 'Not available', e.message || this.photogrammetryDisabledMsg);
                        } else {
                            console.warn('Photogrammetry task ended with error:', e.message);
                        }
                    });

                this.photogrammetryDialogOpen = false;
                this._toast('info', 'Photogrammetry started', 'The task is now queued on the processing node.');
                await this.loadTasks();
                this.scheduleAutoRefresh();
            } catch (e) {
                if (e && e.status === 403) {
                    this._toast('error', 'Not available', e.message || this.photogrammetryDisabledMsg);
                } else {
                    this._toast('error', 'Submit failed', e.message);
                }
            } finally {
                this.submitting = false;
                this._pendingParams = null;
            }
        },

        // ---- per-task actions ----

        cancelTask(task) {
            this.cancellingTask = task;
            this.cancelDialogOpen = true;
        },

        async handleCancelDialogClose(buttonId) {
            this.cancelDialogOpen = false;
            if (buttonId !== 'confirm' || !this.cancellingTask) {
                this.cancellingTask = null;
                return;
            }
            const task = this.cancellingTask;
            this.cancellingTask = null;
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
            // Navigate to the authenticated result URL (cookie auth); the server
            // sends Content-Disposition: attachment so the browser downloads it.
            window.location.href = this.dataset.taskResultUrl(task.taskId);
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

        // ---- output folder picker ----

        openOutputFolderPicker() {
            this.outputFolderPickerOpen = true;
        },

        handleOutputFolderPickerClose(result) {
            this.outputFolderPickerOpen = false;
            if (result) {
                this.photogrammetryForm.destPath = result.path;
            }
        },

        // ---- image folder picker ----

        openImageFolderPicker() {
            this.imageFolderPickerOpen = true;
        },

        handleImageFolderPickerClose(result) {
            this.imageFolderPickerOpen = false;
            if (result) {
                this.photogrammetryForm.folder = result.path;
            }
        },

        // ---- formatting helpers are provided by the useTaskFormatting mixin ----

        // ---- pagination ----

        onPageChange(event) {
            this.currentPageFirst = event.first;
            this.pageSize = event.rows;
        },

        onPageReset() {
            this.currentPageFirst = 0;
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

.paginator-wrapper {
    flex-shrink: 0;
    background: var(--p-content-background);
    border-top: 1px solid var(--p-content-border-color);
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-lg);
}

.muted {
    color: var(--ddb-text-muted, #888);
}

.error-text {
    color: var(--ddb-danger, #d9534f);
}

.pg-preset-tags {
    border: 1px solid var(--ddb-border, #dee2e6);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    background: var(--ddb-bg-secondary, #f8f9fa);
}

.pg-node-details {
    border: 1px solid var(--ddb-border, #dee2e6);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    background: var(--ddb-bg-secondary, #f8f9fa);
    font-size: 0.9rem;
}

.pg-option-chip {
    display: inline-block;
    background: var(--ddb-primary, #0d6efd);
    color: #fff;
    border-radius: 12px;
    padding: 0.15rem 0.6rem;
    font-size: 0.78rem;
    font-family: monospace;
    font-weight: 500;
}

.pg-option-chip-clickable {
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.pg-option-chip-clickable:hover {
    background-color: var(--ddb-primary-hover, #0060bf);
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
