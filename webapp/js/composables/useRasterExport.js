// @ts-check
/**
 * useRasterExport - the export of a styled raster as the `raster-export` task (FR-RAS-16, FR-PRC-15, FR-RAS-26, D-023): the
 * one export of Raster Analysis and Plant Health. The whole raster or the visible extent is submitted as a task whose
 * state, progress and Cancel the control shows with HeavyTaskStatus (FR-XC-15); when it succeeds the file is downloaded and
 * a toast says so. The size of an export and the limit come from the value info of the Registry (the same function checks
 * the submit, D-023): the visible extent has its own estimate, read with the window.
 *
 *   const exporter = useRasterExport({ dataset: () => props.dataset, path: () => props.filePath,
 *                                      vizParams: () => style, bbox: () => props.visibleBbox, info: () => rasterInfo, dialogs });
 *   exporter.exportWhole() / exporter.exportExtent() / exporter.cancel()
 *   exporter.wholeReason, exporter.extentReason, exporter.task, exporter.error, exporter.running
 *
 * 'Visible extent' needs a server whose libddb exports a window (`rasterExportWindow` of /sys/features, libddb 2.3): on
 * any other it is disabled with its reason (FR-XC-22) and never submitted. While the estimate of a new extent is read, the
 * last one is kept and the reason is 'Checking size…'.
 */
import { ref, computed, watch } from 'vue';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { useHeavyTaskCancel } from '@/composables/useHeavyTaskCancel';
import { useTimerGroup } from '@/composables/useTimers';
import { downloadBlob } from '@/libs/download';
import { notify } from '@/libs/notify';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { exportRefusal, exportFileName, exportTaskParams, exportSubmitMessage, EXPORT_WINDOW_UNSUPPORTED, EXPORT_CHECKING_SIZE } from '@/libs/map/rasterExport';

/** How long the control rests before an estimate is read (a pan sends many moves; a panel that opens reads its own info first) */
export const ESTIMATE_DELAY_MS = 400;

/** The number of an estimate or of a limit, else null @param {any} v */
const bytesOf = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @param {object} options
 * @param {() => any} options.dataset  the ddb Dataset
 * @param {() => string | null | undefined} options.path  the raster
 * @param {() => Record<string, any>} options.vizParams  the style of the layer (what the export draws)
 * @param {() => number[] | null | undefined} options.bbox  the visible extent in WGS 84, null when it is not known
 * @param {() => any} [options.info]  the value info the panel already has (its estimate and limit are used, not read again)
 * @param {boolean} [options.readEstimate]  read the value info of the whole raster when `info` has no estimate (false: a panel
 *   whose info is the value info, which has the estimate when the server counts it)
 * @param {{ open: Function }} options.dialogs  from useDialogs(): where the question of Cancel is shown
 */
