<template>
    <div id="task-history" class="task-history-page">
        <div class="filters">
            <div class="filter-bar">
                <div class="d-flex gap-2 align-items-center flex-wrap">
                    <Select v-model="selectedState" aria-label="Filter by state" :options="stateOptions" option-label="label" option-value="value"
                            placeholder="All States" @change="onFilterChange" />
                    <Select v-model="selectedTool" aria-label="Filter by tool" :options="toolFilterOptions" option-label="label" option-value="value"
                            placeholder="All Tools" @change="onFilterChange" />
                    <Button icon="fa-solid fa-arrows-rotate" label="Refresh" severity="secondary" :loading="loading"
                            @click="refreshData" />
                    <span v-if="showPhotogrammetryButton" class="d-inline-block"
                          :title="photogrammetryGatingDisabled ? photogrammetryDisabledMsg : ''">
                        <Button severity="success" :disabled="photogrammetryGatingDisabled"
                                icon="fa-solid fa-camera"
                                label="Run Photogrammetry" @click="openPhotogrammetryDialog" />
                    </span>
                    <Button v-if="canWrite" severity="danger" :disabled="concludedCount === 0" icon="fa-solid fa-trash"
                            label="Clear Concluded" @click="showClearDialog" />
                </div>
            </div>
        </div>

        <div class="content">
            <TasksTable :tasks="filteredTasks" :tools="tools" :loading="loading" :rows="pageSize"
                        :current-page-first="currentPageFirst"
                        :downloading-task-id="downloadingTaskId" :busy-task-ids="[...taskActions.busyIds]"
                        empty-message="No processing tasks have been run for this dataset yet."
                        @view-log="openLog" @download-result="downloadResult"
                        @cancel="taskActions.cancel" @retry="taskActions.retry" @delete="taskActions.remove"
                        @page-reset="onPageReset" />
        </div>

        <!-- Standalone paginator (outside scrollable area, hidden when < 10 items) -->
        <div v-if="filteredTasks.length >= 10" class="paginator-wrapper">
            <Paginator :rows="pageSize" :total-records="filteredTasks.length" :first="currentPageFirst"
                       :rows-per-page-options="[10, 20, 25, 50, 100]" paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
                       @page="onPageChange" />
        </div>

        <!-- Photogrammetry launcher -->
        <!-- The form dialog size below the wide breakpoint; from it the wide size, the fields and the options side by side
             (FR-PRC-45, FR-XC-33). The window is 90vh high from sm up (css below): the options list takes the free height -->
        <Window id="photogrammetry" v-model:visible="photogrammetryDialogOpen" modal title="Run Photogrammetry (NodeODX)"
                fixed-position :size-class="wideScreen ? 'dialog-wide' : 'dialog-xl'">
            <div class="pg-layout">
                <div class="pg-fields">
                    <div class="mb-3">
                        <label for="task-history-image-folder" class="d-block mb-1"><strong>Image folder</strong> <span class="muted">(optional)</span></label>
                        <div class="d-flex gap-2">
                            <InputText id="task-history-image-folder" v-model="photogrammetryForm.folder" class="flex-grow-1" style="min-width: 0"
                                       placeholder="Leave empty to use dataset root" @input="folderPathError = ''" />
                            <Button icon="fa-regular fa-folder-open" severity="secondary"
                                    title="Browse dataset" aria-label="Browse dataset" @click="openImageFolderPicker" />
                        </div>
                        <small v-if="folderPathError" class="error-text d-block">{{ folderPathError }}</small>
                        <small v-else class="muted">All images under this folder will be processed.</small>
                    </div>

                    <!-- Processing node: dropdown when several are configured, details for a single one -->
                    <div class="mb-3">
                        <label id="task-history-processing-node-label" for="task-history-processing-node" class="d-block mb-1"><strong>Processing node</strong></label>
                        <Select v-if="photogrammetryNodes.length > 1" v-model="photogrammetryForm.nodeId" input-id="task-history-processing-node" aria-labelledby="task-history-processing-node-label"
                                :options="photogrammetryNodes" option-label="label" option-value="value"
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
                                Node reachable - {{ nodeLoadText(nodeStatus) }}.<span v-if="nodeStatus.engine">
                                    Engine: {{ [nodeStatus.engine, nodeStatus.engineVersion].filter(Boolean).join(' ') }}.</span>
                            </template>
                            <template v-else>
                                Node unreachable: {{ nodeStatus.errorMessage }}
                            </template>
                        </PrimeMessage>
                    </div>
                    <div class="mb-3">
                        <label for="task-history-task-name" class="d-block mb-1"><strong>Task name</strong> <span class="muted">(optional)</span></label>
                        <InputText id="task-history-task-name" v-model="photogrammetryForm.name" class="w-100" placeholder="Auto-generated" />
                    </div>
                    <!-- Processing profile -->
                    <div class="mb-3">
                        <label id="task-history-processing-profile-label" for="task-history-processing-profile" class="d-block mb-1"><strong>Processing profile</strong></label>
                        <Select v-model="photogrammetryForm.preset" input-id="task-history-processing-profile" aria-labelledby="task-history-processing-profile-label"
                                :options="odmPresetOptions" option-label="label" option-value="id"
                                class="w-100" />
                        <small class="d-block muted mt-1">{{ selectedPreset.description }}</small>
                    </div>
                </div>

                <div class="pg-options">
                    <!-- Options editor (non-custom presets) -->
                    <template v-if="photogrammetryForm.preset !== 'custom'">
                        <OdxOptionsEditor v-if="availableOdmOptions.length > 0"
                                          ref="odmEditor"
                                          v-model="customOptions"
                                          :available-options="availableOdmOptions"
                                          :preset-options="selectedPreset.options" class="mb-3" />
                        <div v-if="customOptions.length > 0" class="mb-3 pg-preset-tags">
                            <strong class="d-block mb-1">Customized options ({{ customOptions.length }})</strong>
                            <div class="d-flex flex-wrap gap-1">
                                <button v-for="opt in customOptions" :key="opt.name" type="button"
                                        class="btn-reset pg-option-chip pg-option-chip-clickable"
                                        title="Go to this option"
                                        @click="scrollToPresetOption(opt.name)">
                                    {{ opt.name }}: {{ opt.value }}
                                </button>
                            </div>
                        </div>
                    </template>

                    <!-- Custom JSON (only when Custom preset is selected) -->
                    <div v-if="photogrammetryForm.preset === 'custom'" class="mb-2">
                        <label for="task-history-options" class="d-block mb-1"><strong>Options</strong> <span class="muted">(JSON array)</span></label>
                        <Textarea id="task-history-options" v-model="photogrammetryForm.optionsText" class="w-100" rows="5"
                                  placeholder="[{&quot;name&quot;:&quot;fast-orthophoto&quot;,&quot;value&quot;:true},{&quot;name&quot;:&quot;dsm&quot;,&quot;value&quot;:true}]" />
                    </div>
                    <small v-if="optionsError" class="error-text">{{ optionsError }}</small>
                </div>

                <div class="pg-output">
                    <!-- Output destination -->
                    <div class="mb-3">
                        <Checkbox v-model="photogrammetryForm.createNewDataset" :binary="true"
                                  input-id="pg-create-new-dataset" />
                        <label for="pg-create-new-dataset" class="d-inline-block ms-2"><strong>Create new dataset for results</strong></label>
                        <small class="d-block muted mt-1">If unchecked, results are extracted into a folder in this dataset.</small>
                    </div>

                    <div v-if="!photogrammetryForm.createNewDataset" class="mb-3">
                        <label for="task-history-output-folder" class="d-block mb-1"><strong>Output folder</strong></label>
                        <div class="d-flex gap-2">
                            <InputText id="task-history-output-folder" v-model="photogrammetryForm.destPath" class="flex-grow-1" style="min-width: 0"
                                       placeholder="photogrammetry_output" @input="destPathError = ''" />
                            <Button icon="fa-regular fa-folder-open" severity="secondary"
                                    title="Browse dataset" aria-label="Browse dataset" @click="openOutputFolderPicker" />
                        </div>
                        <small v-if="destPathError" class="error-text d-block">{{ destPathError }}</small>
                        <small v-else class="muted">Extracted files will be placed in this folder.</small>
                    </div>

                    <template v-if="photogrammetryForm.createNewDataset">
                        <div class="mb-3">
                            <label for="task-history-new-dataset-name" class="d-block mb-1"><strong>New dataset name</strong></label>
                            <InputText id="task-history-new-dataset-name" v-model="photogrammetryForm.newDatasetName" class="w-100"
                                       placeholder="photogrammetry-results" />
                            <small class="muted">A slug: {{ slugRuleText }}</small>
                        </div>
                        <div class="mb-3">
                            <label id="task-history-visibility-label" for="task-history-visibility" class="d-block mb-1"><strong>Visibility</strong></label>
                            <Select v-model="photogrammetryForm.newDatasetVisibility" input-id="task-history-visibility" aria-labelledby="task-history-visibility-label"
                                    :options="visibilityOptions" option-label="label" option-value="value"
                                    class="w-100" />
                        </div>
                    </template>
                </div>
            </div>

            <template #footer>
                <Button label="Cancel" severity="secondary" @click="photogrammetryDialogOpen = false" />
                <Button label="Check Node" icon="fa-solid fa-heart-pulse" severity="secondary"
                        :loading="checkingNode" @click="checkNode" />
                <Button label="Start" icon="fa-solid fa-play" :loading="submitting" @click="submitPhotogrammetry" />
            </template>
        </Window>

        <!-- Log viewer -->
        <TaskLogDialog v-model:visible="logDialogOpen" :title="taskActions.logTitle(logTask)" :log-text="logText"
                       :is-active="logTask && isActive(logTask.state)" @refresh="refreshLog" />

        <DialogHost :dialogs="dialogs" />

        <!-- Folder picker for output folder -->
        <FolderPicker v-if="outputFolderPickerOpen" :dataset="dataset" mode="folder"
                      :initial-path="photogrammetryForm.destPath || ''" title="Select output folder"
                      @close="handleOutputFolderPickerClose" />

        <!-- Folder picker for image folder -->
        <FolderPicker v-if="imageFolderPickerOpen" :dataset="dataset" mode="folder"
                      :initial-path="photogrammetryForm.folder || ''" title="Select image folder"
                      @close="handleImageFolderPickerClose" />
    </div>
