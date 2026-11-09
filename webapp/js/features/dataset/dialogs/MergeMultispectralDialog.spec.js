/**
 * Merging the raw band images of a multi-camera sensor (MicaSense): the window keeps libddb's
 * warnings (raw band images have no geotransform), says whether the approximate shift correction
 * applies, and sends the user to the Hub's own Run Photogrammetry for accurate results.
 * The submit starts one task per click and replaces an existing file only after the user confirmed it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import MergeMultispectralDialog from './MergeMultispectralDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const runHeavyTask = vi.fn();
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask }) }));
const confirmReplace = vi.fn();
vi.mock('@/composables/useConfirmReplace', async importOriginal => ({
    ...(await importOriginal()), useConfirmReplace: () => confirmReplace
}));

const BANDS = ['IMG_0001_1.tif', 'IMG_0001_2.tif', 'IMG_0001_3.tif'];

const CAMERA_IMAGES = 'These are camera images without map coordinates: the result will not be placed on the map';

function validation(correctionApplied) {
    return {
        ok: true,
        errors: [],
        warnings: [
            CAMERA_IMAGES,
            'Band misalignment detected (~14 pixels). Bands from multi-camera sensors (e.g. MicaSense, DJI Multispectral) '
                + 'are captured from slightly different viewpoints. For accurate vegetation indices (NDVI, NDRE, etc.), '
                + 'process raw imagery with a photogrammetry tool (e.g. WebODM, Pix4D) before merging.'
        ],
        summary: { totalBands: 3, dataType: 'UInt16', width: 1261, height: 942, crs: '' },
        alignment: {
            detected: true, maxShiftPixels: 14.2, correctionApplied,
            bands: [{ index: 0, name: 'Blue' }, { index: 1, name: 'Green' }, { index: 2, name: 'Red' }]
        }
    };
}

async function mountDialog(correctionApplied = true, { result = validation(correctionApplied), names = BANDS } = {}) {
    const dataset = {
        validateMergeMultispectral: vi.fn().mockResolvedValue(result),
        previewMergeMultispectral: vi.fn().mockResolvedValue(null)
    };
    const w = mount(MergeMultispectralDialog, {
        props: { files: names.map(path => ({ label: path, entry: { path } })), dataset },
        global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /><slot name="footer" /></div>' } } }
    });
    await flushPromises();
    return w;
}

describe('MergeMultispectralDialog band misalignment', () => {
    it('points to Run Photogrammetry, not to another product', async () => {
        const banner = (await mountDialog()).find('.alignment-warning');
        expect(banner.text()).toContain('Run Photogrammetry');
        expect(banner.text()).not.toMatch(/WebODM/i);
        expect(banner.find('a').exists()).toBe(false);
    });

    it('shows the one plain warning about camera images, not one for each band', async () => {
        const w = await mountDialog();
        const warnings = w.findAll('.validation-warnings .validation-msg');
        expect(warnings.map(x => x.text())).toEqual([CAMERA_IMAGES]);
        expect(w.text()).not.toContain('Cannot read geotransform');
        expect(w.text()).not.toMatch(/WebODM/i);
    });

    it('says whether the approximate correction applies', async () => {
        expect((await mountDialog(true)).find('.alignment-warning').text()).toContain('Approximate correction will be applied.');
        const without = (await mountDialog(false)).find('.alignment-warning').text();
        expect(without).toContain('No approximate correction applies to these images.');
        expect(without).not.toContain('will be applied');
    });
});

// ---- The check says each thing once, names the files and the bands (FR-PRC-14) --------------------

describe('MergeMultispectralDialog check', () => {
    it('says an identical warning once, with how many there were', async () => {
        const result = { ...validation(true), alignment: null, warnings: Array(5).fill('Cannot read geotransform') };
        const rows = (await mountDialog(true, { result })).findAll('.validation-warnings .validation-msg');
        expect(rows.map(x => x.text())).toEqual(['Cannot read geotransform (×5)']);
    });

    it('keeps different warnings apart, in the order they came', async () => {
        const result = { ...validation(true), alignment: null, warnings: ['b one', 'a two', 'b one'] };
        const rows = (await mountDialog(true, { result })).findAll('.validation-warnings .validation-msg');
        expect(rows.map(x => x.text())).toEqual(['b one (×2)', 'a two']);
    });

    it('shows the band name from the camera next to each file', async () => {
        const w = await mountDialog();
        const names = w.findAll('.band-item').map(li => li.find('[data-testid="band-camera-name"]').text());
        expect(names).toEqual(['Blue', 'Green', 'Red']);
    });

    it('follows the band names when the order of the files changes', async () => {
        const w = await mountDialog();
        w.vm.dataset.validateMergeMultispectral.mockResolvedValue({
            ...validation(true),
            alignment: { ...validation(true).alignment, bands: [{ name: 'Green' }, { name: 'Blue' }, { name: 'Red' }] }
        });
        await w.findAll('.band-move button')[1].trigger('click'); // the first file down: it is second now
        await flushPromises();
        expect(w.findAll('.band-item').map(li => li.find('.band-name').attributes('title')))
            .toEqual(['IMG_0001_2.tif', 'IMG_0001_1.tif', 'IMG_0001_3.tif']);
        expect(w.findAll('[data-testid="band-camera-name"]').map(x => x.text())).toEqual(['Green', 'Blue', 'Red']);
    });

    it('shows the answer of the latest check when an older one comes back after it', async () => {
        const w = await mountDialog();
        /** @type {Array<(value: unknown) => void>} */
        const answer = [];
        w.vm.dataset.validateMergeMultispectral.mockImplementation(() => new Promise(resolve => answer.push(resolve)));
        const checked = (/** @type {string[]} */ names) => ({
            ...validation(true),
            alignment: { ...validation(true).alignment, bands: names.map(name => ({ name })) }
        });
        await w.findAll('.band-move button')[1].trigger('click'); // 2, 1, 3
        await w.findAll('.band-move button')[3].trigger('click'); // 2, 3, 1
        expect(answer).toHaveLength(2);

        answer[1](checked(['Green', 'Red', 'Blue']));
        await flushPromises();
        answer[0](checked(['Green', 'Blue', 'Red']));
        await flushPromises();

        expect(w.findAll('.band-item').map(li => li.find('.band-name').attributes('title')))
            .toEqual(['IMG_0001_2.tif', 'IMG_0001_3.tif', 'IMG_0001_1.tif']);
        expect(w.findAll('[data-testid="band-camera-name"]').map(x => x.text())).toEqual(['Green', 'Red', 'Blue']);
        expect(w.vm.dataset.previewMergeMultispectral).toHaveBeenLastCalledWith(
            ['IMG_0001_2.tif', 'IMG_0001_3.tif', 'IMG_0001_1.tif'], '1,2,3', 512);
        expect(w.vm.validating).toBe(false);
    });

    it('shows no band name when the check gives none', async () => {
        const result = { ...validation(true), alignment: null };
        expect((await mountDialog(true, { result })).find('[data-testid="band-camera-name"]').exists()).toBe(false);
    });

    it('shortens a long file name in the middle and keeps the suffix that tells the bands apart', async () => {
        const names = ['IMG_180822_135805_0467_GRE.TIF', 'IMG_180822_135805_0467_NIR.TIF'];
        const w = await mountDialog(true, { names });
        const shown = w.findAll('.band-name').map(x => x.text());
        expect(shown).toEqual(['IMG_180822_135…7_GRE.TIF', 'IMG_180822_135…7_NIR.TIF']);
        // the full path stays in the tooltip
        expect(w.find('.band-name').attributes('title')).toBe(names[0]);
    });

    it('shows a name that fits as it is', async () => {
        expect((await mountDialog()).find('.band-name').text()).toBe('IMG_0001_1.tif');
    });

    it('shows the size of the merged raster that the check reports', async () => {
        expect((await mountDialog()).find('.merge-summary').text()).toContain('1261×942');
    });
});

