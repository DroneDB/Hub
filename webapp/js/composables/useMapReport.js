// @ts-check
/**
 * useMapReport - the "Report" button of the map: opens the report editor with the file the map saves its measurements
 * in as the source and the view the map shows as the cover. A report reads the saved file, so unsaved measurements are
 * offered a Save first. A map that has no saved measurements opens the editor with no source, which the editor asks for.
 *
 * The cover is the working state of the view the map shows (a saved view with its unsaved changes, a new view of a file).
 * The dataset map has no view state: its georasters, the first one on top, make one.
 */
import { toRaw } from 'vue';
import { isGeoraster } from '@/libs/entryTypes';
import { buildEntryState } from '@/libs/views/viewState';

/**
 * The view state the report draws its maps on: the view the map shows, or the georasters of the files on the dataset map.
 * @param {import('@/libs/views/viewState').ViewState | null | undefined} view
 * @param {{ entry?: any }[]} files  the files the map shows, in draw order (the last one on top)
 * @returns {import('@/libs/reports/reportDefinition').ReportCover | null}
 */
export function coverOfMap(view, files) {
    if (view) return { viewState: JSON.parse(JSON.stringify(toRaw(view))) };
    const rasters = files.map(f => f.entry).filter(e => e && isGeoraster(e)).reverse();
    if (!rasters.length) return null;
    const [first, ...others] = rasters;
    return { viewState: buildEntryState({ path: first.path, hash: first.hash || '' }, others.map(e => e.path), { baseIsGeoraster: true }) };
}

/**
 * @param {object} ctx
 * @param {{ create: (initial: { sources: string[], cover: any }) => Promise<any> } | null} ctx.actions  useReportActions of the dataset, none without a dataset
 * @param {(options: object) => Promise<'confirm'|'secondary'|'cancel'>} ctx.choose
 * @param {() => import('@/libs/views/viewState').ViewState | null | undefined} ctx.view
 * @param {() => { entry?: any }[]} ctx.files
 * @param {{ isDirty: () => boolean, hasSaved: () => boolean, filePath: () => string, save: () => Promise<void> }} ctx.measurements
 */
export function useMapReport({ actions, choose, view, files, measurements }) {
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
        await actions.create({ sources: file ? [file] : [], cover: coverOfMap(view(), files()) });
    }

    return { startReport };
}
