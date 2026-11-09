/**
 * The point-cloud-only tools (FR-VWR-26): each one calls what the icon of the Potree menu calls.
 */
import { describe, it, expect, vi } from 'vitest';
import { VIEWS, COLOR_BY, CLIP_HINT, setView, startClipVolume, placeClipVolume, clipVolumeCount, colorOptions, rangeSignature, setColorBy } from './potreeTools';

const attribute = (min, max) => ({ range: [min, max] });
// What Potree declares for a COPC cloud before a node is loaded (PointAttribute: range [Infinity, -Infinity])
const unset = () => attribute(Infinity, -Infinity);
const copcCloud = format => {
    const attributes = { rgba: unset(), intensity: unset(), classification: unset(), 'return number': unset() };
    return {
        attributes,
        getAttribute: name => attributes[name] ?? null,
        pcoGeometry: { copc: { header: { pointDataRecordFormat: format } } },
        material: { activeAttributeName: 'rgba' }
    };
};
// A node loads: Potree widens the range with the node's (CopcLaszipLoader)
const load = (attr, min, max) => { attr.range[0] = Math.min(attr.range[0], min); attr.range[1] = Math.max(attr.range[1], max); };

class Dispatcher {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(e) { [...(this.listeners[e.type] || [])].forEach(fn => fn(e)); }
}
// A COPC cloud: every attribute is there, with its range
const cloud = (attributes = { rgba: attribute(0, 255), intensity: attribute(0, 65535), classification: attribute(0, 18), 'return number': attribute(1, 5) }) => ({
    getAttribute: name => attributes[name] ?? null,
    material: { activeAttributeName: 'rgba' }
});

describe('views', () => {
    it('are the top, front, left and right views, each the viewer method of the Potree icon', () => {
        expect(VIEWS.map(v => [v.key, v.label, v.method])).toEqual([
            ['top', 'Top', 'setTopView'], ['front', 'Front', 'setFrontView'], ['left', 'Left', 'setLeftView'], ['right', 'Right', 'setRightView']
        ]);
    });

    it('call the viewer method of the view and nothing else', () => {
        const viewer = { setTopView: vi.fn(), setFrontView: vi.fn(), setLeftView: vi.fn(), setRightView: vi.fn() };
        expect(setView(viewer, 'front')).toBe(true);
        expect(viewer.setFrontView).toHaveBeenCalledTimes(1);
        expect(viewer.setTopView).not.toHaveBeenCalled();
    });

    it('ignore a view that does not exist', () => {
        const viewer = { setTopView: vi.fn() };
        expect(setView(viewer, 'bottom')).toBe(false);
        expect(viewer.setTopView).not.toHaveBeenCalled();
    });
});

describe('clip volume', () => {
    it('starts the insertion of a clip volume, as the Potree icon does', () => {
        const volume = {};
        const viewer = { volumeTool: { startInsertion: vi.fn(() => volume) } };
        expect(startClipVolume(viewer)).toBe(volume);
        expect(viewer.volumeTool.startInsertion).toHaveBeenCalledWith({ clip: true });
    });

    it('counts the clip boxes and the clip polygons, not the plain volumes', () => {
        const scene = { volumes: [{ clip: true }, { clip: false }, { clip: true }], polygonClipVolumes: [{}] };
        expect(clipVolumeCount(scene)).toBe(3);
        expect(clipVolumeCount({ volumes: [], polygonClipVolumes: [] })).toBe(0);
    });
});

describe('placing a clip volume', () => {
    const setup = () => {
        const volume = new Dispatcher();
        const scene = Object.assign(new Dispatcher(), { removeVolume: vi.fn() });
        const viewer = Object.assign(new Dispatcher(), {
            scene,
            inputHandler: { startDragging: vi.fn() },
            volumeTool: { startInsertion: vi.fn(() => volume) }
        });
        const cancelled = vi.fn();
        viewer.addEventListener('cancel_insertions', cancelled);
        const onEnd = vi.fn();
        const placement = placeClipVolume(viewer, { onEnd });
        return { volume, scene, viewer, cancelled, onEnd, placement };
    };
    const press = key => {
        const e = new KeyboardEvent('keydown', { key, cancelable: true });
        document.dispatchEvent(e);
        return e;
    };

    it('says how to place it and how to cancel', () => {
        expect(CLIP_HINT).toBe('Click to place the clip box. Esc cancels.');
    });

    it('Escape cancels it: Potree ends the insertion, the box is removed and the pointer lets go of it', () => {
        const { volume, scene, viewer, cancelled, onEnd, placement } = setup();
        expect(placement.volume).toBe(volume);
        expect(viewer.volumeTool.startInsertion).toHaveBeenCalledWith({ clip: true });
        const e = press('Escape');
        expect(e.defaultPrevented).toBe(true);
        expect(cancelled).toHaveBeenCalledTimes(1);
        expect(scene.removeVolume).toHaveBeenCalledWith(volume);
        expect(viewer.inputHandler.startDragging).toHaveBeenCalledWith(null);
        expect(onEnd).toHaveBeenCalledTimes(1);
        // One shot: a second Escape is not its
        expect(press('Escape').defaultPrevented).toBe(false);
        expect(scene.removeVolume).toHaveBeenCalledTimes(1);
    });

    it('other keys do nothing', () => {
        const { scene, onEnd } = setup();
        press('Enter');
        press('a');
        expect(scene.removeVolume).not.toHaveBeenCalled();
        expect(onEnd).not.toHaveBeenCalled();
        press('Escape');
    });

    it('ends when the box is dropped: it stays, and Escape is no longer heard', () => {
        const { volume, scene, onEnd, viewer } = setup();
        volume.dispatchEvent({ type: 'drop' });
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(press('Escape').defaultPrevented).toBe(false);
        expect(scene.removeVolume).not.toHaveBeenCalled();
        expect(volume.listeners.drop).toEqual([]);
        expect(scene.listeners.volume_removed).toEqual([]);
        expect(viewer.listeners.cancel_insertions).toHaveLength(1);
    });

    it('ends when another insertion cancels it, or when the box is removed', () => {
        const first = setup();
        first.viewer.dispatchEvent({ type: 'cancel_insertions' });
        expect(first.onEnd).toHaveBeenCalledTimes(1);
        expect(press('Escape').defaultPrevented).toBe(false);

        const second = setup();
        second.scene.dispatchEvent({ type: 'volume_removed', volume: {} });
        expect(second.onEnd).not.toHaveBeenCalled();
        second.scene.dispatchEvent({ type: 'volume_removed', volume: second.volume });
        expect(second.onEnd).toHaveBeenCalledTimes(1);
        expect(press('Escape').defaultPrevented).toBe(false);
    });

    it('stop lets go of everything without removing the box', () => {
        const { placement, scene, onEnd } = setup();
        placement.stop();
        placement.stop();
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(press('Escape').defaultPrevented).toBe(false);
        expect(scene.removeVolume).not.toHaveBeenCalled();
    });

    it('is nothing when no volume starts', () => {
        expect(placeClipVolume({ volumeTool: { startInsertion: () => undefined } })).toBeNull();
    });
});

