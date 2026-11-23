// @ts-check
/**
 * useViewMeasurements - the measurements of the dataset map when it is saved as a view (Save as view). A view shows the
 * measurements saved with its files, so the measurements on the map go with it:
 *
 * - the view reads the file the map saves in (its layers have the same owner): measurements that are not saved are
 *   offered a Save, which puts them in the view;
 * - the view reads another file (one georaster has a file of its own; the map, showing other files of the folder too,
 *   saves in the folder's): the user is asked to save the measurements of the map and copy them into the view's file,
 *   so the view shows them. The two files then hold copies.
 *
 *   const viewMeasurements = useViewMeasurements({ dataset, choose, measurements, onFileWritten });
 *   if (await viewMeasurements.include(state)) await viewActions.saveAsNew(state);
 */
import { escapeHtml } from '@/libs/sanitize';
import { viewMeasurementOwner } from '@/libs/map/measurementOwner';
import { MeasurementStorage, copyMeasurements } from '@/libs/map/measurementStorage';
import { useNotify } from '@/composables/useNotify';
import { saveMeasurementsFirst } from '@/composables/saveMeasurementsFirst';

/**
 * @param {object} ctx
 * @param {any} ctx.dataset
 * @param {(options: object) => Promise<'confirm'|'secondary'|'cancel'>} ctx.choose
 * @param {{ isDirty: () => boolean, save: () => Promise<void>, owner: () => ({ path: string } | null), count: () => number }} ctx.measurements
 *   the measurements on the map: unsaved changes, Save, the entry whose file they are saved in, how many the map shows
 * @param {(path: string) => void} [ctx.onFileWritten]  the dataset page lists a file the copy wrote
 */
export function useViewMeasurements({ dataset, choose, measurements, onFileWritten = () => {} }) {
    const notify = useNotify();

    /**
     * Asks about the measurements of the map before the view is saved, and saves (or copies) them as the user says.
     * @param {import('@/libs/views/viewState').ViewState} state  the view to save
     * @returns {Promise<boolean>}  whether the view is to be saved (false: the user cancelled, or a save or copy failed)
     */
    async function include(state) {
        const owner = measurements.owner();
        const viewOwner = viewMeasurementOwner(state);
        const viewFile = new MeasurementStorage(null, viewOwner).measurementPath;
        const mapFile = owner ? new MeasurementStorage(null, owner).measurementPath : '';
        const count = measurements.count();
        if (!owner || viewFile === mapFile || !count) {
            return (await saveMeasurementsFirst(choose, measurements, {
                message: 'The view shows the measurements saved with its files. Save the measurements on the map and include them in the view?',
                confirmText: 'Save and include',
                secondaryText: 'Save the view only'
            })) !== 'cancel';
        }
        // A ConfirmDialog renders its message as HTML: the paths are escaped
        const [what, them] = count === 1 ? ['measurement', 'it'] : [`${count} measurements`, 'them'];
        const answer = await choose({
            title: 'Measurements on the map',
            message: `This view shows the measurements of <strong>${escapeHtml(viewFile)}</strong>, and the map saves its `
                + `${what} in <strong>${escapeHtml(mapFile)}</strong>. Save ${them} and copy ${them} into the file of the view, so the view shows ${them}?`,
            confirmText: 'Save and copy',
            secondaryText: 'Save the view only',
            cancelText: 'Cancel'
        });
        if (answer === 'cancel') return false;
        if (answer === 'secondary') return true;
        if (measurements.isDirty()) {
            await measurements.save();
            // A save that did not save (its alert says why) leaves them dirty: the view waits
            if (measurements.isDirty()) return false;
        }
        try {
            const copied = await copyMeasurements(dataset, owner, viewOwner);
            if (copied) onFileWritten(viewFile);
            return true;
        } catch (e) {
            console.error('Cannot copy the measurements into the view:', e);
            notify.error(e instanceof Error ? e.message : String(e), { summary: 'Cannot copy the measurements' });
            return false;
        }
    }

    return { include };
}
