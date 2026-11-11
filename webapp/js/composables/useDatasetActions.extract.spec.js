/**
 * Extract Archive from the dataset page (FR-PRC-30): the toast names the entries the extraction skipped, with the reason of
 * each, instead of saying the archive was extracted as a whole.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useDatasetActions } from './useDatasetActions';

const notify = { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));

// The page's other dialogs are not under test (the settings dialog imports an image of the build)
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

let listing;
let showFolder;

async function extractAndClose(result) {
    const dialogs = { open: vi.fn() };
    listing = { reload: vi.fn().mockResolvedValue(), removed: vi.fn() };
    showFolder = vi.fn();
    const actions = useDatasetActions({
        dataset: { org: 'org', ds: 'ds' }, listing, dialogs, busy: ref(false), canWrite: ref(true),
        route: { org: 'org', ds: 'ds' }, openItem: vi.fn(), refresh: vi.fn(), showFolder
    });
    actions.extract({ entry: { path: 'good.zip' } });
    const props = dialogs.open.mock.calls[0][1];
    const resolved = typeof props === 'function' ? props() : props;
    await resolved.onClose('extracted', result);
}

describe('Extract of the dataset page', () => {
    beforeEach(() => vi.clearAllMocks());

    it('says the archive was extracted when nothing was skipped', async () => {
        await extractAndClose({ destPath: 'out', summary: { extracted: 9, skipped: 0, entries: [], more: 0 } });

        expect(notify.success).toHaveBeenCalledWith('Archive extracted to out', { summary: 'Extract Completed', life: 'normal' });
        expect(notify.warn).not.toHaveBeenCalled();
        expect(listing.reload).toHaveBeenCalledWith('out');
    });

    it('names the skipped entry and why', async () => {
        await extractAndClose({
            destPath: '',
            summary: { extracted: 8, skipped: 1, entries: [{ path: 'vectors/tool.exe', reason: 'file type not allowed' }], more: 0 }
        });

        expect(notify.warn).toHaveBeenCalledWith(
            'Archive extracted to root folder. Skipped 1 entry: vectors/tool.exe (file type not allowed)',
            { summary: 'Extract Completed', life: 'long' });
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('still says it was extracted for a result without a summary', async () => {
        await extractAndClose({ destPath: 'out' });

        expect(notify.success).toHaveBeenCalledWith('Archive extracted to out', { summary: 'Extract Completed', life: 'normal' });
    });

    // FR-EXP-19: the docs say the Hub opens the destination folder, and the tree gets the new folders
    it('opens the destination folder in the tree and the list (and the archive that was deleted leaves the list)', async () => {
        await extractAndClose({ destPath: 'extracted/gltf', archivePath: 'models/zips/model-gltf.zip', deletedArchive: true, summary: { extracted: 2, skipped: 0, entries: [], more: 0 } });

        expect(listing.reload).toHaveBeenCalledWith('extracted/gltf');
        expect(listing.removed).toHaveBeenCalledWith(['models/zips/model-gltf.zip']);
        expect(showFolder).toHaveBeenCalledTimes(1);
        expect(showFolder).toHaveBeenCalledWith('extracted/gltf');
    });

    it('opens the root when the archive is extracted there', async () => {
        await extractAndClose({ destPath: '', summary: { extracted: 1, skipped: 0, entries: [], more: 0 } });

        expect(showFolder).toHaveBeenCalledWith('');
    });
});
