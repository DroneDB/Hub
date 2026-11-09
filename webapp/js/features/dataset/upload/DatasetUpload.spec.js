/**
 * DatasetUpload.vue mounted for real: the queue must exist before the component's
 * watchers first read it, and the dialog must follow the queue from the file list to the
 * summary. The request layer is replaced by a fake that answers each job at once.
 *
 * Names that exist (FR-UPL-03, AC-023): the destination is listed before a byte is sent, and the
 * files whose names exist go to one prompt (Replace / Keep both / Skip, Apply to all); a 409 with
 * conflictPath brings the file back to it once. Errors (FR-UPL-07): Retry only for what can succeed,
 * Transferred counts the files that are done.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const sent = [];
const server = vi.hoisted(() => ({ answer: null, listing: {}, listed: [] }));
vi.mock('@/libs/upload/uploadRequests', () => ({
    createUploadRequests: () => ({
        send: async (job, hooks) => {
            sent.push(...job.items.map(i => ({ path: i.path, overwrite: i.overwrite })));
            hooks.onUploaded(job.items.map(i => i.id));
            return job.items.map(i => server.answer?.(i) ?? { id: i.id, ok: true, entry: { path: i.path } });
        }
    })
}));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        url: 'http://hub.test', getAuthToken: () => 'token', invalidateCache: vi.fn(),
        Organization: org => ({
            Dataset: ds => ({
                baseApi: `/orgs/${org}/ds/${ds}`,
                list: async folder => {
                    server.listed.push(folder ?? '');
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
    let wrapper, errors, uploaded;

    beforeEach(() => {
        sent.length = 0;
        server.answer = null;
        server.listing = {};
        server.listed = [];
        errors = [];
        uploaded = [];
    });

    afterEach(() => wrapper?.unmount());

    function mountUpload(props) {
        wrapper = mount(DatasetUpload, {
            props: { organization: 'org', dataset: 'ds', path: '', ...props, onUpload: entry => uploaded.push(entry.path) },
            attachTo: document.body,
            global: {
                plugins: [PrimeVue],
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
});