describe('colour by', () => {
    it('offers the colour, elevation, intensity, classification and return number of a cloud that has them, with their labels', () => {
        expect(colorOptions(cloud())).toEqual([
            { name: 'rgba', label: 'Colour' }, { name: 'elevation', label: 'Elevation' }, { name: 'intensity', label: 'Intensity' },
            { name: 'classification', label: 'Classification' }, { name: 'return number', label: 'Return number' }
        ]);
        expect(COLOR_BY).toHaveLength(5);
    });

    it('always offers the elevation, and leaves out what the cloud has not or has as one value', () => {
        expect(colorOptions(cloud({ rgba: attribute(0, 255), intensity: attribute(7, 7) })).map(o => o.name)).toEqual(['rgba', 'elevation']);
        expect(colorOptions(cloud({})).map(o => o.name)).toEqual(['elevation']);
    });

    it('offers only the elevation for a COPC cloud whose nodes are not loaded and whose point format has no colour', () => {
        expect(colorOptions(copcCloud(6)).map(o => o.name)).toEqual(['elevation']);
    });

    it('offers the colour of a COPC point format with RGB, whose range Potree never fills', () => {
        expect(colorOptions(copcCloud(7)).map(o => o.name)).toEqual(['rgba', 'elevation']);
        expect(colorOptions(copcCloud(8)).map(o => o.name)).toEqual(['rgba', 'elevation']);
    });

    it('offers an attribute once the loaded nodes give it more than one value', () => {
        const pc = copcCloud(7);
        load(pc.attributes.intensity, 0, 812);
        load(pc.attributes.classification, 2, 2);
        expect(colorOptions(pc).map(o => o.name)).toEqual(['rgba', 'elevation', 'intensity']);
        load(pc.attributes.classification, 6, 6);
        load(pc.attributes['return number'], 1, 3);
        expect(colorOptions(pc).map(o => o.name)).toEqual(['rgba', 'elevation', 'intensity', 'classification', 'return number']);
    });

    it('always keeps the current colouring, in its place', () => {
        expect(colorOptions(copcCloud(6), 'classification').map(o => o.name)).toEqual(['elevation', 'classification']);
        expect(colorOptions(copcCloud(6), 'rgba').map(o => o.name)).toEqual(['rgba', 'elevation']);
    });

    it('has a range signature that changes when a node widens a range, and not otherwise', () => {
        const pc = copcCloud(7);
        const before = rangeSignature(pc);
        expect(rangeSignature(pc)).toBe(before);
        load(pc.attributes.intensity, 10, 20);
        expect(rangeSignature(pc)).not.toBe(before);
    });

    it('sets the attribute of the material', () => {
        const pc = cloud();
        expect(setColorBy(pc, 'intensity', null)).toBe(true);
        expect(pc.material.activeAttributeName).toBe('intensity');
    });

    it('refuses a name that is not a colouring of the toolbar', () => {
        const pc = cloud();
        expect(setColorBy(pc, 'position', null)).toBe(false);
        expect(pc.material.activeAttributeName).toBe('rgba');
    });

    it('lets the menu panel show the controls of the attribute (its own change of the select) when the panel is built', () => {
        const change = vi.fn();
        const jquery = vi.fn(() => ({ length: 1, selectmenu: vi.fn(() => ({ options: { change } })) }));
        setColorBy(cloud(), 'elevation', jquery);
        expect(jquery).toHaveBeenCalledWith('#optMaterial');
        expect(change).toHaveBeenCalledTimes(1);
    });

    it('works with no menu panel (nothing is built yet)', () => {
        const pc = cloud();
        expect(setColorBy(pc, 'elevation', () => ({ length: 0 }))).toBe(true);
        expect(pc.material.activeAttributeName).toBe('elevation');
    });
});
