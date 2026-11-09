import { describe, it, expect } from 'vitest';
import { drawingHint } from './measureHints';

describe('drawingHint (the one hint text of every measuring tool, D-027)', () => {
    it('says how to finish and cancel a line and an area', () => {
        expect(drawingHint('line')).toBe('Click the points of the line. Double-click, right-click or Enter finishes; Esc cancels.');
        expect(drawingHint('area')).toBe('Click the corners of the area (3 or more). Double-click, right-click or Enter finishes; Esc cancels.');
    });

    it('says how to place a point, a box and a height', () => {
        expect(drawingHint('point')).toBe('Click to place the point. Esc cancels.');
        expect(drawingHint('box')).toBe('Click two opposite corners of the rectangle. Esc cancels.');
        expect(drawingHint('height')).toBe('Click two points: the height is the difference along the up. Esc cancels.');
        // A measure the toolbar has no button for (the point cloud's angle, circle, azimuth)
        expect(drawingHint('measure')).toBe('Click the points of the measure. Double-click, right-click or Enter finishes; Esc cancels.');
    });

    it('adds the keyboard crosshair where the tool has one', () => {
        expect(drawingHint('line', { crosshair: true })).toBe('Click the points of the line. Double-click, right-click or Enter finishes; Esc cancels. Space adds the point at the crosshair.');
        expect(drawingHint('pick', { crosshair: true })).toBe('Click a place on the map. Esc cancels. Space adds the point at the crosshair.');
    });
});
