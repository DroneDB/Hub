// @ts-check
/**
 * useSplatCameras - the saved camera views of a splat: the `<name>_cameras.json` sidecar next to
 * it (the cameras and the scene orientation), the list the viewer edits, and saving it back.
 *
 *   const cams = useSplatCameras({ dataset, entry, canWrite, notify, confirm, getRig, orientation });
 *   await cams.load();                       // before the scene is built: the orientation it reads is applied
 *   cams.cameras.value, cams.activeIndex.value, cams.dirty.value, cams.add() / update(i) / remove(i) / move({ index, dir }) / rename({ index, name }) / save()
 *
 * The orientation refs hold what the viewer remembers for the entry when load() runs; a field the
 * sidecar has replaces it (the sidecar wins), a field it lacks leaves it (the up axis may be null
 * then: the viewer tells a sidecar's up from the rest to choose the one the scene opens with).
 * The up axis is an axis or "auto" (the up the build estimated), written and read as it is.
 *
 * A sidecar that cannot be read is not the same as none: it is reported, and saving, which would
 * replace it, asks first.
 */
import { ref } from 'vue';
import { camerasPathFor, parseCamerasFile, serializeCamerasFile, cameraFromRig, activeAfterDelete, activeAfterMove } from './cameraPresets';

/**
 * @param {object} options
 * @param {{ value: any }} options.dataset            the dataset (a ref)
 * @param {{ value: any }} options.entry              the splat entry (a ref)
 * @param {{ value: boolean }} options.canWrite       whether the user may write to the dataset (a ref)
 * @param {{ success: Function, warn: Function, error: Function }} options.notify
 * @param {(options: { title: string, message: string, confirmText: string, danger: boolean }) => Promise<boolean>} options.confirm
 * @param {() => any} options.getRig                  the camera rig (null before the scene exists)
 * @param {{ upAxis: { value: string }, tiltRoll: { value: number }, tiltPitch: { value: number } }} options.orientation
 *   the orientation refs of the viewer: set by load(), written by save()
 */
export function useSplatCameras({ dataset, entry, canWrite, notify, confirm, getRig, orientation }) {
    const cameras = ref(/** @type {any[]} */ ([]));
    const activeIndex = ref(/** @type {number | null} */ (null));
    // Changes the sidecar does not have yet (the viewer also sets it for an orientation change)
    const dirty = ref(false);
    // The sidecar exists but could not be read: saving replaces it
    const unreadable = ref(false);
    let path = '';

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
            if (parsed.orientation.upAxis !== undefined) orientation.upAxis.value = parsed.orientation.upAxis;
            if (parsed.orientation.tiltRoll !== undefined) orientation.tiltRoll.value = parsed.orientation.tiltRoll;
            if (parsed.orientation.tiltPitch !== undefined) orientation.tiltPitch.value = parsed.orientation.tiltPitch;
        } catch (e) {
            cameras.value = [];
            unreadable.value = true;
            notify.warn(`The saved camera views of this splat could not be read (${e instanceof Error ? e.message : e}). `
                + 'Saving camera views will replace the file.', { summary: 'Camera views', life: 'long' });
        }
    }

    function add() {
        cameras.value.push(cameraFromRig(getRig(), `Camera ${cameras.value.length + 1}`));
        dirty.value = true;
        activeIndex.value = cameras.value.length - 1;
    }

    function update(/** @type {number} */ index) {
        const c = cameras.value[index];
        if (!c) return;
        const { position, quaternion, fov, target } = cameraFromRig(getRig(), c.name);
        Object.assign(c, { position, quaternion, fov, target });
        dirty.value = true;
        activeIndex.value = index;
    }

    function remove(/** @type {number} */ index) {
        if (index < 0 || index >= cameras.value.length) return;
        cameras.value.splice(index, 1);
        dirty.value = true;
        activeIndex.value = activeAfterDelete(activeIndex.value, index);
    }

    function move(/** @type {{ index: number, dir: number }} */ { index, dir }) {
        const dest = index + dir;
        const list = cameras.value;
        if (index < 0 || index >= list.length || dest < 0 || dest >= list.length) return;
        list.splice(dest, 0, list.splice(index, 1)[0]);
        dirty.value = true;
        activeIndex.value = activeAfterMove(activeIndex.value, index, dest);
    }

    function rename(/** @type {{ index: number, name: string }} */ { index, name }) {
        const c = cameras.value[index];
        if (!c) return;
        c.name = name;
        dirty.value = true;
    }

    /** Writes the sidecar. Every failure is a notification (the page keeps working). @returns {Promise<boolean>} whether it was written */
    async function save() {
        if (!canWrite.value) {
            notify.error("You don't have permission to save camera views in this dataset.", { summary: 'Camera views' });
            return false;
        }
        if (unreadable.value) {
            const replace = await confirm({
                title: 'Replace the saved camera views',
                message: 'The saved camera views file of this splat could not be read. Saving replaces it with the views shown now.',
                confirmText: 'Replace',
                danger: true
            });
            if (!replace) return false;
        }
        try {
            await dataset.value.writeObj(path, serializeCamerasFile(cameras.value, {
                upAxis: orientation.upAxis.value, tiltRoll: orientation.tiltRoll.value, tiltPitch: orientation.tiltPitch.value
            }));
        } catch (e) {
            notify.error(`Failed to save camera views: ${e instanceof Error ? e.message : e}`, { summary: 'Camera views' });
            return false;
        }
        dirty.value = false;
        unreadable.value = false;
        notify.success({ summary: 'Camera views saved' });
        return true;
    }

    return { cameras, activeIndex, dirty, unreadable, load, add, update, remove, move, rename, save };
}
