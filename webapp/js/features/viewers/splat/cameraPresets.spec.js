import { describe, it, expect } from 'vitest';
import { SIDECAR_VERSION, camerasPathFor, parseCamerasFile, serializeCamerasFile, normalizeCamera, activeAfterDelete, activeAfterMove } from './cameraPresets';

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

    it('keep the active camera when the list changes', () => {
        expect(activeAfterDelete(2, 0)).toBe(1);
        expect(activeAfterDelete(2, 2)).toBeNull();
        expect(activeAfterDelete(1, 3)).toBe(1);
        expect(activeAfterMove(1, 1, 2)).toBe(2);
        expect(activeAfterMove(2, 1, 2)).toBe(1);
        expect(activeAfterMove(0, 1, 2)).toBe(0);
    });
});
