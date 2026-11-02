import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import RasterLayerOpacityPanel from './RasterLayerOpacityPanel.vue';

const row = (path, extra = {}) => ({ path, name: path, opacity: 1, visible: true, plantHealthCapable: false, placeholder: null, ...extra });
const missing = path => row(path, { placeholder: { kind: 'missing', text: 'Missing: ' + path } });

let wrapper;
const render = props => {
    wrapper = mount(RasterLayerOpacityPanel, { props: { layers: [row('b.tif'), row('a.tif')], ...props } });
    return wrapper;
};
afterEach(() => wrapper?.unmount());

const eye = path => wrapper.find(`button[aria-label="Visibility of ${path}"]`);
const removes = () => wrapper.findAll('button[aria-label^="Remove"]');
const repicks = () => wrapper.findAll('button[aria-label="Pick another raster"]');
const addButton = () => wrapper.findAll('button').find(b => b.text() === 'Add layer');

describe('RasterLayerOpacityPanel visibility', () => {
    it('has an eye toggle for each drawn row, pressed while the layer shows', () => {
        render({ layers: [row('b.tif', { visible: false }), row('a.tif')] });
        expect(eye('a.tif').attributes('aria-pressed')).toBe('true');
        expect(eye('a.tif').find('i').classes()).toContain('fa-eye');
        expect(eye('b.tif').attributes('aria-pressed')).toBe('false');
        expect(eye('b.tif').find('i').classes()).toContain('fa-eye-slash');
    });

    it('emits the path of the row when the eye is clicked', async () => {
        render();
        await eye('a.tif').trigger('click');
        expect(wrapper.emitted('toggle-visible')).toEqual([['a.tif']]);
    });

    it('has no eye on a placeholder row', () => {
        render({ layers: [missing('gone.tif'), row('a.tif')] });
        expect(eye('gone.tif').exists()).toBe(false);
        expect(wrapper.findAll('button[aria-pressed]')).toHaveLength(1);
    });

    it('does not change the slider of a hidden row', () => {
        render({ layers: [row('b.tif', { visible: false, opacity: 0.4 }), row('a.tif')] });
        expect(wrapper.find('input[aria-label="Opacity of b.tif"]').element.value).toBe('0.4');
        expect(wrapper.text()).toContain('40%');
    });
});

describe('RasterLayerOpacityPanel remove and repick', () => {
    it('has no remove control unless the panel or the row allows it', () => {
        render();
        expect(removes()).toHaveLength(0);
    });

    it('removes any row when removable, with the default label', async () => {
        render({ removable: true });
        expect(removes().map(b => b.attributes('aria-label'))).toEqual(['Remove layer: b.tif', 'Remove layer: a.tif']);
        expect(removes()[0].attributes('title')).toBe('Remove layer');
        await removes()[1].trigger('click');
        expect(wrapper.emitted('remove')).toEqual([['a.tif']]);
    });

    it('names the remove control from removeLabel', () => {
        render({ removable: true, removeLabel: 'Remove from comparison' });
        expect(removes()[0].attributes('title')).toBe('Remove from comparison');
        expect(removes()[0].attributes('aria-label')).toBe('Remove from comparison: b.tif');
    });

    it('lets a row decide for itself, placeholders too', () => {
        render({ layers: [{ ...missing('gone.tif'), removable: true }, row('a.tif', { removable: false }), row('m.tif')] });
        expect(removes().map(b => b.attributes('aria-label'))).toEqual(['Remove layer: gone.tif']);
    });

    it('lets a row be removable on a panel that is not', () => {
        render({ layers: [row('b.tif', { removable: true }), row('a.tif')] });
        expect(removes()).toHaveLength(1);
    });

    it('offers to pick another file for a missing row when removable, as before', async () => {
        render({ layers: [missing('gone.tif'), row('a.tif')], removable: true });
        expect(repicks()).toHaveLength(1);
        await repicks()[0].trigger('click');
        expect(wrapper.emitted('repick')).toEqual([['gone.tif']]);
    });

    it('offers it only where canRepick says so', () => {
        render({ layers: [missing('gone.tif'), row('a.tif')], removable: true, canRepick: false });
        expect(repicks()).toHaveLength(0);
        wrapper.unmount();
        render({ layers: [missing('gone.tif'), row('a.tif')], removable: false, canRepick: true });
        expect(repicks()).toHaveLength(1);
    });

    it('offers nothing to pick on a map where rows are removable one by one', () => {
        render({ layers: [{ ...missing('gone.tif'), removable: true }, row('a.tif')] });
        expect(repicks()).toHaveLength(0);
    });
});

describe('RasterLayerOpacityPanel removable paths', () => {
    it('removes only the rows of those paths, and picking another file stays off', async () => {
        render({ removablePaths: ['a.tif', 'gone.tif'], layers: [missing('gone.tif'), row('b.tif'), row('a.tif')] });
        expect(removes().map(b => b.attributes('aria-label'))).toEqual(['Remove layer: gone.tif', 'Remove layer: a.tif']);
        expect(repicks()).toHaveLength(0);
        await removes()[1].trigger('click');
        expect(wrapper.emitted('remove')).toEqual([['a.tif']]);
    });

    it('lets a flag on the row decide first', () => {
        render({ removablePaths: ['a.tif'], layers: [row('b.tif', { removable: true }), row('a.tif', { removable: false })] });
        expect(removes().map(b => b.attributes('aria-label'))).toEqual(['Remove layer: b.tif']);
    });
});

describe('RasterLayerOpacityPanel add layer', () => {
    it('is not shown unless asked for', () => {
        render();
        expect(addButton()).toBeUndefined();
    });

    it('emits add', async () => {
        render({ canAdd: true });
        expect(addButton().attributes('disabled')).toBeUndefined();
        expect(addButton().find('i').classes()).toContain('fa-plus');
        await addButton().trigger('click');
        expect(wrapper.emitted('add')).toHaveLength(1);
    });

    it('is disabled at the limit and the title says why', async () => {
        render({ canAdd: true, addDisabled: true, addTitle: 'At most 3 layers can be added' });
        expect(addButton().attributes('disabled')).toBeDefined();
        expect(addButton().attributes('title')).toBe('At most 3 layers can be added');
        await addButton().trigger('click');
        expect(wrapper.emitted('add')).toBeUndefined();
    });
});

describe('RasterLayerOpacityPanel', () => {
    it('keeps the visibility of the other rows when an opacity changes', async () => {
        render({ layers: [row('b.tif', { visible: false }), row('a.tif')] });
        await wrapper.find('input[aria-label="Opacity of a.tif"]').setValue('0.5');
        const [updated] = wrapper.emitted('update:layers')[0];
        expect(updated.map(l => [l.path, l.opacity, l.visible])).toEqual([['b.tif', 1, false], ['a.tif', 0.5, true]]);
    });
});
