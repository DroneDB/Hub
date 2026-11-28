/**
 * logoCheck: the type and the size of a logo file, with the limit the caller gives (an organization logo and a
 * report-template logo have their own).
 */
import { describe, it, expect } from 'vitest';
import { LOGO_TYPES, logoProblem } from './logoCheck';

describe('logoProblem', () => {
    it('accepts PNG, JPEG, WebP and SVG up to the limit', () => {
        for (const type of LOGO_TYPES) expect(logoProblem({ type, size: 1000 }, 2000)).toBeNull();
        expect(logoProblem({ type: 'image/png', size: 2000 }, 2000)).toBeNull();
    });

    it('names the limit it was given', () => {
        expect(logoProblem({ type: 'image/png', size: 256 * 1024 + 1 }, 256 * 1024)).toBe('The logo is at most 256 KB');
        expect(logoProblem({ type: 'image/png', size: 512 * 1024 + 1 }, 512 * 1024)).toBe('The logo is at most 512 KB');
        expect(logoProblem({ type: 'image/png', size: 300 * 1024 }, 512 * 1024)).toBeNull();
    });

    it('refuses another type, whatever its size', () => {
        expect(logoProblem({ type: 'image/gif', size: 10 }, 2000)).toBe('The logo is a PNG, JPEG, WebP or SVG image');
        expect(logoProblem({ size: 10 }, 2000)).toBe('The logo is a PNG, JPEG, WebP or SVG image');
    });

    it('asks for an image when there is no file', () => {
        expect(logoProblem(null, 2000)).toBe('Choose an image');
        expect(logoProblem(undefined, 2000)).toBe('Choose an image');
    });
});
