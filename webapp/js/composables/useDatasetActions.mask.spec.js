/**
 * Mask Borders from the dataset page: the Registry replaces an existing masked copy only when the
 * request says so (409 otherwise), so the page sends overwrite only after the user confirmed the replace.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useDatasetActions } from './useDatasetActions';

vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/libs/build/buildManager', () => ({ default: { startPolling: vi.fn() } }));

// The page's other dialogs are not under test (the settings dialog imports an image of the build)
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const item = { entry: { path: 'ortho/ortho.tif' }, label: 'ortho.tif' };

let dataset;
let dialogs;

/** Opens Mask Borders, confirms it, and answers the replace question with confirmAnswer. */
async function maskWith(existing, confirmAnswer = 'confirm') {
    dataset = {
        org: 'org', ds: 'ds',
        checkMaskedFileExists: vi.fn().mockResolvedValue({ exists: existing, outputPath: 'ortho/ortho_masked.tif' }),
        maskBorders: vi.fn().mockResolvedValue({})
    };
    // The first dialog is Mask Borders, the next one the replace question
    dialogs = { open: vi.fn().mockReturnValueOnce(undefined).mockResolvedValue(confirmAnswer) };
    const actions = useDatasetActions({
        dataset, listing: {}, dialogs, busy: ref(false), canWrite: ref(true),
        route: { org: 'org', ds: 'ds' }, openItem: vi.fn(), refresh: vi.fn()
    });
    actions.maskBorders(item);
    await dialogs.open.mock.calls[0][1].onClose('confirm');
}

describe('Mask Borders of the dataset page', () => {
    beforeEach(() => vi.clearAllMocks());

    it('replaces an existing masked copy only after the user confirmed it, and says so', async () => {
        await maskWith(true);
        expect(dialogs.open).toHaveBeenCalledTimes(2);
        expect(dataset.maskBorders).toHaveBeenCalledWith('ortho/ortho.tif', undefined, undefined, true);
    });

    it('asks nothing and sends no overwrite when there is no masked copy', async () => {
        await maskWith(false);
        expect(dialogs.open).toHaveBeenCalledTimes(1);
        expect(dataset.maskBorders).toHaveBeenCalledWith('ortho/ortho.tif', undefined, undefined, false);
    });

    it('starts nothing when the user keeps the existing copy', async () => {
        await maskWith(true, 'cancel');
        expect(dataset.maskBorders).not.toHaveBeenCalled();
    });
});
