/**
 * The identity of an annotation: the id a feature without one is given (the same for every reader), the refs that
 * are issued (1 plus the highest ref of the annotations, worked out every time), and the rules of the fields.
 */
import { describe, it, expect } from 'vitest';
import { sha256Hex } from '@/libs/sha256';
import {
    backfillIds, assignRefs, renumberTaken, duplicateRefs, highestRef, RefSequence, storedFields, isDueDate, isValidRef,
    unknownProperties, annotationProperties, choiceLabel, applyFields, inCreationOrder, refTakenMessage, renumberedMessage, idOf, refOf,
    isAnnotationType, isAnnotation, withoutStrayRefs
} from './annotationIds';

const ownerOf = f => (f.properties?.localCoordinates ? 'pointCloud' : 'map');
const area = (createdAt, extra = {}) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] },
    properties: { measurementType: 'area', createdAt, ...extra }
});

describe('backfillIds', () => {
    it('is the lower-case hex SHA-256 of the JSON of [owner, createdAt, geometry] as the file stores it', () => {
        const feature = area('2026-01-01T00:00:00.000Z');
        const [filled] = backfillIds([feature], ownerOf);
        expect(filled.properties.id).toBe(sha256Hex(JSON.stringify(['map', '2026-01-01T00:00:00.000Z', feature.geometry])));
        expect(filled.properties.id).toMatch(/^[0-9a-f]{64}$/);
        // Everything else stays, and the feature that was given is not changed
        expect(filled.properties).toMatchObject({ measurementType: 'area' });
        expect(feature.properties.id).toBeUndefined();
    });

    it('puts null for a feature with no createdAt, and the owner of the feature in the hash', () => {
        const cloud = { type: 'Feature', geometry: null, properties: { localCoordinates: [[0, 0, 0]] } };
        const [filled] = backfillIds([cloud], ownerOf);
        expect(filled.properties.id).toBe(sha256Hex(JSON.stringify(['pointCloud', null, null])));
    });

    it('gives the first of equal features the hash and the next ones -2, -3, in file order', () => {
        const same = () => area('2026-01-01T00:00:00.000Z');
        const [a, b, c] = backfillIds([same(), same(), same()], ownerOf);
        expect(b.properties.id).toBe(`${a.properties.id}-2`);
        expect(c.properties.id).toBe(`${a.properties.id}-3`);
        expect(new Set([a, b, c].map(f => f.properties.id)).size).toBe(3);
    });

    it('keeps the id a feature has, and does not give one that another feature has', () => {
        const hash = backfillIds([area('t')], ownerOf)[0].properties.id;
        const [kept, filled] = backfillIds([area('u', { id: 'mine' }), area('t', { id: hash })], ownerOf);
        expect(kept.properties.id).toBe('mine');
        expect(filled.properties.id).toBe(hash);
        const [taken, other] = backfillIds([area('t', { id: hash }), area('t')], ownerOf);
        expect(taken.properties.id).toBe(hash);
        expect(other.properties.id).toBe(`${hash}-2`);
    });

    it('gives the same ids whatever else the properties say, and returns the same array when nothing is missing', () => {
        const [a] = backfillIds([area('t', { name: 'A' })], ownerOf);
        const [b] = backfillIds([area('t', { name: 'B', color: 'red' })], ownerOf);
        expect(a.properties.id).toBe(b.properties.id);
        const features = [area('t', { id: 'x' })];
        expect(backfillIds(features, ownerOf)).toBe(features);
    });
});

