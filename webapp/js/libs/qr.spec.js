import { describe, it, expect } from 'vitest';
import { qrCode, qrSvg, QUIET_ZONE } from '@/libs/qr';

/** The dark modules of a code as a set of "row,column", read back from the path. */
function modulesOf(code) {
    const dark = new Set();
    for (const [, x, y, w] of code.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
        for (let i = 0; i < Number(w); i++) dark.add(`${Number(y) - QUIET_ZONE},${Number(x) - QUIET_ZONE + i}`);
    }
    return dark;
}

describe('qrCode', () => {
    it('is a square of modules with a quiet zone of 4 on each side', () => {
        const code = qrCode('https://hub.example/r/acme/site/reports/r_k3x9q2m7#item-abc');
        const count = code.size - 2 * QUIET_ZONE;
        // a version 1 to 40 symbol: 21 + 4 * (version - 1) modules a side
        expect((count - 21) % 4).toBe(0);
        expect(count).toBeGreaterThanOrEqual(21);
        expect(code.path).toMatch(/^M/);
    });

    it('has the finder patterns of a QR code in three corners and not in the fourth', () => {
        const code = qrCode('https://hub.example/x');
        const count = code.size - 2 * QUIET_ZONE;
        const dark = modulesOf(code);
        // the 7 x 7 finder: a dark ring, a light ring, a 3 x 3 dark centre
        const finder = (row, column) => {
            for (let i = 0; i < 7; i++) {
                for (let j = 0; j < 7; j++) {
                    const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
                    const wantsDark = ring !== 2;
                    if (dark.has(`${row + i},${column + j}`) !== wantsDark) return false;
                }
            }
            return true;
        };
        expect(finder(0, 0)).toBe(true);
        expect(finder(0, count - 7)).toBe(true);
        expect(finder(count - 7, 0)).toBe(true);
        expect(finder(count - 7, count - 7)).toBe(false);
    });

    it('is the same for the same text, and a different one for another', () => {
        expect(qrCode('https://hub.example/a')).toEqual(qrCode('https://hub.example/a'));
        expect(qrCode('https://hub.example/a').path).not.toBe(qrCode('https://hub.example/b').path);
    });

    it('encodes an address with characters of a name in ASCII (percent-encoded)', () => {
        expect(() => qrCode('https://hub.example/r/acme/site/reports/r_1#item-é中')).not.toThrow();
        expect(qrCode('https://hub.example/é').path).toBe(qrCode('https://hub.example/%C3%A9').path);
    });

    it('keeps a text that is not an address', () => {
        expect(() => qrCode('not an address')).not.toThrow();
    });
});

describe('qrSvg', () => {
    it('is the path in a viewBox of the code size, declaring the pixels asked for', () => {
        const code = qrCode('https://hub.example/a');
        const svg = qrSvg(code, 90);
        expect(svg).toContain(`viewBox="0 0 ${code.size} ${code.size}"`);
        expect(svg).toContain('width="90" height="90"');
        expect(svg).toContain(`d="${code.path}"`);
    });
});
