/**
 * The rules of the photos of an annotation: a path must be one of the dataset, the limits of the file's entries hold,
 * an upload gets the lowest free name next to the measurement file, an item that is not georeferenced has no geometry to
 * ask the coverage query about, and the marker lands where the pixel says.
 */
import { describe, it, expect } from 'vitest';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import { fromLonLat } from 'ol/proj';
import {
    MAX_CAPTION, MAX_PHOTOS, addBlockReason, annotationsFolder, applyPhotos, coverageGeometry, documentFeatureGeometry, isDatasetPath,
    isGeoreferenced, mapFeatureGeometry, markerPosition, nextUploadPath, photoAlt, photoIssue, storedPhoto, storedPhotos, uploadExtension,
    withPhoto
} from './annotationPhotos';

describe('isDatasetPath', () => {
    it.each(['a.jpg', 'images/DJI_0412.JPG', 'a b/c d.jpg', 'dir/sub.folder/x.png', 'caf\u00e9/\u00fc.jpg'])('accepts %s', path => {
        expect(isDatasetPath(path)).toBe(true);
    });

    it.each([
        ['empty', ''], ['absolute', '/etc/passwd'], ['dot dot at the start', '../secret.jpg'], ['dot dot inside', 'a/../../b.jpg'],
        ['dot dot at the end', 'a/..'], ['a dot segment', 'a/./b.jpg'], ['an empty segment', 'a//b.jpg'], ['a trailing slash', 'a/'],
        ['a backslash', 'a\\b.jpg'], ['a url', 'https://example.com/a.jpg'], ['a drive', 'C:/a.jpg'], ['a control character', 'a\u0000b.jpg'],
        ['not a text', 12], ['null', null], ['too long', 'a'.repeat(1025)]
    ])('refuses %s', (_label, path) => {
        expect(isDatasetPath(path)).toBe(false);
    });
});

describe('photoIssue and storedPhoto', () => {
    it('accepts a photo of each source, with or without pixel and caption', () => {
        expect(photoIssue({ path: 'a.jpg', source: 'coverage', pixel: [1, 2], caption: 'x' })).toBe('');
        expect(photoIssue({ path: 'a.jpg', source: 'dataset' })).toBe('');
        expect(photoIssue({ path: 'annotations/x-1.jpg', source: 'upload', pixel: null })).toBe('');
    });

    it('names what is wrong', () => {
        expect(photoIssue(null)).toBe('Not a photo');
        expect(photoIssue({ path: '../a.jpg', source: 'dataset' })).toMatch(/path/);
        expect(photoIssue({ path: 'a.jpg', source: 'web' })).toBe('Unknown source');
        expect(photoIssue({ path: 'a.jpg', source: 'dataset', pixel: [1] })).toMatch(/location/);
        expect(photoIssue({ path: 'a.jpg', source: 'dataset', caption: 'x'.repeat(MAX_CAPTION + 1) })).toMatch(/caption/);
        expect(photoIssue({ path: 'a.jpg', source: 'dataset', caption: 'x'.repeat(MAX_CAPTION) })).toBe('');
    });

    it('stores the known members only, a trimmed caption and no empty one', () => {
        expect(storedPhoto({ path: 'a.jpg', source: 'dataset', caption: '  hi  ', extra: 1 })).toEqual({ path: 'a.jpg', source: 'dataset', caption: 'hi' });
        expect(storedPhoto({ path: 'a.jpg', source: 'coverage', pixel: [1.5, 2], caption: '   ' })).toEqual({ path: 'a.jpg', source: 'coverage', pixel: [1.5, 2] });
    });

    it('stores no list for no photos, and leaves a photo that is not valid as it is (it is not lost by a save)', () => {
        expect(storedPhotos([])).toBeUndefined();
        const odd = { path: '../x.jpg', source: 'dataset' };
        expect(storedPhotos([odd, { path: 'a.jpg', source: 'dataset', caption: ' c ' }])).toEqual([odd, { path: 'a.jpg', source: 'dataset', caption: 'c' }]);
    });

    it('sets the photos of the holder of the properties, and removes the key for none', () => {
        const bag = { id: 'x' };
        expect(applyPhotos(bag, [{ path: 'a.jpg', source: 'dataset' }]).photos).toHaveLength(1);
        expect(applyPhotos(bag, undefined)).toEqual({ id: 'x' });
        expect(applyPhotos({ photos: [1] }, [])).toEqual({});
    });
});

