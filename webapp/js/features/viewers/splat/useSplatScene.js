// @ts-check
/**
 * useSplatScene - what is saved with a splat: the `<name>_cameras.json` sidecar next to it (the
 * scene orientation, the scale, the camera views, the pins and the measurements), the lists the
 * viewer edits, and saving it back.
 *
 *   const scene = useSplatScene({ dataset, entry, canWrite, notify, confirm, getRig, orientation });
 *   await scene.load();                       // before the scene is built: the orientation it reads is applied
 *   scene.cameras.value, scene.activeIndex.value, scene.dirty.value, scene.add() / update(i) / remove(i) / move({ index, dir }) / rename({ index, name })
 *   scene.annotations.value, scene.addPin({ position }) / editPin(i, changes) / updatePinView(i) / removePin(i) ...
 *   scene.scale.value, scene.setScale(metersPerUnit), scene.measurements.value, scene.setMeasurements(list), scene.save()
 *
 * The orientation refs hold what the viewer remembers for the entry when load() runs; a field the
 * sidecar has replaces it (the sidecar wins), a field it lacks leaves it (the up axis may be null
 * then: the viewer tells a sidecar's up from the rest to choose the one the scene opens with).
 * The up axis is an axis or "auto" (the up the build estimated), written and read as it is; for
 * "auto" the file also holds the vector it resolved to (`savedUp` after load(), written from
 * `orientation.autoUp`), so the saved views stay right when a rebuild estimates another up.
 *
 * Reading is for everyone, changing is for writers: the pins, the scale and the measurements are
 * edited only when the user may write to the dataset, and a measurement a reader draws is theirs
 * for the session (it is neither kept nor saved).
 *
 * A sidecar that cannot be read is not the same as none: it is reported, and saving, which would
 * replace it, asks first.
 */
import { ref, shallowRef } from 'vue';
import { camerasPathFor, parseCamerasFile, serializeCamerasFile, viewFromRig, cameraFromRig } from './cameraPresets';
import { editableList } from './editableList';
import { newId } from './sceneData';

/**
 * @param {object} options
 * @param {{ value: any }} options.dataset            the dataset (a ref)
 * @param {{ value: any }} options.entry              the splat entry (a ref)
 * @param {{ value: boolean }} options.canWrite       whether the user may write to the dataset (a ref)
 * @param {{ success: Function, warn: Function, error: Function }} options.notify
 * @param {(options: { title: string, message: string, confirmText: string, danger: boolean }) => Promise<boolean>} options.confirm
 * @param {() => any} options.getRig                  the camera rig (null before the scene exists)
 * @param {{ upAxis: { value: string | null }, tiltRoll: { value: number }, tiltPitch: { value: number }, autoUp?: { value: { up: number[] } | null } }} options.orientation
 *   the orientation refs of the viewer: set by load(), written by save()
 */
