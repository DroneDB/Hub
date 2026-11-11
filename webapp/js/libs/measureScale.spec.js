import { describe, it, expect } from 'vitest';
import { measureLabelPx, measureLabelFactor, MEASURE_LINE_PX } from './measureScale';

describe('measurement label and line sizes (FR-VWR-37)', () => {
    it('the label is the canvas height / 90 px, from 12 to 18', () => {
        expect(measureLabelPx(1080)).toBe(12);
        expect(measureLabelPx(400)).toBe(12);
        expect(measureLabelPx(1440)).toBe(16);
        expect(measureLabelPx(1620)).toBe(18);
        expect(measureLabelPx(2104)).toBe(18);
        expect(measureLabelPx(0)).toBe(12);
        expect(measureLabelPx(undefined)).toBe(12);
    });

    it('a Potree label is 1 at 1080 px high and 1.5 times larger from 1620 px', () => {
        expect(measureLabelFactor(1080)).toBe(1);
        expect(measureLabelFactor(1440)).toBeCloseTo(16 / 12, 10);
        expect(measureLabelFactor(2104)).toBe(1.5);
    });

    it('lines are 3 px', () => {
        expect(MEASURE_LINE_PX).toBe(3);
    });
});