describe('assignRefs', () => {
    it('numbers the features without a ref in creation order, the file order for equal or missing times', () => {
        const features = [
            area('2026-01-03T00:00:00Z', { id: 'c' }),
            area('2026-01-01T00:00:00Z', { id: 'a' }),
            area(undefined, { id: 'n1' }),
            area('2026-01-02T00:00:00Z', { id: 'b' }),
            area('2026-01-02T00:00:00Z', { id: 'b2' }),
            area(undefined, { id: 'n2' })
        ];
        const { features: numbered, assigned } = assignRefs(features);
        const refs = Object.fromEntries(numbered.map(f => [f.properties.id, f.properties.ref]));
        expect(refs).toEqual({ a: '1', b: '2', b2: '3', c: '4', n1: '5', n2: '6' });
        expect(assigned).toBe(6);
        // Order of the file is kept
        expect(numbered.map(idOf)).toEqual(features.map(idOf));
    });

    it('starts after the highest integer ref of the annotations, whatever counter the file kept', () => {
        const features = [area('t', { id: 'a', ref: '7' }), area('u', { id: 'b' })];
        expect(assignRefs(features).features[1].properties.ref).toBe('8');
        // A ref that is not an integer does not count
        expect(assignRefs([area('t', { id: 'a', ref: 'A-1' }), area('u', { id: 'b' })]).features[1].properties.ref).toBe('1');
        // Nor the ref an older Hub gave a contour: it is no annotation's
        const contour = { type: 'Feature', geometry: null, properties: { measurementType: 'contour', id: 'c', ref: '457' } };
        expect(assignRefs([contour, area('u', { id: 'b' })]).features[1].properties.ref).toBe('1');
    });

    it('changes nothing else of a feature, and nothing in a file where every feature has a ref', () => {
        const features = [area('t', { id: 'a', ref: '1', customKey: 5 })];
        const result = assignRefs(features);
        expect(result.features).toBe(features);
        expect(result.assigned).toBe(0);
        const [numbered] = assignRefs([area('t', { id: 'a', customKey: 5, name: 'X' })]).features;
        expect(numbered.properties).toEqual({ measurementType: 'area', createdAt: 't', id: 'a', customKey: 5, name: 'X', ref: '1' });
    });

    it('gives no ref to a feature that is no annotation (a contour line)', () => {
        const contour = { ...area('t', { id: 'c' }), properties: { measurementType: 'contour', createdAt: 't', id: 'c' } };
        const { features, assigned } = assignRefs([contour, area('u', { id: 'a' })]);
        expect(features.map(refOf)).toEqual(['', '1']);
        expect(assigned).toBe(1);
    });

    it('breaks the ties of the creation time with the position the file gives', () => {
        const features = [area('t', { id: 'a' }), area('t', { id: 'b' })];
        const { features: numbered } = assignRefs(features, { fileOrder: (feature, index) => 1 - index });
        expect(numbered.map(f => f.properties.ref)).toEqual(['2', '1']);
    });
});

describe('inCreationOrder', () => {
    it('puts the features with a time first, in time order, then those with none in file order', () => {
        const entries = [{ feature: area(undefined), index: 0 }, { feature: area('2026-02-01T00:00:00Z'), index: 1 }, { feature: area('2026-01-01T00:00:00Z'), index: 2 }];
        expect(inCreationOrder(entries).map(e => e.index)).toEqual([2, 1, 0]);
    });
});

describe('renumberTaken', () => {
    it('gives the next ref to a new feature whose ref another feature of the file has, and only to it', () => {
        const mine = area('t', { id: 'mine', ref: '4' });
        const saved = area('t', { id: 'saved', ref: '4' });
        const theirs = area('u', { id: 'theirs', ref: '4' });
        const result = renumberTaken([mine, saved, theirs], f => f === mine);
        expect(result.changes).toEqual([{ id: 'mine', from: '4', to: '5' }]);
        expect(result.features.map(refOf)).toEqual(['5', '4', '4']);
        expect(renumberedMessage(result.changes[0])).toBe('Reference 4 was taken; the item is now 5');
    });

    it('returns the same features when no new ref is taken', () => {
        const features = [area('t', { id: 'a', ref: '1' }), area('u', { id: 'b', ref: '2' })];
        const result = renumberTaken(features, f => idOf(f) === 'a');
        expect(result.features).toBe(features);
        expect(result.changes).toEqual([]);
    });

    it('counts the ref of every saved feature as taken, of the view that saves too (another session numbered it)', () => {
        const loaded = area('t', { id: 'loaded', ref: '1' });
        const mine = area('u', { id: 'mine', ref: '1' });
        const result = renumberTaken([loaded, mine], f => f === mine);
        expect(result.changes).toEqual([{ id: 'mine', from: '1', to: '2' }]);
        expect(result.features.map(refOf)).toEqual(['1', '2']);
    });
});

