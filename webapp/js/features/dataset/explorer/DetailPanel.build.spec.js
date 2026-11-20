/**
 * The details panel and the Build button: a buildable file gets it, except while a build of it runs or while it waits
 * for files the dataset lacks. The build of a file that waits starts by itself when the files are added, and one
 * started before then builds nothing (the server defers it again and adds a task for it), so the panel says what to
 * upload and offers no build.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

const buildManager = vi.hoisted(() => ({ getBuildState: vi.fn(() => null), hasActiveBuild: vi.fn(() => false), on: vi.fn(), off: vi.fn() }));
vi.mock('@/libs/build/buildManager', () => ({ default: buildManager, BUILD_STATES: {} }));

const DetailPanel = (await import('./DetailPanel.vue')).default;

const dataset = { org: 'org', ds: 'ds' };
const model = build => ({
    path: 'ddb://h/org/ds/site/model.obj',
    entry: { path: 'site/model.obj', type: ddb.entry.type.MODEL, size: 1, mtime: 1, hash: 'h', meta: {}, properties: {}, ...build }
});
const WAITING = { buildStatus: 'pending', buildMissingDependencies: ['site/model.jpg'], buildAwaitingFiles: true };

async function panel(file) {
    const w = mount(DetailPanel, { props: { dataset, file }, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return w;
}
const hasButton = (w, label) => w.findAll('button').some(b => b.text() === label);

describe('the Build button of the details panel', () => {
    beforeEach(() => {
        buildManager.hasActiveBuild.mockReturnValue(false);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('is offered for a buildable file that was never built, that is built, or whose build failed', async () => {
        for (const build of [{}, { artifacts: [{ role: 'model.bm3d', url: '/orgs/org/ds/ds/build/h/bm3d/model.bm3d' }] }, { buildStatus: 'failed' }]) {
            expect(hasButton(await panel(model(build)), 'Build')).toBe(true);
        }
    });

    it('is not offered while the file waits for files: the panel says which to upload', async () => {
        const w = await panel(model(WAITING));

        expect(hasButton(w, 'Build')).toBe(false);
        expect(w.find('.build-explanation-section').text())
            .toBe('Waiting for files: site/model.jpg. Upload the missing file to this dataset and processing starts by itself.');
        // The other actions stay
        expect(hasButton(w, 'Share/Embed')).toBe(true);
    });

    it('is offered for a build on hold for another reason, which the server retries', async () => {
        const w = await panel(model({ buildStatus: 'pending', buildMissingDependencies: [], buildAwaitingFiles: false }));

        expect(hasButton(w, 'Build')).toBe(true);
        expect(w.find('.build-explanation-section').text()).toBe('Processing is on hold and will be retried automatically.');
    });

    it('comes back when the files arrive and the entry no longer waits', async () => {
        const w = await panel(model(WAITING));
        expect(hasButton(w, 'Build')).toBe(false);

        await w.setProps({ file: model({ buildStatus: 'queued' }) });
        await flushPromises();

        expect(hasButton(w, 'Build')).toBe(true);
    });

    it('is not offered while a build of the file runs', async () => {
        buildManager.hasActiveBuild.mockReturnValue(true);

        expect(hasButton(await panel(model({})), 'Build')).toBe(false);
    });

    it('is not offered for a file that is not buildable', async () => {
        const photo = { path: 'ddb://h/org/ds/a.jpg', entry: { path: 'a.jpg', type: ddb.entry.type.IMAGE, size: 1, mtime: 1, hash: 'h', meta: {}, properties: {} } };

        expect(hasButton(await panel(photo), 'Build')).toBe(false);
    });
});
