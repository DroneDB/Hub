import { describe, it, expect } from 'vitest';
import { statusColour, choiceColour, itemBadges, rowMarks, reportKpis, kindLabel, kindShades, tint, shade, textOn, softBadge, CLOSED_COLOUR, OVERDUE_COLOUR, UNSET_COLOUR } from './reportStyling';
import { KIND_ORDER } from './reportKinds';
import { DEFAULT_SCHEMA } from './reportDefaults';
import { DARK_TEXT } from '@/libs/readableText';

const schema = DEFAULT_SCHEMA;

describe('the colours of the values of an item', () => {
    it('are the colours of the schema for a category and a severity, grey for none or an id it does not have', () => {
        expect(choiceColour(schema, 'category', 'defect')).toBe('#dc2626');
        expect(choiceColour(schema, 'severity', 'low')).toBe('#16a34a');
        expect(choiceColour(schema, 'category', null)).toBe(UNSET_COLOUR);
        expect(choiceColour(schema, 'category', 'gone')).toBe(UNSET_COLOUR);
    });

    it('are green for a closed status, and the colour of its place among the open ones for another', () => {
        expect(statusColour(schema.statuses, 'resolved')).toBe(CLOSED_COLOUR);
        expect(statusColour(schema.statuses, 'open')).toBe('#0070e0');
        expect(statusColour(schema.statuses, 'in-progress')).toBe('#0891b2');
        expect(statusColour(schema.statuses, 'gone')).toBe(UNSET_COLOUR);
        expect(statusColour(schema.statuses, null)).toBe(UNSET_COLOUR);
    });

    it('never are orange', () => {
        const all = [...schema.statuses.map(s => statusColour(schema.statuses, s.id)), CLOSED_COLOUR, OVERDUE_COLOUR, UNSET_COLOUR];
        for (const colour of all) expect(['#f97316', '#ea580c', '#fb923c']).not.toContain(colour);
    });
});

describe('the badges of an item', () => {
    it('are its category, severity and status, then Overdue, each with its name', () => {
        expect(itemBadges({ category: 'safety', severity: 'high', status: 'open', overdue: true }, schema)).toEqual([
            { key: 'category', label: 'Safety', colour: '#eab308' },
            { key: 'severity', label: 'High', colour: '#dc2626' },
            { key: 'status', label: 'Open', colour: '#0070e0', tone: 'open' },
            { key: 'overdue', label: 'Overdue', colour: OVERDUE_COLOUR, tone: 'alert' }
        ]);
    });

    it('leave out what the item has not, and say Unknown for an id the schema does not have', () => {
        expect(itemBadges({ category: null, severity: null, status: null, overdue: false }, schema)).toEqual([]);
        expect(itemBadges({ category: 'old', severity: null, status: 'resolved', overdue: false }, schema)).toEqual([
            { key: 'category', label: 'Unknown (old)', colour: UNSET_COLOUR },
            { key: 'status', label: 'Resolved', colour: CLOSED_COLOUR, tone: 'closed' }
        ]);
    });
});

describe('the marks of a row', () => {
    it('are the colours of its fields, null for a field with no value, and whether it is closed or overdue', () => {
        expect(rowMarks({ category: 'defect', severity: null, status: 'open', overdue: true }, schema))
            .toEqual({ category: '#dc2626', severity: null, status: '#0070e0', closed: false, overdue: true });
    });
});

describe('the headline figures', () => {
    it('count the items, the open, the overdue and the closed ones', () => {
        const items = [
            { status: 'open', overdue: true }, { status: 'in-progress', overdue: false }, { status: 'resolved', overdue: false }, { status: null, overdue: false }
        ];
        expect(reportKpis(items, schema)).toEqual([
            { key: 'items', label: 'Items', value: '4', detail: '3 with a status', tone: 'neutral' },
            { key: 'open', label: 'Open', value: '2', detail: 'need action', tone: 'info' },
            { key: 'overdue', label: 'Overdue', value: '1', detail: 'past their due date', tone: 'alert' },
            { key: 'closed', label: 'Closed', value: '1', detail: '33 % of the items with a status', tone: 'done' }
        ]);
    });

    it('say when nothing is open or late, and count one item in the singular', () => {
        const [items, open, overdue, closed] = reportKpis([{ status: 'resolved', overdue: false }], schema);
        expect(items.label).toBe('Item');
        expect(open).toMatchObject({ value: '0', detail: 'nothing open', tone: 'done' });
        expect(overdue).toMatchObject({ value: '0', detail: 'none late', tone: 'done' });
        expect(closed.detail).toBe('100 % of the items with a status');
        expect(reportKpis([], schema)[3].detail).toBe('0 % of the items with a status');
    });
});

