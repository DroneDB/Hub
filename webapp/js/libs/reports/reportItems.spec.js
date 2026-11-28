/**
 * The items of a report: the filter, the order, the references, the overdue rule, and whether an item has a place
 * on the map.
 */
import { describe, it, expect } from 'vitest';
import { buildItems, compareRefs, isOverdue, isGeoreferenced, localDateKey, NO_REF } from './reportItems';
import { mapFeature, cloudFeature, documentOf, definitionOf } from './reportModel.fixtures';

const POINT = { type: 'Point', coordinates: [9.2, 45.1] };
const schema = { statuses: [{ id: 'open', closed: false }, { id: 'done', closed: true }] };
const build = (features, definition = definitionOf(['a.geojson'])) => buildItems(definition, [{ file: 'a.geojson', document: documentOf(features) }], schema, '2026-11-15');

describe('compareRefs', () => {
    it('puts 2 before 10 and A-2 before A-10', () => {
        expect(['10', '2', '1'].sort(compareRefs)).toEqual(['1', '2', '10']);
        expect(['A-10', 'A-2', 'A-1'].sort(compareRefs)).toEqual(['A-1', 'A-2', 'A-10']);
    });
});

describe('localDateKey', () => {
    it('is the local calendar date, not the UTC one', () => {
        expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
        expect(localDateKey(new Date(2026, 11, 31, 0, 5))).toBe('2026-12-31');
    });
});

describe('isOverdue', () => {
    it('needs a status that is not closed and a due date before today', () => {
        expect(isOverdue({ status: 'open', dueDate: '2026-11-14' }, schema, '2026-11-15')).toBe(true);
        expect(isOverdue({ status: 'open', dueDate: '2026-11-15' }, schema, '2026-11-15')).toBe(false);
        expect(isOverdue({ status: 'done', dueDate: '2026-01-01' }, schema, '2026-11-15')).toBe(false);
        expect(isOverdue({ status: null, dueDate: '2026-01-01' }, schema, '2026-11-15')).toBe(false);
        expect(isOverdue({ status: 'open', dueDate: null }, schema, '2026-11-15')).toBe(false);
    });

    it('takes a status the schema does not have as not closed', () => {
        expect(isOverdue({ status: 'old', dueDate: '2026-01-01' }, schema, '2026-11-15')).toBe(true);
        expect(isOverdue({ status: 'open', dueDate: '2026-01-01' }, {}, '2026-11-15')).toBe(true);
    });
});

describe('isGeoreferenced', () => {
    it('is always so for a 2D item, and for a 3D one when its file has a CRS and the geometry is not the old one', () => {
        expect(isGeoreferenced(documentOf([], { crs: false }), 'map')).toBe(true);
        expect(isGeoreferenced(documentOf([]), 'pointCloud')).toBe(true);
        expect(isGeoreferenced(documentOf([], { crs: false }), 'pointCloud')).toBe(false);
        expect(isGeoreferenced(documentOf([], { legacyGeometry: true }), 'pointCloud')).toBe(false);
        expect(isGeoreferenced(null, 'pointCloud')).toBe(false);
    });
});

describe('buildItems', () => {
    it('gives each item its fields, group name, photos and the point cloud of its file', () => {
        const document = documentOf([
            mapFeature('a', '1', 'point', POINT, { name: 'Gate', groupId: 'g1', category: 'defect', photos: [{ path: 'p.jpg', source: 'dataset' }, { nope: 1 }] }),
            cloudFeature('b', '2', 'point', POINT, { snapshot: { path: 's.webp', camera: { position: [0, 0, 0], target: [1, 1, 1] } } })
        ], { groups: [{ id: 'g1', name: 'Fence' }] });
        const { items } = buildItems(definitionOf(['a.geojson']), [{ file: 'a.geojson', document }], schema, '2026-11-15');
        expect(items[0]).toMatchObject({ id: 'a', ref: '1', numbered: true, name: 'Gate', group: 'g1', groupName: 'Fence', category: 'defect', owner: 'map', pointCloudFile: null, snapshot: null });
        expect(items[0].photos).toEqual([{ path: 'p.jpg', source: 'dataset', pixel: undefined, caption: undefined }]);
        expect(items[1]).toMatchObject({ owner: 'pointCloud', pointCloudFile: 'cloud.laz', snapshot: { path: 's.webp' } });
    });

    it('keeps the order of the file for equal references, and orders the unnumbered by creation time then file order', () => {
        const { items } = build([
            mapFeature('u1', null, 'point', POINT, { createdAt: undefined }),
            mapFeature('a', '2', 'point', POINT),
            mapFeature('b', '2', 'point', POINT),
            mapFeature('u2', null, 'point', POINT, { createdAt: '2026-01-01T00:00:00Z' }),
            mapFeature('u3', null, 'point', POINT, { createdAt: undefined })
        ]);
        expect(items.map(i => i.id)).toEqual(['a', 'b', 'u2', 'u1', 'u3']);
        expect(items.slice(2).every(i => i.displayRef === NO_REF && !i.numbered)).toBe(true);
    });

    it('orders by source first, then by reference', () => {
        const definition = definitionOf(['a.geojson', 'b.geojson']);
        const { items } = buildItems(definition, [
            { file: 'b.geojson', document: documentOf([mapFeature('b1', '1', 'point', POINT)]) },
            { file: 'a.geojson', document: documentOf([mapFeature('a10', '10', 'point', POINT), mapFeature('a9', '9', 'point', POINT)]) }
        ], schema, '2026-11-15');
        expect(items.map(i => i.displayRef)).toEqual(['A-9', 'A-10', 'B-1']);
    });

    it('does not count the repeats of the references of the items the filter left out', () => {
        const definition = definitionOf(['a.geojson']);
        definition.filter.statuses = ['open'];
        const { duplicates } = build([mapFeature('a', '1', 'point', POINT, { status: 'open' }), mapFeature('b', '1', 'point', POINT, { status: 'done' })], definition);
        expect(duplicates).toEqual([]);
    });

    it('counts what is no measurement and gives such a feature no item', () => {
        const result = build([mapFeature('a', '1', undefined, null), mapFeature('b', '2', 'point', POINT), 'junk', null]);
        expect(result.items.map(i => i.id)).toEqual(['b']);
        expect(result.skipped).toBe(3);
    });

    it('lists a source whose document is empty, or has an error object', () => {
        const definition = definitionOf(['a.geojson', 'b.geojson']);
        const { failed } = buildItems(definition, [{ file: 'a.geojson', document: null }, { file: 'b.geojson', error: new Error('boom') }], schema, '2026-11-15');
        expect(failed).toEqual([
            { label: 'A', file: 'a.geojson', error: 'The file is empty or missing' },
            { label: 'B', file: 'b.geojson', error: 'boom' }
        ]);
    });
});
