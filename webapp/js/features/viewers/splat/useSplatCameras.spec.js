import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useSplatCameras } from './useSplatCameras';

const rig = {
    camera: { position: { x: 1, y: 2, z: 3 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, fov: 60 },
    controls: { target: { x: 0, y: 0, z: 0 } }
};
const SAVED = JSON.stringify({
    version: 1,
    orientation: { upAxis: '+z', flipped: false, tiltRoll: 3, tiltPitch: -2 },
    cameras: [{ id: 1, name: 'Front', position: [0, 0, 5], quaternion: [0, 0, 0, 1], fov: 50, target: null }]
});

let dataset;
let notify;
let confirm;
let canWrite;
let orientation;

function make(overrides = {}) {
    return useSplatCameras({
        dataset: ref(dataset), entry: ref({ path: 'scenes/site.spz' }), canWrite, notify, confirm,
        getRig: () => rig, orientation, ...overrides
    });
}

beforeEach(() => {
    dataset = { getFileContents: vi.fn().mockResolvedValue(SAVED), writeObj: vi.fn().mockResolvedValue({}) };
    notify = { success: vi.fn(), warn: vi.fn(), error: vi.fn() };
    confirm = vi.fn().mockResolvedValue(true);
    canWrite = ref(true);
    orientation = { upAxis: ref('-y'), tiltRoll: ref(0), tiltPitch: ref(0) };
});

describe('loading the sidecar', () => {
    it('reads the cameras and the orientation next to the splat', async () => {
        const cams = make();
        await cams.load();
        expect(dataset.getFileContents).toHaveBeenCalledWith('scenes/site_cameras.json');
        expect(cams.cameras.value.map(c => c.name)).toEqual(['Front']);
        expect([orientation.upAxis.value, orientation.tiltRoll.value, orientation.tiltPitch.value]).toEqual(['+z', 3, -2]);
        expect(cams.unreadable.value).toBe(false);
        expect(notify.warn).not.toHaveBeenCalled();
    });

    it('reads "auto" from the sidecar and writes it back as it is', async () => {
        dataset.getFileContents.mockResolvedValue(JSON.stringify({ orientation: { upAxis: 'auto', tiltRoll: 1 }, cameras: [] }));
        const cams = make();
        await cams.load();
        expect(orientation.upAxis.value).toBe('auto');
        await cams.save();
        expect(JSON.parse(dataset.writeObj.mock.calls[0][1]).orientation).toEqual({ upAxis: 'auto', tiltRoll: 1, tiltPitch: 0 });
    });

    it('leaves the up axis as it was (unset) for a sidecar without one, so the viewer can choose', async () => {
        dataset.getFileContents.mockResolvedValue(JSON.stringify({ orientation: { tiltRoll: 1 }, cameras: [] }));
        orientation.upAxis.value = null;
        await make().load();
        expect(orientation.upAxis.value).toBeNull();
    });

    it('treats a missing sidecar as none, with no warning', async () => {
        dataset.getFileContents.mockRejectedValue(new Error('Not found'));
        const cams = make();
        await cams.load();
        expect(cams.cameras.value).toEqual([]);
        expect(cams.unreadable.value).toBe(false);
        expect(notify.warn).not.toHaveBeenCalled();
        expect(orientation.upAxis.value).toBe('-y');
    });

    it('warns about a sidecar that does not parse, and keeps the orientation as it was', async () => {
        dataset.getFileContents.mockResolvedValue('{ "cameras": [');
        const cams = make();
        await cams.load();
        expect(cams.cameras.value).toEqual([]);
        expect(cams.unreadable.value).toBe(true);
        expect(notify.warn).toHaveBeenCalledTimes(1);
        expect(notify.warn.mock.calls[0][0]).toMatch(/could not be read/);
        expect(orientation.upAxis.value).toBe('-y');
    });
});

describe('precedence of the sidecar over what is remembered', () => {
    it('replaces the fields it has and leaves the others as the viewer set them', async () => {
        // An old sidecar: a flip and one tilt angle only
        dataset.getFileContents.mockResolvedValue(JSON.stringify({ orientation: { flipped: false, tiltRoll: 7 }, cameras: [] }));
        orientation.upAxis.value = '-z';
        orientation.tiltRoll.value = 20;
        orientation.tiltPitch.value = -12;
        await make().load();
        expect([orientation.upAxis.value, orientation.tiltRoll.value, orientation.tiltPitch.value]).toEqual(['+y', 7, -12]);
    });

    it('leaves what is remembered when the sidecar has no orientation', async () => {
        dataset.getFileContents.mockResolvedValue(JSON.stringify([{ position: [0, 0, 1] }]));
        orientation.upAxis.value = '+x';
        orientation.tiltPitch.value = 4;
        await make().load();
        expect([orientation.upAxis.value, orientation.tiltRoll.value, orientation.tiltPitch.value]).toEqual(['+x', 0, 4]);
    });
});

describe('saving', () => {
    it('writes the cameras and the orientation, and clears the unsaved mark', async () => {
        const cams = make();
        await cams.load();
        cams.add();
        expect(cams.dirty.value).toBe(true);
        expect(cams.activeIndex.value).toBe(1);

        expect(await cams.save()).toBe(true);
        const [path, content] = dataset.writeObj.mock.calls[0];
        expect(path).toBe('scenes/site_cameras.json');
        expect(JSON.parse(content)).toMatchObject({ orientation: { upAxis: '+z', flipped: false, tiltRoll: 3, tiltPitch: -2 } });
        expect(JSON.parse(content).cameras).toHaveLength(2);
        expect(cams.dirty.value).toBe(false);
        expect(notify.success).toHaveBeenCalledWith({ summary: 'Camera views saved' });
        expect(confirm).not.toHaveBeenCalled();
    });

    it('reports a failed save as a notification, not a page error, and keeps the unsaved mark', async () => {
        dataset.writeObj.mockRejectedValue(new Error('disk full'));
        const cams = make();
        await cams.load();
        cams.add();
        expect(await cams.save()).toBe(false);
        expect(notify.error).toHaveBeenCalledTimes(1);
        expect(notify.error.mock.calls[0][0]).toBe('Failed to save camera views: disk full');
        expect(cams.dirty.value).toBe(true);
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('does not save without write access, and says so as a notification', async () => {
        canWrite.value = false;
        const cams = make();
        await cams.load();
        expect(await cams.save()).toBe(false);
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(notify.error).toHaveBeenCalledTimes(1);
    });

    describe('over a sidecar that could not be read', () => {
        beforeEach(() => dataset.getFileContents.mockResolvedValue('not json'));

        it('does not replace it until the user confirms', async () => {
            const cams = make();
            await cams.load();
            cams.add();
            confirm.mockResolvedValue(false);

            expect(await cams.save()).toBe(false);
            expect(confirm).toHaveBeenCalledTimes(1);
            expect(dataset.writeObj).not.toHaveBeenCalled();
            expect(cams.unreadable.value).toBe(true);

            confirm.mockResolvedValue(true);
            expect(await cams.save()).toBe(true);
            expect(dataset.writeObj).toHaveBeenCalledTimes(1);
            expect(cams.unreadable.value).toBe(false);
        });

        it('asks only once: after it was replaced the file is the editor\'s own', async () => {
            const cams = make();
            await cams.load();
            await cams.save();
            await cams.save();
            expect(confirm).toHaveBeenCalledTimes(1);
            expect(dataset.writeObj).toHaveBeenCalledTimes(2);
        });
    });
});

describe('editing the list', () => {
    it('adds, renames, moves and deletes cameras, keeping the active one on the same camera', async () => {
        const cams = make();
        await cams.load();
        cams.add();
        cams.add();
        expect(cams.cameras.value.map(c => c.name)).toEqual(['Front', 'Camera 2', 'Camera 3']);
        cams.rename({ index: 1, name: 'Roof' });
        cams.activeIndex.value = 1;
        cams.move({ index: 1, dir: 1 });
        expect(cams.cameras.value.map(c => c.name)).toEqual(['Front', 'Camera 3', 'Roof']);
        expect(cams.activeIndex.value).toBe(2);
        cams.remove(0);
        expect(cams.cameras.value.map(c => c.name)).toEqual(['Camera 3', 'Roof']);
        expect(cams.activeIndex.value).toBe(1);
    });

    it('updates a camera to the current view', async () => {
        const cams = make();
        await cams.load();
        cams.update(0);
        expect(cams.cameras.value[0]).toMatchObject({ name: 'Front', position: [1, 2, 3], fov: 60 });
        expect(cams.dirty.value).toBe(true);
    });
});
