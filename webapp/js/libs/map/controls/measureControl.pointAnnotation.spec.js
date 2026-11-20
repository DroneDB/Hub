/**
 * A point annotation has one popup, with its edit, copy and delete buttons, whether the point was drawn or read
 * from a saved file, and after its annotation is edited, the point moved or the move undone. The callouts toggle
 * shows these popups always (the default) or only while their point is hovered or tapped; the labels of the other
 * measurements show on hover either way.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import { fromLonLat } from 'ol/proj';
import MeasureControls from './measureControl';
import MeasurementPropertiesDialog from '@/components/measurements/MeasurementPropertiesDialog.vue';
import { PREF, getPref, setPref, _resetPrefListenersForTests } from '@/libs/preferences';
import { readSource, ruleOf } from '@/specs/cssSource';

let control;
let map;
/** The props of the dialogs the control opened, the last one last */
let dialogs;

beforeEach(() => {
    _resetPrefListenersForTests();
    localStorage.clear();
    dialogs = [];
    control = new MeasureControls({
        openDialog: (component, props) => { dialogs.push({ ...props, component }); return { close: vi.fn() }; },
        getGroups: () => [{ id: 'g1', name: 'North' }]
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target, view: new View({ center: [0, 0], zoom: 10 }) });
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
});

const SAVED_POINT = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [31.136198, -23.939526] },
    properties: { measurementType: 'point', stroke: '#ffc107', latitude: -23.939526, longitude: 31.136198 }
};
const LINE = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[31.1361, -23.9395], [31.1371, -23.9395]] },
    properties: { measurementType: 'length' }
};

/** The popups of the points on the map */
const popups = () => map.getOverlays().getArray().map(o => o.getElement()).filter(el => el.classList.contains('ol-point-popup'));
const button = (popup, action) => /** @type {HTMLElement} */ (popup.querySelector(`.ol-point-popup-${action}`));
const importSaved = (...features) => control.importFromGeoJSON({ type: 'FeatureCollection', features }).features;

describe('the popup of a saved point annotation', () => {
    it('edited from its own button: the point keeps one popup, which shows the description and keeps its buttons', () => {
        const [point] = importSaved(SAVED_POINT);
        expect(popups()).toHaveLength(1);

        button(popups()[0], 'edit').click();
        dialogs.at(-1).onSave({ name: '', stroke: '#ff0000', description: 'Ciao', groupId: '' });

        expect(popups()).toHaveLength(1);
        const [popup] = popups();
        expect(popup.textContent).toContain('Ciao');
        for (const action of ['edit', 'copy', 'delete']) expect(button(popup, action)).not.toBeNull();
        expect(point.get('description')).toBe('Ciao');
        expect(point.get('stroke')).toBe('#ff0000');
    });

    it('edited a second time from the new popup, the dialog edits the same point', () => {
        const [point] = importSaved(SAVED_POINT);
        button(popups()[0], 'edit').click();
        dialogs.at(-1).onSave({ name: '', stroke: '#ffc107', description: 'first', groupId: '' });
        button(popups()[0], 'edit').click();
        expect(dialogs.at(-1).feature.get('description')).toBe('first');
        dialogs.at(-1).onSave({ name: '', stroke: '#ffc107', description: 'second', groupId: '' });
        expect(popups()).toHaveLength(1);
        expect(popups()[0].textContent).toContain('second');
        expect(point.get('description')).toBe('second');
    });

    it('deleted from its button: the point and its popup leave the map', () => {
        importSaved(SAVED_POINT);
        button(popups()[0], 'delete').click();
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(popups()).toHaveLength(0);
    });

    it('keeps its buttons when the point is moved and the move undone', () => {
        const [point] = importSaved(SAVED_POINT);
        control.saveToUndoStack(point);
        point.getGeometry().setCoordinates(fromLonLat([31.14, -23.94]));
        control.showPointPopup(point);
        expect(popups()).toHaveLength(1);
        expect(popups()[0].textContent).toContain('-23.940000, 31.140000');

        control.undo();

        expect(popups()).toHaveLength(1);
        expect(popups()[0].textContent).toContain('-23.939526, 31.136198');
        expect(button(popups()[0], 'edit')).not.toBeNull();
    });
});

