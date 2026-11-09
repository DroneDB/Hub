/**
 * DatasetUpload.vue mounted for real: the queue must exist before the component's
 * watchers first read it, and the dialog must follow the queue from the file list to the
 * summary. The request layer is replaced by a fake that answers each job at once.
 *
 * Names that exist (FR-UPL-03, AC-023): the destination is listed before a byte is sent, and the
 * files whose names exist go to one prompt (Replace / Keep both / Skip, Apply to all); a 409 with
 * conflictPath brings the file back to it once. Errors (FR-UPL-07): Retry only for what can succeed,
 * Transferred counts the files that are done.
 *
 * FR-UPL-04: the queue is the app-wide store's, so closing the dialog does not stop it ("Continue in background"),
 * Pause and Resume act on it, Cancel stops it and removes the server's chunks, and after a reload the dialog offers the
 * open chunked uploads: a file selected again with the same name, size and last-modified time resumes one at its path,
 * before the question about names that exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';

const sent = [];
const server = vi.hoisted(() => ({
    answer: null, listing: {}, listed: [], open: [], deleted: [], hold: false, held: [], toasts: [],
    // The signed-in user, the client's 'logout' listeners, and a listing held until the test releases it
    user: 'alice', listeners: {}, listHeld: null
}));
vi.mock('@/libs/notify', () => ({
    notify: Object.fromEntries(['success', 'info', 'warn', 'error'].map(kind => [kind, (...args) => server.toasts.push([kind, ...args])]))
}));
vi.mock('@/libs/upload/uploadRequests', () => ({
    createUploadRequests: () => ({
        send: async (job, hooks) => {
            sent.push(...job.items.map(i => ({ path: i.path, overwrite: i.overwrite, ...(i.fileId ? { fileId: i.fileId } : {}) })));
            // A held request ends when the test says, or when it is aborted (pause, cancel)
            if (server.hold) {
                await new Promise((resolve, reject) => {
                    server.held.push(resolve);
                    hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('Upload aborted'), { name: 'AbortError' })));
                });
            }
            hooks.onUploaded(job.items.map(i => i.id));
            return job.items.map(i => server.answer?.(i) ?? { id: i.id, ok: true, entry: { path: i.path } });
        }
    })
}));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        url: 'http://hub.test', getAuthToken: () => (server.user ? `token-of-${server.user}` : null), invalidateCache: vi.fn(),
        isLoggedIn: () => server.user !== null, getUsername: () => server.user, reportUnauthorized: () => {},
        addEventListener: (event, cb) => { (server.listeners[event] ??= new Set()).add(cb); },
        removeEventListener: (event, cb) => { server.listeners[event]?.delete(cb); },
        Organization: org => ({
            Dataset: ds => ({
                baseApi: `/orgs/${org}/ds/${ds}`,
                listChunkUploads: async () => server.open,
                deleteChunkUpload: async fileId => { server.deleted.push(fileId); },
                list: async folder => {
                    server.listed.push(folder ?? '');
                    if (server.listHeld) await server.listHeld.promise;
                    return (server.listing[folder ?? ''] ?? []).map(name => ({ path: folder ? `${folder}/${name}` : name }));
                }
            })
        })
    }
}));

const { default: DatasetUpload } = await import('./DatasetUpload.vue');

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 0));
        await nextTick();
    }
};

describe('DatasetUpload', () => {
    let wrapper, errors, uploaded, pinia;

    beforeEach(() => {
        sent.length = 0;
        server.answer = null;
        server.listing = {};
        server.listed = [];
        server.open = [];
        server.deleted = [];
        server.hold = false;
        server.held = [];
        server.toasts = [];
        server.user = 'alice';
        server.listeners = {};
        server.listHeld = null;
        errors = [];
        uploaded = [];
    });

    afterEach(() => wrapper?.unmount());

    function mountUpload(props) {
        wrapper = mount(DatasetUpload, {
            props: { organization: 'org', dataset: 'ds', path: '', ...props, onUpload: entry => uploaded.push(entry.path) },
            attachTo: document.body,
            global: {
                plugins: [PrimeVue, pinia = createPinia()],
                config: { errorHandler: err => errors.push(err) },
                mocks: { $router: { push: () => {} } },
                stubs: { RouterLink: true, Window: { template: '<div class="window-stub"><slot /><slot name="footer" /></div>' } }
            }
        });
    }

    const prompt = () => wrapper.find('#upload-dialog .window-stub');
    const click = async selector => {
        await prompt().find(selector).trigger('click');
        await flush();
    };

    it('mounts without errors and shows the file picker when no files are given', async () => {
        mountUpload({ filesToUpload: [] });
        await flush();

        expect(errors).toEqual([]);
        expect(wrapper.text()).toContain('Select Files');
    });

    it('uploads the given files and shows the summary', async () => {
        const files = [new File(['a'], 'a.txt'), new File(['bb'], 'b.txt')];
        mountUpload({ filesToUpload: files });
        await flush();

        expect(errors).toEqual([]);
        expect(sent.map(s => s.path)).toEqual(['a.txt', 'b.txt']);
        expect(uploaded).toEqual(['a.txt', 'b.txt']);
        expect(wrapper.find('.upload-summary').exists()).toBe(true);
        expect(wrapper.text()).toContain('All 2 files uploaded successfully');
        expect(prompt().exists()).toBe(false);
    });

    describe('a name that exists', () => {
        it('asks before a byte is sent, and Skip drops the file', async () => {
            server.listing[''] = ['NOTE.txt'];
            mountUpload({ filesToUpload: [new File(['a'], 'note.txt'), new File(['b'], 'b.txt')] });
            await flush();

            expect(prompt().exists()).toBe(true);
            expect(prompt().text()).toContain('note.txt');
            expect(sent).toEqual([]);

            await click('.conflict-skip');

            expect(prompt().exists()).toBe(false);
            expect(sent.map(s => s.path)).toEqual(['b.txt']);
        });

        it('Keep both uploads the file under the lowest free name', async () => {
            server.listing.docs = ['note.txt'];
            mountUpload({ path: 'docs', filesToUpload: [new File(['a'], 'note.txt')] });
            await flush();

            await click('.conflict-keep');

            expect(sent).toEqual([{ path: 'docs/note (2).txt', overwrite: false }]);
        });

        it('Replace sends the file with overwrite', async () => {
            server.listing[''] = ['note.txt'];
            mountUpload({ filesToUpload: [new File(['a'], 'note.txt')] });
            await flush();

            await click('.conflict-replace');

            expect(sent).toEqual([{ path: 'note.txt', overwrite: true }]);
        });

        it('applies one choice to every conflict with Apply to all', async () => {
            server.listing[''] = ['a.txt', 'b.txt'];
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['c'], 'c.txt')] });
            await flush();

            expect(prompt().text()).toContain('Conflict 1 of 2');
            await prompt().find('#conflict-apply-all').setValue(true);
            await click('.conflict-keep');

            expect(sent.map(s => s.path)).toEqual(['a (2).txt', 'b (2).txt', 'c.txt']);
        });

        it('Cancel uploads nothing and goes back to the file selection', async () => {
            server.listing[''] = ['a.txt'];
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')] });
            await flush();

            await prompt().findAll('button').find(b => b.text() === 'Cancel').trigger('click');
            await flush();

            expect(sent).toEqual([]);
            expect(wrapper.text()).toContain('Select Files');
        });

        it('lists only folders that exist: a new folder is not listed', async () => {
            server.listing[''] = ['old'];
            mountUpload({ filesToUpload: [Object.assign(new File(['a'], 'a.txt'), { fullPath: 'new/a.txt' })] });
            await flush();

            expect(server.listed).toEqual(['']);
            expect(prompt().exists()).toBe(false);
            expect(sent.map(s => s.path)).toEqual(['new/a.txt']);
        });

        it('brings a file refused with 409 back to the prompt once (another upload took the name)', async () => {
            let refusals = 0;
            server.answer = item => (!item.overwrite && refusals++ < 2
                ? { id: item.id, ok: false, status: 409, noRetry: true, error: "A file or folder named 'race.txt' already exists in this folder", conflictPath: 'race.txt' }
                : null);
            mountUpload({ filesToUpload: [new File(['a'], 'race.txt')] });
            await flush();

            expect(prompt().exists()).toBe(true);
            await click('.conflict-replace');

            expect(sent).toEqual([{ path: 'race.txt', overwrite: false }, { path: 'race.txt', overwrite: true }]);
            expect(uploaded).toEqual(['race.txt']);
        });
        it('Keep both after a 409 picks a name that no file of the upload has', async () => {
            // a.txt is taken by another upload meanwhile; this upload's own "a (2).txt" is added
            server.answer = item => (item.path === 'a.txt'
                ? { id: item.id, ok: false, status: 409, noRetry: true, error: 'exists', conflictPath: 'a.txt' }
                : null);
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt'), new File(['b'], 'a (2).txt')] });
            await flush();

            await click('.conflict-keep');

            expect(sent.map(s => s.path)).toEqual(['a.txt', 'a (2).txt', 'a (3).txt']);
            expect(uploaded).toEqual(['a (2).txt', 'a (3).txt']);
        });
    });

    describe('errors', () => {
        it('an all-403 run hides Retry, says why, and shows Transferred 0 B', async () => {
            server.answer = item => ({ id: item.id, ok: false, status: 403, noRetry: true, error: 'You do not have write access to this dataset' });
            mountUpload({ filesToUpload: [new File(['aaaa'], 'a.txt'), new File(['bbbb'], 'b.txt')] });
            await flush();

            expect(wrapper.find('.upload-summary').exists()).toBe(true);
            expect(wrapper.findAll('button').some(b => b.text().startsWith('Retry Failed'))).toBe(false);
            expect(wrapper.find('.no-retry-reason').exists()).toBe(true);
            const transferred = wrapper.findAll('.summary-stat').find(s => s.text().startsWith('Transferred'));
            // 8 bytes were sent, none added
            expect(transferred.find('.stat-value').text()).toBe('0 B');
        });

        it('offers Retry for the failures that can succeed only', async () => {
            server.answer = item => (item.path === 'a.txt'
                ? { id: item.id, ok: false, status: 403, noRetry: true, error: 'Forbidden' }
                : { id: item.id, ok: false, status: 400, noRetry: false, error: 'Bad request' });
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')] });
            await flush();

            const retry = wrapper.findAll('button').find(b => b.text().startsWith('Retry Failed'));
            expect(retry?.text()).toBe('Retry Failed (1)');
            expect(wrapper.find('.no-retry-reason').exists()).toBe(false);
        });
    });

    describe('uploads that go on and resume (FR-UPL-04)', () => {
        const LAMB = { fileId: 'stored-id-0001', path: 'orto/Lamb (2).tif', totalFileSize: 4, totalChunks: 4, chunkSize: 1,
            sourceFileName: 'Lamb.tif', lastModified: 1731000000123, received: [0, 1], missing: [2, 3], complete: false };
        const lambFile = () => new File(['abcd'], 'Lamb.tif', { lastModified: 1731000000123 });
        const button = label => wrapper.findAll('button').find(b => b.text().includes(label));
        const store = async () => (await import('@/stores/uploads')).useUploadsStore(pinia);

        it('offers the open uploads of the dataset on the file selection screen', async () => {
            server.open = [LAMB];
            mountUpload({ filesToUpload: [] });
            await flush();

            const offer = wrapper.find('.open-uploads');
            expect(offer.exists()).toBe(true);
            expect(offer.text()).toContain('Interrupted uploads');
            expect(offer.text()).toContain('Lamb.tif');
            expect(offer.text()).toContain('50% stored');
        });

        it('Discard removes the chunks of an open upload that the user will not resume', async () => {
            server.open = [LAMB];
            mountUpload({ filesToUpload: [] });
            await flush();

            await wrapper.find('.open-upload button[aria-label^="Discard"]').trigger('click');
            await flush();

            expect(server.deleted).toEqual(['stored-id-0001']);
            expect(wrapper.find('.open-uploads').exists()).toBe(false);
        });

        it('a file selected again resumes its open upload at the stored path, before the question about names', async () => {
            server.open = [LAMB];
            // The name of the selected file is taken at the folder it is selected for: it is not a clash for the resume
            server.listing[''] = ['Lamb.tif'];
            mountUpload({ filesToUpload: [lambFile(), new File(['x'], 'other.txt')] });
            await flush();

            expect(prompt().exists()).toBe(false);
            expect(sent).toEqual([
                { path: 'orto/Lamb (2).tif', overwrite: false, fileId: 'stored-id-0001' },
                { path: 'other.txt', overwrite: false }
            ]);
        });

        it('a file with another size or last-modified time does not resume it', async () => {
            server.open = [LAMB];
            mountUpload({ filesToUpload: [new File(['abcd'], 'Lamb.tif', { lastModified: 1731000000124 })] });
            await flush();

            expect(sent).toEqual([{ path: 'Lamb.tif', overwrite: false }]);
        });

        it('"Continue in background" closes the dialog and the upload goes on: it is not cancelled', async () => {
            server.hold = true;
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt')] });
            await flush();
            expect(button('Cancel Upload')).toBeTruthy();

            await button('Continue in background').trigger('click');
            expect(wrapper.emitted('close')).toHaveLength(1);
            wrapper.unmount();
            wrapper = null;
            await flush();

            const uploads = await store();
            expect(uploads.active).toBe(true);
            expect(uploads.filesLeft).toBe(1);
            // The request in flight was not aborted: it ends when the server answers
            server.held.forEach(release => release());
            await flush();
            expect(uploads.active).toBe(false);
            expect(uploads.uploads).toEqual([]);
            // Nobody shows it: the toast says what was added, and where
            expect(server.toasts).toEqual([['success', 'Uploaded 1 file to org/ds', { summary: 'Upload Complete' }]]);
        });

        it('Pause stops the upload and Resume sends it again', async () => {
            server.hold = true;
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt')] });
            await flush();

            await button('Pause').trigger('click');
            await flush();

            expect(wrapper.text()).toContain('Paused');
            expect(button('Resume')).toBeTruthy();
            expect((await store()).paused).toBe(true);
            const requests = sent.length;

            server.hold = false;
            await button('Resume').trigger('click');
            await flush();

            expect(sent.length).toBe(requests + 1);
            expect(wrapper.text()).toContain('All 1 files uploaded successfully');
        });

        it('Cancel removes the chunks of the files not committed and closes; the dialog does not cancel on unmount', async () => {
            server.open = [LAMB];
            server.hold = true;
            mountUpload({ filesToUpload: [lambFile()] });
            await flush();

            await button('Cancel Upload').trigger('click');
            await flush();

            expect(server.deleted).toEqual(['stored-id-0001']);
            expect(wrapper.emitted('close')).toHaveLength(1);
            expect((await store()).active).toBe(false);
        });
    });

    describe('the session ends while the dialog checks the names (a 401 signs out)', () => {
        const signOut = () => {
            server.user = null;
            for (const cb of [...(server.listeners.logout ?? [])]) cb();
        };
        const holdListing = () => {
            let release;
            const promise = new Promise(r => { release = r; });
            server.listHeld = { promise, release };
            return release;
        };
        const store = async () => (await import('@/stores/uploads')).useUploadsStore(pinia);

        it('during the listing: no queue, no request, no toast', async () => {
            const release = holdListing();
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt')] });
            await flush();
            expect(wrapper.text()).toContain('Looking for files with the same names');
            const add = vi.spyOn(await store(), 'add');

            signOut();
            release();
            await flush();

            expect(sent).toEqual([]);
            // The dialog stops by itself; the store would refuse it too
            expect(add).not.toHaveBeenCalled();
            expect((await store()).uploads).toEqual([]);
            expect(server.toasts).toEqual([]);
            expect(errors).toEqual([]);
        });

        it('while the conflict prompt is open: answering it queues nothing', async () => {
            server.listing[''] = ['note.txt'];
            mountUpload({ filesToUpload: [new File(['a'], 'note.txt'), new File(['b'], 'b.txt')] });
            await flush();
            expect(prompt().exists()).toBe(true);
            const add = vi.spyOn(await store(), 'add');

            signOut();
            await click('.conflict-replace');

            expect(sent).toEqual([]);
            // The dialog stops by itself; the store would refuse it too
            expect(add).not.toHaveBeenCalled();
            expect((await store()).uploads).toEqual([]);
            expect(server.toasts).toEqual([]);
        });

        it('another user signs in before the listing ends: the first user\'s files are not queued in their session', async () => {
            const release = holdListing();
            mountUpload({ filesToUpload: [new File(['a'], 'a.txt')] });
            await flush();
            const add = vi.spyOn(await store(), 'add');

            signOut();
            server.user = 'bob';
            release();
            await flush();

            expect(sent).toEqual([]);
            // The dialog stops by itself; the store would refuse it too
            expect(add).not.toHaveBeenCalled();
            expect((await store()).uploads).toEqual([]);
            expect(server.toasts).toEqual([]);
        });
    });
});
