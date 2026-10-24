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
        expect(full.orientation).toEqual({ flipped: false, tiltRoll: 2 });
    });

    it('round-trip through the sidecar', () => {
        const cams = [normalizeCamera({ id: 'a', name: 'Door', position: [0, 1, 2], target: [0, 0, 0] }, 0)];
        const text = serializeCamerasFile(cams, { flipped: true, tiltRoll: 0, tiltPitch: 1.5 });
        const back = parseCamerasFile(text);
        expect(back.cameras).toEqual(cams);
        expect(back.orientation).toEqual({ flipped: true, tiltRoll: 0, tiltPitch: 1.5 });
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