describe('the popup of a drawn point annotation', () => {
    const drawn = () => {
        const point = new Feature({ geometry: new Point(fromLonLat([9, 45])), measurementType: 'point' });
        control.source.addFeature(point);
        control.openPropertiesDialog(point, { isNew: true });
        return point;
    };

    it('has the buttons of a saved one once its annotation is saved', () => {
        drawn();
        dialogs.at(-1).onSave({ name: '', stroke: '#ffc107', description: 'Gate', groupId: '' });
        expect(popups()).toHaveLength(1);
        expect(popups()[0].textContent).toContain('Gate');
        for (const action of ['edit', 'copy', 'delete']) expect(button(popups()[0], action)).not.toBeNull();
    });

    it('is not shown when its annotation is discarded: the point is removed', () => {
        drawn();
        dialogs.at(-1).onDiscard();
        expect(control.source.getFeatures()).toHaveLength(0);
        expect(popups()).toHaveLength(0);
    });
});

describe('hovering a measurement', () => {
    it('leaves the popup of a point on show after the pointer leaves it', () => {
        const [point] = importSaved(SAVED_POINT);
        control._setHoveredFeature(point);
        control._setHoveredFeature(null);
        expect(popups()[0].classList.contains('ol-tooltip-hidden')).toBe(false);
    });

    it('still shows the label of another measurement only while it is hovered', () => {
        const [line] = importSaved(LINE);
        const label = line.get('measureTooltipElement');
        expect(label.classList.contains('ol-tooltip-hidden')).toBe(true);
        control._setHoveredFeature(line);
        expect(label.classList.contains('ol-tooltip-hidden')).toBe(false);
        control._setHoveredFeature(null);
        expect(label.classList.contains('ol-tooltip-hidden')).toBe(true);
    });
});

describe('the callouts toggle', () => {
    const toggle = () => control.btnCallouts;
    const onHover = () => map.getViewport().classList.contains('ol-point-callouts-hover');
    // Shown: always, or (on hover) with the class the CSS shows it by (the rule is checked below)
    const shown = popup => !onHover() || popup.classList.contains('ol-point-popup-shown');

    it('hides, on hover, the popups of the points that are not hovered: a rule of the map CSS', () => {
        const css = readSource(__dirname, '../../../../css/ol-controls.css');
        expect(ruleOf(css, '.ol-point-callouts-hover .ol-point-popup:not(.ol-point-popup-shown)')).toMatch(/display:\s*none/);
    });

    it('is shown while the map has a point annotation, pressed: callouts always shown', () => {
        importSaved(LINE);
        expect(toggle().style.display).toBe('none');
        importSaved(SAVED_POINT);
        expect(toggle().style.display).toBe('block');
        expect(toggle().getAttribute('aria-pressed')).toBe('true');
        expect(toggle().classList.contains('active')).toBe(true);
        expect(onHover()).toBe(false);
    });

    it('switches to callouts on hover and back, and keeps the choice as the preference', () => {
        importSaved(SAVED_POINT);
        toggle().click();
        expect(onHover()).toBe(true);
        expect(toggle().getAttribute('aria-pressed')).toBe('false');
        expect(toggle().title).toMatch(/Click to always show them/);
        expect(getPref(PREF.SHOW_POINT_CALLOUTS, true)).toBe(false);
        toggle().click();
        expect(onHover()).toBe(false);
        expect(getPref(PREF.SHOW_POINT_CALLOUTS, false)).toBe(true);
    });

    it('starts on hover when the user chose it, and follows a change of the preference made elsewhere', () => {
        control.setMap(null);
        setPref(PREF.SHOW_POINT_CALLOUTS, false);
        control = new MeasureControls({ openDialog: () => ({ close: vi.fn() }) });
        control.setMap(map);
        expect(onHover()).toBe(true);
        expect(control.btnCallouts.getAttribute('aria-pressed')).toBe('false');
        setPref(PREF.SHOW_POINT_CALLOUTS, true);
        expect(onHover()).toBe(false);
        expect(control.btnCallouts.getAttribute('aria-pressed')).toBe('true');
    });

    it('on hover: a callout shows while its point is hovered, and the labels of the other measurements as before', () => {
        const [point, line] = importSaved(SAVED_POINT, LINE);
        toggle().click();
        const [popup] = popups();
        expect(shown(popup)).toBe(false);
        control._setHoveredFeature(point);
        expect(shown(popup)).toBe(true);
        control._setHoveredFeature(line);
        expect(shown(popup)).toBe(false);
        expect(line.get('measureTooltipElement').classList.contains('ol-tooltip-hidden')).toBe(false);
        control._setHoveredFeature(null);
        expect(line.get('measureTooltipElement').classList.contains('ol-tooltip-hidden')).toBe(true);
    });

    it('on hover: the callout stays on show while the pointer moves from its point onto it, and goes when it leaves', () => {
        const [point] = importSaved(SAVED_POINT);
        toggle().click();
        const at = vi.spyOn(control, '_measurementAt').mockReturnValue(point);
        const move = target => map.dispatchEvent({ type: 'pointermove', pixel: [10, 10], dragging: false, originalEvent: { target } });
        move(map.getViewport());
        const [popup] = popups();
        expect(shown(popup)).toBe(true);
        // Over the popup there is no measurement under the pointer, but the popup is the hovered point's
        at.mockReturnValue(null);
        move(button(popup, 'edit'));
        expect(shown(popup)).toBe(true);
        move(map.getViewport());
        expect(shown(popup)).toBe(false);
    });

    it('a pointer on a callout hovers its point, not the measurement under the callout', () => {
        const [point, line] = importSaved(SAVED_POINT, LINE);
        vi.spyOn(control, '_measurementAt').mockReturnValue(line);
        map.dispatchEvent({ type: 'pointermove', pixel: [10, 10], dragging: false, originalEvent: { target: button(popups()[0], 'copy') } });
        expect(control._hoveredFeature).toBe(point);
        map.dispatchEvent({ type: 'pointermove', pixel: [10, 10], dragging: false, originalEvent: { target: map.getViewport() } });
        expect(control._hoveredFeature).toBe(line);
    });

    it('on hover: a tap on a point shows its callout, and a tap elsewhere hides it (a touch screen has no hover)', () => {
        const [point] = importSaved(SAVED_POINT);
        toggle().click();
        const at = vi.spyOn(control, '_measurementAt').mockReturnValue(point);
        map.dispatchEvent({ type: 'singleclick', pixel: [10, 10] });
        expect(shown(popups()[0])).toBe(true);
        at.mockReturnValue(null);
        map.dispatchEvent({ type: 'singleclick', pixel: [200, 200] });
        expect(shown(popups()[0])).toBe(false);
    });

    it('on hover: the callout of the point being edited stays on show after its annotation is saved', () => {
        const [point] = importSaved(SAVED_POINT);
        toggle().click();
        control._setHoveredFeature(point);
        button(popups()[0], 'edit').click();
        dialogs.at(-1).onSave({ name: '', stroke: '#ffc107', description: 'Ciao', groupId: '' });
        expect(popups()).toHaveLength(1);
        expect(shown(popups()[0])).toBe(true);
    });

    it('leaves the map showing every popup once the control is off it', () => {
        importSaved(SAVED_POINT);
        toggle().click();
        control.setMap(null);
        expect(onHover()).toBe(false);
    });
});

