/**
 * The dialog about a file that cannot open: for a file the server cannot read (a DWG without its converter) it
 * says so in words for the user, offers no processing, and keeps the setup hint for the administrator behind Show Details.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

vi.mock('@/libs/build/buildManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));

const { default: FileAvailabilityDialog } = await import('./FileAvailabilityDialog.vue');

const WindowStub = { template: '<div><slot /></div>' };
let wrapper;
const render = (props = {}) => {
    wrapper = mount(FileAvailabilityDialog, {
        props: {
            show: true, title: 'DWG Not Supported', status: 'unsupported', actions: ['close', 'details'], dataset: {}, entry: { path: 'plan.dwg' },
            message: 'DWG drawings cannot be read on this server; export the drawing as DXF and upload that.',
            hint: 'The server needs the dwg2dxf converter (LibreDWG): install dwg2dxf next to ddb, or set DDB_DWG2DXF_PATH.',
            ...props
        },
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    return flushPromises();
};
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('FileAvailabilityDialog of a file the server cannot read', () => {
    it('says it for the user and offers no processing', async () => {
        await render();
        expect(wrapper.text()).toContain('DWG drawings cannot be read on this server; export the drawing as DXF and upload that.');
        const labels = wrapper.findAll('button').map(b => b.text());
        expect(labels).toEqual(['Close', 'Show Details']);
        expect(wrapper.text()).not.toContain('Retry Processing');
    });

    it('keeps the hint for the administrator until the details are asked for', async () => {
        await render();
        expect(wrapper.find('.admin-hint').exists()).toBe(false);
        await wrapper.findAll('button').find(b => b.text() === 'Show Details').trigger('click');
        expect(wrapper.find('.admin-hint').text()).toBe(
            'For the administrator: The server needs the dwg2dxf converter (LibreDWG): install dwg2dxf next to ddb, or set DDB_DWG2DXF_PATH.');
    });
});

describe('FileAvailabilityDialog of a model whose 3D Tiles could not be generated', () => {
    const alternative = { label: 'Open in the model viewer', icon: 'fa-solid fa-cube', view: 'model', to: '/r/o/d/view/aG91c2Uub2Jq/model' };
    const notGenerated = {
        title: '3D Tiles not available', status: 'not-generated', actions: ['close'], hint: '', entry: { path: 'house.obj' },
        message: "The 3D Tiles of 'house.obj' could not be generated: Index was out of range."
    };

    it('is a warning (yellow with dark text), as a file on hold is', async () => {
        await render(notGenerated);
        expect(wrapper.find('.p-message').classes()).toContain('p-message-warn');
    });

    it('offers the model viewer next to Close, and asks for it when it is chosen', async () => {
        await render({ ...notGenerated, alternative });
        const labels = wrapper.findAll('button').map(b => b.text());
        expect(labels).toEqual(['Close', 'Open in the model viewer']);
        expect(wrapper.text()).not.toContain('Retry Processing');
        await wrapper.findAll('button').find(b => b.text() === 'Open in the model viewer').trigger('click');
        expect(wrapper.emitted('open-alternative')).toEqual([[alternative]]);
    });
});
