import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const source = vi.hoisted(() => ({ entry: null, error: '' }));
vi.mock('@/composables/useViewerEntry', async () => {
    const { ref, shallowRef } = await import('vue');
    return {
        useViewerEntry: () => ({
            entry: shallowRef(source.entry),
            dataset: shallowRef({ name: 'dataset' }),
            loading: ref(!source.entry && !source.error),
            error: ref(source.error),
            entryLoaded: Promise.resolve(!!source.entry)
        })
    };
});
// The viewers are tested on their own: here they only say which one was opened
vi.mock('./Bm3dViewer.vue', () => ({ __esModule: true, default: { name: 'Bm3dViewer', props: ['entry', 'dataset'], template: '<div class="bm3d" />' } }));
vi.mock('./LegacyNexusViewer.vue', () => ({ __esModule: true, default: { name: 'LegacyNexusViewer', props: ['entry', 'dataset'], template: '<div class="legacy" />' } }));

const { default: ModelViewer } = await import('./ModelViewer.vue');

const BM3D = { role: 'model.bm3d', url: '/orgs/o/ds/d/build/h/bm3d/model.bm3d' };
const NXZ = { role: 'model.nexus', url: '/orgs/o/ds/d/build/h/nxs/model.nxz' };
const entry = artifacts => ({ path: 'house.obj', hash: 'h', type: 2, artifacts });

const ViewerShell = { props: ['error', 'loading'], template: '<div class="shell">{{ error }}<slot /></div>' };
let wrapper;
async function open(e, error = '') {
    source.entry = e;
    source.error = error;
    wrapper = mount(ModelViewer, { global: { stubs: { ViewerShell } } });
    await flushPromises();
    return wrapper;
}
beforeEach(() => { source.entry = null; source.error = ''; });
afterEach(() => wrapper?.unmount());

describe('ModelViewer: the viewer follows the format the build made', () => {
    it('opens the bm3d viewer for an entry that lists the bm3d model', async () => {
        await open(entry([BM3D]));
        expect(wrapper.find('.bm3d').exists()).toBe(true);
        expect(wrapper.find('.legacy').exists()).toBe(false);
    });

    it('opens the Nexus viewer for an entry that lists only the Nexus model', async () => {
        await open(entry([NXZ]));
        expect(wrapper.find('.legacy').exists()).toBe(true);
        expect(wrapper.find('.bm3d').exists()).toBe(false);
    });

    it('hands the entry and the dataset to the viewer', async () => {
        const e = entry([BM3D]);
        await open(e);
        const viewer = wrapper.findComponent({ name: 'Bm3dViewer' });
        expect(viewer.props('entry')).toStrictEqual(e);
        expect(viewer.props('dataset')).toEqual({ name: 'dataset' });
    });

    it('opens the bm3d viewer, which reports the missing model, for an entry without one', async () => {
        await open(entry(undefined));
        expect(wrapper.find('.bm3d').exists()).toBe(true);
    });

    it('opens no viewer while the entry loads, and shows the error of an entry that does not load', async () => {
        await open(null, 'house.obj cannot be opened as a 3D model');
        expect(wrapper.find('.bm3d').exists()).toBe(false);
        expect(wrapper.find('.legacy').exists()).toBe(false);
        expect(wrapper.find('.shell').text()).toContain('cannot be opened as a 3D model');
    });
});
