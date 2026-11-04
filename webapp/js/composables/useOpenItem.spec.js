/**
 * useOpenItem: after a build job ends, the viewer opens only when the entry lists what the viewer
 * needs; a job that succeeded can leave the build on hold, and the dialog then says so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ddb from 'ddb';

const checker = vi.hoisted(() => ({ check: vi.fn() }));
const notify = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn() }));
vi.mock('@/libs/build/fileAvailabilityChecker', () => ({ default: checker }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/features/dataset/dialogs/FileAvailabilityDialog.vue', () => ({ default: {} }));

const { useOpenItem } = await import('./useOpenItem');

const entry = { path: 'ortho.tif', hash: 'h', type: ddb.entry.type.GEORASTER };
const node = { path: 'ddb://x/o/d/ortho.tif', entry };
const ready = { available: true, status: 'ready' };
const onHold = { available: false, status: 'blocked', title: 'Processing On Hold', message: 'Missing: ortho.tfw', actions: ['cancel', 'retry-build'], buildState: null };

function setup() {
    const dialogs = { open: vi.fn(() => ({ close: vi.fn() })) };
    const actions = { showError: vi.fn() };
    const { openItem } = useOpenItem({
        dataset: { name: 'ds' }, route: { org: 'o', ds: 'd' }, canWrite: { value: true }, dialogs, actions,
        showInLightbox: () => true, openPlantHealth: vi.fn()
    });
    return { openItem, dialogs, actions };
}

/** Opens the explanation dialog for an unbuilt file and returns the props the dialog got. */
async function openUnavailable(ctx) {
    checker.check.mockResolvedValueOnce({ available: false, status: 'queued', title: 't', message: 'm', actions: ['start-build'], buildState: null });
    await ctx.openItem(node, 'map');
    return ctx.dialogs.open.mock.calls.at(-1)[1];
}

beforeEach(() => {
    checker.check.mockReset();
    notify.success.mockReset();
    vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('when the build job ends', () => {
    it('opens the viewer once the entry lists the build', async () => {
        const ctx = setup();
        const props = await openUnavailable(ctx);
        checker.check.mockResolvedValueOnce(ready);
        await props.onBuildCompleted(entry);
        expect(checker.check).toHaveBeenLastCalledWith({ name: 'ds' }, entry, 'map');
        expect(window.open).toHaveBeenCalledTimes(1);
        expect(window.open.mock.calls[0][0]).toMatch(/^\/r\/o\/d\/view\/.+\/map$/);
        expect(notify.success).toHaveBeenCalled();
    });

    it('explains what is missing instead of opening a viewer on a build the job did not produce', async () => {
        const ctx = setup();
        const props = await openUnavailable(ctx);
        checker.check.mockResolvedValueOnce(onHold);
        await props.onBuildCompleted(entry);
        expect(window.open).not.toHaveBeenCalled();
        expect(notify.success).not.toHaveBeenCalled();
        expect(ctx.dialogs.open).toHaveBeenCalledTimes(2);
        expect(ctx.dialogs.open.mock.calls[1][1]).toMatchObject({ title: 'Processing On Hold', status: 'blocked' });
    });

    it('shows an error when the entry cannot be checked', async () => {
        const ctx = setup();
        const props = await openUnavailable(ctx);
        checker.check.mockRejectedValueOnce(new Error('offline'));
        await props.onBuildCompleted(entry);
        expect(ctx.actions.showError).toHaveBeenCalledWith('offline', 'Error');
    });
});