// ---- The preview is requested at the size it is shown (FR-PRC-46) ------------------------------

describe('MergeMultispectralDialog preview', () => {
    afterEach(() => vi.unstubAllGlobals());

    async function mountWithPreview(ratio) {
        vi.stubGlobal('devicePixelRatio', ratio);
        const dataset = {
            validateMergeMultispectral: vi.fn().mockResolvedValue(validation(true)),
            previewMergeMultispectral: vi.fn().mockResolvedValue('/preview.png')
        };
        const w = mount(MergeMultispectralDialog, {
            props: { files: BANDS.map(path => ({ label: path, entry: { path } })), dataset },
            global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /><slot name="footer" /></div>' } } }
        });
        await flushPromises();
        return { w, dataset };
    }

    it('asks for 512 px at ratio 1: the preview is drawn 28rem (448 px) at most, not 256 px upscaled', async () => {
        const { dataset } = await mountWithPreview(1);
        expect(dataset.previewMergeMultispectral).toHaveBeenCalledWith(BANDS, '1,2,3', 512);
    });

    it('asks for 1024 px at ratio 2, the most it asks for', async () => {
        const { dataset } = await mountWithPreview(2);
        expect(dataset.previewMergeMultispectral).toHaveBeenCalledWith(BANDS, '1,2,3', 1024);
        const size = dataset.previewMergeMultispectral.mock.calls[0][2];
        expect(size).toBeGreaterThanOrEqual(440);
    });

    it('grows with the dialog, up to 28rem', async () => {
        const css = fs.readFileSync(path.join(__dirname, 'MergeMultispectralDialog.vue'), 'utf8').split('<style')[1];
        expect(css).toMatch(/\.preview-thumb\s*\{[^}]*max-width:\s*min\(100%,\s*28rem\)/);
        expect(css).not.toMatch(/max-width:\s*220px/);
    });

    it('opens at full size on a click, and not before', async () => {
        const { w } = await mountWithPreview(1);
        expect(w.find('.preview-full').exists()).toBe(false);
        await w.find('.preview-open').trigger('click');
        expect(w.find('.preview-full').attributes('src')).toBe('/preview.png');
    });

    it('closes the full size when the bands are checked again', async () => {
        const { w } = await mountWithPreview(1);
        await w.find('.preview-open').trigger('click');
        await w.findAll('.band-move button')[1].trigger('click');
        await flushPromises();
        expect(w.find('.preview-full').exists()).toBe(false);
    });
});