describe('refs', () => {
    it('accepts 1 to 8 letters, digits and dashes', () => {
        ['1', 'A-12', 'ab-cd-12', '12345678'].forEach(ref => expect(isValidRef(ref)).toBe(true));
        ['', '123456789', 'a b', 'a_b', 'è'].forEach(ref => expect(isValidRef(ref)).toBe(false));
        expect(refTakenMessage('3')).toBe('Reference 3 is already used');
    });

    it('finds the highest integer ref, and the refs that are used twice', () => {
        expect(highestRef(['1', 'A-2', '10', '9'])).toBe(10);
        expect(highestRef([])).toBe(0);
        expect(duplicateRefs(['1', '2', '1', '', '', '3', '2'])).toEqual(['1', '2']);
    });
});

describe('RefSequence', () => {
    const doc = (features, metadata = {}) => ({ metadata, features });
    const mapOnly = f => ownerOf(f) === 'pointCloud';
    const contour = (ref) => ({ type: 'Feature', geometry: null, properties: { measurementType: 'contour', id: `c${ref}`, ref } });

    it('issues 1 plus the highest ref of the file and of the view, worked out again every time', () => {
        const sequence = new RefSequence();
        sequence.observe(doc([area('t', { id: 'a', ref: '1' }), area('t', { id: 'b', ref: '3' })]), mapOnly);
        expect(sequence.issue()).toBe('4');
        expect(sequence.issue(['4'])).toBe('5');
        // The annotation of 5 is deleted before it was saved: 5 is the next one again
        expect(sequence.issue(['4'])).toBe('5');
        expect(sequence.issue(['4', '5'])).toBe('6');
    });

    it('does not count the lastRef counter of an older file, nor the refs an older Hub gave the contours', () => {
        const sequence = new RefSequence();
        sequence.observe(doc([contour('456'), contour('457')], { lastRef: 457 }), mapOnly);
        expect(sequence.issue()).toBe('1');
        expect(sequence.isTaken('457')).toBe(false);
    });

    it('gives a ref no annotation of the file or of the view has', () => {
        const sequence = new RefSequence();
        const cloud = { type: 'Feature', geometry: null, properties: { id: 'c', ref: '7', localCoordinates: [[0, 0, 0]] } };
        sequence.observe(doc([cloud, area('t', { id: 'a', ref: '2' })]), mapOnly);
        const own = ['2', '3'];
        const ref = sequence.issue(own);
        expect(ref).toBe('8');
        expect(sequence.isTaken(ref, own)).toBe(false);
    });

    it('knows the refs of the features the view leaves alone, for the refs a user types', () => {
        const sequence = new RefSequence();
        const cloud = { type: 'Feature', geometry: null, properties: { id: 'c', ref: 'P-1', localCoordinates: [[0, 0, 0]] } };
        sequence.observe(doc([cloud, area('t', { id: 'a', ref: '1' })]), mapOnly);
        expect(sequence.isTaken('P-1')).toBe(true);
        expect(sequence.isTaken('1')).toBe(false);
        expect(sequence.isTaken('1', ['1'])).toBe(true);
    });
});

describe('the fields of an annotation', () => {
    it('are stored without what has no value: an empty text is absent, an assignee is trimmed to 100 characters', () => {
        expect(storedFields({ ref: ' 7 ', category: 'defect', severity: '', status: null, assignee: '   ', dueDate: '', report: true }))
            .toEqual({ ref: '7', category: 'defect', severity: undefined, status: undefined, assignee: undefined, dueDate: undefined, report: undefined });
        expect(storedFields({ assignee: ` ${'x'.repeat(120)} ` }).assignee).toHaveLength(100);
        expect(storedFields({ report: false }).report).toBe(false);
    });

    it('take a due date that is a calendar date', () => {
        expect(isDueDate('2026-02-28')).toBe(true);
        expect(isDueDate('2026-02-30')).toBe(false);
        expect(isDueDate('28/02/2026')).toBe(false);
        expect(isDueDate(undefined)).toBe(false);
        expect(storedFields({ dueDate: '2026-02-30' }).dueDate).toBeUndefined();
    });

    it('are set on and removed from an object', () => {
        const target = { ref: '1', category: 'defect', other: 1 };
        applyFields(target, { category: undefined, status: 'open', ref: '2', name: 'ignored' });
        expect(target).toEqual({ ref: '2', status: 'open', other: 1 });
    });

    it('have the name the schema gives them, Unknown (<id>) for an id it lacks, nothing for no value', () => {
        const choices = [{ id: 'defect', name: 'Defect' }];
        expect(choiceLabel(choices, 'defect')).toBe('Defect');
        expect(choiceLabel(choices, 'gone')).toBe('Unknown (gone)');
        expect(choiceLabel(choices, undefined)).toBe('');
        expect(choiceLabel(undefined, 'x')).toBe('Unknown (x)');
    });
});