export function useSplatScene({ dataset, entry, canWrite, notify, confirm, getRig, orientation }) {
    const cameras = ref(/** @type {any[]} */ ([]));
    const annotations = ref(/** @type {import('./sceneData').Annotation[]} */ ([]));
    const measurements = ref(/** @type {import('./sceneData').Measurement[]} */ ([]));
    const scale = ref(/** @type {{ metersPerUnit: number } | null} */ (null));
    // The vector "auto" resolved to when the sidecar was saved (null: none, or the choice was not auto)
    const savedUp = shallowRef(/** @type {number[] | null} */ (null));
    // Changes the sidecar does not have yet (the viewer also sets it for an orientation change)
    const dirty = ref(false);
    // The sidecar exists but could not be read: saving replaces it
    const unreadable = ref(false);
    let path = '';

    const markDirty = () => { dirty.value = true; };
    const cameraList = editableList(cameras, { nameKey: 'name', markDirty });
    const pinList = editableList(annotations, { nameKey: 'title', markDirty });

    /** Runs a change of what only a writer may change; a reader's attempt does nothing. */
    function forWriters(/** @type {(...args: any[]) => any} */ change) {
        return (/** @type {any[]} */ ...args) => (canWrite.value ? change(...args) : undefined);
    }

    /** Reads the sidecar (absent for most datasets) and applies the orientation it holds. */
    async function load() {
        path = camerasPathFor(entry.value.path);
        let text;
        try {
            text = await dataset.value.getFileContents(path);
        } catch {
            cameras.value = [];
            return;
        }
        try {
            const parsed = parseCamerasFile(text);
            cameras.value = parsed.cameras;
            annotations.value = parsed.annotations;
            measurements.value = parsed.measurements;
            scale.value = parsed.scale;
            if (parsed.orientation.upAxis !== undefined) orientation.upAxis.value = parsed.orientation.upAxis;
            if (parsed.orientation.tiltRoll !== undefined) orientation.tiltRoll.value = parsed.orientation.tiltRoll;
            if (parsed.orientation.tiltPitch !== undefined) orientation.tiltPitch.value = parsed.orientation.tiltPitch;
            savedUp.value = parsed.orientation.upAxis === 'auto' ? (parsed.orientation.up ?? null) : null;
        } catch (e) {
            cameras.value = [];
            unreadable.value = true;
            notify.warn(`The saved views of this splat (camera views, pins and measurements) could not be read (${e instanceof Error ? e.message : e}). `
                + 'Saving will replace the file.', { summary: 'Saved views', life: 'long' });
        }
    }

    // ---- Camera views ---------------------------------------------------------------------

    function add() {
        cameras.value.push(cameraFromRig(getRig(), `Camera ${cameras.value.length + 1}`));
        markDirty();
        cameraList.active.value = cameras.value.length - 1;
    }

    function update(/** @type {number} */ index) {
        const c = cameras.value[index];
        if (!c) return;
        Object.assign(c, viewFromRig(getRig()));
        markDirty();
        cameraList.active.value = index;
    }

    // ---- Pins -----------------------------------------------------------------------------

    /** A pin at a point of the splat (in the frame of the file), with the view the user looks from now. */
    const addPin = forWriters((/** @type {{ position: number[] }} */ { position }) => {
        annotations.value.push({
            id: newId(), title: `Pin ${annotations.value.length + 1}`, text: '', link: '', image: '',
            position: position.slice(), view: viewFromRig(getRig())
        });
        markDirty();
        pinList.active.value = annotations.value.length - 1;
        return annotations.value.length - 1;
    });

    /** Changes the text fields of a pin. */
    const editPin = forWriters((/** @type {number} */ index, /** @type {{ title?: string, text?: string, link?: string, image?: string }} */ changes) => {
        const pin = annotations.value[index];
        if (!pin) return;
        Object.assign(pin, changes);
        markDirty();
    });

    /** Makes the view of a pin the view now. */
    const updatePinView = forWriters((/** @type {number} */ index) => {
        const pin = annotations.value[index];
        if (!pin) return;
        pin.view = viewFromRig(getRig());
        markDirty();
        pinList.active.value = index;
    });

    // ---- Scale and measurements -----------------------------------------------------------

    /** Sets how many metres a unit of the scene is. */
    const setScale = forWriters((/** @type {number} */ metersPerUnit) => {
        scale.value = { metersPerUnit };
        markDirty();
    });

    /**
     * The measurements the tool now shows. A writer's are kept (and saved); a reader's are the
     * tool's, for the session.
     */
    function setMeasurements(/** @type {import('./sceneData').Measurement[]} */ list) {
        if (!canWrite.value) return;
        measurements.value = list.map(m => ({ id: m.id, kind: m.kind, points: m.points.map(p => p.slice()) }));
        markDirty();
    }

    // ---- Saving ---------------------------------------------------------------------------

    /** Writes the sidecar. Every failure is a notification (the page keeps working). @returns {Promise<boolean>} whether it was written */
    async function save() {
        if (!canWrite.value) {
            notify.error("You don't have permission to save in this dataset.", { summary: 'Saved views' });
            return false;
        }
        if (unreadable.value) {
            const replace = await confirm({
                title: 'Replace the saved views',
                message: 'The saved views file of this splat (camera views, pins and measurements) could not be read. Saving replaces it with what is shown now.',
                confirmText: 'Replace',
                danger: true
            });
            if (!replace) return false;
        }
        const upAxis = /** @type {string} */ (orientation.upAxis.value);
        try {
            await dataset.value.writeObj(path, serializeCamerasFile(cameras.value, {
                upAxis, up: orientation.autoUp?.value?.up ?? null, tiltRoll: orientation.tiltRoll.value, tiltPitch: orientation.tiltPitch.value
            }, { scale: scale.value, annotations: annotations.value, measurements: measurements.value }));
        } catch (e) {
            notify.error(`Failed to save the views: ${e instanceof Error ? e.message : e}`, { summary: 'Saved views' });
            return false;
        }
        dirty.value = false;
        unreadable.value = false;
        notify.success({ summary: 'Views saved' });
        return true;
    }

    return {
        cameras, activeIndex: cameraList.active, dirty, unreadable, savedUp,
        load, add, update, remove: cameraList.remove, move: cameraList.move, rename: cameraList.rename,
        annotations, activePin: pinList.active, addPin, editPin, updatePinView,
        removePin: forWriters(pinList.remove), movePin: forWriters(pinList.move), renamePin: forWriters(pinList.rename),
        scale, setScale, measurements, setMeasurements,
        save
    };
}