describe('the colours of a fill and of the text on it', () => {
    it('lighten a colour towards white and darken it towards the ink', () => {
        expect(tint('#000000', 0.5)).toBe('#808080');
        expect(tint('#0070e0', 0)).toBe('#0070e0');
        expect(tint('#0070e0', 1)).toBe('#ffffff');
        expect(shade('#ffffff', 1)).toBe('#1f2937');
        expect(tint('not a colour', 0.5)).toBe('#f8fafc');
    });

    it('write white on a dark fill and the ink on a light one', () => {
        expect(textOn('#0f2a4a')).toBe('#ffffff');
        expect(textOn('#eab308')).toBe(DARK_TEXT);
        expect(textOn('#ffffff')).toBe(DARK_TEXT);
        expect(textOn('not a colour')).toBe(DARK_TEXT);
    });

    it('name the kind and the view of an item on one line', () => {
        expect(kindLabel({ kind: 'volume', owner: 'map' })).toBe('Volume · 2D');
        expect(kindLabel({ kind: 'measure3d', owner: 'pointCloud' })).toMatch(/· 3D$/);
    });
});

/** The WCAG contrast of two #rrggbb colours. */
function contrast(a, b) {
    const luminance = hex => {
        const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
}

describe('a soft badge', () => {
    it('has its text readable on its own fill (4.5:1) for every colour a status can have, the slates included', () => {
        // The statuses of a schema with more open ones than the default has, so that each colour of the cycle is one
        const statuses = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Status ${i}`, closed: false }));
        const colours = [...statuses.map(s => statusColour(statuses, s.id)), CLOSED_COLOUR, UNSET_COLOUR];
        expect(new Set(colours).size).toBeGreaterThanOrEqual(7);
        for (const colour of colours) {
            const { fill, text } = softBadge(colour);
            expect(contrast(text, fill), colour).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('does not depend on the page behind it: a status written in its colour alone is 1.3:1 for the darkest slate on a dark page', () => {
        // What the table drew before: the colour as the text. The fill and the text of the badge are a pair of their own.
        expect(contrast('#1e293b', '#0f172a')).toBeLessThan(1.5);
        const { fill, text } = softBadge('#1e293b');
        expect(contrast(text, fill)).toBeGreaterThan(7);
    });
});

describe('the shades of the kinds', () => {
    const luminance = hex => {
        const n = parseInt(hex.slice(1), 16);
        return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };

    it('give every kind a shade of the accent, from darker to lighter in the order of the kinds, all different', () => {
        const shades = kindShades('#0891b2');
        expect(Object.keys(shades)).toEqual([...KIND_ORDER]);
        const values = KIND_ORDER.map(kind => shades[kind]);
        expect(new Set(values).size).toBe(KIND_ORDER.length);
        for (const value of values) expect(value).toMatch(/^#[0-9a-f]{6}$/);
        const lights = values.map(luminance);
        for (let i = 1; i < lights.length; i++) expect(lights[i]).toBeGreaterThan(lights[i - 1]);
        expect(lights[0]).toBeLessThan(luminance('#0891b2'));
        expect(lights.at(-1)).toBeGreaterThan(luminance('#0891b2'));
    });

    it('stay apart for a very dark or a very light accent, and stop short of black and white', () => {
        for (const accent of ['#000000', '#1e293b', '#eab308', '#ffffff']) {
            const values = Object.values(kindShades(accent));
            expect(new Set(values).size).toBe(KIND_ORDER.length);
        }
        expect(Object.values(kindShades('#ffffff'))).not.toContain('#ffffff');
    });
});