describe('what a feature keeps', () => {
    it('keeps the properties no view knows, and takes the identity and the fields apart', () => {
        const properties = { name: 'A', customKey: 5, id: 'i', ref: '1', photos: [{ path: 'a.jpg', source: 'dataset' }], category: null };
        expect(unknownProperties(properties, new Set(['name', ...Object.keys(annotationProperties(properties))]))).toEqual({ customKey: 5, category: null });
        expect(annotationProperties(properties)).toEqual({ id: 'i', ref: '1', photos: [{ path: 'a.jpg', source: 'dataset' }] });
        expect(unknownProperties(null, new Set())).toEqual({});
    });

    it('reads a numeric ref (a file another tool wrote) as its text, with the one rule of refOf, and stores it as text', () => {
        expect(annotationProperties({ id: 'i', ref: 5 })).toEqual({ id: 'i', ref: '5' });
        expect(annotationProperties({ id: 'i', ref: true })).toEqual({ id: 'i' });
        expect(refOf({ properties: { ref: 5 } })).toBe('5');
        expect(storedFields({ ref: 12 }).ref).toBe('12');
    });
});

describe('inspectionSummary', () => {
    const schema = {
        categories: [{ id: 'defect', name: 'Defect' }],
        severities: [{ id: 'high', name: 'High' }],
        statuses: [{ id: 'open', name: 'Open' }]
    };

    it('names each value that is set, in the order of the form, the reference left out', async () => {
        const { inspectionSummary } = await import('./annotationIds');
        expect(inspectionSummary({ ref: '4', category: 'defect', severity: 'high', status: 'open', assignee: 'Anna', dueDate: '2026-12-01', report: false }, schema))
            .toBe('Defect · High · Open · Anna · due 2026-12-01 · not in reports');
        expect(inspectionSummary({ status: 'gone' }, schema)).toBe('Unknown (gone)');
    });

    it('is empty when nothing is set (an annotation in reports is the default)', async () => {
        const { inspectionSummary } = await import('./annotationIds');
        expect(inspectionSummary({ ref: '4', report: true }, schema)).toBe('');
        expect(inspectionSummary(undefined, schema)).toBe('');
    });
});

describe('the features that are no annotation', () => {
    const contour = extra => ({ type: 'Feature', geometry: null, properties: { measurementType: 'contour', id: 'c', ...extra } });

    it('are the contour lines: every other type, and a feature without one, is an annotation', () => {
        expect(isAnnotationType('contour')).toBe(false);
        ['point', 'length', 'area', 'profile', 'stockpile', 'distance', 'annotation', undefined, ''].forEach(t => expect(isAnnotationType(t)).toBe(true));
        expect(isAnnotation(contour())).toBe(false);
        expect(isAnnotation(area('t'))).toBe(true);
    });

    it('lose a ref they were given, and keep everything else; the array is the same when none has one', () => {
        const features = [contour({ ref: '4', elev: 162 }), area('t', { id: 'a', ref: '5' })];
        const { features: cleaned, removed } = withoutStrayRefs(features);
        expect(removed).toBe(1);
        expect(cleaned[0].properties).toEqual({ measurementType: 'contour', id: 'c', elev: 162 });
        expect(cleaned[1]).toBe(features[1]);
        const clean = [contour(), area('t', { id: 'a', ref: '5' })];
        expect(withoutStrayRefs(clean)).toEqual({ features: clean, removed: 0 });
    });
});