</template>

<script>
import { getCurrentInstance } from 'vue';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { useTaskFormatting } from '@/composables/useTaskFormatting';
import taskMonitor, { datasetKey } from '@/libs/tasks/taskMonitor';
import { useTaskActions } from '@/composables/useTaskActions';
import { matchesStateFilter, nodeLoadText } from '@/libs/tasks/taskFormat';
import { foldBuildChildren } from '@/libs/tasks/taskGroups';
import TasksTable from '@/features/tasks/TasksTable.vue';
import TaskLogDialog from '@/features/tasks/TaskLogDialog.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { escapeHtml } from '@/libs/sanitize';
import { deleteConfirmation } from '@/libs/deleteConfirmation';
import { countOf } from '@/libs/format';
import { VISIBILITY_OPTIONS, DEFAULT_VISIBILITY, visibilityName } from '@/libs/visibility';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Window from '@/components/HubWindow.vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Checkbox from 'primevue/checkbox';
import PrimeMessage from 'primevue/message';
import OdxOptionsEditor from '@/features/dataset/OdxOptionsEditor.vue';
import FolderPicker from '@/components/FolderPicker.vue';
import Paginator from 'primevue/paginator';
import { useDatasetSessionStore } from '@/stores/datasetSession';
import { slugProblem, slugDescription } from '@/libs/slug';
import { useMediaMatch } from '@/composables/useStackedLayout';
import { WIDE_MEDIA_QUERY } from '@/libs/responsiveColumns';

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

    components: {
        DialogHost, Button, Select, Window, InputText, Textarea, Checkbox, PrimeMessage, TasksTable, TaskLogDialog, OdxOptionsEditor, FolderPicker, Paginator
    },

    inject: {
        registerTabChild: { default: null },
        unregisterTabChild: { default: null }
    },

    props: {
        dataset: { type: Object, required: true },
        canWrite: { type: Boolean, default: false }
    },

    setup(props) {
        const { trackHeavyTask } = useHeavyTask();
        const dialogs = useDialogs();
        const confirm = useConfirm(dialogs);
        const formatting = useTaskFormatting();
        // The row actions read the tab when they run: its tool catalog and its reload (FR-XC-15)
        const vm = /** @type {any} */ (getCurrentInstance()?.proxy);
        const taskActions = useTaskActions({
            datasetOf: () => props.dataset,
            deleteTask: task => props.dataset.deleteTask(task.taskId),
            refresh: async () => {
                await taskMonitor.forceRefresh(props.dataset);
                await vm.loadTasks();
            },
            confirm,
            toolTitle: task => formatting.toolTitle(task.toolId, vm.tools),
            datasetName: () => `${props.dataset.org}/${props.dataset.ds}`
        });
        return { trackHeavyTask, dialogs, confirm, taskActions, nodeLoadText, wideScreen: useMediaMatch(WIDE_MEDIA_QUERY), ...formatting };
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
                newDatasetVisibility: DEFAULT_VISIBILITY
            },
            optionsError: '',
            folderPathError: '',
            destPathError: '',
            checkingNode: false,
            nodeStatus: null,
            availableOdmOptions: [],
            customOptions: [],
            visibilityOptions: VISIBILITY_OPTIONS,

            logDialogOpen: false,
            logTask: null,
            logText: '',

            outputFolderPickerOpen: false,
            imageFolderPickerOpen: false
        };
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
        // The slug rule of the Registry, as the new dataset name field shows it
        slugRuleText() {
            return slugDescription();
        },

        selectedPreset() {
            return ODM_PRESETS.find(p => p.id === this.photogrammetryForm.preset) || ODM_PRESETS[0];
        },
        odmPresetOptions() {
            // sort by label for better UX
            return [...ODM_PRESETS].sort((a, b) => a.label.localeCompare(b.label));;
        }
    },

    watch: {
        // The permissions of the dataset may arrive after the tab: ask for the nodes once the user can write
        canWrite(value) {
            if (value) this.loadProcessingNodes();
        }
    },

    async mounted() {
        // Flag runs before the first await so an unmount during the loads below
        // is observed here and never registers a permanent listener on a
        // destroyed instance
        this._isUnmounted = false;
        await this.loadTools();
        await this.loadProcessingNodes();
        await this.loadTasks();

        if (this._isUnmounted) return;

        // Background refresh: re-render when the shared task store is polled
        // (taskMonitor polls GET /tasks for this dataset as long as it is open).
        this._onTasksUpdated = (data) => {
            if (data?.dataset && datasetKey(data.dataset) === datasetKey(this.dataset)) {
                this._backgroundReload();
            }
        };
        taskMonitor.on('tasksUpdated', this._onTasksUpdated);

        // Register with TabSwitcher so onTabActivated() is called on tab switch
        if (this.registerTabChild) this.registerTabChild('tasks', this);
    },

    beforeUnmount() {
        this._isUnmounted = true;
        // Unsubscribe from the shared task store
        taskMonitor.off('tasksUpdated', this._onTasksUpdated);

        // Unregister from TabSwitcher
        if (this.unregisterTabChild) this.unregisterTabChild('tasks');

        // Clear the flag so the download button re-enables when leaving the dataset.
        useDatasetSessionStore().setActiveBulkDownload(false);
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
            // The nodes are only offered to a user who can write. GET /sys/processingNodes needs a
            // signed-in user: for an anonymous visitor of a shared dataset its 401 would send them to
            // Login (FR-ACC-01), so a reader never asks. Asked once per tab.
            if (!this.canWrite || this._nodesRequested) return;
            this._nodesRequested = true;
            try {
                const nodes = await this.dataset.registry.sys.processingNodes() || [];
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
            // Trigger an immediate fetch from taskMonitor and wait for it to land before reading the store.
            await taskMonitor.forceRefresh(this.dataset);
            await this.loadTasks();
        },

        // Called by TabSwitcher when the Tasks tab is activated. Refreshes the task list.
        async onTabActivated() {
            await taskMonitor.forceRefresh(this.dataset);
            await this.loadTasks();
        },

        // Re-read the shared store after a background poll. Keeps the current
        // page and skips the loading overlay so 2.5 s ticks don't flicker a spinner.
        _backgroundReload() {
            try {
                this.tasks = taskMonitor.getTasks(this.dataset) || [];
                this.applyFilters(false);
            } catch (e) {
                console.error('Failed to reload tasks:', e);
                this.tasks = [];
                this.filteredTasks = [];
            }
        },

        // Wrapper for the filter dropdowns: PrimeVue passes the selected value as the
        // change argument (and 'All States'/'All Tools' are '' — falsy), so rebind to
        // this so a filter change ALWAYS resets pagination to the first page.
        onFilterChange() {
            this.applyFilters();
        },

        // Re-render either after a filter change (resetPage = true) or after a
        // background store update (resetPage = false, keeps the current page).
        applyFilters(resetPage = true) {
            let filtered = [...this.tasks];
            // A task queued on a processing node is Enqueued, as the Registry filters it (FR-PRC-37)
            if (this.selectedState) filtered = filtered.filter(t => matchesStateFilter(t, this.selectedState));
            if (this.selectedTool) filtered = filtered.filter(t => t.toolId === this.selectedTool);
            // The builds a task started are listed under it with a count, unless the list is the one of the builds (FR-PRC-26)
            if (this.selectedTool !== 'build') filtered = foldBuildChildren(filtered, state => this.isActive(state));
            this.filteredTasks = filtered;

            if (resetPage) {
                // Reset to first page when filters change
                this.currentPageFirst = 0;
            } else if (this.currentPageFirst >= filtered.length) {
                // List shrank: clamp onto the last valid page so a background
                // refresh never leaves an empty off-range page.
                this.currentPageFirst = Math.max(0, (Math.ceil(filtered.length / this.pageSize) - 1) * this.pageSize);
            }

            // An active (queued/running) bulk-download task disables the download buttons
            // of the header and the dataset page.
            useDatasetSessionStore().setActiveBulkDownload(this.tasks.some(
                t => t.toolId === 'bulk-download' && this.isActive(t.state)));
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
                newDatasetVisibility: DEFAULT_VISIBILITY
            };
            this.photogrammetryDialogOpen = true;

            // Load NodeODX options for the selected node
            this.loadOdmOptions();
        },

        async loadOdmOptions() {
            try {
                const nodeId = this.photogrammetryForm.nodeId || 'default';
                this.availableOdmOptions = await this.dataset.registry.sys.processingNodeOptions(nodeId) || [];
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
        // Returns the status object (also stored in this.nodeStatus). { silent }: no toast (the submit).
        // The toast is the answer of the click on Check Node: a check that the submit makes first (silent) shows none
        async checkNode({ silent = false } = {}) {
            const nodeId = this.photogrammetryForm.nodeId
                || (this.photogrammetryNodes[0] && this.photogrammetryNodes[0].value);
            if (!nodeId) {
                this.$notify.warn('No NodeODX node is configured.', { summary: 'No processing node' });
                return null;
            }
            this.checkingNode = true;
            this.nodeStatus = null;
            try {
                const status = await this.dataset.registry.sys.processingNodeStatus(nodeId);
                this.nodeStatus = status;
                if (!silent) {
                    if (status.reachable) {
                        this.$notify.success(`${nodeLoadText(status)}.`, { summary: 'Node reachable' });
                    } else {
                        this.$notify.error(status.errorMessage || 'The node did not respond.', { summary: 'Node unreachable' });
                    }
                }
                return status;
            } catch (e) {
                this.nodeStatus = { reachable: false, errorMessage: e.message };
                if (!silent) this.$notify.error(e.message, { summary: 'Check failed' });
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
                // The slug rule of the Registry (FR-XC-12, libs/slug.js), the text the Registry answers with
                const slugError = slugProblem(this.photogrammetryForm.newDatasetName, 'Dataset');
                if (slugError) {
                    this.optionsError = slugError;
                    return null;
                }
            }

            const params = {};
            if (this.photogrammetryForm.folder) params.folder = this.photogrammetryForm.folder.trim();
            if (this.photogrammetryForm.nodeId) params.nodeId = this.photogrammetryForm.nodeId;
            if (this.photogrammetryForm.name) params.name = this.photogrammetryForm.name;
            if (options) params.options = options;
            // The profile names the run in the task lists (its label, FR-PRC-22)
            const customized = this.photogrammetryForm.preset !== 'custom' && this.customOptions.length > 0;
            params.profile = customized ? `${this.selectedPreset.label}, customized` : this.selectedPreset.label;

            params.createNewDataset = this.photogrammetryForm.createNewDataset;
            if (!this.photogrammetryForm.createNewDataset) {
                params.destPath = this.photogrammetryForm.destPath.trim();
            } else {
                params.newDatasetName = this.photogrammetryForm.newDatasetName;
                // The task parameters carry the name of the visibility
                params.newDatasetVisibility = visibilityName(this.photogrammetryForm.newDatasetVisibility);
            }
            return params;
        },

        _showPathError(message) {
            this.confirm({ title: 'Invalid path', message: escapeHtml(message), confirmText: 'OK', cancelText: 'Close' });
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
            const status = await this.checkNode({ silent: true });
            if (status && !status.reachable && !await this.confirm({
                title: 'Processing node unreachable',
                message: `The selected processing node did not respond${status.errorMessage ? ` (${escapeHtml(status.errorMessage)})` : ''}.<br/>Do you want to start the task anyway?`,
                confirmText: 'Start anyway',
                warningTitle: 'Warning',
                warningMessage: 'The task may fail immediately if the node is offline.'
            })) {
                this._pendingParams = null;
                return;
            }
            await this._doSubmit();
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
                            this.$notify.error(e.message || this.photogrammetryDisabledMsg, { summary: 'Not available' });
                        } else {
                            console.warn('Photogrammetry task ended with error:', e.message);
                        }
                    });

                this.photogrammetryDialogOpen = false;
                this.$notify.info('The task is now queued on the processing node.', { summary: 'Photogrammetry started' });
                await taskMonitor.forceRefresh(this.dataset);
                await this.loadTasks();
            } catch (e) {
                if (e && e.status === 403) {
                    this.$notify.error(e.message || this.photogrammetryDisabledMsg, { summary: 'Not available' });
                } else {
                    this.$notify.error(e.message, { summary: 'Submit failed' });
                }
            } finally {
                this.submitting = false;
                this._pendingParams = null;
            }
        },

        // ---- per-task actions (cancel, retry, delete: useTaskActions) ----

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

        async showClearDialog() {
            // The server removes their history rows (with the logs) and the results they produced
            if (!await this.confirm(deleteConfirmation({
                kind: 'concluded tasks',
                description: countOf(this.concludedCount, 'concluded task'),
                lost: ['their logs', 'the results they produced that are still available for download']
            }))) return;
            try {
                this.loading = true;
                await this.dataset.clearTasks(this.selectedTool || undefined);
                await taskMonitor.forceRefresh(this.dataset);
                await this.loadTasks();
                this.$notify.success('The concluded tasks have been removed.', { summary: 'Tasks cleared' });
            } catch (e) {
                this.$notify.error(e.message, { summary: 'Clear failed' });
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

        // ---- formatting helpers come from useTaskFormatting() (setup) ----

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

<style scoped lang="scss">
@use '../../../css/breakpoints' as *;

.task-history-page {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.filters {
    padding: var(--ddb-spacing-lg);
    background: var(--ddb-bg-hover);
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
    color: var(--ddb-text-muted);
}

.error-text {
    color: var(--ddb-danger);
}

.pg-preset-tags {
    border: 1px solid var(--ddb-border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    background: var(--ddb-bg-light);
}

.pg-node-details {
    border: 1px solid var(--ddb-border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    background: var(--ddb-bg-light);
    font-size: 0.9rem;
}

.pg-option-chip {
    display: inline-block;
    background: var(--ddb-primary);
    color: var(--ddb-text-on-color);
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
    background-color: var(--ddb-primary-hover);
}

/* The photogrammetry window (FR-PRC-45). From sm the window is 90vh high and its content a column: the form fields do
   not grow, the options list takes the free height (at least 12rem), so the only scroll area is the list. When the
   screen is too small for the fields and 12rem of list, the window scrolls as a whole, and nothing overlaps.
   Below sm (a phone) the window is as high as its content, and the list keeps its own height. */
.pg-layout {
    display: flex;
    flex-direction: column;
}

.pg-options {
    display: flex;
    flex-direction: column;
}

.pg-options > :deep(.odm-options-editor) {
    flex: 1 1 0px;
}

@media (max-width: 575.98px) {
    .pg-options :deep(.odm-options-content) {
        flex: none;
        max-height: 28rem;
    }
}

@media (min-width: 576px) {
    :global(#photogrammetry.p-dialog.window-dialog) {
        height: 90vh;
    }

    :global(#photogrammetry .p-dialog-content) {
        display: flex;
        flex-direction: column;
    }

    :global(#photogrammetry .window-footer) {
        flex: none;
    }

    .pg-layout {
        flex: 1 1 auto;
    }

    .pg-fields,
    .pg-output {
        flex: none;
    }

    .pg-options {
        flex: 1 1 0px;
    }
}

/* From the wide breakpoint (FR-XC-33) the fields are on the left and the options on the right, twice as wide */
@include wide-up {
    .pg-layout {
        display: grid;
        grid-template-columns: 1fr 2fr;
        grid-template-rows: auto 1fr;
        column-gap: 1.5rem;
    }

    .pg-fields {
        grid-column: 1;
        grid-row: 1;
    }

    .pg-output {
        grid-column: 1;
        grid-row: 2;
    }

    .pg-options {
        grid-column: 2;
        grid-row: 1 / span 2;
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
