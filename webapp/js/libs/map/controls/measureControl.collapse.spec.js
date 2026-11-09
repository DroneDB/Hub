/**
 * The measure tools of a compact map (a phone, a small embed frame) sit behind one 'Measure' toggle in the rail
 * (FR-MAP-12, FR-SHR-05). Whether the toggle is shown and the tools hidden is the CSS under `.is-compact` (see
 * mapOverlayLayout.spec); here: what the control puts in the rail, and how the toggle opens and closes the tools.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import OlMap from 'ol/Map';
import Draw from 'ol/interaction/Draw';
import MeasureControls from './measureControl';

let control;
let map;
beforeEach(() => {
    control = new MeasureControls({});
    const target = document.createElement('div');
    document.body.appendChild(target);
    map = new OlMap({ target });
    control.setMap(map);
});
afterEach(() => {
    control.setMap(null);
    map.setTarget(undefined);
});

const toggleGroup = () => control.element.querySelector('.ol-measure-toggle');
const toggle = () => toggleGroup().querySelector('button');
const groupLabels = () => [...control.element.children].map(el => el.getAttribute('aria-label'));

describe('the Measure toggle of the measure control', () => {
    it('is the first group of the control, one button named Measure, closed', () => {
        expect(groupLabels()).toEqual(['Measure', 'Measure Tools', 'Manage Measurements']);
        expect(toggleGroup().querySelectorAll('button')).toHaveLength(1);
        expect(toggle().getAttribute('aria-label')).toBe('Measure');
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(control.element.classList.contains('is-open')).toBe(false);
    });

    it('opens the tools on a press and closes them on the next', () => {
        toggle().click();
        expect(control.element.classList.contains('is-open')).toBe(true);
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(toggle().classList.contains('active')).toBe(true);
        toggle().click();
        expect(control.element.classList.contains('is-open')).toBe(false);
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(toggle().classList.contains('active')).toBe(false);
    });

    it('opens the tools when a tool is started from code, so Stop is in reach', () => {
        control.onSelect('length');
        expect(control.element.classList.contains('is-open')).toBe(true);
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('ends the tool in use when the tools are closed, so taps no longer add points behind them', () => {
        const deselected = [];
        control.onToolDeselected = () => deselected.push(true);
        control.onSelect('point');
        expect(control.draw).not.toBeNull();
        toggle().click();
        expect(control.selectedTool).toBeNull();
        expect(control.draw).toBeNull();
        expect(map.getInteractions().getArray().some(i => i instanceof Draw)).toBe(false);
        expect(control.btnStop.style.display).toBe('none');
        expect(deselected).toHaveLength(1);
        expect(control.element.classList.contains('is-open')).toBe(false);
        expect(toggle().classList.contains('active')).toBe(false);
    });

    it('ends edit mode when the tools are closed, and opens them when edit mode starts', () => {
        control.enableEditMode(map);
        expect(control.element.classList.contains('is-open')).toBe(true);
        expect(toggle().classList.contains('active')).toBe(true);
        toggle().click();
        expect(control.isEditMode).toBe(false);
        expect(control.modifyInteraction).toBeNull();
        expect(control.element.classList.contains('is-open')).toBe(false);
        expect(toggle().classList.contains('active')).toBe(false);
    });

    it('looks pressed while a tool is in use, even when the tools were closed from code', () => {
        control.onSelect('length');
        control.setToolsOpen(false);
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(toggle().classList.contains('active')).toBe(true);
        control.deselectCurrent();
        expect(toggle().classList.contains('active')).toBe(false);
    });

    it('keeps the tools open after the tool in use is stopped (Stop): only the toggle closes them', () => {
        toggle().click();
        control.onSelect('area');
        control.handleStop();
        expect(control.selectedTool).toBeNull();
        expect(control.element.classList.contains('is-open')).toBe(true);
        expect(toggle().classList.contains('active')).toBe(true);
    });

    it('keeps the tools of the toolbar as they were: the same buttons, in the same groups', () => {
        const names = group => [...control.element.querySelectorAll(`[aria-label="${group}"] button`)].map(b => b.getAttribute('aria-label'));
        expect(names('Measure Tools')).toEqual([
            'Point Annotation', 'Measure Length', 'Measure Area', 'Erase Measurement', 'Edit/Move Measurements', 'Stop Measuring'
        ]);
        expect(names('Manage Measurements')).toEqual([
            'Measurement List', 'Save Measurements', 'Clear All Measurements', 'Export Measurements as GeoJSON',
            'Export Measurements as CSV', 'Delete Saved Measurements'
        ]);
    });
});
