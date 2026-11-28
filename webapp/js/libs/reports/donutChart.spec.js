/**
 * The donut of a group of counts of the report summary: the slices go round the ring clockwise from twelve o'clock in
 * the order of the counts, each as wide as its count is of the group, one count is the whole ring, and the SVG the PDF
 * draws is the same ring with the number of items in the hole.
 */
import { describe, it, expect } from 'vitest';
import { DONUT_GAP, DONUT_SIZE, donutGeometry, donutSvg } from './donutChart';

const counts = [
    { key: 'low', label: 'Low', count: 2, colour: '#16a34a' },
    { key: 'medium', label: 'Medium', count: 2, colour: '#eab308' },
    { key: 'high', label: 'High', count: 5, colour: '#dc2626' },
    { key: 'critical', label: 'Critical', count: 4, colour: '#7f1d1d' },
    { key: '', label: 'Not set', count: 6, colour: '#94a3b8' }
];

const centre = DONUT_SIZE / 2;
const outer = centre - DONUT_GAP / 2;

/** The points of a path ("M x y", the end of each "A", "L x y"), in order */
function pointsOf(d) {
    const numbers = [...d.matchAll(/([MLA])([^MLAZ]*)/g)].map(([, command, args]) => [command, args.trim().split(/[\s,]+/).map(Number)]);
    return numbers.map(([command, args]) => (command === 'A' ? args.slice(5, 7) : args.slice(0, 2)));
}

/** The angle of a point, radians clockwise from twelve o'clock, in [0, 2π) */
const angleOf = ([x, y]) => (Math.atan2(x - centre, centre - y) + 2 * Math.PI) % (2 * Math.PI);
const close = (a, b) => Math.abs(a - b) < 0.01;

describe('the donut of a group of counts', () => {
    it('has a slice per count in their order, with its colour and the text a pointer over it shows', () => {
        const { slices } = donutGeometry(counts);
        expect(slices.map(s => [s.key, s.colour, s.title])).toEqual(counts.map(c => [c.key, c.colour, `${c.label}: ${c.count}`]));
    });

    it('goes round clockwise from twelve o\'clock, each slice as wide as its share, the last ending where the first starts', () => {
        const { slices } = donutGeometry(counts);
        const total = counts.reduce((sum, c) => sum + c.count, 0);
        let from = 0;
        slices.forEach((slice, index) => {
            const [start, end] = pointsOf(slice.d);
            const to = from + (counts[index].count / total) * 2 * Math.PI;
            expect(close(angleOf(start), from % (2 * Math.PI))).toBe(true);
            expect(close(angleOf(end), to % (2 * Math.PI))).toBe(true);
            // On the outer edge of the ring
            expect(Math.hypot(start[0] - centre, start[1] - centre)).toBeCloseTo(outer, 1);
            from = to;
        });
        expect(pointsOf(slices[0].d)[0]).toEqual([centre, centre - outer]);
    });

    it('draws the long way round a slice of more than half the ring', () => {
        const [big, small] = donutGeometry([{ key: 'a', label: 'A', count: 3, colour: '#000000' }, { key: 'b', label: 'B', count: 1, colour: '#ffffff' }]).slices;
        expect(big.d).toMatch(/A[\d.]+ [\d.]+ 0 1 1/);
        expect(small.d).toMatch(/A[\d.]+ [\d.]+ 0 0 1/);
    });

    it('is the whole ring for one count, with its hole', () => {
        const { slices } = donutGeometry([{ key: 'open', label: 'Open', count: 7, colour: '#0070e0' }]);
        expect(slices).toHaveLength(1);
        // Two closed rings: the outer edge and the hole
        expect(slices[0].d.match(/M/g)).toHaveLength(2);
        expect(slices[0].d).not.toContain('NaN');
    });

    it('leaves out a count of zero', () => {
        const { slices } = donutGeometry([{ key: 'a', label: 'A', count: 0, colour: '#000000' }, { key: 'b', label: 'B', count: 2, colour: '#ffffff' }]);
        expect(slices.map(s => s.key)).toEqual(['b']);
    });

    it('keeps a very small slice a slice of its own', () => {
        const { slices } = donutGeometry([{ key: 'a', label: 'A', count: 1, colour: '#000000' }, { key: 'b', label: 'B', count: 999, colour: '#ffffff' }]);
        expect(slices).toHaveLength(2);
        for (const slice of slices) expect(slice.d).not.toContain('NaN');
    });
});

describe('the donut as SVG, for the PDF', () => {
    const parse = text => new DOMParser().parseFromString(text, 'image/svg+xml');

    it('is a well-formed SVG of the slices, gapped by the page colour, with the number of items and its word in the hole', () => {
        const doc = parse(donutSvg(counts, { number: '19', word: 'items' }, { background: '#ffffff', ink: '#1f2937', muted: '#64748b' }));
        expect(doc.querySelector('parsererror')).toBeNull();
        const paths = [...doc.querySelectorAll('path')];
        expect(paths.map(p => p.getAttribute('fill'))).toEqual(counts.map(c => c.colour));
        expect(paths.every(p => p.getAttribute('stroke') === '#ffffff' && p.getAttribute('stroke-width') === String(DONUT_GAP))).toBe(true);
        expect(paths.map(p => p.getAttribute('d'))).toEqual(donutGeometry(counts).slices.map(s => s.d));
        expect([...doc.querySelectorAll('text')].map(t => t.textContent)).toEqual(['19', 'items']);
    });

    it('escapes the text of the hole', () => {
        const doc = parse(donutSvg(counts, { number: '1<2', word: 'a & "b"' }, { background: '#ffffff', ink: '#000000', muted: '#000000' }));
        expect(doc.querySelector('parsererror')).toBeNull();
        expect([...doc.querySelectorAll('text')].map(t => t.textContent)).toEqual(['1<2', 'a & "b"']);
    });
});
