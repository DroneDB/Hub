/**
 * Merge Multispectral from the dataset page (FR-PRC-02, FR-PRC-04): the dialog gets the folder's
 * listing (to propose a free name and warn of an existing one), and the page no longer deletes the
 * source bands itself: the merge task does, once its output is written and opens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useDatasetActions } from './useDatasetActions';

vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// The page's other dialogs are not under test (the settings dialog imports an image of the build)
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const bands = ['images/IMG_1.tif', 'images/IMG_2.tif'].map(path => ({ entry: { path }, label: path.slice(7) }));

let dataset;
let dialogs;
let listing;

function openMerge() {
    dataset = { org: 'org', ds: 'ds', deleteObjs: vi.fn() };
    dialogs = { open: vi.fn() };
    listing = { files: ref([...bands, { entry: { path: 'images/IMG_merged.tif' } }]), addEntry: vi.fn().mockResolvedValue(), removed: vi.fn() };
    const actions = useDatasetActions({
        dataset, listing, dialogs, busy: ref(false), canWrite: ref(true),
        route: { org: 'org', ds: 'ds' }, openItem: vi.fn(), refresh: vi.fn()
    });
    actions.mergeMultispectral(bands);
    const props = dialogs.open.mock.calls[0][1];
    return typeof props === 'function' ? props() : props;
}

describe('Merge Multispectral of the dataset page', () => {
    beforeEach(() => vi.clearAllMocks());

    it('gives the dialog the listing of the folder', () => {
        const props = openMerge();
        expect(props.allEntries).toBe(listing.files.value);
        expect(props.files).toBe(bands);
    });

    it('does not delete the sources itself: it only drops them from the list the task emptied', async () => {
        const props = openMerge();
        await props.onClose('merged', {
            outputPath: 'images/IMG_merged (2).tif', deleteSource: true,
            sourceNames: ['IMG_1.tif', 'IMG_2.tif'], sourcePaths: ['images/IMG_1.tif', 'images/IMG_2.tif']
        });
        expect(dataset.deleteObjs).not.toHaveBeenCalled();
        expect(listing.addEntry).toHaveBeenCalledWith('images/IMG_merged (2).tif');
        expect(listing.removed).toHaveBeenCalledWith(['images/IMG_1.tif', 'images/IMG_2.tif']);
    });

    it('keeps the sources in the list without deleteSource', async () => {
        const props = openMerge();
        await props.onClose('merged', { outputPath: 'images/m.tif', deleteSource: false, sourcePaths: ['images/IMG_1.tif'] });
        expect(dataset.deleteObjs).not.toHaveBeenCalled();
        expect(listing.removed).not.toHaveBeenCalled();
    });
});