// ---- Submit: one task per click, and no silent replace (FR-PRC-02, FR-PRC-04) ------------------

const WindowStub = { props: ['busy'], template: '<div><slot /><slot name="footer" /></div>' };

// entries: what the listing in view shows; folder: what the Registry lists (dataset.list), read after a 409
async function openForSubmit({ entries = [], folder = [] } = {}) {
    const dataset = {
        validateMergeMultispectral: vi.fn().mockResolvedValue({ ...validation(true), alignment: null }),
        previewMergeMultispectral: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue(folder)
    };
    const files = BANDS.map(path => ({ label: path, entry: { path } }));
    const w = mount(MergeMultispectralDialog, {
        props: { files, dataset, allEntries: [...files, ...entries] },
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    await flushPromises();
    return w;
}

const mergeButton = w => w.findAll('button').find(b => b.text() === 'Merge');
const output = w => w.find('#merge-multispectral-dialog-output-path');
const submitted = call => runHeavyTask.mock.calls[call][2];
const conflict = path => new ApiError(`A file or folder named '${path}' already exists in this folder`, 409, { conflictPath: path });

describe('MergeMultispectralDialog submit', () => {
    beforeEach(() => {
        runHeavyTask.mockReset();
        confirmReplace.mockReset();
    });

    it('starts one task on a double click, without force, and is busy while it runs', async () => {
        runHeavyTask.mockImplementation(() => new Promise(() => {}));
        const w = await openForSubmit();

        const button = mergeButton(w);
        button.trigger('click');
        button.trigger('click');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(runHeavyTask.mock.calls[0][1]).toBe('merge-multispectral');
        expect(submitted(0).force).toBeUndefined();
        expect(submitted(0).params).toEqual({
            paths: BANDS, outputPath: 'IMG_0001_merged.tif', overwrite: false, deleteSources: false
        });
        expect(w.findComponent(WindowStub).props('busy')).toBe(true);
        expect(mergeButton(w).element.disabled).toBe(true);
    });

    it('sends the delete-sources flag to the task, and deletes nothing itself', async () => {
        runHeavyTask.mockResolvedValue({ state: 'Succeeded' });
        const w = await openForSubmit();
        await w.find('#deleteSrcCheckbox').setValue(true);

        await mergeButton(w).trigger('click');
        await flushPromises();

        expect(submitted(0).params.deleteSources).toBe(true);
        expect(w.emitted('close')[0]).toEqual(['merged', expect.objectContaining({ deleteSource: true, sourcePaths: BANDS })]);
    });

    it('proposes a free name, and warns when the typed name exists', async () => {
        const w = await openForSubmit({ entries: [{ entry: { path: 'img_0001_MERGED.tif' } }] });

        expect(output(w).element.value).toBe('IMG_0001_merged (2).tif');
        expect(w.text()).not.toContain('This file exists and will be replaced');

        await output(w).setValue('IMG_0001_merged.tif');
        expect(w.text()).toContain('This file exists and will be replaced');
        expect(mergeButton(w).element.disabled).toBe(false);
    });

    it('marks a source band as output invalid, and does not submit it', async () => {
        const w = await openForSubmit();

        await output(w).setValue('img_0001_2.TIF');
        expect(w.find('.output-error').text()).toBe('The output cannot be one of the source bands');
        expect(output(w).classes()).toContain('p-invalid');
        expect(mergeButton(w).element.disabled).toBe(true);

        await w.vm.merge();
        expect(runHeavyTask).not.toHaveBeenCalled();
    });

    it('marks the name of a folder as output invalid', async () => {
        const w = await openForSubmit({ entries: [{ entry: { path: 'out.tif', type: ddb.entry.type.DIRECTORY } }] });

        await output(w).setValue('out.tif');
        expect(w.find('.output-error').text()).toBe("A file or folder named 'out.tif' already exists in this folder");
        expect(mergeButton(w).element.disabled).toBe(true);
    });

    it('replaces an existing file only after the user confirmed it', async () => {
        runHeavyTask.mockResolvedValue({ state: 'Succeeded' });
        confirmReplace.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const w = await openForSubmit({ entries: [{ entry: { path: 'IMG_0001_merged.tif' } }] });
        await output(w).setValue('img_0001_merged.tif');

        await mergeButton(w).trigger('click');
        await flushPromises();
        expect(confirmReplace).toHaveBeenCalledWith('IMG_0001_merged.tif');
        expect(runHeavyTask).not.toHaveBeenCalled();
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);

        await mergeButton(w).trigger('click');
        await flushPromises();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(submitted(0).params).toMatchObject({ outputPath: 'img_0001_merged.tif', overwrite: true });
        // The Registry wrote the existing entry: the page adds that path
        expect(w.emitted('close')[0][1].outputPath).toBe('IMG_0001_merged.tif');
    });

    it('does not offer to replace a folder the Registry found at the submit: it shows the clash', async () => {
        runHeavyTask.mockRejectedValue(conflict('IMG_0001_merged.tif'));
        const w = await openForSubmit({ folder: [{ path: 'img_0001_MERGED.tif', type: ddb.entry.type.DIRECTORY }] });

        await mergeButton(w).trigger('click');
        await flushPromises();

        expect(confirmReplace).not.toHaveBeenCalled();
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(w.find('.validation-errors').text()).toContain("A file or folder named 'IMG_0001_merged.tif' already exists in this folder");
    });

    it('asks once when the Registry finds the file at the submit (409 conflictPath), then resubmits with overwrite', async () => {
        runHeavyTask.mockRejectedValueOnce(conflict('Img_0001_Merged.tif')).mockResolvedValueOnce({ state: 'Succeeded' });
        confirmReplace.mockResolvedValue(true);
        const w = await openForSubmit({ folder: [{ path: 'Img_0001_Merged.tif', type: ddb.entry.type.GEORASTER }] });

        await mergeButton(w).trigger('click');
        await flushPromises();

        expect(confirmReplace).toHaveBeenCalledOnce();
        expect(confirmReplace).toHaveBeenCalledWith('Img_0001_Merged.tif');
        expect(runHeavyTask).toHaveBeenCalledTimes(2);
        expect(submitted(0).params.overwrite).toBe(false);
        expect(submitted(1).params.overwrite).toBe(true);
        expect(w.emitted('close')[0]).toEqual(['merged', expect.objectContaining({ outputPath: 'Img_0001_Merged.tif' })]);
    });

    it('resubmits only once, and shows a second refusal', async () => {
        runHeavyTask.mockRejectedValue(conflict('IMG_0001_merged.tif'));
        confirmReplace.mockResolvedValue(true);
        const w = await openForSubmit();

        await mergeButton(w).trigger('click');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledTimes(2);
        expect(w.find('.validation-errors').text()).toContain("A file or folder named 'IMG_0001_merged.tif' already exists in this folder");
        expect(w.emitted('close')).toBeUndefined();
    });

    it('keeps the file when the user declines the replace after a 409', async () => {
        runHeavyTask.mockRejectedValueOnce(conflict('IMG_0001_merged.tif'));
        confirmReplace.mockResolvedValue(false);
        const w = await openForSubmit();

        await mergeButton(w).trigger('click');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(w.emitted('close')).toBeUndefined();
        expect(mergeButton(w).element.disabled).toBe(false);
    });

    it('shows the message of another 409 or a 503 without asking', async () => {
        runHeavyTask.mockRejectedValueOnce(new ApiError('Another task writes this output', 409))
            .mockRejectedValueOnce(new ApiError('The dataset is busy: try again', 503));
        const w = await openForSubmit();

        await mergeButton(w).trigger('click');
        await flushPromises();
        expect(w.find('.validation-errors').text()).toContain('Another task writes this output');

        await w.vm.validate();
        await mergeButton(w).trigger('click');
        await flushPromises();
        expect(w.find('.validation-errors').text()).toContain('The dataset is busy: try again');
        expect(confirmReplace).not.toHaveBeenCalled();
        expect(runHeavyTask).toHaveBeenCalledTimes(2);
    });
});
