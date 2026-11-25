/**
 * The label of a 3D measure names the item: its name, its category and severity (with the severity's colour) and the
 * first line of its description, each only when it has one, each shortened to one line.
 */
import { describe, it, expect } from 'vitest';
import { LABEL_LIMITS, clipText, itemLabelLines } from './itemLabel';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportDefaults';

describe('itemLabelLines', () => {
    it('has the name, "Category · Severity" with the colour of the severity, and the description', () => {
        expect(itemLabelLines({ name: 'Crepa', category: 'defect', severity: 'high', description: 'Crack in the roof' }, DEFAULT_SCHEMA)).toEqual([
            { text: 'Crepa', kind: 'name' },
            { text: 'Defect · High', kind: 'fields', colour: '#dc2626' },
            { text: 'Crack in the roof', kind: 'description' }
        ]);
    });

    it('has only the lines the item has a value for', () => {
        expect(itemLabelLines({ name: 'Gate' }, DEFAULT_SCHEMA)).toEqual([{ text: 'Gate', kind: 'name' }]);
        expect(itemLabelLines({ category: 'defect' }, DEFAULT_SCHEMA)).toEqual([{ text: 'Defect', kind: 'fields' }]);
        expect(itemLabelLines({ severity: 'low', description: '  \n second line' }, DEFAULT_SCHEMA)).toEqual([
            { text: 'Low', kind: 'fields', colour: '#16a34a' },
            { text: 'second line', kind: 'description' }
        ]);
    });

    it('has no line for an item with no name, inspection field or description (a point keeps its coordinates)', () => {
        expect(itemLabelLines({ name: '  ', description: '' }, DEFAULT_SCHEMA)).toEqual([]);
        // The status, the assignee and the rest are in the dialog and in reports, not on the label
        expect(itemLabelLines({ status: 'open' }, DEFAULT_SCHEMA)).toEqual([]);
    });

    it('names a choice the schema does not have as unknown, with no colour', () => {
        expect(itemLabelLines({ severity: 'gone' }, DEFAULT_SCHEMA)).toEqual([{ text: 'Unknown (gone)', kind: 'fields' }]);
    });

    it('shows the first line of the description, shortened with an ellipsis', () => {
        const long = 'x'.repeat(LABEL_LIMITS.description + 10);
        const [line] = itemLabelLines({ description: `${long}\nmore` }, DEFAULT_SCHEMA);
        expect(line.text).toHaveLength(LABEL_LIMITS.description);
        expect(line.text.endsWith('…')).toBe(true);
    });
});

describe('clipText', () => {
    it('keeps a short text, folds its white space and shortens a long one', () => {
        expect(clipText(' a \t b ', 10)).toBe('a b');
        expect(clipText('abcdef', 4)).toBe('abc…');
        expect(clipText(undefined, 4)).toBe('');
    });
});
