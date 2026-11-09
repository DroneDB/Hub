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

// FR-MAP-17: a divider is a focusable separator that the keyboard moves
describe('RasterSplitOverlay dividers', () => {
    const handles = () => wrapper.findAll('[role="separator"]');

    it('has a focusable vertical separator per divider, named for the two bands it parts, with its position in percent', () => {
        render({ bands: [band('a.tif'), band('b.tif'), band('c.tif')], positions: [0.3, 0.65] });
        expect(handles()).toHaveLength(2);
        const [first, second] = handles();
        expect(first.attributes('tabindex')).toBe('0');
        expect(first.attributes('aria-orientation')).toBe('vertical');
        expect(first.attributes('aria-label')).toBe('Divider between a.tif and b.tif');
        expect(second.attributes('aria-label')).toBe('Divider between b.tif and c.tif');
        expect(first.attributes('aria-valuenow')).toBe('30');
        expect(first.attributes('aria-valuemin')).toBe('0');
        expect(first.attributes('aria-valuemax')).toBe('100');
        expect(second.attributes('aria-valuenow')).toBe('65');
    });

    it('names a band that is missing by its placeholder', () => {
        render({ bands: [band('a.tif'), band('gone.tif', { kind: 'missing', text: 'Missing: gone.tif' })] });
        expect(handles()[0].attributes('aria-label')).toBe('Divider between a.tif and Missing: gone.tif');
    });

    it('ArrowRight moves the divider by 5 %, ArrowLeft back, Shift by 1 %', async () => {
        render({ positions: [0.5] });
        await handles()[0].trigger('keydown', { key: 'ArrowRight' });
        expect(wrapper.emitted('update:positions').at(-1)).toEqual([[0.55]]);
        await handles()[0].trigger('keydown', { key: 'ArrowLeft' });
        expect(wrapper.emitted('update:positions').at(-1)).toEqual([[0.45]]);
        await handles()[0].trigger('keydown', { key: 'ArrowRight', shiftKey: true });
        expect(wrapper.emitted('update:positions').at(-1)[0][0]).toBeCloseTo(0.51, 10);
    });

    it('Home and End go to the ends of its range, 5 % from the edge of the map', async () => {
        render({ positions: [0.5] });
        await handles()[0].trigger('keydown', { key: 'Home' });
        expect(wrapper.emitted('update:positions').at(-1)).toEqual([[0.05]]);
        await handles()[0].trigger('keydown', { key: 'End' });
        expect(wrapper.emitted('update:positions').at(-1)).toEqual([[0.95]]);
    });

    it('never comes closer than 5 % to its neighbour, and says nothing when it cannot move', async () => {
        render({ bands: [band('a.tif'), band('b.tif'), band('c.tif')], positions: [0.45, 0.5] });
        await handles()[0].trigger('keydown', { key: 'ArrowRight' });
        expect(wrapper.emitted('update:positions')).toBeUndefined();
        await handles()[1].trigger('keydown', { key: 'ArrowLeft' });
        expect(wrapper.emitted('update:positions')).toBeUndefined();
        await handles()[0].trigger('keydown', { key: 'End' });
        expect(wrapper.emitted('update:positions')).toBeUndefined();
    });

    it('leaves the other keys alone', async () => {
        render({ positions: [0.5] });
        const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
        handles()[0].element.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(wrapper.emitted('update:positions')).toBeUndefined();
        const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
        handles()[0].element.dispatchEvent(arrow);
        expect(arrow.defaultPrevented).toBe(true);
    });
});
