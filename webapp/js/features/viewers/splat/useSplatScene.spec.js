import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useSplatScene } from './useSplatScene';
import { parseCamerasFile } from './cameraPresets';

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
    return useSplatScene({
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
        expect(notify.success).toHaveBeenCalledWith({ summary: 'Views saved' });
        expect(confirm).not.toHaveBeenCalled();
    });

    it('reports a failed save as a notification, not a page error, and keeps the unsaved mark', async () => {
        dataset.writeObj.mockRejectedValue(new Error('disk full'));
        const cams = make();
        await cams.load();
        cams.add();
        expect(await cams.save()).toBe(false);
        expect(notify.error).toHaveBeenCalledTimes(1);
        expect(notify.error.mock.calls[0][0]).toBe('Failed to save the views: disk full');
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

describe('the file of version 2', () => {
    const PIN = { id: 7, title: 'Gate', text: 'The **north** gate', link: 'https://example.com/gate', image: 'photos/gate.jpg', position: [1, 2, 3], view: { position: [0, 0, 9], quaternion: [0, 0, 0, 1], fov: 50, target: [1, 2, 3] } };
    const MEASUREMENT = { id: 3, kind: 'distance', points: [[0, 0, 0], [3, 4, 0]] };
    const V2 = JSON.stringify({
        version: 2,
        orientation: { upAxis: 'auto', up: [0, 0, 1], tiltRoll: 1, tiltPitch: 2 },
        scale: { metersPerUnit: 0.25 },
        cameras: [{ id: 1, name: 'Front', position: [0, 0, 5], quaternion: [0, 0, 0, 1], fov: 50, target: null }],
        annotations: [PIN],
        measurements: [MEASUREMENT]
    });

    it('is read whole, with the vector "auto" resolved to', async () => {
        dataset.getFileContents.mockResolvedValue(V2);
        const scene = make();
        await scene.load();
        expect(scene.cameras.value).toHaveLength(1);
        expect(scene.annotations.value).toEqual([PIN]);
        expect(scene.measurements.value).toEqual([MEASUREMENT]);
        expect(scene.scale.value).toEqual({ metersPerUnit: 0.25 });
        expect(orientation.upAxis.value).toBe('auto');
        expect(scene.savedUp.value).toEqual([0, 0, 1]);
    });

    it('keeps the vector only for "auto": another axis is the whole orientation', async () => {
        dataset.getFileContents.mockResolvedValue(JSON.stringify({ orientation: { upAxis: '+z', up: [0, 0, 1] }, cameras: [] }));
        const scene = make();
        await scene.load();
        expect(scene.savedUp.value).toBeNull();
    });

    it('is written back as read: a version 1 file becomes version 2 with nothing lost and nothing invented', async () => {
        const scene = make();
        await scene.load();
        expect(scene.annotations.value).toEqual([]);
        expect(scene.scale.value).toBeNull();
        scene.add();
        await scene.save();
        const written = JSON.parse(dataset.writeObj.mock.calls[0][1]);
        expect(written).toMatchObject({ version: 2, orientation: { upAxis: '+z', flipped: false, tiltRoll: 3, tiltPitch: -2 }, annotations: [], measurements: [] });
        expect(written.scale).toBeUndefined();
        expect(written.cameras.map(c => c.name)).toEqual(['Front', 'Camera 2']);
    });

    it('round trips the pins, the scale, the measurements and the resolved up through save and load', async () => {
        dataset.getFileContents.mockResolvedValue(V2);
        orientation.autoUp = ref({ up: [0, 0.6, 0.8] });
        const scene = make();
        await scene.load();
        scene.setScale(2);
        await scene.save();

        const [path, content] = dataset.writeObj.mock.calls[0];
        expect(path).toBe('scenes/site_cameras.json');
        const back = parseCamerasFile(content);
        expect(back.annotations).toEqual([PIN]);
        expect(back.measurements).toEqual([MEASUREMENT]);
        expect(back.scale).toEqual({ metersPerUnit: 2 });
        // The up "auto" follows now is the one saved with the views
        expect(back.orientation).toEqual({ upAxis: 'auto', up: [0, 0.6, 0.8], tiltRoll: 1, tiltPitch: 2 });
    });

    it('is still read when it is the first layout, a bare list of cameras', async () => {
        dataset.getFileContents.mockResolvedValue(JSON.stringify([{ position: [0, 0, 1] }]));
        const scene = make();
        await scene.load();
        expect(scene.cameras.value).toHaveLength(1);
        expect(scene.annotations.value).toEqual([]);
        expect(scene.measurements.value).toEqual([]);
        expect(scene.scale.value).toBeNull();
    });
});

describe('pins', () => {
    it('are added at a point with the view now, edited, given the view now again, moved and removed', async () => {
        const scene = make();
        await scene.load();
        expect(scene.addPin({ position: [4, 5, 6] })).toBe(0);
        scene.addPin({ position: [7, 8, 9] });
        expect(scene.annotations.value.map(a => a.title)).toEqual(['Pin 1', 'Pin 2']);
        expect(scene.annotations.value[0]).toMatchObject({ position: [4, 5, 6], view: { position: [1, 2, 3], fov: 60, target: [0, 0, 0] } });
        expect(scene.activePin.value).toBe(1);

        scene.editPin(0, { title: 'Door', text: 'Closed', link: 'https://example.com', image: 'a.jpg' });
        scene.renamePin({ index: 1, name: 'Window' });
        scene.movePin({ index: 1, dir: -1 });
        expect(scene.annotations.value.map(a => a.title)).toEqual(['Window', 'Door']);
        expect(scene.activePin.value).toBe(0);

        rig.camera.position.x = 10;
        scene.updatePinView(1);
        expect(scene.annotations.value[1].view.position).toEqual([10, 2, 3]);

        scene.removePin(0);
        expect(scene.annotations.value.map(a => a.title)).toEqual(['Door']);
        expect(scene.dirty.value).toBe(true);
        rig.camera.position.x = 1;
    });
});

describe('what only a writer changes', () => {
    beforeEach(() => { canWrite.value = false; });

    it('leaves the pins, the scale and the measurements as they were for a reader, who still sees them', async () => {
        dataset.getFileContents.mockResolvedValue(JSON.stringify({ version: 2, cameras: [], annotations: [{ id: 1, title: 'Gate', position: [0, 0, 0] }], scale: { metersPerUnit: 3 } }));
        const scene = make();
        await scene.load();
        expect(scene.annotations.value.map(a => a.title)).toEqual(['Gate']);

        expect(scene.addPin({ position: [1, 1, 1] })).toBeUndefined();
        scene.editPin(0, { title: 'Changed' });
        scene.renamePin({ index: 0, name: 'Changed' });
        scene.updatePinView(0);
        scene.movePin({ index: 0, dir: 1 });
        scene.removePin(0);
        scene.setScale(9);
        scene.setMeasurements([{ id: 1, kind: 'point', points: [[0, 0, 0]] }]);

        expect(scene.annotations.value.map(a => a.title)).toEqual(['Gate']);
        expect(scene.scale.value).toEqual({ metersPerUnit: 3 });
        expect(scene.measurements.value).toEqual([]);
        expect(scene.dirty.value).toBe(false);
    });

    it('keeps the measurements of a writer, which are saved with the file', async () => {
        canWrite.value = true;
        const scene = make();
        await scene.load();
        scene.setMeasurements([{ id: 1, kind: 'distance', points: [[0, 0, 0], [0, 0, 2]] }]);
        expect(scene.dirty.value).toBe(true);
        await scene.save();
        expect(JSON.parse(dataset.writeObj.mock.calls[0][1]).measurements).toEqual([{ id: 1, kind: 'distance', points: [[0, 0, 0], [0, 0, 2]] }]);
    });
});
