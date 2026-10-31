/**
 * Sending files to another dataset from the dataset page: a writer moves them (they leave the
 * list), a user who can only read the dataset copies them (they stay).
 */
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useDatasetActions } from './useDatasetActions';

const success = vi.fn();
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ success, info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// The page's other dialogs are not under test (the settings dialog imports an image of the build)
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const files = [{ entry: { path: 'a.jpg' } }, { entry: { path: 'b.jpg' } }];

function transferAs(canWrite) {
    const listing = { removed: vi.fn() };
    const dialogs = { open: vi.fn() };
    const actions = useDatasetActions({
        dataset: { org: 'org', ds: 'ds' }, listing, dialogs, busy: ref(false), canWrite: ref(canWrite),
        route: { org: 'org', ds: 'ds' }, openItem: vi.fn(), refresh: vi.fn()
    });
    actions.transfer(files);
    const props = dialogs.open.mock.calls[0][1];
    props.onClose('transferred', files);
    return { props, listing };
}

describe('the transfer of the dataset page', () => {
    it('moves the files of a writer: the dialog does not keep them and the list drops them', () => {
        success.mockClear();
        const { props, listing } = transferAs(true);
        expect(props.keepSource).toBe(false);
        expect(listing.removed).toHaveBeenCalledWith(['a.jpg', 'b.jpg']);
        expect(success).toHaveBeenCalledWith('2 items transferred successfully', { summary: 'Transfer Complete' });
    });

    it('copies the files of a user who can only read the dataset: they stay in the list', () => {
        success.mockClear();
        const { props, listing } = transferAs(false);
        expect(props.keepSource).toBe(true);
        expect(listing.removed).not.toHaveBeenCalled();
        expect(success).toHaveBeenCalledWith('2 items copied successfully', { summary: 'Copy Complete' });
    });
});
