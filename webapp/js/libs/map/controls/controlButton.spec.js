/**
 * The map controls name their icon buttons and their groups, so assistive technology and
 * selectors find them by name instead of by tooltip or class.
 */
import { describe, it, expect } from 'vitest';
import { controlButton, controlGroup, iconElement } from './controlButton';
import MeasureControls from './measureControl';
import SelectionControl from './selectionControl';
import SettingsControl from './settingsControl';
import { defaultMapControls } from './defaultControls';
import * as icons from '@/libs/glyphs';

describe('controlButton', () => {
    it('is a named button with its name first in the tooltip and a decorative icon', () => {
        const btn = controlButton('Measure Length', 'Click on the map.', icons.LENGTH_ICON);
        expect(btn.type).toBe('button');
        expect(btn.getAttribute('aria-label')).toBe('Measure Length');
        expect(btn.title).toBe('Measure Length - Click on the map.');
        expect(btn.innerHTML).toBe('<i class="fa-solid fa-ruler" aria-hidden="true"></i>');
    });

    it('draws its icon as a glyph of the set, not as an image file, which has a size and a colour of its own', () => {
        const btn = controlButton('Measure Area', 'Click on the map.', icons.AREA_ICON);
        expect(btn.querySelector('img')).toBeNull();
        expect(btn.querySelector('i').className).toBe('ddb-icon ddb-icon-area');
        expect(iconElement(icons.AREA_ICON).getAttribute('aria-hidden')).toBe('true');
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

    // The glyph of each button of the map controls, by the name of the button
    const glyphs = el => Object.fromEntries([...el.querySelectorAll('button')].map(b => [b.getAttribute('aria-label'), b.innerHTML]));
    const glyph = icon => `<i class="${icon}" aria-hidden="true"></i>`;

    it('give every measure button one glyph of the set: no image, no two alike', () => {
        const shown = glyphs(new MeasureControls({}).element);
        expect(shown).toEqual({
            'Measure': glyph(icons.MEASURE_ICON),
            'Point Annotation': glyph(icons.POINT_ICON),
            'Measure Length': glyph(icons.LENGTH_ICON),
            'Measure Area': glyph(icons.AREA_ICON),
            'Erase Measurement': glyph(icons.ERASE_ICON),
            'Edit/Move Measurements': glyph(icons.EDIT_VERTICES_ICON),
            'Stop Measuring': glyph(icons.STOP_ICON),
            'Measurement List': glyph(icons.MEASUREMENT_LIST_ICON),
            'Always Show Point Callouts': glyph(icons.CALLOUTS_ICON),
            'Save Measurements': glyph(icons.SAVE_ICON),
            'Clear All Measurements': glyph(icons.CLEAR_ALL_ICON),
            'Export Measurements as GeoJSON': glyph(icons.EXPORT_GEOJSON_ICON),
            'Export Measurements as CSV': glyph(icons.EXPORT_CSV_ICON),
            'Delete Saved Measurements': glyph(icons.DELETE_ICON)
        });
        expect(new Set(Object.values(shown)).size).toBe(Object.keys(shown).length);
    });

    it('give the selection and the settings buttons their glyph', () => {
        expect(glyphs(new SelectionControl({}).element)).toEqual({
            'Rectangle Selection': glyph(icons.SELECT_RECTANGLE_ICON),
            'Polygon Selection': glyph(icons.SELECT_POLYGON_ICON),
            'Clear Selection': glyph(icons.CLEAR_SELECTION_ICON)
        });
        expect(glyphs(new SettingsControl({}).element)).toEqual({ 'Map Settings': glyph(icons.SETTINGS_ICON) });
    });

    it('draw the buttons of OpenLayers (zoom, north, attribution) with glyphs of the set, not characters of the page font', () => {
        const controls = defaultMapControls().getArray();
        const buttons = controls.flatMap(control => [...control.element.querySelectorAll('button')]);
        const shown = () => Object.fromEntries(buttons.map(b => [b.className.split(' ')[0] || b.title, b.querySelector('i')?.className]));
        expect(shown()).toEqual({
            'ol-zoom-in': icons.ZOOM_IN_ICON,
            'ol-zoom-out': icons.ZOOM_OUT_ICON,
            'ol-rotate-reset': `${icons.NORTH_ICON} ol-compass`,
            'Attributions': icons.ATTRIBUTION_ICON
        });
        expect(buttons.map(b => b.textContent.trim())).toEqual(['', '', '', '']);
        // The open attribution closes with its own glyph
        controls.find(control => typeof control.setCollapsed === 'function').setCollapsed(false);
        expect(shown().Attributions).toBe(icons.COLLAPSE_ICON);
    });

    it('name the measure toolbars', () => {
        const el = new MeasureControls({}).element;
        expect(el.querySelector('[aria-label="Measure Tools"] [aria-label="Measure Length"]')).not.toBeNull();
        expect(el.querySelector('[aria-label="Manage Measurements"] [aria-label="Save Measurements"]')).not.toBeNull();
    });
});
