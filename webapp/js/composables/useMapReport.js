// @ts-check
/**
 * useMapReport - the "Report" button of the map: opens the report editor with the file the map saves its measurements
 * in as the source and the view the map shows as the view of the report. A report reads the saved file, so unsaved
 * measurements are offered a Save first. A map that has no saved measurements opens the editor with no source: the
 * editor then proposes one of the dataset.
 *
 * The view: a saved view that the map shows as it was saved is the report's view as it is. Anything else (a saved
 * view with unsaved changes, a new view of a file, the georasters of the dataset map) is the state on show, which the
 * editor saves as a new view with the report, so the report never points to a view that nobody can open.
 */
import { toRaw } from 'vue';

/**
 * @typedef {{ uid: string } | { state: import('@/libs/views/viewState').ViewState, name: string }} MapReportView
 *   a saved view, or a state to save as a new view (named `name`, or after its base file when that is empty)
 */

/**
 * The view a report from this map starts with.
 * @param {import('@/libs/views/viewState').ViewState | null | undefined} state  what the map shows (none: a dataset map with no georaster)
 * @param {{ uid: string, name: string, dirty: boolean } | null | undefined} info  the saved view on show (uid '' for a new view of a file) and its name
 * @returns {MapReportView | null}
 */
export function viewOfMap(state, info) {
    if (!state) return null;
    if (info?.uid && !info.dirty) return { uid: info.uid };
    return { state: JSON.parse(JSON.stringify(toRaw(state))), name: info?.name ?? '' };
}

/**
 * @param {object} ctx
 * @param {{ create: (initial: { sources: string[], view: MapReportView | null }) => Promise<any> } | null} ctx.actions  useReportActions of the dataset, none without a dataset
 * @param {(options: object) => Promise<'confirm'|'secondary'|'cancel'>} ctx.choose
 * @param {() => import('@/libs/views/viewState').ViewState | null | undefined} ctx.state  what the map shows as a view
 * @param {() => { uid: string, name: string, dirty: boolean } | null | undefined} [ctx.viewInfo]  the view of the map viewer
 * @param {{ isDirty: () => boolean, hasSaved: () => boolean, filePath: () => string, save: () => Promise<void> }} ctx.measurements
 */
export function useMapReport({ actions, choose, state, viewInfo = () => null, measurements }) {
    /** Whether the measurements are in their file, asking the user what to do when they are not: false when the report must not start. */
    async function measurementsSaved() {
        if (!measurements.isDirty()) return true;
        const answer = await choose({
            title: 'Unsaved measurements',
            message: 'A report reads the saved measurements file. Save the measurements on the map first?',
            confirmText: 'Save and continue',
            secondaryText: 'Continue without saving',
            cancelText: 'Cancel'
        });
        if (answer === 'cancel') return false;
        if (answer === 'confirm') {
            await measurements.save();
            // A save that did not save (its alert says why) leaves them dirty: the report waits
            return !measurements.isDirty();
        }
        return true;
    }

    async function startReport() {
        if (!actions || !(await measurementsSaved())) return;
        const file = measurements.hasSaved() ? measurements.filePath() : '';
        await actions.create({ sources: file ? [file] : [], view: viewOfMap(state(), viewInfo()) });
    }

    return { startReport };
}
