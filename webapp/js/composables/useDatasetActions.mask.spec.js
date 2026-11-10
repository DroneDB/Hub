/**
 * Mask Borders from the dataset page (FR-PRC-12, FR-XC-07): a heavy task through runHeavyTask, never the endpoint of
 * before. The masked file joins the list when the task ends and the toast names it; the Registry replaces an existing
 * masked copy only when the request says so (409 otherwise), so the page sends overwrite only after the user confirmed
 * the replace.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useDatasetActions } from './useDatasetActions';
import { replaceConfirmation } from './useConfirmReplace';

const notify = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const runHeavyTask = vi.hoisted(() => vi.fn());
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask }) }));
vi.mock('@/libs/build/buildManager', () => ({ default: { startPolling: vi.fn() } }));

// The page's other dialogs are not under test (the settings dialog imports an image of the build)
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const item = { entry: { path: 'ortho/ortho.tif' }, label: 'ortho.tif' };

let dataset;
let dialogs;
let listing;

/** Opens Mask Borders, confirms it, and answers the replace question with confirmAnswer. */
async function maskWith({ listed = [], confirmAnswer = 'confirm', submit } = {}) {
    dataset = { org: 'org', ds: 'ds', list: vi.fn().mockResolvedValue([]) };
    listing = { files: ref(listed.map(path => ({ entry: { path, type: 4 } }))), addEntry: vi.fn().mockResolvedValue(undefined) };
    runHeavyTask.mockImplementation(submit ?? (async (ds, tool, options) => {
        options.onSubmitted?.({ taskId: 't1' });
        return { taskId: 't1', state: 'Succeeded' };
    }));
    // The first dialog is Mask Borders, the next one the replace question
    dialogs = { open: vi.fn().mockReturnValueOnce(undefined).mockResolvedValue(confirmAnswer) };
    const actions = useDatasetActions({
        dataset, listing, dialogs, busy: ref(false), canWrite: ref(true),
        route: { org: 'org', ds: 'ds' }, openItem: vi.fn(), refresh: vi.fn()
    });
    actions.maskBorders(item);
    await dialogs.open.mock.calls[0][1].onClose('confirm');
}

const maskTaskCalls = () => runHeavyTask.mock.calls.filter(c => c[1] === 'mask-borders');

describe('Mask Borders of the dataset page', () => {
    beforeEach(() => vi.clearAllMocks());

    it('runs the mask-borders heavy task for the file, without overwrite when no copy exists', async () => {
        await maskWith();
        expect(maskTaskCalls()).toHaveLength(1);
        expect(maskTaskCalls()[0][0]).toBe(dataset);
        expect(maskTaskCalls()[0][2]).toMatchObject({ params: { path: 'ortho/ortho.tif', overwrite: false }, notify: false });
        expect(dialogs.open).toHaveBeenCalledTimes(1);
    });

    it('puts the new file in the list at once when the task ends, and the toast names it', async () => {
        await maskWith();
        expect(listing.addEntry).toHaveBeenCalledWith('ortho/ortho_masked.tif');
        expect(notify.success).toHaveBeenCalledWith('Masked file ready: ortho_masked.tif', expect.objectContaining({ summary: 'Mask Borders' }));
        expect(notify.info).toHaveBeenCalledWith('Masking started for ortho.tif...', expect.objectContaining({ summary: 'Mask Borders' }));
    });

    it('shows nothing and adds nothing when the task fails, and says why', async () => {
        await maskWith({ submit: async () => { throw Object.assign(new Error('Storage quota exceeded: the owner of this organization has 0 B left.'), { task: {} }); } });
        expect(listing.addEntry).not.toHaveBeenCalled();
        expect(notify.success).not.toHaveBeenCalled();
        expect(notify.error).toHaveBeenCalledWith('Storage quota exceeded: the owner of this organization has 0 B left.', expect.objectContaining({ summary: 'Mask Borders failed' }));
    });

    it('replaces a masked copy that is in the list only after the user confirmed it, and sends overwrite', async () => {
        await maskWith({ listed: ['ortho/ortho_masked.tif'] });
        expect(dialogs.open).toHaveBeenCalledTimes(2);
        expect(maskTaskCalls()[0][2].params).toEqual({ path: 'ortho/ortho.tif', overwrite: true });
    });

    it('asks the one replace question of the Hub (confirmReplace, FR-XC-07)', async () => {
        await maskWith({ listed: ['ortho/ortho_masked.tif'] });
        const { title, message, confirmText } = replaceConfirmation('ortho/ortho_masked.tif');
        expect(title).toBe('Replace “ortho_masked.tif”?');
        expect(dialogs.open.mock.calls[1][1]).toMatchObject({ title, message, confirmText, confirmButtonClass: 'danger' });
    });

    it('finds the copy in another letter case, and writes that entry (D-040)', async () => {
        await maskWith({ listed: ['ortho/Ortho_Masked.TIF'] });
        expect(maskTaskCalls()[0][2].params.overwrite).toBe(true);
        expect(listing.addEntry).toHaveBeenCalledWith('ortho/Ortho_Masked.TIF');
    });

    it('starts nothing when the user keeps the existing copy', async () => {
        await maskWith({ listed: ['ortho/ortho_masked.tif'], confirmAnswer: 'cancel' });
        expect(runHeavyTask).not.toHaveBeenCalled();
        expect(listing.addEntry).not.toHaveBeenCalled();
    });

    it('asks once, then replaces, when the copy appeared after the list was read (409 with its path)', async () => {
        const submit = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('A file named ortho_masked.tif already exists'), { status: 409, conflictPath: 'ortho/ortho_masked.tif' }))
            .mockResolvedValue({ taskId: 't2', state: 'Succeeded' });
        await maskWith({ submit });
        expect(dialogs.open).toHaveBeenCalledTimes(2);
        expect(submit).toHaveBeenCalledTimes(2);
        expect(submit.mock.calls[1][2].params.overwrite).toBe(true);
        expect(listing.addEntry).toHaveBeenCalledWith('ortho/ortho_masked.tif');
    });
});