describe('the limit and the list', () => {
    const photos = n => Array.from({ length: n }, (_, i) => ({ path: `p${i}.jpg`, source: 'dataset' }));

    it('allows 12 photos and then says why not', () => {
        expect(MAX_PHOTOS).toBe(12);
        expect(addBlockReason(photos(11))).toBe('');
        expect(addBlockReason(photos(12))).toMatch(/at most 12/);
    });

    it('adds a photo at the end, once, and refuses the 13th', () => {
        const added = withPhoto(photos(2), { path: 'new.jpg', source: 'coverage', pixel: [3, 4] });
        expect(added.map(p => p.path)).toEqual(['p0.jpg', 'p1.jpg', 'new.jpg']);
        const same = photos(2);
        expect(withPhoto(same, { path: 'p0.jpg', source: 'dataset' })).toBe(same);
        expect(() => withPhoto(photos(12), { path: 'new.jpg', source: 'dataset' })).toThrow(/at most 12/);
    });

    it('refuses a photo whose path is not the dataset\'s', () => {
        expect(() => withPhoto([], { path: '../outside.jpg', source: 'dataset' })).toThrow(/path/);
        expect(() => withPhoto([], { path: '/abs.jpg', source: 'dataset' })).toThrow();
    });
});

describe('the alternative text of a photo', () => {
    it('is the item and the caption, or the file name when there is no caption', () => {
        expect(photoAlt('Crack', { path: 'images/DJI_1.JPG' })).toBe('Crack - DJI_1.JPG');
        expect(photoAlt('Crack', { path: 'images/DJI_1.JPG', caption: 'North wall' })).toBe('Crack - North wall');
        expect(photoAlt('', { path: 'a.jpg' })).toBe('a.jpg');
        expect(photoAlt('Crack', {})).toBe('Crack');
        expect(photoAlt('', {})).toBe('Photo');
    });
});

describe('the name of an upload', () => {
    const file = 'surveys/site_measurements.geojson';

    it('goes to the annotations folder next to the measurement file', () => {
        expect(annotationsFolder(file)).toBe('surveys/annotations');
        expect(annotationsFolder('measurements.geojson')).toBe('annotations');
        expect(nextUploadPath(file, 'abc', 'jpg')).toBe('surveys/annotations/abc-1.jpg');
        expect(nextUploadPath('measurements.geojson', 'abc', 'png')).toBe('annotations/abc-1.png');
    });

    it('is the lowest number from 1 that is free, filling a gap', () => {
        const taken = ['surveys/annotations/abc-1.jpg', 'surveys/annotations/abc-3.jpg'];
        expect(nextUploadPath(file, 'abc', 'jpg', taken)).toBe('surveys/annotations/abc-2.jpg');
        expect(nextUploadPath(file, 'abc', 'jpg', [...taken, 'surveys/annotations/abc-2.jpg'])).toBe('surveys/annotations/abc-4.jpg');
    });

    it('takes a number as used whatever the extension and the letter case of the file, and only for the same annotation', () => {
        expect(nextUploadPath(file, 'abc', 'jpg', ['surveys/annotations/ABC-1.JPG'])).toBe('surveys/annotations/abc-2.jpg');
        expect(nextUploadPath(file, 'abc', 'png', ['surveys/annotations/abc-1.jpg'])).toBe('surveys/annotations/abc-2.png');
        expect(nextUploadPath(file, 'abc', 'jpg', ['surveys/annotations/other-1.jpg', 'surveys/annotations/abc-1-3d.webp', 'surveys/annotations/abc-x.jpg', 'elsewhere/abc-1.jpg'])).toBe('surveys/annotations/abc-1.jpg');
        // an id that is the start of another one is not that annotation's
        expect(nextUploadPath(file, 'abc', 'jpg', ['surveys/annotations/abc-2-1.jpg'])).toBe('surveys/annotations/abc-1.jpg');
    });

    it('is made with the id, kept to safe characters, and needs one', () => {
        expect(nextUploadPath(file, 'a/b c', 'jpg')).toBe('surveys/annotations/a_b_c-1.jpg');
        expect(() => nextUploadPath(file, '', 'jpg')).toThrow(/id/);
        expect(() => nextUploadPath(file, 'abc', '../x')).toThrow(/extension/);
    });

    it('takes the extension of an image that can be uploaded, in lower case', () => {
        expect(uploadExtension('IMG_0001.JPG')).toBe('jpg');
        expect(uploadExtension('a.b.webp')).toBe('webp');
        expect(uploadExtension('notes.pdf')).toBe('');
        expect(uploadExtension('noextension')).toBe('');
    });
});

