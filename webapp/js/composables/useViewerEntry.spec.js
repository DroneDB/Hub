import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import ddb from 'ddb';
import { ApiError, loadErrorKind, LoadErrorKind } from '@/libs/ddb/apiError';
import { b64encode } from '@/libs/base64';

const route = { params: {} };
const dataset = { listOne: vi.fn(), info: vi.fn(), remoteUri: vi.fn(path => `ddb://o/d/${path}`) };
const setSelectedFiles = vi.fn();
const setTitle = vi.fn();
const organization = vi.fn(() => ({ Dataset: () => dataset }));

vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { Organization: (...args) => organization(...args) } }));
vi.mock('@/libs/utils', () => ({ setTitle: (...args) => setTitle(...args) }));
vi.mock('@/stores/datasetSession', () => ({ useDatasetSessionStore: () => ({ setSelectedFiles }) }));

const { useViewerEntry } = await import('./useViewerEntry');

const entryOf = path => ({ path, type: ddb.entry.type.GEORASTER, hash: `h-${path}` });
const rootWith = permissions => [{ path: '', properties: { permissions } }];

beforeEach(() => {
    vi.clearAllMocks();
    route.params = { org: 'o', ds: 'd', encodedPath: b64encode('f/a.tif') };
    dataset.listOne.mockImplementation(async path => entryOf(path));
    dataset.info.mockResolvedValue(rootWith({ canRead: true, canWrite: true, canDelete: false }));
});

describe('useViewerEntry from the route', () => {
    it('loads the file the route names, with the permissions, the selection and the title', async () => {
        const v = useViewerEntry({ title: 'Map' });
        expect(await v.entryLoaded).toBe(true);
        expect(dataset.listOne).toHaveBeenCalledWith('f/a.tif');
        expect(v.entry.value).toEqual(entryOf('f/a.tif'));
        expect(v.ddbURI.value).toBe('ddb://o/d/f/a.tif');
        expect([v.canRead.value, v.canWrite.value, v.canDelete.value]).toEqual([true, true, false]);
        expect(setSelectedFiles).toHaveBeenCalledWith([{ path: 'ddb://o/d/f/a.tif' }]);
        expect(setTitle).toHaveBeenCalledWith('a.tif - Map');
        expect(v.loading.value).toBe(false);
    });

    it('reports a route without a file as a link that is not valid', async () => {
        route.params = { org: 'o', ds: 'd' };
        const v = useViewerEntry({ title: 'Map' });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('This link is not valid: the file path in the address cannot be read.');
        expect(loadErrorKind(v.loadError.value)).toBe(LoadErrorKind.INVALID_LINK);
    });

    it('reports a file path that cannot be decoded as a link that is not valid, without a request (FR-VWR-23)', async () => {
        route.params = { org: 'o', ds: 'd', encodedPath: '%%%garbage' };
        const v = useViewerEntry({ title: 'Map' });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('This link is not valid: the file path in the address cannot be read.');
        expect(loadErrorKind(v.loadError.value)).toBe(LoadErrorKind.INVALID_LINK);
        expect(dataset.listOne).not.toHaveBeenCalled();
    });

    it('reports a file that is not in the dataset as an error, of the not found state', async () => {
        dataset.listOne.mockRejectedValue(new Error('Cannot find: f/a.tif.'));
        const v = useViewerEntry({ title: 'Map' });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('Cannot find: f/a.tif.');
        expect(loadErrorKind(v.loadError.value)).toBe(LoadErrorKind.NOT_FOUND);
        expect(v.entry.value).toBeNull();
    });

    it.each([[401, 'sign-in'], [403, 'no-access'], [404, 'not-found']])('keeps the error of a %i for its page state', async (status, kind) => {
        dataset.listOne.mockRejectedValue(new ApiError('refused', status));
        const v = useViewerEntry({ title: 'Map' });
        expect(await v.entryLoaded).toBe(false);
        expect(loadErrorKind(v.loadError.value)).toBe(kind);
    });

    it('has no load error for a file that loaded', async () => {
        const v = useViewerEntry({ title: 'Map' });
        expect(await v.entryLoaded).toBe(true);
        expect(v.loadError.value).toBeNull();
    });

    it('rejects a file of another type', async () => {
        const v = useViewerEntry({ types: [ddb.entry.type.MODEL], typeLabel: 'a 3D model', title: 'Model' });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('f/a.tif cannot be opened as a 3D model');
    });
});

