import { describe, it, expect, vi } from 'vitest';
import { MeasureTool } from './measureTool';

describe('3D viewer measure tool', () => {
    it('writes the labels of its shapes again when asked (a change of units)', () => {
        const instance = { notifyChange: vi.fn() };
        const tool = new MeasureTool({ instance, mercatorScale: 1 }, () => {});
        const shapes = [{ rebuildLabels: vi.fn() }, { rebuildLabels: vi.fn() }];
        tool.shapes.push(...shapes);
        tool.relabel();
        shapes.forEach(s => expect(s.rebuildLabels).toHaveBeenCalledTimes(1));
        expect(instance.notifyChange).toHaveBeenCalled();
    });

    it('does nothing without a scene', () => {
        const tool = new MeasureTool({ instance: null, mercatorScale: 1 }, () => {});
        expect(() => tool.relabel()).not.toThrow();
    });
});
