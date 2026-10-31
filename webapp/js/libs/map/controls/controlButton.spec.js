/**
 * The map controls name their icon buttons and their groups, so assistive technology and
 * selectors find them by name instead of by tooltip or class.
 */
import { describe, it, expect } from 'vitest';
import { controlButton, controlGroup } from './controlButton';
import MeasureControls from './measureControl';
import SelectionControl from './selectionControl';
import SettingsControl from './settingsControl';

describe('controlButton', () => {
    it('is a named button with its name first in the tooltip and a decorative icon', () => {
        const btn = controlButton('Measure Length', 'Click on the map.', '/images/measure-length.svg');
        expect(btn.type).toBe('button');
        expect(btn.getAttribute('aria-label')).toBe('Measure Length');
        expect(btn.title).toBe('Measure Length - Click on the map.');
        expect(btn.querySelector('img').getAttribute('alt')).toBe('');
    });

    it('has no icon when none is given', () => {
        expect(controlButton('List', 'All of them.').innerHTML).toBe('');
    });
});

describe('controlGroup', () => {
    it('is a named group inside an OpenLayers control box', () => {
        const group = controlGroup('Measure Tools', 'ol-selection');
        expect(group.getAttribute('role')).toBe('group');
        expect(group.getAttribute('aria-label')).toBe('Measure Tools');
        expect(group.className).toBe('ol-selection ol-control');
        expect(controlGroup('Tools').className).toBe('ol-control');
    });
});

describe('map controls', () => {
    const unnamed = el => [...el.querySelectorAll('button')].filter(b => !b.getAttribute('aria-label'));

    it('have no button without a name', () => {
        for (const control of [new MeasureControls({}), new SelectionControl({}), new SettingsControl({})]) {
            expect(control.element.querySelectorAll('button').length).toBeGreaterThan(0);
            expect(unnamed(control.element)).toEqual([]);
        }
    });

    it('name the measure toolbars', () => {
        const el = new MeasureControls({}).element;
        expect(el.querySelector('[aria-label="Measure Tools"] [aria-label="Measure Length"]')).not.toBeNull();
        expect(el.querySelector('[aria-label="Manage Measurements"] [aria-label="Save Measurements"]')).not.toBeNull();
    });
});
