import { describe, it, expect } from 'vitest';
import { camerasPathFor, parseCamerasFile, serializeCamerasFile, normalizeCamera, activeAfterDelete, activeAfterMove } from './cameraPresets';

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

    it('keep the active camera when the list changes', () => {
        expect(activeAfterDelete(2, 0)).toBe(1);
        expect(activeAfterDelete(2, 2)).toBeNull();
        expect(activeAfterDelete(1, 3)).toBe(1);
        expect(activeAfterMove(1, 1, 2)).toBe(2);
        expect(activeAfterMove(2, 1, 2)).toBe(1);
        expect(activeAfterMove(0, 1, 2)).toBe(0);
    });
});