describe('useViewerEntry with a path of its own', () => {
    it.each([
        ['a string', () => 'x/b.tif'],
        ['a getter', () => () => 'x/b.tif'],
        ['an async getter', () => async () => 'x/b.tif'],
        ['a ref', () => ref('x/b.tif')],
        ['a promise', () => Promise.resolve('x/b.tif')]
    ])('loads the file of %s, not the one of the route', async (_, make) => {
        const v = useViewerEntry({ path: make(), title: 'Map' });
        expect(await v.entryLoaded).toBe(true);
        expect(dataset.listOne).toHaveBeenCalledWith('x/b.tif');
        expect(v.entry.value.path).toBe('x/b.tif');
    });

    it('works on a route that names no file', async () => {
        route.params = { org: 'o', ds: 'd', uid: 'v_1' };
        const v = useViewerEntry({ path: () => 'x/b.tif', title: 'Map' });
        expect(await v.entryLoaded).toBe(true);
        expect(v.error.value).toBe('');
    });

    it('makes no request and sets no error when the path turns out to be empty', async () => {
        const v = useViewerEntry({ path: () => Promise.resolve(null), title: null });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('');
        expect(v.loading.value).toBe(false);
        expect(organization).not.toHaveBeenCalled();
        expect(dataset.listOne).not.toHaveBeenCalled();
        expect(dataset.info).not.toHaveBeenCalled();
    });

    it('reports a path that fails to resolve as the error', async () => {
        const v = useViewerEntry({ path: () => Promise.reject(new Error('no list')), title: null });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('no list');
    });
});

describe('useViewerEntry allowMissing', () => {
    it('loads a missing file as no entry, with the permissions and without a selection or title', async () => {
        dataset.listOne.mockRejectedValue(new Error('Cannot find: f/a.tif.'));
        const v = useViewerEntry({ allowMissing: true, title: 'Map' });
        expect(await v.entryLoaded).toBe(true);
        expect(v.error.value).toBe('');
        expect(v.entry.value).toBeNull();
        expect(v.dataset.value).toBe(dataset);
        expect(v.canWrite.value).toBe(true);
        expect(setSelectedFiles).not.toHaveBeenCalled();
        expect(setTitle).not.toHaveBeenCalled();
    });

    it('treats a 404 as missing too', async () => {
        dataset.listOne.mockRejectedValue(new ApiError('nf', 404));
        const v = useViewerEntry({ allowMissing: true, title: 'Map' });
        expect(await v.entryLoaded).toBe(true);
        expect(v.entry.value).toBeNull();
    });

    it('still reports a failure that does not say the file is missing', async () => {
        dataset.listOne.mockRejectedValue(new ApiError('Network error', 0));
        const v = useViewerEntry({ allowMissing: true, title: 'Map' });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('Network error');
    });

    it('does not apply to a viewer that does not ask for it', async () => {
        dataset.listOne.mockRejectedValue(new ApiError('nf', 404));
        const v = useViewerEntry({ title: 'Map' });
        expect(await v.entryLoaded).toBe(false);
        expect(v.error.value).toBe('nf');
    });
});

describe('useViewerEntry title', () => {
    it('leaves the page title alone with title null', async () => {
        const v = useViewerEntry({ title: null });
        expect(await v.entryLoaded).toBe(true);
        expect(v.entry.value.path).toBe('f/a.tif');
        expect(setTitle).not.toHaveBeenCalled();
    });
});
