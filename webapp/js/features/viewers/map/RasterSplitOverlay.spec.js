import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import RasterSplitOverlay from './RasterSplitOverlay.vue';

const band = (name, placeholder = null) => ({ name, placeholder });

let wrapper;
const render = props => {
    wrapper = mount(RasterSplitOverlay, { props: { bands: [band('a.tif'), band('b.tif')], positions: [0.5], ...props } });
    return wrapper;
};
afterEach(() => wrapper?.unmount());

const buttons = label => wrapper.findAll(`button[aria-label="${label}"]`);

describe('RasterSplitOverlay band controls', () => {
    it('names the remove control of a band Remove layer, as the layer panel does', async () => {
        render({ removable: true });
        expect(buttons('Remove layer')).toHaveLength(2);
        expect(buttons('Remove layer')[0].attributes('title')).toBe('Remove layer');
        await buttons('Remove layer')[1].trigger('click');
        expect(wrapper.emitted('remove')).toEqual([[1]]);
    });

    it('has no remove control when the layers cannot be removed, or with one band', () => {
        render();
        expect(wrapper.findAll('button[aria-label^="Remove"]')).toHaveLength(0);
        wrapper.unmount();
        render({ removable: true, bands: [band('a.tif')], positions: [] });
        expect(wrapper.findAll('button[aria-label^="Remove"]')).toHaveLength(0);
    });

    it('picks another raster for a missing band', async () => {
        render({ removable: true, bands: [band('a.tif'), band('gone.tif', { kind: 'missing', text: 'Missing: gone.tif' })] });
        expect(buttons('Pick another raster')).toHaveLength(1);
        await buttons('Pick another raster')[0].trigger('click');
        expect(wrapper.emitted('repick')).toEqual([[1]]);
    });
});
