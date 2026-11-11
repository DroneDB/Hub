/**
 * Align from the dataset page (FR-PRC-11): the Align window stays open with its result, so the page learns of the
 * output when the tasks are done (`aligned`: toast with the numbers, list refresh) and opens it on the map only when
 * the user asks (`close` with 'map').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useDatasetActions } from './useDatasetActions';

const notify = { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));

// The page's other dialogs are not under test (the settings dialog imports an image of the build)
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const source = { entry: { path: 'align/shifted.tif' }, label: 'shifted.tif' };
const output = { entry: { path: 'align/shifted_aligned.tif' }, label: 'shifted_aligned.tif' };

let dataset;
let dialogs;
let listing;
let openItem;

function openAlign(listed = [source, output]) {
    dataset = { remoteUri: vi.fn(path => `ddb://org/ds/${path}`), listOne: vi.fn(async path => ({ path })) };
    dialogs = { open: vi.fn() };
    listing = { files: ref(listed), addEntry: vi.fn().mockResolvedValue() };
    openItem = vi.fn();
    const actions = useDatasetActions({
        dataset, listing, dialogs, busy: ref(false), canWrite: ref(true),
        route: { org: 'org', ds: 'ds' }, openItem, refresh: vi.fn()
    });
    actions.align(source);
    const props = dialogs.open.mock.calls[0][1];
    return typeof props === 'function' ? props() : props;
}

describe('Align of the dataset page', () => {
    beforeEach(() => vi.clearAllMocks());

    it('adds the output to the list and says the numbers when the tasks are done, without closing anything', async () => {
        const props = openAlign();
        await props.onAligned({
            outputPath: 'align/shifted_aligned.tif', result: { tx: -3, ty: 2, thetaDeg: 0, scale: 1, confidence: 1 }
        });

        expect(listing.addEntry).toHaveBeenCalledWith('align/shifted_aligned.tif');
        expect(notify.success).toHaveBeenCalledWith(
            'Output saved as align/shifted_aligned.tif (tx=-3.000 m, ty=2.000 m, θ=0.000°, s=1.00000, conf=1.00)',
            { summary: 'Alignment complete', life: 'long' });
        expect(openItem).not.toHaveBeenCalled();
    });

    it('says only the output when the log gave no numbers', async () => {
        await openAlign().onAligned({ outputPath: 'align/out.tif', result: null });
        expect(notify.success.mock.calls[0][0]).toBe('Output saved as align/out.tif');
    });

    it('does not open anything when the window closes with Close', async () => {
        await openAlign().onClose('close');
        expect(openItem).not.toHaveBeenCalled();
    });

    it('opens the output on the map when the user asks, from the item of the list', async () => {
        await openAlign().onClose('map', { outputPath: 'align/shifted_aligned.tif' });
        expect(openItem).toHaveBeenCalledWith(expect.objectContaining({ entry: output.entry, label: 'shifted_aligned.tif' }));
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('reads the entry when the output is not in the list in view', async () => {
        await openAlign([source]).onClose('map', { outputPath: 'other/out.tif' });
        expect(dataset.listOne).toHaveBeenCalledWith('other/out.tif');
        expect(openItem).toHaveBeenCalledWith({ label: 'out.tif', entry: { path: 'other/out.tif' }, path: 'ddb://org/ds/other/out.tif' });
    });

    // The page says what went wrong in an alert dialog (showError): its message, not an exception
    const alertMessage = () => dialogs.open.mock.calls.slice(1).map(c => c[1]).find(p => p?.title === 'Open on map')?.message;
    const notFound = 'The aligned file other/out.tif could not be found in the dataset. Refresh the file list and open it from there.';

    it('says in words that the output was not found when the Registry has no entry for it', async () => {
        const props = openAlign([source]);
        dataset.listOne.mockResolvedValue(null);
        await props.onClose('map', { outputPath: 'other/out.tif' });
        expect(alertMessage()).toBe(notFound);
        expect(openItem).not.toHaveBeenCalled();
    });

    it('says the same, not the raw error, when reading the entry fails', async () => {
        const props = openAlign([source]);
        dataset.listOne.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'path')"));
        await props.onClose('map', { outputPath: 'other/out.tif' });
        expect(alertMessage()).toBe(notFound);
        expect(openItem).not.toHaveBeenCalled();
    });
});