describe('the properties dialog of a point', () => {
    it('keeps the popup of the point, with its buttons, when its name is saved', () => {
        const [point] = importSaved(SAVED_POINT);
        control.openPropertiesDialog(point);
        dialogs.at(-1).onSave({ name: 'Gate' });
        expect(popups()).toHaveLength(1);
        expect(popups()[0].textContent).toContain('Gate');
        for (const action of ['edit', 'copy', 'delete']) expect(button(popups()[0], action)).not.toBeNull();
    });
});

describe('the dialog of a point annotation', () => {
    const opened = () => dialogs.at(-1);

    it('is the properties dialog, with Delete and the groups, from the edit button and from a double click alike', () => {
        const [point] = importSaved(SAVED_POINT);
        button(popups()[0], 'edit').click();
        const fromButton = opened();
        vi.spyOn(control, '_measurementAt').mockReturnValue(point);
        map.dispatchEvent({ type: 'dblclick', pixel: [10, 10], stopPropagation: () => {}, preventDefault: () => {} });
        const fromDoubleClick = opened();
        for (const props of [fromButton, fromDoubleClick]) {
            expect(props.component).toBe(MeasurementPropertiesDialog);
            expect(props.feature).toBe(point);
            expect(props.geometryType).toBe('Point');
            expect(props.showDelete).toBe(true);
            expect(props.isNew).toBe(false);
            expect(props.groups).toEqual([{ id: 'g1', name: 'North' }]);
        }
    });

    it('is the same dialog for a point just placed, as a new one; Save adds its callout, Discard removes it', () => {
        const placed = () => {
            const point = new Feature({ geometry: new Point(fromLonLat([9, 45])), measurementType: 'point' });
            control.source.addFeature(point);
            control.openPropertiesDialog(point, { isNew: true });
            return point;
        };
        placed();
        expect(opened().component).toBe(MeasurementPropertiesDialog);
        expect(opened().isNew).toBe(true);
        opened().onSave({ name: 'Gate', description: '', stroke: '#ffc107', groupId: 'g1' });
        expect(popups()).toHaveLength(1);
        expect(control.source.getFeatures()[0].get('groupId')).toBe('g1');
        expect(control.btnCallouts.style.display).toBe('block');

        placed();
        opened().onDiscard();
        expect(control.source.getFeatures()).toHaveLength(1);
    });

    it('takes a point out of its group when it is saved with none', () => {
        const [point] = importSaved({ ...SAVED_POINT, properties: { ...SAVED_POINT.properties, groupId: 'g1' } });
        control.openPropertiesDialog(point);
        opened().onSave({ name: '', description: '', stroke: '#ffc107', groupId: '' });
        expect(point.get('groupId')).toBeUndefined();
    });
});