describe('the geometry of the coverage query', () => {
    const point = { type: 'Point', coordinates: [11.2, 45.1] };

    it('is the WGS84 point, line or polygon', () => {
        expect(coverageGeometry(point)).toEqual(point);
        expect(coverageGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toBeTruthy();
        expect(coverageGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })).toBeTruthy();
    });

    it('is null for an item that is not georeferenced, for a kind the query does not take and for bad numbers', () => {
        expect(coverageGeometry(point, { georeferenced: false })).toBeNull();
        expect(coverageGeometry({ type: 'MultiPoint', coordinates: [[0, 0]] })).toBeNull();
        expect(coverageGeometry({ type: 'Point', coordinates: [NaN, 1] })).toBeNull();
        expect(coverageGeometry({ type: 'Point', coordinates: [] })).toBeNull();
        expect(coverageGeometry(null)).toBeNull();
    });

    it('of a feature of the map is converted from the map projection to longitude and latitude', () => {
        const geometry = mapFeatureGeometry(new Feature(new Point(fromLonLat([11.25, 45.5]))));
        expect(geometry.type).toBe('Point');
        expect(geometry.coordinates[0]).toBeCloseTo(11.25, 6);
        expect(geometry.coordinates[1]).toBeCloseTo(45.5, 6);
        const area = mapFeatureGeometry(new Feature(new Polygon([[[0, 0], [100, 0], [100, 100], [0, 0]]])));
        expect(area.type).toBe('Polygon');
        expect(mapFeatureGeometry(new Feature())).toBeNull();
        expect(mapFeatureGeometry(null)).toBeNull();
    });

    describe('of an item of a measurement document', () => {
        const feature = { type: 'Feature', properties: { id: 'a1' }, geometry: point };
        const georeferenced = { crs: { type: 'name', properties: { name: 'EPSG:4326' } }, metadata: {}, features: [feature] };

        it('is the item\'s geometry when the document has a crs', () => {
            expect(isGeoreferenced(georeferenced)).toBe(true);
            expect(documentFeatureGeometry(georeferenced, 'a1')).toEqual(point);
        });

        it('is null when the document has no crs member (a point cloud with no usable CRS)', () => {
            const unreferenced = { metadata: {}, features: [feature] };
            expect(isGeoreferenced(unreferenced)).toBe(false);
            expect(documentFeatureGeometry(unreferenced, 'a1')).toBeNull();
        });

        it('is null when the 3D geometry is still the one of an older writer (legacyGeometry)', () => {
            const legacy = { ...georeferenced, metadata: { views: { pointCloud: { legacyGeometry: true } } } };
            expect(isGeoreferenced(legacy)).toBe(false);
            expect(documentFeatureGeometry(legacy, 'a1')).toBeNull();
        });

        it('is null for an id the document does not have', () => {
            expect(documentFeatureGeometry(georeferenced, 'nope')).toBeNull();
            expect(documentFeatureGeometry(null, 'a1')).toBeNull();
        });
    });
});

describe('the marker', () => {
    const size = { width: 4000, height: 3000 };

    it('is the pixel over the size of the full image, as percentages', () => {
        expect(markerPosition([1000, 750], size)).toEqual({ left: 25, top: 25 });
        expect(markerPosition([0, 3000], size)).toEqual({ left: 0, top: 100 });
    });

    it('is none without a pixel, without the size of the image, or with a pixel outside the image', () => {
        expect(markerPosition(null, size)).toBeNull();
        expect(markerPosition(undefined, size)).toBeNull();
        expect(markerPosition([10, 10], null)).toBeNull();
        expect(markerPosition([10, 10], { width: 0, height: 0 })).toBeNull();
        expect(markerPosition([-1, 10], size)).toBeNull();
        expect(markerPosition([4001, 10], size)).toBeNull();
        expect(markerPosition([10], size)).toBeNull();
    });
});
