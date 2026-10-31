<template>
    <Window id="splatTrainingExportDialog" title="Export Splat Training Data" modal max-width="620px" fixed-size
            :cancel-label="done ? 'Close' : 'Cancel'" :confirm-label="done ? 'Download' : 'Export'"
            :confirm-icon="done ? 'fa-solid fa-download' : 'fa-solid fa-file-export'"
            :confirm-disabled="!done && !validation.params" :busy="running"
            @confirm="done ? download() : start()" @close="emit('close', 'close')">
        <div class="training-dialog">
            <PrimeMessage severity="info" :closable="false">
                Writes what a Gaussian splat trainer needs from the ODM project in
                <strong>{{ folderLabel }}</strong>: the cameras and points as a COLMAP model, the images and the
                georeference, in one ZIP. A splat trained from it and uploaded next to its georeference file is
                placed on the map.
            </PrimeMessage>

            <PrimeMessage v-if="odmProject === false" severity="warn" :closable="false">
                This folder does not look like an ODM project: neither <code>cameras.json</code> nor
                <code>odm_georeferencing/coords.txt</code> was found. The export fails if the project files are missing.
            </PrimeMessage>

            <div class="field">
                <label for="training-max-image-size">Largest image side (pixels)</label>
                <InputNumber v-model="maxImageSize" input-id="training-max-image-size" :min="0" :max="TRAINING_LIMITS.maxImageSize"
                             :use-grouping="false" :disabled="running || done" :invalid="!!validation.errors.maxImageSize" fluid />
                <small v-if="validation.errors.maxImageSize" class="field-error">{{ validation.errors.maxImageSize }}</small>
                <small v-else class="field-help">Images are resized to this longest side; 0 keeps the originals.</small>
            </div>

            <div class="field">
                <label for="training-max-points">Most points</label>
                <InputNumber v-model="maxPoints" input-id="training-max-points" :min="0" :max="TRAINING_LIMITS.maxPoints"
                             :use-grouping="false" :disabled="running || done" :invalid="!!validation.errors.maxPoints" fluid />
                <small v-if="validation.errors.maxPoints" class="field-error">{{ validation.errors.maxPoints }}</small>
                <small v-else class="field-help">The sparse model keeps at most this many points; 0 writes none.</small>
            </div>

            <div class="field">
                <label for="training-file-name">File name</label>
                <InputText id="training-file-name" v-model="fileName" :disabled="running || done" :invalid="!!validation.errors.fileName" fluid />
                <small v-if="validation.errors.fileName" class="field-error">{{ validation.errors.fileName }}</small>
            </div>

            <div v-if="running" class="progress-section">
                <ProgressBar :value="percent" :show-value="true" />
                <div class="progress-label">{{ phase || 'Working…' }}</div>
            </div>

            <PrimeMessage v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</PrimeMessage>

            <PrimeMessage v-if="warnings.length" severity="warn" :closable="false">
                <ul class="warnings" aria-label="Warnings of the export">
                    <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
                </ul>
            </PrimeMessage>

            <PrimeMessage v-if="done" severity="success" :closable="false">
                The training data is ready.
                <a :href="resultUrl" :download="fileName || undefined">Download {{ fileName || 'the ZIP' }}</a>
            </PrimeMessage>
        </div>
    </Window>
</template>

<script setup>
/**
 * SplatTrainingExportDialog - exports the training data of a Gaussian splat from the ODM project in
 * a folder of the dataset: asks for the options, runs the background task, shows its progress and
 * the warnings it writes (a flight that looks straight down, images left out) and offers the ZIP
 * when it is done. The rules of the options and of the log are in viewers/splat/trainingExport.
 */
import { ref, computed, onMounted } from 'vue';
import Window from '@/components/HubWindow.vue';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import ProgressBar from 'primevue/progressbar';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { notify } from '@/libs/notify';
import { startFileDownload } from '@/features/viewers/splat/splatDownloads';
import {
    TRAINING_EXPORT_TOOL, TRAINING_DEFAULTS, TRAINING_LIMITS, trainingExportPath, defaultTrainingFileName,
    validateTrainingOptions, trainingWarnings, looksLikeOdmProject
} from '@/features/viewers/splat/trainingExport';

const props = defineProps({
    /** The folder (an item of the file browser) */
    file: { type: Object, required: true },
    dataset: { type: Object, required: true }
});
const emit = defineEmits(['close']);

const { runHeavyTask } = useHeavyTask();

const path = trainingExportPath(props.file.entry);
const folderLabel = path ?? 'the dataset';

const maxImageSize = ref(TRAINING_DEFAULTS.maxImageSize);
const maxPoints = ref(TRAINING_DEFAULTS.maxPoints);
const fileName = ref(defaultTrainingFileName(path));
const validation = computed(() => validateTrainingOptions({ maxImageSize: maxImageSize.value, maxPoints: maxPoints.value, fileName: fileName.value }));

// null until the folder has been read; false puts a warning above the options
const odmProject = ref(/** @type {boolean | null} */ (null));
onMounted(async () => { odmProject.value = await looksLikeOdmProject(props.dataset, path); });

const running = ref(false);
const percent = ref(0);
const phase = ref('');
const warnings = ref(/** @type {string[]} */ ([]));
const errorMessage = ref('');
const taskId = ref(/** @type {string | null} */ (null));
const done = computed(() => taskId.value !== null);
const resultUrl = computed(() => (taskId.value ? props.dataset.taskResultUrl(taskId.value) : ''));

async function start() {
    const { params } = validation.value;
    if (running.value || !params) return;
    running.value = true;
    errorMessage.value = '';
    warnings.value = [];
    percent.value = 0;
    phase.value = 'Starting…';
    try {
        const result = await runHeavyTask(props.dataset, TRAINING_EXPORT_TOOL, {
            path: path ?? undefined,
            params,
            force: true,
            notify: false,
            onProgress: entry => {
                percent.value = Math.max(0, Math.round(entry.percent ?? 0));
                phase.value = entry.phase || '';
                warnings.value = trainingWarnings(entry.logTail);
            }
        });
        warnings.value = trainingWarnings(result.logTail);
        taskId.value = result.taskId;
        notify.success('The training data is ready to download.', { summary: 'Export completed' });
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e);
        notify.error(e, { summary: 'Export failed', life: 'long' });
    } finally {
        running.value = false;
    }
}

function download() {
    if (taskId.value) startFileDownload(resultUrl.value, fileName.value.trim() || defaultTrainingFileName(path));
}
</script>

<style scoped>
.training-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
    min-width: min(420px, var(--window-content-width, 100%));
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.field label {
    font-weight: 600;
}

.field-help {
    color: var(--p-text-muted-color);
    font-size: 0.8rem;
}

.field-error {
    color: var(--p-red-500);
    font-size: 0.8rem;
}

.progress-label {
    margin-top: 0.4rem;
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
    text-align: center;
}

.warnings {
    margin: 0;
    padding-left: 1.2rem;
}
</style>
