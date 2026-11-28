/**
 * The cover field of a dataset: it shows the cover (or the placeholder), and Upload, Choose from dataset and Remove only
 * say what the user chose (`update:modelValue`), with the preview of it; Undo drops it. An image that cannot be a cover
 * is refused at the field. The search of the dataset looks for the types whose thumbnail is drawn from the file.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

vi.mock('@/libs/api/sharedRegistry', () => ({ default: { features: { value: () => undefined } } }));
const { default: DatasetCoverField } = await import('./DatasetCoverField.vue');

function makeDataset() {
    return {
        thumbUrl: vi.fn((path, size) => `/thumb?path=${path}&size=${size}`),
        search: vi.fn(async (_q, { type }) => (type === 4 ? [{ path: 'odm/ortho.tif' }] : type === 6 ? [{ path: 'cover.jpg' }] : []))
    };
}

let wrapper;
async function show(props = {}) {
    const dataset = makeDataset();
    wrapper = mount(DatasetCoverField, {
        props: { dataset, currentUrl: null, modelValue: null, ...props, 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    return dataset;
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

const button = label => wrapper.findAll('button').find(b => b.text() === label || b.attributes('aria-label') === label);
const preview = () => wrapper.find('img').attributes('src');
const lastChange = () => wrapper.emitted('update:modelValue').at(-1)[0];
async function chooseFile(file) {
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
}

describe('DatasetCoverField', () => {
    it('shows the cover the dataset has, with Remove', async () => {
        await show({ currentUrl: '/orgs/a/ds/b/thumb?size=256' });
        expect(preview()).toBe('/orgs/a/ds/b/thumb?size=256');
        expect(button('Remove')).toBeDefined();
        expect(button('Undo')).toBeUndefined();
    });

    it('shows the placeholder and no Remove when there is none, or when the cover does not load', async () => {
        await show();
        expect(preview()).toBe('/images/dataset-placeholder.svg');
        expect(button('Remove')).toBeUndefined();
        wrapper.unmount();

        await show({ currentUrl: '/gone' });
        await wrapper.find('img').trigger('error');
        expect(preview()).toBe('/images/dataset-placeholder.svg');
    });

    it('Upload says the image chosen and previews it; Undo drops it', async () => {
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:roof'), revokeObjectURL: vi.fn() }));
        await show({ currentUrl: '/cover' });
        const file = new File(['x'], 'roof.png', { type: 'image/png' });

        await chooseFile(file);

        expect(lastChange()).toEqual({ file });
        expect(preview()).toBe('blob:roof');
        expect(wrapper.text()).toContain('roof.png will be the thumbnail.');

        await button('Undo').trigger('click');
        expect(lastChange()).toBeNull();
        expect(preview()).toBe('/cover');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:roof');
    });

    it('refuses an image that cannot be a cover, at the field', async () => {
        await show();
        await chooseFile(new File(['x'], 'a.gif', { type: 'image/gif' }));
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.find('.field-error').text()).toBe('Choose a WebP, JPEG or PNG image');
    });

    it('Choose from dataset finds the images and rasters but not the cover files, and Use previews the thumbnail of the file', async () => {
        const dataset = await show();

        await button('Choose from dataset').trigger('click');
        await flushPromises();

        const types = dataset.search.mock.calls.map(c => c[1].type).sort((a, b) => a - b);
        expect(types).toEqual([3, 4, 6, 12, 13]);
        expect(button('Use cover.jpg')).toBeUndefined();
        await button('Use odm/ortho.tif').trigger('click');
        await flushPromises();

        expect(lastChange()).toEqual({ entryPath: 'odm/ortho.tif' });
        expect(preview()).toBe('/thumb?path=odm/ortho.tif&size=256');
        expect(wrapper.text()).toContain('odm/ortho.tif will be the thumbnail.');
        // The search closes once a file is chosen
        expect(button('Use odm/ortho.tif')).toBeUndefined();
    });

    it('Remove shows the placeholder; while busy the actions wait', async () => {
        await show({ currentUrl: '/cover' });
        await button('Remove').trigger('click');
        expect(lastChange()).toEqual({ remove: true });
        expect(preview()).toBe('/images/dataset-placeholder.svg');
        expect(wrapper.text()).toContain('The thumbnail will be removed.');

        await wrapper.setProps({ busy: true });
        expect(button('Upload').attributes('disabled')).toBeDefined();
        expect(button('Choose from dataset').attributes('disabled')).toBeDefined();
        expect(button('Undo')).toBeUndefined();
    });
});
