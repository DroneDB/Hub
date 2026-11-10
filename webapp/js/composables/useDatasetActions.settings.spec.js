/**
 * The Settings window of the dataset page and what it asks of the page (FR-EXP-36, FR-EXP-24, FR-EXP-30): a README that
 * the window creates opens in the text editor of the page, not in a new browser tab; the README of the dataset opens from
 * the window in its viewer or in the editor; a new URL slug takes the page to it; the cover is announced with its file name
 * and joins the list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';

const h_ = vi.hoisted(() => ({ candidates: ['thumbnail.webp', 'cover.jpg'], uploads: [] }));
const notify = { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { features: { value: () => h_.candidates, get: () => false }, isLoggedIn: () => true }
}));
vi.mock('@/stores/uploads', () => ({ useUploadsStore: () => ({ uploads: h_.uploads }) }));
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: { name: 'SettingsDialog' } }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const { useDatasetActions } = await import('./useDatasetActions');

const README = { path: 'README.md', type: 8, size: 1 };
let dialogs, listing, openItem, rootChanged, dataset, busy;

function setup(extra = {}) {
    const settingsDialog = { close: vi.fn() };
    dialogs = { open: vi.fn(component => (component.name === 'SettingsDialog' ? settingsDialog : Promise.resolve('confirm'))) };
    listing = { uploaded: vi.fn(), addEntry: vi.fn().mockResolvedValue(), removed: vi.fn(), files: ref([]), currentPath: ref('sub') };
    openItem = vi.fn();
    rootChanged = vi.fn();
    busy = ref(false);
    dataset = {
        org: 'acme', ds: 'site', remoteUri: p => `ddb://h/acme/site/${p}`, listOne: vi.fn().mockResolvedValue(README),
        list: vi.fn().mockResolvedValue([]), deleteObjs: vi.fn().mockResolvedValue({}), uploadObj: vi.fn().mockResolvedValue({}),
        thumbUrl: () => '/thumb', registry: { fetchRaw: vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x'], { type: 'image/webp' }) }) },
        ...extra
    };
    const actions = useDatasetActions({ dataset, listing, dialogs, busy, canWrite: ref(true), route: { org: 'acme', ds: 'site' }, openItem, refresh: vi.fn(), rootChanged });
    actions.settings();
    const props = dialogs.open.mock.calls[0][1];
    return { actions, settingsDialog, props: typeof props === 'function' ? props() : props };
}

/** The call that opened the text editor (a lazy component: told by its props) */
const editorCall = () => dialogs.open.mock.calls.find(call => call[1] && typeof call[1] === 'object' && call[1].entry && 'readonly' in call[1]);

beforeEach(() => { vi.clearAllMocks(); h_.uploads = []; });
afterEach(() => vi.unstubAllGlobals());

describe('Add Readme from the Settings window (FR-EXP-36)', () => {
    it('opens README.md in the text editor of the page, from a subfolder too, and never in a new tab', () => {
        const open = vi.fn();
        vi.stubGlobal('open', open);
        const { settingsDialog, props } = setup();

        props.onAddMarkdown('README.md', README);

        expect(listing.uploaded).toHaveBeenCalledWith([README]);
        expect(settingsDialog.close).toHaveBeenCalled();
        const editor = editorCall();
        expect(editor[1]).toMatchObject({ entry: README, readonly: false });
        expect(openItem).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
    });
});

describe('the README of the dataset from the Settings window (FR-EXP-24)', () => {
    it('Open shows the file in its viewer, as a double click does', async () => {
        const { settingsDialog, props } = setup();

        await props.onOpenReadme('README.md');

        expect(dataset.listOne).toHaveBeenCalledWith('README.md');
        expect(settingsDialog.close).toHaveBeenCalled();
        expect(openItem).toHaveBeenCalledWith({ label: 'README.md', entry: README, path: 'ddb://h/acme/site/README.md' });
    });

    it('Edit opens the text editor on the file', async () => {
        const { props } = setup();

        await props.onEditReadme('README.md');

        const editor = editorCall();
        expect(editor[1].entry).toBe(README);
        expect(openItem).not.toHaveBeenCalled();
    });

    it('says when the file cannot be found, and keeps the window', async () => {
        const { settingsDialog, props } = setup();
        dataset.listOne.mockRejectedValue(new Error('gone'));

        await props.onEditReadme('README.md');

        expect(settingsDialog.close).not.toHaveBeenCalled();
        expect(dialogs.open.mock.calls.at(-1)[1]).toMatchObject({ title: 'Readme', message: 'gone' });
    });

    it('a saved setting makes the page read the dataset again', () => {
        const { props } = setup();
        props.onChanged();
        expect(rootChanged).toHaveBeenCalledTimes(1);
    });

    it('a new slug takes the page to the new address', () => {
        const location = { href: '' };
        vi.stubGlobal('location', location);
        const { props } = setup();

        props.onSlugRenamed('new-site');

        expect(location.href).toBe('/r/acme/new-site');
        expect(busy.value).toBe(true);
    });
});

describe('a new URL slug while uploads of the dataset run (FR-EXP-24)', () => {
    const upload = (ds, left, org = 'acme') => ({ key: `${org}/${ds}`, org, ds, left });

    it('asks first, saying that the uploads stop, and goes on when the user agrees', async () => {
        h_.uploads = [upload('site', 2), upload('site', 1), upload('other', 5)];
        const { props } = setup();

        expect(await props.confirmSlugChange()).toBe(true);

        const question = dialogs.open.mock.calls.at(-1)[1];
        expect(question.title).toBe('Change URL');
        expect(question.message).toBe('<p>3 files of this dataset are still uploading.</p>'
            + '<p>Changing the URL stops the upload: the files that are not yet in the dataset will not be added.</p>');
        expect(question.confirmButtonClass).toBe('danger');
    });

    it('does not rename when the user declines', async () => {
        h_.uploads = [upload('site', 1)];
        const { props } = setup();
        dialogs.open.mockImplementation(() => Promise.resolve('cancel'));

        expect(await props.confirmSlugChange()).toBe(false);
    });

    it('does not ask when no upload of this dataset has files left', async () => {
        h_.uploads = [upload('site', 0), upload('other', 4), upload('site', 3, 'another-org')];
        const { props } = setup();
        dialogs.open.mockClear();

        expect(await props.confirmSlugChange()).toBe(true);
        expect(dialogs.open).not.toHaveBeenCalled();
    });
});

describe('Set as Dataset Thumbnail (FR-EXP-30)', () => {
    it('names the file in the toast, and the file joins the list', async () => {
        const { actions } = setup();

        await actions.setAsCover({ entry: { path: 'odm_orthophoto.tif' } });

        expect(dataset.uploadObj).toHaveBeenCalledWith('thumbnail.webp', expect.any(File), { overwrite: true });
        expect(listing.addEntry).toHaveBeenCalledWith('thumbnail.webp');
        expect(notify.success).toHaveBeenCalledWith('Saved as thumbnail.webp in the dataset root', { summary: 'Cover Set' });
        expect(rootChanged).toHaveBeenCalled();
    });

    it('a cover that is replaced leaves the list and the tree', async () => {
        const { actions } = setup();
        dataset.list.mockResolvedValue([{ path: 'thumbnail.webp' }, { path: 'other.jpg' }]);

        await actions.setAsCover({ entry: { path: 'odm_orthophoto.tif' } });

        expect(dataset.deleteObjs).toHaveBeenCalledWith(['thumbnail.webp']);
        expect(listing.removed).toHaveBeenCalledWith(['thumbnail.webp']);
    });
});