describe('the move handle of a point annotation', () => {
    beforeEach(() => {
        // happy-dom has no pointer capture, and the map is not rendered: the map coordinate of a pointer is its client position
        Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false });
        vi.spyOn(map, 'getEventCoordinate').mockImplementation(e => [e.clientX, e.clientY]);
    });
    afterEach(() => {
        delete HTMLElement.prototype.setPointerCapture;
        delete HTMLElement.prototype.releasePointerCapture;
        delete HTMLElement.prototype.hasPointerCapture;
    });

    const drag = (dx, dy) => {
        const handle = button(popups()[0], 'move');
        const pointer = (type, x, y) => handle.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, cancelable: true }));
        pointer('pointerdown', 0, 0);
        pointer('pointermove', dx, dy);
        pointer('pointerup', dx, dy);
    };

    it('moves the point, and its one popup, with its buttons, shows its new coordinates', () => {
        const [point] = importSaved(SAVED_POINT);
        control.markSaved();
        expect(control.isDirty()).toBe(false);
        const from = point.getGeometry().getCoordinates();
        const to = fromLonLat([31.14, -23.94]);
        drag(to[0] - from[0], to[1] - from[1]);
        expect(point.getGeometry().getCoordinates()).toEqual(to);
        expect(popups()).toHaveLength(1);
        expect(popups()[0].textContent).toContain('-23.940000, 31.140000');
        for (const action of ['move', 'edit', 'copy', 'delete']) expect(button(popups()[0], action)).not.toBeNull();
        expect(control.isDirty()).toBe(true);
    });

    it('in edit mode, Ctrl+Z puts the point back; outside it, the move is not on the undo stack', () => {
        const [point] = importSaved(SAVED_POINT);
        const from = point.getGeometry().getCoordinates();
        drag(500, 0);
        expect(control.undoStack.undo()).toBeFalsy();

        control.enableEditMode(map);
        drag(500, 0);
        expect(point.getGeometry().getCoordinates()).toEqual([from[0] + 1000, from[1]]);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
        expect(point.getGeometry().getCoordinates()).toEqual([from[0] + 500, from[1]]);
        expect(popups()).toHaveLength(1);
        control.disableEditMode();
    });
});

describe('coordinates typed in the dialog of a point', () => {
    it('move the point and its popup, and the map is centred on it when it is out of view', () => {
        const [point] = importSaved(SAVED_POINT);
        map.setSize([800, 600]);
        map.getView().setCenter(point.getGeometry().getCoordinates());
        map.getView().setZoom(15);
        const animate = vi.spyOn(map.getView(), 'animate').mockImplementation(() => {});
        control.openPropertiesDialog(point);
        dialogs.at(-1).onSave({ name: '', description: '', stroke: '#ffc107', groupId: '', coordinates: [9.25, 45.5] });
        expect(point.getGeometry().getCoordinates()).toEqual(fromLonLat([9.25, 45.5]));
        expect(popups()).toHaveLength(1);
        expect(button(popups()[0], 'copy').title).toBe('Copy coordinates: 45.500000, 9.250000');
        expect(animate).toHaveBeenCalledWith(expect.objectContaining({ center: fromLonLat([9.25, 45.5]) }));
    });

    it('leave the view where it is for a point that stays in view, and are undone by Ctrl+Z in edit mode', () => {
        const [point] = importSaved(SAVED_POINT);
        const from = point.getGeometry().getCoordinates();
        map.setSize([800, 600]);
        map.getView().setCenter(from);
        map.getView().setZoom(10);
        const animate = vi.spyOn(map.getView(), 'animate').mockImplementation(() => {});
        control.enableEditMode(map);
        control.openPropertiesDialog(point);
        dialogs.at(-1).onSave({ name: '', description: '', stroke: '#ffc107', groupId: '', coordinates: [31.14, -23.94] });
        expect(animate).not.toHaveBeenCalled();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
        expect(point.getGeometry().getCoordinates()).toEqual(from);
        control.disableEditMode();
    });
});
