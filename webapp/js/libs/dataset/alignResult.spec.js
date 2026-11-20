import { describe, it, expect } from 'vitest';
import { formatAlignResult } from './alignResult';

describe('formatAlignResult', () => {
    it('says every number with its precision', () => {
        expect(formatAlignResult({ tx: -3, ty: 2, thetaDeg: 0, scale: 1, confidence: 1 }))
            .toBe('tx=-3.000 m, ty=2.000 m, θ=0.000°, s=1.00000, conf=1.00');
    });

    it('does not say -0.000 for a tiny negative value', () => {
        expect(formatAlignResult({ tx: -0.0001, ty: 0.12345, thetaDeg: 1.23456, scale: 0.99999, confidence: 0.876 }))
            .toBe('tx=0.000 m, ty=0.123 m, θ=1.235°, s=0.99999, conf=0.88');
    });

    it('shows a missing number as the empty cell', () => {
        expect(formatAlignResult({ tx: 1 })).toBe('tx=1.000 m, ty=– m, θ=–°, s=–, conf=–');
    });

    it('says nothing without a result', () => {
        expect(formatAlignResult(null)).toBe('');
    });
});
