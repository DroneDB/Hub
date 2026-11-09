/**
 * The point cloud's own tools in the toolbar (FR-VWR-26): labelled buttons that do what the icons of the Potree menu do.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PotreeTools from './PotreeTools.vue';

class Dispatcher {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(e) { [...(this.listeners[e.type] || [])].forEach(fn => fn(e)); }
}

let wrapper;
let viewer;
let material;
let scene;
let attributes;
let volume;
const range = (min, max) => ({ range: [min, max] });
const make = ({ attrs, active = 'rgba', format } = {}) => {
    material = Object.assign(new Dispatcher(), { activeAttributeName: active });
    scene = Object.assign(new Dispatcher(), { volumes: [], polygonClipVolumes: [], removeAllClipVolumes: vi.fn(), removeVolume: vi.fn() });
    attributes = attrs ?? { rgba: range(0, 255), intensity: range(0, 65535), classification: range(0, 18) };
    scene.pointclouds = [{ material, getAttribute: name => attributes[name] ?? null, pcoGeometry: { copc: { header: { pointDataRecordFormat: format } } } }];
    volume = new Dispatcher();
    viewer = Object.assign(new Dispatcher(), {
        scene,
        inputHandler: { startDragging: vi.fn() },
        setTopView: vi.fn(), setFrontView: vi.fn(), setLeftView: vi.fn(), setRightView: vi.fn(),
        volumeTool: { startInsertion: vi.fn(() => volume) }
    });
    wrapper = mount(PotreeTools, { props: { viewer } });
};
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
});
const byId = id => wrapper.find(`[data-testid="${id}"]`);
const optionTexts = () => byId('color-by').findAll('option').map(o => o.text());
// What Potree declares for a COPC cloud before a node is loaded, and what loading a node does to it
const unset = () => range(Infinity, -Infinity);
const load = (attr, min, max) => { attr.range[0] = Math.min(attr.range[0], min); attr.range[1] = Math.max(attr.range[1], max); };
const press = key => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true });
    document.dispatchEvent(e);
    return e;
};
// A phone: the media query of useStackedLayout (below sm) matches
const phone = () => vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(max-width: 575.98px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn()
}));

describe('PotreeTools', () => {
    it('has labelled buttons: Clip volume, Remove clips, Top, Front, Left, Right and Colour by', () => {
        make();
        expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Clip volume', 'Remove clips', 'Top', 'Front', 'Left', 'Right']);
        expect(wrapper.find('label[for="potree-color-by"]').text()).toBe('Colour by');
        expect(byId('color-by').findAll('option').map(o => o.text())).toEqual(['Colour', 'Elevation', 'Intensity', 'Classification']);
    });

    it('Clip volume starts the clip insertion of the Potree icon, after telling that the measure drawn ends', async () => {
        make();
        const order = [];
        viewer.volumeTool.startInsertion.mockImplementation(args => { order.push(['start', args]); return volume; });
        wrapper.unmount();
        wrapper = mount(PotreeTools, { props: { viewer, onBeforeClip: () => order.push('before') } });
        await byId('clip-volume').trigger('click');
        expect(order).toEqual(['before', ['start', { clip: true }]]);
    });

    it('each view button calls the viewer method of its Potree icon', async () => {
        make();
        await byId('view-top').trigger('click');
        await byId('view-front').trigger('click');
        await byId('view-left').trigger('click');
        await byId('view-right').trigger('click');
        expect(viewer.setTopView).toHaveBeenCalledTimes(1);
        expect(viewer.setFrontView).toHaveBeenCalledTimes(1);
        expect(viewer.setLeftView).toHaveBeenCalledTimes(1);
        expect(viewer.setRightView).toHaveBeenCalledTimes(1);
    });

    it('Remove clips is off with no clip volume, and removes them when there are', async () => {
        make();
        expect(byId('clip-remove').attributes('disabled')).toBeDefined();
        scene.volumes.push({ clip: true });
        scene.dispatchEvent({ type: 'volume_added' });
        await wrapper.vm.$nextTick();
        expect(byId('clip-remove').attributes('disabled')).toBeUndefined();
        await byId('clip-remove').trigger('click');
        expect(scene.removeAllClipVolumes).toHaveBeenCalledTimes(1);
    });

    it('Colour by sets the attribute of the material', async () => {
        make();
        await byId('color-by').setValue('elevation');
        expect(material.activeAttributeName).toBe('elevation');
    });

    it('Colour by follows the menu: a colouring chosen there is shown here, also one the toolbar has no name for', async () => {
        make();
        material.activeAttributeName = 'intensity';
        material.dispatchEvent({ type: 'active_attribute_changed' });
        await wrapper.vm.$nextTick();
        expect(byId('color-by').element.value).toBe('intensity');
        material.activeAttributeName = 'level of detail';
        material.dispatchEvent({ type: 'active_attribute_changed' });
        await wrapper.vm.$nextTick();
        expect(byId('color-by').element.value).toBe('level of detail');
        expect(byId('color-by').findAll('option').map(o => o.text())).toContain('level of detail');
    });

    it('lets go of the viewer when it unmounts', () => {
        make();
        wrapper.unmount();
        expect(scene.listeners.volume_added).toEqual([]);
        expect(material.listeners.active_attribute_changed).toEqual([]);
        expect(viewer.listeners.update).toEqual([]);
        wrapper = null;
    });
});

describe('PotreeTools colours of a COPC cloud as it loads', () => {
    const copc = () => ({ rgba: unset(), intensity: unset(), classification: unset(), 'return number': unset() });

    it('offers only what the loaded nodes show: none of the declared attributes before a node is loaded', () => {
        make({ attrs: copc(), format: 6, active: 'elevation' });
        expect(optionTexts()).toEqual(['Elevation']);
    });

    it('adds an attribute when the loading of nodes gives it more than one value (the frame after)', async () => {
        make({ attrs: copc(), format: 7 });
        expect(optionTexts()).toEqual(['Colour', 'Elevation']);
        load(attributes.intensity, 0, 900);
        load(attributes.classification, 2, 2);
        viewer.dispatchEvent({ type: 'update' });
        await wrapper.vm.$nextTick();
        expect(optionTexts()).toEqual(['Colour', 'Elevation', 'Intensity']);
    });

    it('looks at the ranges again when the select is opened', async () => {
        make({ attrs: copc(), format: 7 });
        load(attributes.classification, 1, 6);
        load(attributes['return number'], 1, 4);
        await byId('color-by').trigger('focus');
        expect(optionTexts()).toEqual(['Colour', 'Elevation', 'Classification', 'Return number']);
    });

    it('keeps the current colouring even when its range is not known yet', () => {
        make({ attrs: copc(), format: 7, active: 'intensity' });
        expect(optionTexts()).toEqual(['Colour', 'Elevation', 'Intensity']);
        expect(byId('color-by').element.value).toBe('intensity');
    });
});

describe('PotreeTools clip box placing', () => {
    it('shows how to place it and how to cancel while it follows the pointer', async () => {
        make();
        expect(byId('clip-hint').exists()).toBe(false);
        await byId('clip-volume').trigger('click');
        expect(byId('clip-hint').text()).toContain('Click to place the clip box. Esc cancels.');
        expect(byId('clip-volume').classes()).toContain('active');
    });

    it('Escape cancels it: the insertion ends, the box is removed, the pointer lets go and the hint goes', async () => {
        make();
        const cancelled = vi.fn();
        viewer.addEventListener('cancel_insertions', cancelled);
        await byId('clip-volume').trigger('click');
        expect(press('Escape').defaultPrevented).toBe(true);
        await wrapper.vm.$nextTick();
        expect(cancelled).toHaveBeenCalledTimes(1);
        expect(scene.removeVolume).toHaveBeenCalledWith(volume);
        expect(viewer.inputHandler.startDragging).toHaveBeenCalledWith(null);
        expect(byId('clip-hint').exists()).toBe(false);
        expect(press('Escape').defaultPrevented).toBe(false);
    });

    it('Cancel of the hint does the same (a screen with no Escape)', async () => {
        make();
        await byId('clip-volume').trigger('click');
        await byId('clip-cancel').trigger('click');
        expect(scene.removeVolume).toHaveBeenCalledWith(volume);
        expect(byId('clip-hint').exists()).toBe(false);
    });

    it('a dropped box stays, the hint goes and Escape is no longer its', async () => {
        make();
        await byId('clip-volume').trigger('click');
        volume.dispatchEvent({ type: 'drop' });
        await wrapper.vm.$nextTick();
        expect(byId('clip-hint').exists()).toBe(false);
        expect(press('Escape').defaultPrevented).toBe(false);
        expect(scene.removeVolume).not.toHaveBeenCalled();
    });

    it('lets go of Escape when it unmounts while a box is placed', async () => {
        make();
        await byId('clip-volume').trigger('click');
        wrapper.unmount();
        wrapper = null;
        expect(press('Escape').defaultPrevented).toBe(false);
        expect(scene.removeVolume).not.toHaveBeenCalled();
        expect(volume.listeners.drop).toEqual([]);
    });
});

describe('PotreeTools on a phone (below sm)', () => {
    it('shows the tools as icons with their accessible names, and the views as one select', async () => {
        phone();
        make();
        expect(wrapper.findAll('.tool-label')).toHaveLength(0);
        expect(byId('clip-volume').attributes('aria-label')).toBe('Clip volume');
        expect(byId('clip-remove').attributes('aria-label')).toBe('Remove the clip volumes');
        expect(byId('color-by').attributes('aria-label')).toBe('Colour the points by');
        expect(byId('view-top').exists()).toBe(false);
        const views = byId('view-select');
        expect(views.attributes('aria-label')).toBe('Look at the point cloud from');
        expect(views.findAll('option').map(o => o.text())).toEqual(['View', 'Top', 'Front', 'Left', 'Right']);
        await views.setValue('left');
        expect(viewer.setLeftView).toHaveBeenCalledTimes(1);
        expect(views.element.value).toBe('');
    });

    it('has the labels and the view buttons above sm', () => {
        make();
        expect(wrapper.findAll('.tool-label').map(l => l.text())).toEqual(['Clip volume', 'Remove clips', 'Top', 'Front', 'Left', 'Right', 'Colour by']);
        expect(byId('view-select').exists()).toBe(false);
    });
});