export function useRasterExport({ dataset, path, vizParams, bbox, info = () => null, readEstimate = true, dialogs }) {
    const { runHeavyTask, heavyTasks } = useHeavyTask();
    const { cancelHeavyTask, cancelling } = useHeavyTaskCancel(dataset, dialogs);
    const later = useTimerGroup();

    const running = ref(false);
    const taskId = ref(/** @type {string | null} */ (null));
    const task = computed(() => (taskId.value ? heavyTasks.value[taskId.value] ?? null : null));
    /** The reason a submit was refused (it has no task) */
    const error = ref('');
    /** Whether the refused submit was of the visible extent */
    const refusedExtent = ref(false);

    // The value info of the whole raster when the panel has none with an estimate (Plant Health reads the info of its bands)
    const fetched = ref(/** @type {{ bytes: number | null, limit: number | null | undefined } | null} */ (null));
    // The last estimate of the visible extent: kept while the one of a new extent is read, so the control does not flicker
    const extentEstimate = ref(/** @type {number | null} */ (null));
    /** The estimate of the current extent is being read (the reason says so, the button waits) */
    const extentPending = ref(false);
    let requests = 0;

    /** The server exports a window (libddb 2.3, /sys/features); an older server, which does not say it, does not (FR-XC-22) */
    const windowSupported = reg.features.get(Features.RASTER_EXPORT_WINDOW);

    const nodataOf = () => {
        const v = vizParams()?.nodata;
        return typeof v === 'number' ? v : undefined;
    };

    const wholeBytes = computed(() => bytesOf(info()?.estimatedExportBytes) ?? fetched.value?.bytes ?? null);
    // A server that sends no limit in the value info (an older Registry) has the one of its features
    const limit = computed(() => {
        const given = info();
        if (given && 'exportLimitBytes' in given) return bytesOf(given.exportLimitBytes);
        if (fetched.value && fetched.value.limit !== undefined) return bytesOf(fetched.value.limit);
        return bytesOf(reg.features.value(Features.MAX_EXPORT_SIZE_BYTES));
    });

    /** Why the whole raster cannot be exported (the sizes of the Registry), or '' */
    const wholeReason = computed(() => exportRefusal(wholeBytes.value, limit.value));
    /** The estimate of the visible extent is over the limit (the reason is a size, not a wait) */
    const extentOverLimit = computed(() => !!(windowSupported && bbox() && wholeReason.value && !extentPending.value
        && exportRefusal(extentEstimate.value, limit.value, { extent: true })));
    /**
     * Why the visible extent cannot be exported: a server that exports no window, the map's extent unknown, the estimate of
     * a new extent not read yet, or its estimate over the limit. A window is never larger than the raster: when the whole
     * raster fits, so does the window.
     */
    const extentReason = computed(() => {
        if (!windowSupported) return EXPORT_WINDOW_UNSUPPORTED;
        if (!bbox()) return 'The visible extent of the map is not known yet';
        if (!wholeReason.value) return '';
        if (extentPending.value) return EXPORT_CHECKING_SIZE;
        return exportRefusal(extentEstimate.value, limit.value, { extent: true });
    });

    async function loadWholeEstimate() {
        const current = ++requests;
        fetched.value = null;
        const d = dataset();
        const p = path();
        if (!readEstimate || !d || !p || bytesOf(info()?.estimatedExportBytes) !== null) return;
        try {
            const value = await d.getRasterValueInfo(p, { nodata: nodataOf() });
            if (current === requests) fetched.value = { bytes: bytesOf(value?.estimatedExportBytes), limit: 'exportLimitBytes' in (value || {}) ? value.exportLimitBytes : undefined };
        } catch (e) {
            // The submit decides (D-023): the estimate is a help
            console.error('Failed to read the export estimate:', e);
        }
    }

    let extentRequests = 0;
    /** Whether the estimate of the visible extent is needed: a window the server exports, of a raster over the limit */
    const needsExtentEstimate = () => !!(windowSupported && dataset() && path() && bbox() && wholeReason.value);

    async function loadExtentEstimate() {
        const current = ++extentRequests;
        const d = dataset();
        const p = path();
        const box = bbox();
        if (!needsExtentEstimate()) {
            extentEstimate.value = null;
            extentPending.value = false;
            return;
        }
        try {
            const value = await d.getRasterValueInfo(p, { nodata: nodataOf(), bbox: box });
            if (current === extentRequests) extentEstimate.value = bytesOf(value?.estimatedExportBytes);
        } catch (e) {
            // The submit decides (D-023)
            if (current === extentRequests) extentEstimate.value = null;
            console.error('Failed to read the export estimate of the visible extent:', e);
        } finally {
            if (current === extentRequests) extentPending.value = false;
        }
    }

    // Both estimates are read once the control has rested, not at every change that follows each other
    const wholeLater = useTimerGroup();
    function scheduleWholeEstimate() {
        wholeLater.clear();
        fetched.value = null;
        wholeLater(loadWholeEstimate, ESTIMATE_DELAY_MS);
    }

    function scheduleExtentEstimate() {
        later.clear();
        // The last estimate stays until the new one arrives; meanwhile the reason is 'Checking size…'
        extentPending.value = needsExtentEstimate();
        later(loadExtentEstimate, ESTIMATE_DELAY_MS);
    }

    watch([dataset, path, () => info()?.estimatedExportBytes, nodataOf], scheduleWholeEstimate, { immediate: true });
    watch([bbox, wholeReason, dataset, path, nodataOf], scheduleExtentEstimate, { deep: true, immediate: true });

    /**
     * Submits the export, follows its task, downloads the file and says so.
     * @param {boolean} extent  the visible extent, not the whole raster
     */
    async function run(extent) {
        const d = dataset();
        const p = path();
        if (!d || !p || running.value || (extent && !windowSupported)) return;
        // Busy before the first await: a second click finds it set
        running.value = true;
        error.value = '';
        refusedExtent.value = extent;
        taskId.value = null;
        const fileName = exportFileName(p, extent);
        try {
            const result = await runHeavyTask(d, 'raster-export', {
                path: p,
                params: { path: p, ...exportTaskParams(vizParams(), { bbox: extent ? bbox() : null, fileName }) },
                notify: false,
                onSubmitted: entry => { taskId.value = entry.taskId; }
            });
            const blob = await d.taskResult(result.taskId);
            downloadBlob(blob, fileName);
            notify.success(`Export ready: ${fileName}`);
        } catch (e) {
            // A task that failed or was cancelled shows its state and reason in the status; a refusal of the submit has no task
            if (!/** @type {any} */ (e)?.task) {
                error.value = exportSubmitMessage(e, { extent });
                console.error('Export error:', e);
            }
        } finally {
            running.value = false;
        }
    }

    return {
        task, running, error, refusedExtent, cancelling, windowSupported,
        wholeBytes, limit, extentEstimate, extentPending, wholeReason, extentReason, extentOverLimit,
        exportWhole: () => run(false),
        exportExtent: () => run(true),
        cancel: (/** @type {any} */ entry) => cancelHeavyTask(entry, 'Export raster')
    };
}
