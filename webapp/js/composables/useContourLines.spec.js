/**
 * Every contour request of the Hub runs as the task raster-contours (FR-RAS-11, NFR-001): the progress and the Cancel come
 * from the task, the lines are its artifact, the layer's NoData value goes with the request, and a result the server cut at
 * its cap says so. A refusal or a failure shows in the dialog, not in a modal alert. A thermal layer gets its levels, its
 * limits and its labels in the unit it shows: its formula goes with the request (D-022), never a Plant Health index formula.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, ref, shallowRef } from 'vue';
import { useContourLines } from './useContourLines';

// The live entries of the task, as useHeavyTask keeps them
const heavyTasks = ref({});
const runHeavyTask = vi.fn();
vi.mock('@/composables/useHeavyTask', () => ({
    useHeavyTask: () => ({ heavyTasks, runHeavyTask })
}));

const PATH = 'odm_dem/dsm.tif';

const line = elev => ({
    type: 'Feature', properties: { elev },
    geometry: { type: 'LineString', coordinates: [[10, 45], [10.001, 45.001]] }
});
const resultOf = (extra = {}) => ({
    type: 'FeatureCollection', features: [line(10), line(20)], interval: 10, baseOffset: 0, min: 10, max: 20, unit: 'm',
    rasterMin: 5, rasterMax: 25, featureCount: 2, featureCap: 100000, truncated: false, ...extra
});
const blobOf = result => ({ text: async () => JSON.stringify(result) });

function setup({ result = resultOf(), vizParams = {} } = {}) {
    const dataset = { submitTask: vi.fn(), taskResult: vi.fn(async () => blobOf(result)) };
    const measureControls = {
        source: { getFeatures: () => [] }, importFromGeoJSON: vi.fn(), refreshButtons: vi.fn()
    };
    const showAlert = vi.fn();
    const showFlash = vi.fn();
    const contours = effectScope().run(() => useContourLines({
        dataset: () => dataset, measureControls: () => measureControls, rasterFilePath: ref(PATH),
        vizParamsByPath: shallowRef(vizParams), showAlert: () => showAlert, showFlash: () => showFlash
    }));
    return { dataset, measureControls, showAlert, showFlash, contours };
}

describe('useContourLines as a task', () => {
    beforeEach(() => {
        heavyTasks.value = {};
        runHeavyTask.mockReset();
        runHeavyTask.mockImplementation(async (dataset, toolId, options) => {
            options.onSubmitted({ taskId: 't1' });
            return { taskId: 't1', state: 'Succeeded' };
        });
    });

    it('runs the options as the task raster-contours on the raster, without the toast of the poller', async () => {
        const { contours, dataset } = setup();

        await contours.generateContourLines({ interval: 10, count: null, baseOffset: 0, minElev: null, maxElev: null, simplifyTolerance: 0 });

        expect(runHeavyTask).toHaveBeenCalledOnce();
        const [passedDataset, toolId, options] = runHeavyTask.mock.calls[0];
        expect(passedDataset.submitTask).toBe(dataset.submitTask);
        expect(toolId).toBe('raster-contours');
        expect(options).toMatchObject({
            path: PATH, notify: false,
            params: { interval: 10, count: null, baseOffset: 0, minElev: null, maxElev: null, simplifyTolerance: 0, bandIndex: 1 }
        });
        expect(options.params).not.toHaveProperty('nodata');
        expect(dataset.taskResult).toHaveBeenCalledWith('t1');
    });

    it('sends the NoData value the layer is styled with', async () => {
        const { contours } = setup({ vizParams: { [PATH]: { nodata: '-9999', colormap: 'viridis' } } });

        await contours.generateContourLines({ interval: 10 });

        expect(runHeavyTask.mock.calls[0][2].params.nodata).toBe(-9999);
    });

    it('puts the lines of the artifact on the measurements layer, closes the dialog and says how many', async () => {
        const { contours, measureControls, showFlash, showAlert } = setup();
        contours.openContourDialog();
        expect(contours.contourDialogVisible.value).toBe(true);

        await contours.generateContourLines({ interval: 10 });

        const imported = measureControls.importFromGeoJSON.mock.calls[0][0];
        expect(imported.features.map(f => [f.properties.elev, f.properties.measurementType, f.properties.unsaved]))
            .toEqual([[10, 'contour', true], [20, 'contour', true]]);
        expect(contours.contourDialogVisible.value).toBe(false);
        expect(contours.contourLoading.value).toBe(false);
        expect(showFlash).toHaveBeenCalledWith('Generated 2 contour lines.', 'positive');
        expect(showAlert).not.toHaveBeenCalled();
        expect(contours.contourRasterMin.value).toBe(5);
        expect(contours.contourRasterMax.value).toBe(25);
    });

    it('says the result is truncated at N lines when the server cut it', async () => {
        const { contours, showAlert } = setup({ result: resultOf({ truncated: true, featureCount: 100000 }) });

        await contours.generateContourLines({ interval: 1 });

        expect(showAlert).toHaveBeenCalledOnce();
        expect(showAlert.mock.calls[0][0]).toBe('Contours truncated');
        expect(showAlert.mock.calls[0][1]).toContain('truncated at 100,000 lines');
    });

    it('names the value range in the truncation of a raster that is not an elevation model (FR-RAS-25)', async () => {
        const { contours, showAlert } = setup({ result: resultOf({ truncated: true, featureCount: 100000 }) });
        contours.openContourDialog({ valueMin: 145, valueMax: 402, bandCount: 2, dataType: 'UInt16', isThermal: false, unit: '' });

        await contours.generateContourLines({ interval: 1 });

        expect(showAlert.mock.calls[0][1]).toBe('The contour lines are truncated at 100,000 lines: the rest of the raster has none. Use a larger interval, or limit the value range, and generate again.');
    });

    it('exposes the live entry of the task of the request while it runs', async () => {
        const { contours } = setup();
        let release;
        runHeavyTask.mockImplementation((dataset, toolId, options) => {
            options.onSubmitted({ taskId: 't9' });
            heavyTasks.value = { t9: { taskId: 't9', state: 'Processing', percent: 40, phase: 'levels' } };
            return new Promise(resolve => { release = resolve; });
        });

        const running = contours.generateContourLines({ interval: 10 });
        await vi.waitFor(() => expect(contours.contourTask.value).toMatchObject({ state: 'Processing', percent: 40, phase: 'levels' }));
        expect(contours.contourLoading.value).toBe(true);
        // A second request while one runs is ignored
        await contours.generateContourLines({ interval: 5 });
        expect(runHeavyTask).toHaveBeenCalledOnce();

        release({ taskId: 't9', state: 'Succeeded' });
        await running;
        expect(contours.contourLoading.value).toBe(false);
    });

    it('keeps the dialog open on a cancelled task, which its status shows, with no alert and no lines', async () => {
        const { contours, measureControls, showAlert } = setup();
        contours.openContourDialog();
        runHeavyTask.mockImplementation(async (dataset, toolId, options) => {
            options.onSubmitted({ taskId: 't2' });
            heavyTasks.value = { t2: { taskId: 't2', state: 'Deleted', cancelledBy: 'me' } };
            throw Object.assign(new Error('Task Deleted'), { task: heavyTasks.value.t2 });
        });

        await contours.generateContourLines({ interval: 10 });

        expect(contours.contourTask.value).toMatchObject({ state: 'Deleted' });
        expect(contours.contourError.value).toBeNull();
        expect(contours.contourDialogVisible.value).toBe(true);
        expect(contours.contourLoading.value).toBe(false);
        expect(measureControls.importFromGeoJSON).not.toHaveBeenCalled();
        expect(showAlert).not.toHaveBeenCalled();
    });

    it('shows a failed task through its status, not through an alert', async () => {
        const { contours, showAlert } = setup();
        runHeavyTask.mockImplementation(async (dataset, toolId, options) => {
            options.onSubmitted({ taskId: 't3' });
            heavyTasks.value = { t3: { taskId: 't3', state: 'Failed', error: 'Cannot read the raster' } };
            throw Object.assign(new Error('Cannot read the raster'), { task: heavyTasks.value.t3 });
        });

        await contours.generateContourLines({ interval: 10 });

        expect(contours.contourTask.value.error).toBe('Cannot read the raster');
        expect(contours.contourError.value).toBeNull();
        expect(showAlert).not.toHaveBeenCalled();
    });

    it('shows the reason of a refused submit in the dialog, with the message of the server', async () => {
        const { contours, showAlert } = setup();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        runHeavyTask.mockRejectedValue(new Error("'interval' must be > 0"));

        await contours.generateContourLines({ interval: 0 });

        expect(contours.contourError.value).toBe("'interval' must be > 0");
        expect(contours.contourTask.value).toBeNull();
        expect(contours.contourLoading.value).toBe(false);
        expect(showAlert).not.toHaveBeenCalled();
    });

    it('says when the artifact is not the contours', async () => {
        const { contours } = setup({ result: { type: 'Nope' } });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await contours.generateContourLines({ interval: 10 });

        expect(contours.contourError.value).toBe('Unexpected contour response.');
    });

    it('says when the lines are none', async () => {
        const { contours } = setup({ result: resultOf({ features: [], featureCount: 0 }) });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await contours.generateContourLines({ interval: 10 });

        expect(contours.contourError.value).toContain('No contour lines were generated');
    });

    it('forgets the task of an earlier request when the dialog opens again', async () => {
        const { contours } = setup();
        await contours.generateContourLines({ interval: 10 });
        heavyTasks.value = { t1: { taskId: 't1', state: 'Succeeded' } };
        expect(contours.contourTask.value).not.toBeNull();

        contours.openContourDialog();

        expect(contours.contourTask.value).toBeNull();
    });

    it('reads the contours of a thermal layer with its formula and its NoData value (D-022)', async () => {
        // What the Registry answers for the contours of a Kelvin raster with the CELSIUS formula
        const celsius = resultOf({ unit: '°C', interval: 5, min: 15, max: 30, rasterMin: 10.85, rasterMax: 30.65 });
        const { contours } = setup({
            result: celsius,
            vizParams: { [PATH]: { formula: 'CELSIUS', colormap: 'ironbow', rescale: '10,30', nodata: 0 } }
        });

        await contours.generateContourLines({ interval: 5 });

        expect(runHeavyTask.mock.calls[0][2].params).toMatchObject({ interval: 5, nodata: 0, formula: 'CELSIUS' });
        // The hints of the dialog are in the unit of the answer
        expect(contours.contourUnit.value).toBe('°C');
        expect(contours.contourRasterMin.value).toBe(10.85);
    });

    it('sends no formula for a layer styled with an index, nor for a layer without style', async () => {
        const index = setup({ vizParams: { [PATH]: { formula: 'NDVI', colormap: 'rdylgn' } } });
        await index.contours.generateContourLines({ interval: 5 });
        expect(runHeavyTask.mock.calls[0][2].params).not.toHaveProperty('formula');
        expect(runHeavyTask.mock.calls[0][2].params).not.toHaveProperty('nodata');

        const plain = setup();
        await plain.contours.generateContourLines({ count: 10 });
        expect(runHeavyTask.mock.calls[1][2].params).not.toHaveProperty('formula');
    });
});
