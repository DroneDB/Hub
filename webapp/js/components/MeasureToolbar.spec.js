/**
 * The one measuring toolbar of the 3D, splat and point-cloud viewers (FR-XC-17, D-027): the tools it is given, Clear
 * (on while a shape is drawn), the hint with Done and Cancel while one is, and a slot for the tools of a viewer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MeasureToolbar from './MeasureToolbar.vue';

let wrapper;
const render = (props = {}, slots = {}) => {
    wrapper = mount(MeasureToolbar, { props, slots });
    return wrapper;
};
afterEach(() => wrapper?.unmount());

const tool = kind => wrapper.find(`[data-testid="measure-${kind}"]`);
const labels = () => wrapper.findAll('[role="toolbar"] button').map(b => b.attributes('aria-label'));

describe('MeasureToolbar tools', () => {
    it('offers point, distance, height and area, and Clear', () => {
        render();
        expect(labels()).toEqual(['Measure a point', 'Measure a distance', 'Measure a height', 'Measure an area', 'Clear measurements']);
    });

    it('offers only the kinds it is given, in their order (the 3D viewer has no height)', () => {
        render({ kinds: ['point', 'distance', 'area'] });
        expect(labels()).toEqual(['Measure a point', 'Measure a distance', 'Measure an area', 'Clear measurements']);
    });

    it('asks for the kind of the button that is pressed, and shows the one being drawn as pressed', async () => {
        render({ activeKind: 'distance' });
        await tool('area').trigger('click');
        expect(wrapper.emitted('measure')).toEqual([['area']]);
        expect(tool('distance').attributes('aria-pressed')).toBe('true');
        expect(tool('distance').classes()).toContain('active');
        expect(tool('area').attributes('aria-pressed')).toBe('false');
    });

    it('has the tools of a viewer in the extra slot, after the measuring ones', () => {
        render({}, { extra: '<button type="button" aria-label="Clip volume">C</button>' });
        expect(labels().at(-1)).toBe('Clip volume');
        expect(labels()).toContain('Measure an area');
    });

    it('has no Clear when it is told so (the point-cloud viewer has its own delete tool)', () => {
        render({ showClear: false });
        expect(labels()).not.toContain('Clear measurements');
    });

    it('offers the scale and the coordinates when the scene can use them', async () => {
        render({ canSetScale: true, coordinateMode: 'EPSG:32632' });
        expect(labels()).toContain('Set the scale');
        expect(labels()).toContain('Coordinates are shown in EPSG:32632: click to change');
        await wrapper.find('.coordinate-mode').trigger('click');
        expect(wrapper.emitted('toggle-coordinates')).toHaveLength(1);
    });
});

describe('MeasureToolbar labelled tools', () => {
    const texts = () => wrapper.findAll('[role="toolbar"] button').map(b => b.text());

    it('shows only icons by default', () => {
        render();
        expect(texts()).toEqual(['', '', '', '', '']);
        expect(wrapper.classes()).not.toContain('labelled');
    });

    it('says the name of each tool beside its icon when labelled, keeping the accessible names', () => {
        render({ labelled: true });
        expect(texts()).toEqual(['Point', 'Distance', 'Height', 'Area', 'Clear']);
        expect(wrapper.classes()).toContain('labelled');
        expect(labels()).toEqual(['Measure a point', 'Measure a distance', 'Measure a height', 'Measure an area', 'Clear measurements']);
    });

    it('starts the same kind from a labelled button', async () => {
        render({ labelled: true });
        await tool('distance').trigger('click');
        expect(wrapper.emitted('measure')).toEqual([['distance']]);
    });
    it('shows only the icons on a phone (below sm), with the same accessible names', () => {
        // The media query of useStackedLayout (below sm) matches
        const media = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
            matches: query === '(max-width: 575.98px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn()
        }));
        try {
            render({ labelled: true });
            expect(wrapper.findAll('.tool-label')).toHaveLength(0);
            expect(texts()).toEqual(['', '', '', '', '']);
            expect(wrapper.classes()).not.toContain('labelled');
            expect(labels()).toEqual(['Measure a point', 'Measure a distance', 'Measure a height', 'Measure an area', 'Clear measurements']);
        } finally {
            media.mockRestore();
        }
    });
});

describe('MeasureToolbar Clear', () => {
    const clear = () => wrapper.find('[data-testid="measure-clear"]');

    it('is off with nothing to clear', () => {
        render({ count: 0 });
        expect(clear().attributes('disabled')).toBeDefined();
    });

    it('is on with a shape shown', async () => {
        render({ count: 2 });
        expect(clear().attributes('disabled')).toBeUndefined();
        await clear().trigger('click');
        expect(wrapper.emitted('clear')).toHaveLength(1);
    });

    it('is on while a shape is drawn, with nothing shown yet: it cancels the open shape too', () => {
        render({ count: 0, activeKind: 'distance' });
        expect(clear().attributes('disabled')).toBeUndefined();
    });
});

describe('MeasureToolbar hint', () => {
    const hint = () => wrapper.find('[data-testid="measure-hint"]');

    it('is not there with no shape being drawn', () => {
        render();
        expect(hint().exists()).toBe(false);
    });

    it('says how to end and cancel a distance and an area: double click, right click, Enter, Escape', () => {
        render({ activeKind: 'distance' });
        expect(hint().text()).toContain('Double-click, right-click or Enter finishes');
        expect(hint().text()).toContain('Esc cancels');
        wrapper.unmount();
        render({ activeKind: 'area' });
        expect(hint().text()).toContain('Click the corners of the area');
        expect(hint().text()).toContain('Double-click, right-click or Enter finishes');
    });

    it('says how to place a point and a height', () => {
        render({ activeKind: 'point' });
        expect(hint().text()).toContain('Click to place the point');
        wrapper.unmount();
        render({ activeKind: 'height' });
        expect(hint().text()).toContain('Click two points');
    });

    it('has Done and Cancel for a screen with no right click, Enter or Escape', async () => {
        render({ activeKind: 'distance' });
        await wrapper.find('[data-testid="measure-done"]').trigger('click');
        await wrapper.find('[data-testid="measure-cancel"]').trigger('click');
        expect(wrapper.emitted('finish')).toHaveLength(1);
        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });

    it('a measure with no button (the point cloud\'s angle, circle, azimuth) gets the general hint, Done and Cancel, and no button is pressed', async () => {
        render({ activeKind: 'other' });
        expect(hint().text()).toContain('Click the points of the measure. Double-click, right-click or Enter finishes; Esc cancels.');
        expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(0);
        await wrapper.find('[data-testid="measure-done"]').trigger('click');
        await wrapper.find('[data-testid="measure-cancel"]').trigger('click');
        expect(wrapper.emitted('finish')).toHaveLength(1);
        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });

    it('says the scale when the shapes are in the units of the file', () => {
        render({ metric: false, count: 1, canSetScale: true });
        expect(wrapper.text()).toContain('Values are in the units of the file. Set the scale to read metres.');
    });
});
