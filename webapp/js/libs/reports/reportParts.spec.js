import { describe, it, expect } from 'vitest';
import { sectionParts, itemFacts, isItemHeading } from './reportParts';

const heading = (level, text, extra = {}) => ({ type: 'heading', level, text, anchor: null, itemId: null, ...extra });

describe('the parts of a section', () => {
    it('make the cover one part, each block in its place and the rest in order', () => {
        const blocks = [
            { type: 'logo', url: 'l' }, heading(1, 'Title'), heading(2, 'Sub'), { type: 'keyValue', rows: [] }, { type: 'kpis', tiles: [] },
            { type: 'note', text: 'n' }, { type: 'mapSnapshot', kind: 'overview' }, { type: 'qr', url: 'u' }, { type: 'markdown', text: 'm' }
        ];
        const [cover, ...more] = sectionParts({ kind: 'cover', blocks });
        expect(more).toEqual([]);
        expect(cover).toEqual({
            type: 'cover', logo: blocks[0], title: blocks[1], subtitle: blocks[2], facts: blocks[3], kpis: blocks[4],
            map: blocks[6], qr: blocks[7], rest: [blocks[5], blocks[8]]
        });
    });

    it('make each item page a part, from its heading to the next, and every other block a part of its own', () => {
        const a = heading(2, '1 A', { itemId: 'a' });
        const b = heading(2, '2 B', { itemId: 'b' });
        const blocks = [
            heading(1, 'Items'),
            a, { type: 'keyValue', rows: [] }, { type: 'mapSnapshot', kind: 'item' }, { type: 'capture3d' }, { type: 'markdown', text: 'd' }, { type: 'photoGrid', photos: [] }, { type: 'qr', url: 'x' },
            b, { type: 'keyValue', rows: [] }, { type: 'chart' }, { type: 'note', text: 'n' }
        ];
        const parts = sectionParts({ kind: 'items', blocks });
        expect(parts.map(p => p.type)).toEqual(['block', 'item', 'item']);
        expect(parts[1]).toMatchObject({ heading: a, facts: blocks[2], figures: [blocks[3], blocks[4]], description: blocks[5], photos: blocks[6], qr: blocks[7], rest: [] });
        expect(parts[2]).toMatchObject({ heading: b, facts: blocks[9], figures: [blocks[10]], description: null, photos: null, qr: null, rest: [blocks[11]] });
        // Nothing is lost or repeated
        const all = parts.flatMap(p => (p.type === 'block' ? [p.block] : [p.heading, p.facts, ...p.figures, p.description, p.photos, p.qr, ...p.rest].filter(Boolean)));
        expect(all).toEqual(blocks);
    });

    it('know an item heading by its item id', () => {
        expect(isItemHeading(heading(2, 'x', { itemId: 'a' }))).toBe(true);
        expect(isItemHeading(heading(1, 'Items'))).toBe(false);
        expect(isItemHeading(null)).toBe(false);
    });
});

describe('the facts of an item', () => {
    it('leave out what its header shows: the reference, the name, the category, the severity and the status', () => {
        const rows = ['reference', 'name', 'kind', 'area', 'category', 'severity', 'status', 'assignee'].map(key => ({ key, label: key, value: key }));
        expect(itemFacts({ rows }).map(r => r.key)).toEqual(['kind', 'area', 'assignee']);
        expect(itemFacts(null)).toEqual([]);
        // A row with no key (another model) is kept
        expect(itemFacts({ rows: [{ label: 'X', value: 'y' }] })).toEqual([{ label: 'X', value: 'y' }]);
    });
});
