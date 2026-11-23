// @ts-check
/**
 * What a new report starts with, so that a user who opens the editor from the map or the dataset page has a report
 * that can be created at once: a name, the measurement files, the view, and the texts of the cover. The rules use
 * what the editor was opened with (the map's measurement file and view), the newest report of the dataset (the
 * organization a dataset is surveyed for, and the template, units and sections chosen for it, rarely change between
 * two reports) and what the dataset has. Pure data: the editor reads the dataset and gives it here.
 */
import { pathutils } from 'ddb';
import { uniqueName } from '@/libs/metaList/metaListStore';
import { MAX_NAME_LENGTH } from '@/libs/views/viewState';
import { addSource, sectionsFromTemplate } from './reportDefinition';

/**
 * Where the maps of a report are drawn: a saved view; the map the editor was opened from, or a file, saved as a new
 * view named `name` when the report is saved; or the view state an existing report keeps (it is saved as it is).
 * @typedef {{ kind: 'saved', uid: string }
 *   | { kind: 'fromMap', name: string, state: import('@/libs/views/viewState').ViewState }
 *   | { kind: 'fromFile', name: string, path: string }
 *   | { kind: 'kept' }} ViewChoice
 */

/**
 * A file a new view can be made of.
 * @typedef {{ path: string, hash: string, georaster: boolean }} BaseFile
 */

/** A name for a new view or report: `base`, numbered when a view or report has it. @param {string} base @param {Iterable<string>} taken */
export const freeName = (base, taken) => uniqueName(base, taken, MAX_NAME_LENGTH);

/**
 * The report changed last (or made last, for one never changed), or null.
 * @param {{ data: any, newerVersion?: boolean }[]} reports  readable reports (listReports)
 */
export function newestReport(reports) {
    const when = (/** @type {{ data: any }} */ r) => String(r.data?.modifiedAt || r.data?.createdAt || '');
    return reports.filter(r => !r.newerVersion).reduce((/** @type {any} */ best, r) => (!best || when(r) > when(best) ? r : best), null);
}

/**
 * The file a new view is made of when nothing says which: an orthophoto, else the first georaster, else the first file.
 * @param {BaseFile[]} files
 */
export function defaultBaseFile(files) {
    const rasters = files.filter(f => f.georaster);
    return rasters.find(f => /orthophoto/i.test(pathutils.basename(f.path))) ?? rasters[0] ?? files[0] ?? null;
}

/**
 * @param {object} input
 * @param {{ sources?: string[], view?: { uid: string } | { state: import('@/libs/views/viewState').ViewState, name: string } | null }} input.initial
 *   what the editor was opened with (the map gives its measurement file and its view)
 * @param {import('./reportDefinition').ReportDefinition | null} input.lastReport  the newest report of the dataset
 * @param {{ uid: string, name: string }[]} input.views  the saved views that can be used
 * @param {string[]} input.measurementFiles
 * @param {BaseFile[]} input.baseFiles
 * @param {{ id: string, defaultSections: readonly string[] }[]} input.templates  the organization's, at least one
 * @param {string} input.user
 * @param {string} input.datasetName
 * @param {string[]} input.reportNames  the names the dataset's reports have
 * @param {string} input.dateText  today, as the user reads a date
 */
export function prefillReport({ initial, lastReport, views, measurementFiles, baseFiles, templates, user, datasetName, reportNames, dateText }) {
    const viewNames = views.map(v => v.name);
    const savedView = (/** @type {string|undefined} */ uid) => views.find(v => v.uid === uid) ?? null;

    /** @returns {ViewChoice | null} */
    function chooseView() {
        const given = initial.view;
        if (given && 'uid' in given && savedView(given.uid)) return { kind: 'saved', uid: given.uid };
        if (given && 'state' in given) {
            return { kind: 'fromMap', state: given.state, name: freeName(given.name || pathutils.basename(given.state.base.path), viewNames) };
        }
        const last = lastReport?.cover && 'viewId' in lastReport.cover ? savedView(lastReport.cover.viewId) : null;
        if (last) return { kind: 'saved', uid: last.uid };
        if (views.length === 1) return { kind: 'saved', uid: views[0].uid };
        const file = views.length ? null : defaultBaseFile(baseFiles);
        return file ? { kind: 'fromFile', path: file.path, name: freeName(pathutils.basename(file.path), viewNames) } : null;
    }

    function chooseSources() {
        if (initial.sources?.length) return initial.sources;
        const kept = (lastReport?.sources ?? []).map(s => s.file).filter(f => measurementFiles.includes(f));
        if (kept.length) return kept;
        return measurementFiles.length === 1 ? measurementFiles : [];
    }

    const view = chooseView();
    const viewName = view?.kind === 'saved' ? savedView(view.uid)?.name ?? '' : '';
    const template = templates.find(t => t.id === lastReport?.templateId) ?? templates[0];
    const fromLast = !!lastReport && template.id === lastReport.templateId;

    return {
        fields: {
            name: freeName(`${viewName || datasetName} – ${dateText}`, reportNames),
            title: datasetName,
            subtitle: viewName,
            preparedBy: lastReport?.preparedBy || user,
            preparedFor: lastReport?.preparedFor ?? '',
            templateId: template.id,
            units: lastReport?.units ?? null,
            // The sections of the last report go with its template; another template brings its own
            sections: fromLast && lastReport ? JSON.parse(JSON.stringify(lastReport.sections)) : sectionsFromTemplate(template.defaultSections),
            sources: chooseSources().reduce((/** @type {{ file: string, label: string }[]} */ list, file) => addSource(list, file), [])
        },
        view
    };
}
