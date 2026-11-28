/**
 * The display bar of the point-cloud viewer: the views, the colour of the points and the unit of the
 * measurements, in a bar of their own, apart from the tools. The views and the colour do what the icons of the Potree
 * menu do.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PotreeDisplayBar from './PotreeDisplayBar.vue';

class Dispatcher {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(e) { [...(this.listeners[e.type] || [])].forEach(fn => fn(e)); }
}

let wrapper;
let viewer;
let material;
let attributes;
const range = (min, max) => ({ range: [min, max] });
const make = ({ attrs, active = 'rgba', format, props = {} } = {}) => {
    material = Object.assign(new Dispatcher(), { activeAttributeName: active });
    attributes = attrs ?? { rgba: range(0, 255), intensity: range(0, 65535), classification: range(0, 18) };
    const scene = { pointclouds: [{ material, getAttribute: name => attributes[name] ?? null, pcoGeometry: { copc: { header: { pointDataRecordFormat: format } } } }] };
    viewer = Object.assign(new Dispatcher(), { scene, setTopView: vi.fn(), setFrontView: vi.fn(), setLeftView: vi.fn(), setRightView: vi.fn() });
    wrapper = mount(PotreeDisplayBar, { props: { viewer, unit: 'metric', ...props } });
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
// A phone: the media query of useStackedLayout (below sm) matches
const phone = () => vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(max-width: 575.98px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn()
}));

describe('PotreeDisplayBar', () => {
    it('is a toolbar of its own, named Display: Top, Front, Left, Right, then Colour by and the unit', () => {
        make();
        expect(wrapper.attributes('role')).toBe('toolbar');
        expect(wrapper.attributes('aria-label')).toBe('Display');
        expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Top', 'Front', 'Left', 'Right']);
        expect(wrapper.find('label[for="potree-color-by"]').text()).toBe('Colour by');
        expect(optionTexts()).toEqual(['Colour', 'Elevation', 'Intensity', 'Classification']);
        expect(wrapper.findAll('select').map(s => s.attributes('aria-label'))).toEqual(['Colour the points by', 'Units']);
    });

    it('has no tool of the measuring toolbar: nothing here changes the cloud or its measurements', () => {
        make();
        expect(byId('clip-volume').exists()).toBe(false);
        expect(wrapper.findAll('button').map(b => b.attributes('data-testid'))).toEqual(['view-top', 'view-front', 'view-left', 'view-right']);
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

    it('Colour by sets the attribute of the material', async () => {
        make();
        await byId('color-by').setValue('elevation');
        expect(material.activeAttributeName).toBe('elevation');
    });

    it('Colour by follows the menu: a colouring chosen there is shown here, also one the bar has no name for', async () => {
        make();
        material.activeAttributeName = 'intensity';
        material.dispatchEvent({ type: 'active_attribute_changed' });
        await wrapper.vm.$nextTick();
        expect(byId('color-by').element.value).toBe('intensity');
        material.activeAttributeName = 'level of detail';
        material.dispatchEvent({ type: 'active_attribute_changed' });
        await wrapper.vm.$nextTick();
        expect(byId('color-by').element.value).toBe('level of detail');
        expect(optionTexts()).toContain('level of detail');
    });

    it('draws its choices as tools of the bar: a select with the name before it, not a field', () => {
        make();
        const choices = wrapper.findAll('.tool-choice');
        expect(choices).toHaveLength(2);
        expect(choices.every(c => c.find('select.tool-select').exists())).toBe(true);
        expect(choices[0].find('label.tool-label').text()).toBe('Colour by');
    });

    it('lets go of the viewer when it unmounts', () => {
        make();
        wrapper.unmount();
        expect(material.listeners.active_attribute_changed).toEqual([]);
        expect(viewer.listeners.update).toEqual([]);
        wrapper = null;
    });
});

describe('PotreeDisplayBar unit of the measurements', () => {
    const unit = () => wrapper.find('#potree-unit-select');

    it('shows the unit it is given, metric or imperial', () => {
        make({ props: { unit: 'imperial' } });
        expect(unit().findAll('option').map(o => [o.element.value, o.text()])).toEqual([['metric', 'Metric (m)'], ['imperial', 'Imperial (ft)']]);
        expect(unit().element.value).toBe('imperial');
    });

    it('tells the unit that is chosen: the viewer owns it', async () => {
        make();
        await unit().setValue('imperial');
        expect(wrapper.emitted('update:unit')).toEqual([['imperial']]);
    });

    it('can be chosen when nothing locks it', () => {
        make();
        expect(unit().attributes('disabled')).toBeUndefined();
    });

    it('is locked, with the reason as its tooltip, on a cloud whose lengths cannot be converted', () => {
        make({ props: { unitsLockedReason: 'The heights of this cloud are in another unit' } });
        expect(unit().attributes('disabled')).toBeDefined();
        expect(unit().element.closest('.tool-choice').getAttribute('title')).toBe('The heights of this cloud are in another unit');
    });
});

describe('PotreeDisplayBar colours of a COPC cloud as it loads', () => {
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

describe('PotreeDisplayBar on a phone (below sm)', () => {
    it('shows the views as one choice and the colour with no name before it, with their accessible names', async () => {
        phone();
        make();
        expect(wrapper.findAll('.tool-label')).toHaveLength(0);
        expect(byId('color-by').attributes('aria-label')).toBe('Colour the points by');
        expect(byId('view-top').exists()).toBe(false);
        const views = byId('view-select');
        expect(views.attributes('aria-label')).toBe('Look at the point cloud from');
        expect(views.findAll('option').map(o => o.text())).toEqual(['View', 'Top', 'Front', 'Left', 'Right']);
        await views.setValue('left');
        expect(viewer.setLeftView).toHaveBeenCalledTimes(1);
        expect(views.element.value).toBe('');
    });

    it('has the names and the view buttons above sm', () => {
        make();
        expect(wrapper.findAll('.tool-label').map(l => l.text())).toEqual(['Top', 'Front', 'Left', 'Right', 'Colour by']);
        expect(byId('view-select').exists()).toBe(false);
    });
});
