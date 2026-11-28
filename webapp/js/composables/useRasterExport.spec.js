/**
 * useRasterExport: the estimates of the size of an export. The answer of a read that a later change of the raster or of the
 * visible extent overtook is not the estimate of what is on show now.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref, nextTick } from 'vue';

vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask: vi.fn(), heavyTasks: ref({}) }) }));
vi.mock('@/composables/useHeavyTaskCancel', () => ({ useHeavyTaskCancel: () => ({ cancelHeavyTask: vi.fn(), cancelling: ref(false) }) }));
vi.mock('@/libs/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/libs/download', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => 1073741824 } } }));

const { useRasterExport, ESTIMATE_DELAY_MS } = await import('./useRasterExport');

const GIB = 1073741824;
const MIB = 1024 * 1024;
const BBOX_A = [15.0, 45.1, 15.1, 45.2];
const BBOX_B = [16.0, 46.1, 16.1, 46.2];
const HUGE = { estimatedExportBytes: 9 * GIB, exportLimitBytes: GIB };

/** A read the test settles */
function deferred() {
    let resolve;
    const promise = new Promise(res => { resolve = res; });
    return { promise, resolve };
}

let scope;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    scope?.stop();
    vi.useRealTimers();
});

function start({ dataset, info = () => HUGE, path = ref('site/a.tif'), bbox = ref(BBOX_A), readEstimate = false }) {
    scope = effectScope();
    let exporter;
    scope.run(() => {
        exporter = useRasterExport({ dataset: () => dataset, path: () => path.value, vizParams: () => ({}), bbox: () => bbox.value, info, readEstimate, dialogs: {} });
    });
    return { exporter, path, bbox };
}

describe('the estimate of the visible extent', () => {
    it('is the one of the extent on show: the answer for the extent before is dropped, and the control keeps waiting', async () => {
        const reads = [];
        const dataset = { getRasterValueInfo: vi.fn(() => { const read = deferred(); reads.push(read); return read.promise; }) };
        const { exporter, bbox } = start({ dataset });

        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 10);
        expect(reads).toHaveLength(1);

        // The map moves while the estimate of the first extent is read
        bbox.value = BBOX_B;
        await nextTick();
        reads[0].resolve({ estimatedExportBytes: 100 * MIB, exportLimitBytes: GIB });
        await vi.advanceTimersByTimeAsync(0);

        // Not 100 MB for the new extent: it is still being checked
        expect(exporter.extentEstimate.value).toBeNull();
        expect(exporter.extentPending.value).toBe(true);
        expect(exporter.extentReason.value).toBe('Checking size…');

        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 10);
        expect(reads).toHaveLength(2);
        expect(dataset.getRasterValueInfo).toHaveBeenLastCalledWith('site/a.tif', { nodata: undefined, bbox: BBOX_B });
        reads[1].resolve({ estimatedExportBytes: 3 * GIB, exportLimitBytes: GIB });
        await vi.advanceTimersByTimeAsync(0);
        expect(exporter.extentEstimate.value).toBe(3 * GIB);
        expect(exporter.extentPending.value).toBe(false);
        expect(exporter.extentReason.value).toMatch(/^Too large to export the visible extent/);
    });

    it('is applied when nothing overtook it', async () => {
        const dataset = { getRasterValueInfo: vi.fn(async () => ({ estimatedExportBytes: 100 * MIB, exportLimitBytes: GIB })) };
        const { exporter } = start({ dataset });
        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 10);
        expect(exporter.extentEstimate.value).toBe(100 * MIB);
        expect(exporter.extentReason.value).toBe('');
    });
});

describe('the estimate of the whole raster', () => {
    it('is the one of the raster on show: the answer for the raster before is dropped', async () => {
        const reads = [];
        const dataset = { getRasterValueInfo: vi.fn(() => { const read = deferred(); reads.push(read); return read.promise; }) };
        const { exporter, path } = start({ dataset, info: () => null, readEstimate: true, bbox: ref(null) });

        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 10);
        expect(reads).toHaveLength(1);

        path.value = 'site/b.tif';
        await nextTick();
        reads[0].resolve({ estimatedExportBytes: 9 * GIB, exportLimitBytes: GIB });
        await vi.advanceTimersByTimeAsync(0);

        // The size of a.tif is not the size of b.tif: no refusal for it
        expect(exporter.wholeBytes.value).toBeNull();
        expect(exporter.wholeReason.value).toBe('');

        await vi.advanceTimersByTimeAsync(ESTIMATE_DELAY_MS + 10);
        expect(reads).toHaveLength(2);
        reads[1].resolve({ estimatedExportBytes: 10 * MIB, exportLimitBytes: GIB });
        await vi.advanceTimersByTimeAsync(0);
        expect(exporter.wholeBytes.value).toBe(10 * MIB);
    });
});
