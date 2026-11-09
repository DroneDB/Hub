import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
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

    it('removes any row when removable, named after the layer', async () => {
        render({ removable: true });
        expect(removes().map(b => b.attributes('aria-label'))).toEqual(['Remove layer: b.tif', 'Remove layer: a.tif']);
        expect(removes()[0].attributes('title')).toBe('Remove layer');
        await removes()[1].trigger('click');
        expect(wrapper.emitted('remove')).toEqual([['a.tif']]);
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

describe('RasterLayerOpacityPanel changed badge', () => {
    const badges = () => wrapper.findAll('.changed-badge');

    it('shows no badge unless the path is in changedPaths', () => {
        render();
        expect(badges()).toHaveLength(0);
        wrapper.unmount();
        render({ changedPaths: ['other.tif'] });
        expect(badges()).toHaveLength(0);
    });

    it('shows the badge, as text, on the rows of those paths only', () => {
        render({ changedPaths: ['a.tif'] });
        const rows = wrapper.findAll('.raster-opacity-row');
        expect(rows[0].find('.changed-badge').exists()).toBe(false);
        expect(rows[1].find('.changed-badge').text()).toBe('Changed since this view was saved');
    });

    it('follows changedPaths when it changes', async () => {
        render({ changedPaths: ['a.tif'] });
        await wrapper.setProps({ changedPaths: ['a.tif', 'b.tif'] });
        expect(badges()).toHaveLength(2);
        await wrapper.setProps({ changedPaths: [] });
        expect(badges()).toHaveLength(0);
    });
});

describe('RasterLayerOpacityPanel with one row', () => {
    const one = extra => render({ layers: [row('a.tif', extra)] });

    it('is shown, with its eye, slider and value', async () => {
        one({ opacity: 0.4 });
        expect(wrapper.find('.raster-opacity-panel').exists()).toBe(true);
        expect(wrapper.text()).toContain('40%');
        await eye('a.tif').trigger('click');
        expect(wrapper.emitted('toggle-visible')).toEqual([['a.tif']]);
        await wrapper.find('input[aria-label="Opacity of a.tif"]').setValue('0.5');
        expect(wrapper.emitted('update:layers')[0][0].map(l => [l.path, l.opacity])).toEqual([['a.tif', 0.5]]);
    });

    it('has no remove control, whatever the panel or the row allows', () => {
        render({ layers: [row('a.tif', { removable: true })], removable: true, removablePaths: ['a.tif'] });
        expect(removes()).toHaveLength(0);
    });

    it('has no arrows to reorder', () => {
        one();
        expect(wrapper.findAll('.order-btn')).toHaveLength(0);
        expect(wrapper.find('button[aria-label="Move layer up"]').exists()).toBe(false);
        expect(wrapper.find('button[aria-label="Move layer down"]').exists()).toBe(false);
    });

    it('keeps the plant health button, the badge and Add layer', async () => {
        render({ layers: [row('a.tif', { plantHealthCapable: true })], activePlantHealthPath: 'a.tif', canAdd: true, changedPaths: ['a.tif'] });
        const ph = wrapper.find('button[aria-label="Plant Health"]');
        expect(ph.classes()).toContain('active');
        await ph.trigger('click');
        expect(wrapper.emitted('plant-health')).toEqual([['a.tif']]);
        await addButton().trigger('click');
        expect(wrapper.emitted('add')).toHaveLength(1);
        expect(wrapper.find('.changed-badge').exists()).toBe(true);
    });

    it('shows the text of a missing row and offers to pick another file', async () => {
        render({ layers: [missing('gone.tif')], canRepick: true });
        expect(wrapper.find('.placeholder-text').text()).toBe('Missing: gone.tif');
        expect(eye('gone.tif').exists()).toBe(false);
        expect(removes()).toHaveLength(0);
        await repicks()[0].trigger('click');
        expect(wrapper.emitted('repick')).toEqual([['gone.tif']]);
    });

    it('is not shown for no rows', () => {
        render({ layers: [] });
        expect(wrapper.find('.raster-opacity-panel').exists()).toBe(false);
    });
});

describe('RasterLayerOpacityPanel with no rows', () => {
    it('shows Add layer alone when asked for (a view of a file that is not a georaster)', async () => {
        render({ layers: [], canAdd: true });
        expect(wrapper.find('.raster-opacity-panel').exists()).toBe(true);
        expect(wrapper.findAll('.raster-opacity-row')).toHaveLength(0);
        expect(wrapper.find('.layers-header').exists()).toBe(false);
        await addButton().trigger('click');
        expect(wrapper.emitted('add')).toHaveLength(1);
    });

    it('keeps Add layer disabled at the limit, with its reason', () => {
        render({ layers: [], canAdd: true, addDisabled: true, addTitle: 'A view shows at most 6 rasters' });
        expect(addButton().attributes('disabled')).toBeDefined();
        expect(addButton().attributes('title')).toBe('A view shows at most 6 rasters');
    });
});

describe('RasterLayerOpacityPanel fold', () => {
    const toggle = () => wrapper.find('.fold-toggle');
    const three = () => render({ layers: [row('c.tif'), row('b.tif', { opacity: 0.3 }), row('a.tif')], canAdd: true });

    it('opens unfolded, with a toggle that names the action', () => {
        three();
        expect(toggle().attributes('aria-expanded')).toBe('true');
        expect(toggle().attributes('aria-label')).toBe('Fold layers');
        expect(wrapper.find('.raster-opacity-panel').classes()).not.toContain('is-folded');
    });

    it('counts the layers in the title', () => {
        three();
        expect(wrapper.find('.layers-title').text()).toBe('Layers (3)');
        wrapper.unmount();
        render({ layers: [row('a.tif')] });
        expect(wrapper.find('.layers-title').text()).toBe('Layers (1)');
    });

    it('folds and unfolds, flipping aria-expanded and the name', async () => {
        three();
        await toggle().trigger('click');
        expect(toggle().attributes('aria-expanded')).toBe('false');
        expect(toggle().attributes('aria-label')).toBe('Unfold layers');
        expect(wrapper.find('.raster-opacity-panel').classes()).toContain('is-folded');
        await toggle().trigger('click');
        expect(toggle().attributes('aria-expanded')).toBe('true');
        expect(toggle().attributes('aria-label')).toBe('Fold layers');
        expect(wrapper.find('.raster-opacity-panel').classes()).not.toContain('is-folded');
    });

    it('keeps the rows mounted, with their settings, while folded', async () => {
        three();
        await toggle().trigger('click');
        expect(wrapper.findAll('.raster-opacity-row')).toHaveLength(3);
        expect(wrapper.find('input[aria-label="Opacity of b.tif"]').element.value).toBe('0.3');
        expect(addButton()).toBeDefined();
    });

    it('stays one element that is a bottom panel, so the rules for the sheets over the map still find it', () => {
        three();
        expect(wrapper.element.classList.contains('map-bottom-panel')).toBe(true);
    });
});

describe('RasterLayerOpacityPanel on a map narrower than sm (FR-MAP-12)', () => {
    const renderOn = (mapSize, props) => {
        wrapper = mount(RasterLayerOpacityPanel, { props: { layers: [row('b.tif'), row('a.tif')], ...props }, global: { provide: { mapSize } } });
        return wrapper;
    };
    const panel = () => wrapper.find('.raster-opacity-panel');
    const foldButton = () => wrapper.find('.fold-toggle');

    it('starts folded, so no panel covers the map on load', () => {
        renderOn(reactive({ narrow: true }));
        expect(panel().classes()).toContain('is-folded');
        expect(foldButton().attributes('aria-expanded')).toBe('false');
        expect(foldButton().attributes('aria-label')).toBe('Unfold layers');
    });

    it('starts unfolded on a map that is not narrow, and with no size class at all', () => {
        renderOn(reactive({ narrow: false }));
        expect(panel().classes()).not.toContain('is-folded');
        wrapper.unmount();
        render();
        expect(panel().classes()).not.toContain('is-folded');
    });

    it('unfolds on a press, and a map that changes size afterwards does not take the choice back', async () => {
        const size = reactive({ narrow: true });
        renderOn(size);
        await foldButton().trigger('click');
        expect(panel().classes()).not.toContain('is-folded');
        size.narrow = false;
        await nextTick();
        size.narrow = true;
        await nextTick();
        expect(panel().classes()).not.toContain('is-folded');
    });

    it('follows the map until it is used: folds when the map narrows, unfolds when it widens', async () => {
        const size = reactive({ narrow: false });
        renderOn(size);
        size.narrow = true;
        await nextTick();
        expect(panel().classes()).toContain('is-folded');
        size.narrow = false;
        await nextTick();
        expect(panel().classes()).not.toContain('is-folded');
    });

    it('keeps the rows when folded (they are hidden, not removed), so their settings stay', () => {
        renderOn(reactive({ narrow: true }), { layers: [row('b.tif', { opacity: 0.4 }), row('a.tif')] });
        expect(wrapper.find('input[aria-label="Opacity of b.tif"]').element.value).toBe('0.4');
    });
});

describe('RasterLayerOpacityPanel layer names (FR-RAS-12)', () => {
    // The two mosaics of r3thermal/hat-creek, and the masked one
    const A = 'Hat_Creek_Fire_Thermal_08242018_16bit.tif';
    const B = 'Hat_Creek_Fire_Thermal_08252018_16bit.tif';
    const C = 'Hat_Creek_Fire_Thermal_08242018_16bit_masked.tif';
    const names = () => wrapper.findAll('.raster-label').map(label => label.text());

    it('shows the part of the name that differs: each of the two dates, and the masked variant with its date', () => {
        render({ layers: [row(A, { name: A }), row(B, { name: B }), row(C, { name: C })] });
        // The shared 'Hat_Creek_Fire_Thermal_' is dropped; the masked one (25 characters) is cut to 22: 11, the ellipsis, 10
        expect(names()).toEqual(['08242018_16bit.tif', '08252018_16bit.tif', '08242018_16\u2026masked.tif']);
    });

    it('keeps the whole name in the title of the label', () => {
        render({ layers: [row(A, { name: A }), row(B, { name: B })] });
        expect(wrapper.findAll('.raster-label').map(label => label.attributes('title'))).toEqual([A, B]);
    });

    it('cuts a label that is still longer than 22 characters in the middle, keeping its start (the date) and its end', () => {
        const long = 'Hat_Creek_Fire_Thermal_08242018_16bit_orthomosaic_masked.tif';
        render({ layers: [row(A, { name: A }), row(long, { name: long })] });
        // After the shared start up to '08242018_': '16bit.tif' and '16bit_orthomosaic_masked.tif' (27): 11, the ellipsis, 10
        expect(names()).toEqual(['16bit.tif', '16bit_ortho\u2026masked.tif']);
    });

    it('shows a single layer by its whole name', () => {
        render({ layers: [row('dsm.tif', { name: 'dsm.tif' })] });
        expect(names()).toEqual(['dsm.tif']);
    });
});
