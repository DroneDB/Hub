import { describe, it, expect, vi, afterEach } from 'vitest';
import { SIDECAR_VERSION, camerasPathFor, parseCamerasFile, serializeCamerasFile, normalizeCamera, activeAfterDelete, activeAfterMove } from './cameraPresets';
import { MAX_SAVED_ITEMS, MAX_SHAPE_POINTS } from './sceneData';

describe('camera presets', () => {
    it('sit next to the splat', () => {
        expect(camerasPathFor('scans/room.spz')).toBe('scans/room_cameras.json');
        expect(camerasPathFor('room')).toBe('room_cameras.json');
    });

    it('read both sidecar shapes and drop cameras without a position', () => {
        const bare = parseCamerasFile(JSON.stringify([{ position: [1, 2, 3] }, { name: 'broken' }]));
        expect(bare.cameras).toHaveLength(1);
        expect(bare.cameras[0]).toMatchObject({ id: 0, name: 'Camera 1', quaternion: [0, 0, 0, 1], fov: 60, target: null });
        const full = parseCamerasFile(JSON.stringify({ cameras: [{ position: ['1', 2, 3], fov: 40 }], orientation: { flipped: false, tiltRoll: 2 } }));
        expect(full.cameras[0].position).toEqual([1, 2, 3]);
        // A sidecar saved before the axis could be chosen holds the flipped flag only
        expect(full.orientation).toEqual({ upAxis: '+y', tiltRoll: 2 });
    });

    it('round-trip through the sidecar', () => {
        const cams = [normalizeCamera({ id: 'a', name: 'Door', position: [0, 1, 2], target: [0, 0, 0] }, 0)];
        const text = serializeCamerasFile(cams, { upAxis: '-y', tiltRoll: 0, tiltPitch: 1.5 });
        const back = parseCamerasFile(text);
        expect(back.cameras).toEqual(cams);
        expect(back.orientation).toEqual({ upAxis: '-y', tiltRoll: 0, tiltPitch: 1.5 });
    });

    describe('orientation', () => {
        const orientationOf = orientation => parseCamerasFile(JSON.stringify({ cameras: [], orientation })).orientation;

        it('reads the flipped flag of a sidecar saved before the up axis could be chosen', () => {
            expect(orientationOf({ flipped: true, tiltRoll: 1, tiltPitch: 2 })).toEqual({ upAxis: '-y', tiltRoll: 1, tiltPitch: 2 });
            expect(orientationOf({ flipped: false })).toEqual({ upAxis: '+y' });
        });

        it('reads the up axis, which wins over a flipped flag that disagrees', () => {
            expect(orientationOf({ upAxis: '+z', flipped: false })).toEqual({ upAxis: '+z' });
            expect(orientationOf({ upAxis: '+y', flipped: true })).toEqual({ upAxis: '+y' });
        });

        it('leaves an unknown axis and a missing orientation out', () => {
            expect(orientationOf({ upAxis: 'sideways' })).toEqual({});
            expect(orientationOf(undefined)).toEqual({});
            expect(parseCamerasFile('[]').orientation).toEqual({});
        });

        it('is written with the up axis and the flipped flag that older versions read', () => {
            const written = axis => JSON.parse(serializeCamerasFile([], { upAxis: axis, tiltRoll: 0, tiltPitch: 0 })).orientation;
            expect(written('-y')).toEqual({ upAxis: '-y', flipped: true, tiltRoll: 0, tiltPitch: 0 });
            expect(written('+y')).toMatchObject({ upAxis: '+y', flipped: false });
            expect(written('+z')).toMatchObject({ upAxis: '+z', flipped: false });
        });

        it('keeps "auto" as its own value, without a flag that would make older versions show it unflipped', () => {
            const text = serializeCamerasFile([], { upAxis: 'auto', tiltRoll: 1, tiltPitch: 2 });
            expect(JSON.parse(text).orientation).toEqual({ upAxis: 'auto', tiltRoll: 1, tiltPitch: 2 });
            expect(parseCamerasFile(text).orientation).toEqual({ upAxis: 'auto', tiltRoll: 1, tiltPitch: 2 });
        });
    });

    describe('version 2', () => {
        const pin = { id: 1, title: 'Gate', text: 'Open', link: 'https://example.com', image: 'a/b.jpg', position: [1, 2, 3], view: { position: [0, 0, 5], quaternion: [0, 0, 0, 1], fov: 45, target: [1, 2, 3] } };
        const extras = {
            scale: { metersPerUnit: 0.5 }, annotations: [pin], measurements: [{ id: 2, kind: 'area', points: [[0, 0, 0], [1, 0, 0], [1, 1, 0]] }]
        };

        it('is written with its version, the scale, the pins and the measurements', () => {
            const written = JSON.parse(serializeCamerasFile([], { upAxis: '+z', tiltRoll: 0, tiltPitch: 0 }, extras));
            expect(written.version).toBe(SIDECAR_VERSION);
            expect(SIDECAR_VERSION).toBe(2);
            expect(written).toMatchObject({ scale: { metersPerUnit: 0.5 }, annotations: [pin], measurements: extras.measurements });
        });

        it('round trips, the vector "auto" resolved to included', () => {
            const text = serializeCamerasFile([], { upAxis: 'auto', up: [0, 0, 1], tiltRoll: 1, tiltPitch: 2 }, extras);
            expect(parseCamerasFile(text)).toEqual({
                cameras: [], orientation: { upAxis: 'auto', up: [0, 0, 1], tiltRoll: 1, tiltPitch: 2 },
                scale: { metersPerUnit: 0.5 }, annotations: [pin], measurements: extras.measurements
            });
        });

        it('keeps the vector out of the file for an axis, where it would mean nothing', () => {
            const text = serializeCamerasFile([], { upAxis: '-y', up: [0, 0, 1], tiltRoll: 0, tiltPitch: 0 });
            expect(JSON.parse(text).orientation.up).toBeUndefined();
        });

        it('is read from version 1, which has none of it, and from the first layout', () => {
            const v1 = parseCamerasFile(JSON.stringify({ version: 1, orientation: { upAxis: '+z' }, cameras: [{ position: [0, 0, 1] }] }));
            expect(v1).toMatchObject({ scale: null, annotations: [], measurements: [] });
            expect(v1.cameras).toHaveLength(1);
            expect(parseCamerasFile('[]')).toMatchObject({ scale: null, annotations: [], measurements: [] });
            expect(parseCamerasFile('null')).toMatchObject({ cameras: [], scale: null, annotations: [], measurements: [] });
        });

        it('drops what cannot be used and keeps the rest', () => {
            const parsed = parseCamerasFile(JSON.stringify({
                orientation: { upAxis: 'auto', up: [0, 0, 0] },
                scale: { metersPerUnit: -1 },
                annotations: [{ title: 'no position' }, { position: [1, 2, 3], link: 'javascript:alert(1)', image: '../secret.jpg' }, 'x'],
                measurements: [{ kind: 'volume', points: [[0, 0, 0]] }, { kind: 'distance', points: [[0, 0, 0]] }, { kind: 'point', points: [[1, 2, 3]] }]
            }));
            expect(parsed.scale).toBeNull();
            expect(parsed.orientation.up).toBeUndefined();
            expect(parsed.annotations).toHaveLength(1);
            expect(parsed.annotations[0]).toMatchObject({ link: '', image: '', view: null, text: '' });
            expect(parsed.measurements).toEqual([{ id: 2, kind: 'point', points: [[1, 2, 3]] }]);
        });
    });

    describe('a file written by hand or by another program', () => {
        afterEach(() => vi.restoreAllMocks());

        const ids = items => items.map(item => item.id);
        const allDistinct = values => new Set(values).size === values.length;

        it('gives a new id to an item whose id an earlier one has, and keeps the first', () => {
            const parsed = parseCamerasFile(JSON.stringify({
                cameras: [{ id: 'a', position: [0, 0, 0] }, { id: 'a', position: [1, 0, 0] }],
                annotations: [{ id: 7, position: [0, 0, 0] }, { id: 7, position: [1, 0, 0] }, { id: 7, position: [2, 0, 0] }],
                // The second has no id and is read with its place, 1, which the first has
                measurements: [{ id: 1, kind: 'point', points: [[0, 0, 0]] }, { kind: 'point', points: [[1, 0, 0]] }]
            }));
            for (const list of [parsed.cameras, parsed.annotations, parsed.measurements]) expect(allDistinct(ids(list))).toBe(true);
            expect(parsed.cameras[0].id).toBe('a');
            expect(parsed.annotations[0].id).toBe(7);
            expect(parsed.measurements[0].id).toBe(1);
            expect(parsed.annotations.map(a => a.position[0])).toEqual([0, 1, 2]);
        });

        it('reads an id that is neither a number nor a text as the place of the item', () => {
            const parsed = parseCamerasFile(JSON.stringify({ cameras: [{ id: { x: 1 }, position: [0, 0, 0] }, { id: null, position: [0, 0, 0] }] }));
            expect(ids(parsed.cameras)).toEqual([0, 1]);
        });

        it(`reads at most ${MAX_SAVED_ITEMS} cameras, pins and measurements, with a warning`, () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const many = make => Array.from({ length: MAX_SAVED_ITEMS + 5 }, (_, i) => make(i));
            const parsed = parseCamerasFile(JSON.stringify({
                cameras: many(i => ({ id: i, position: [i, 0, 0] })),
                annotations: many(i => ({ id: i, position: [i, 0, 0] })),
                measurements: many(i => ({ id: i, kind: 'point', points: [[i, 0, 0]] }))
            }));
            expect(parsed.cameras).toHaveLength(MAX_SAVED_ITEMS);
            expect(parsed.annotations).toHaveLength(MAX_SAVED_ITEMS);
            expect(parsed.measurements).toHaveLength(MAX_SAVED_ITEMS);
            expect(parsed.cameras[MAX_SAVED_ITEMS - 1].id).toBe(MAX_SAVED_ITEMS - 1);
            expect(warn).toHaveBeenCalledTimes(3);
        });

        it(`reads a shape with at most ${MAX_SHAPE_POINTS} points, the first ones, with a warning`, () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const points = Array.from({ length: MAX_SHAPE_POINTS + 10 }, (_, i) => [i, 0, 0]);
            const [shape] = parseCamerasFile(JSON.stringify({ measurements: [{ id: 1, kind: 'distance', points }] })).measurements;
            expect(shape.points).toHaveLength(MAX_SHAPE_POINTS);
            expect(shape.points[MAX_SHAPE_POINTS - 1]).toEqual([MAX_SHAPE_POINTS - 1, 0, 0]);
            expect(warn).toHaveBeenCalledOnce();
        });

        it('drops a camera whose position is not made of numbers, and defaults a rotation, a target or a field of view that is not', () => {
            const parsed = parseCamerasFile(JSON.stringify({
                cameras: [
                    { id: 1, position: ['x', 0, 0] },
                    { id: 2, position: [0, 0, 0], quaternion: [0, 'x', 0, 1], target: [0, 'y', 0], fov: 'wide' },
                    { id: 3, position: [0, 0, 0], fov: -10 }
                ]
            }));
            expect(ids(parsed.cameras)).toEqual([2, 3]);
            expect(parsed.cameras[0]).toMatchObject({ quaternion: [0, 0, 0, 1], target: null, fov: 60 });
            expect(parsed.cameras[1].fov).toBe(60);
            expect(normalizeCamera({ position: [0, NaN, 0] }, 0)).toBeNull();
            expect(normalizeCamera({ position: [0, 0, 0], fov: NaN }, 0).fov).toBe(60);
        });
    });

    it('keep the active camera when the list changes', () => {
        expect(activeAfterDelete(2, 0)).toBe(1);
        expect(activeAfterDelete(2, 2)).toBeNull();
        expect(activeAfterDelete(1, 3)).toBe(1);
        expect(activeAfterMove(1, 1, 2)).toBe(2);
        expect(activeAfterMove(2, 1, 2)).toBe(1);
        expect(activeAfterMove(0, 1, 2)).toBe(0);
    });
});
