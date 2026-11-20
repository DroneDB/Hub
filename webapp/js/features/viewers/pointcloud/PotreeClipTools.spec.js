/**
 * The clip volume of a point cloud in the viewer's measuring toolbar (FR-VWR-26): buttons that do what the icons of
 * the Potree menu do, and the hint while a clip box is placed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PotreeClipTools from './PotreeClipTools.vue';

class Dispatcher {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(e) { [...(this.listeners[e.type] || [])].forEach(fn => fn(e)); }
}

let wrapper;
let viewer;
let scene;
let volume;
const make = () => {
    scene = Object.assign(new Dispatcher(), { volumes: [], polygonClipVolumes: [], removeAllClipVolumes: vi.fn(), removeVolume: vi.fn() });
    volume = new Dispatcher();
    viewer = Object.assign(new Dispatcher(), {
        scene,
        inputHandler: { startDragging: vi.fn() },
        volumeTool: { startInsertion: vi.fn(() => volume) }
    });
    wrapper = mount(PotreeClipTools, { props: { viewer } });
};
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
});
const byId = id => wrapper.find(`[data-testid="${id}"]`);
const press = key => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true });
    document.dispatchEvent(e);
    return e;
};
// A phone: the media query of useStackedLayout (below sm) matches
const phone = () => vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(max-width: 575.98px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn()
}));

describe('PotreeClipTools', () => {
    it('is one group: Clip volume with its name, and the eraser that removes the clips beside it', () => {
        make();
        const group = wrapper.find('[role="group"]');
        expect(group.attributes('aria-label')).toBe('Clip volume');
        expect(group.classes()).toContain('tool-group');
        expect(group.findAll('button').map(b => b.attributes('aria-label'))).toEqual(['Clip volume', 'Remove the clip volumes']);
        expect(group.findAll('button').map(b => b.text())).toEqual(['Clip volume', '']);
    });

    it('Clip volume starts the clip insertion of the Potree icon, after telling that the measure drawn ends', async () => {
        make();
        const order = [];
        viewer.volumeTool.startInsertion.mockImplementation(args => { order.push(['start', args]); return volume; });
        wrapper.unmount();
        wrapper = mount(PotreeClipTools, { props: { viewer, onBeforeClip: () => order.push('before') } });
        await byId('clip-volume').trigger('click');
        expect(order).toEqual(['before', ['start', { clip: true }]]);
    });

    it('the eraser is off with no clip volume, and removes them when there are', async () => {
        make();
        expect(byId('clip-remove').attributes('disabled')).toBeDefined();
        scene.volumes.push({ clip: true });
        scene.dispatchEvent({ type: 'volume_added' });
        await wrapper.vm.$nextTick();
        expect(byId('clip-remove').attributes('disabled')).toBeUndefined();
        await byId('clip-remove').trigger('click');
        expect(scene.removeAllClipVolumes).toHaveBeenCalledTimes(1);
    });

    it('lets go of the scene when it unmounts', () => {
        make();
        wrapper.unmount();
        expect(scene.listeners.volume_added).toEqual([]);
        expect(scene.listeners.volume_removed).toEqual([]);
        wrapper = null;
    });

    it('is an icon with its accessible name on a phone (below sm)', () => {
        phone();
        make();
        expect(wrapper.findAll('.tool-label')).toHaveLength(0);
        expect(byId('clip-volume').attributes('aria-label')).toBe('Clip volume');
        expect(byId('clip-remove').attributes('aria-label')).toBe('Remove the clip volumes');
    });
});

describe('PotreeClipTools clip box placing', () => {
    it('shows how to place it and how to cancel while it follows the pointer', async () => {
        make();
        expect(byId('clip-hint').exists()).toBe(false);
        await byId('clip-volume').trigger('click');
        expect(byId('clip-hint').text()).toContain('Click to place the clip box. Esc cancels.');
        expect(byId('clip-volume').classes()).toContain('active');
        // A line of its own in the toolbar, with a text action: neither is drawn as a tool
        expect(byId('clip-hint').classes()).toContain('tool-hint');
        expect(byId('clip-cancel').classes()).toContain('hint-action');
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
