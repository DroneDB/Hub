// @ts-check
/**
 * The actions on the reports of a dataset that the dataset page, the live page and the map share: open, copy the link,
 * make a new one, edit, duplicate and delete. Each asks the user first where it must; errors are shown and `onChanged`
 * runs after a change that was made. Names reach dialogs and toasts as text only: a ConfirmDialog renders its message
 * as HTML, so a name is in its title, never in its message.
 *
 *   const actions = useReportActions({ dataset, org, ds, dialogs, router, onChanged: reloadReports });
 *   await actions.create({ sources: ['survey/measurements.geojson'], view: { uid: 'v_k3x9q2m7' } });
 */
import reg from '@/libs/api/sharedRegistry';
import { useConfirm, useChoice } from '@/composables/useConfirm';
import { useNotify } from '@/composables/useNotify';
import { copyLinkWithNotice } from '@/composables/useCopyText';
import { absoluteUrl, openInNewTab, reportUrl } from '@/libs/views/viewLinks';
import { deleteReport, deleteUnreadableReport, saveNewReport, MAX_REPORT_NAME_LENGTH, NEWER_REPORT_TEXT } from '@/libs/reports/reportStore';
import { lazyComponent } from '@/libs/lazyComponent';

// The editor's code loads the first time it opens, not with the dataset page or the map
const ReportEditorDialog = lazyComponent(() => import(/* webpackChunkName: "report-editor" */ './ReportEditorDialog.vue'));

/** The name of a copy: " (copy)" after the name, the name cut to leave room for it. @param {string} name */
export function copyName(name) {
    const suffix = ' (copy)';
    return `${name.slice(0, MAX_REPORT_NAME_LENGTH - suffix.length)}${suffix}`;
}

/**
 * @param {object} ctx
 * @param {any} ctx.dataset
 * @param {string} ctx.org @param {string} ctx.ds
 * @param {{ open: Function }} ctx.dialogs
 * @param {{ push: (location: any) => Promise<any> }} ctx.router
 * @param {() => void} [ctx.onChanged]
 */
export function useReportActions({ dataset, org, ds, dialogs, router, onChanged = () => {} }) {
    const confirm = useConfirm(dialogs);
    const choose = useChoice(dialogs);
    const notify = useNotify();
    const urlOf = (/** @type {string} */ uid) => reportUrl({ org, ds }, uid);

    /** @param {string} summary @param {() => Promise<any>} action */
    async function attempt(summary, action) {
        try {
            await action();
            onChanged();
            return true;
        } catch (/** @type {any} */ e) {
            console.error(`${summary}:`, e);
            notify.error(e.message || String(e), { summary });
            return false;
        }
    }

    /** Opens a report's live page in a new tab. @param {{ uid: string }} report */
    const open = report => openInNewTab(urlOf(report.uid));

    /** @param {{ uid: string, name: string }} report */
    const copyLink = report => copyLinkWithNotice(absoluteUrl(urlOf(report.uid)), notify, report.name);

    /**
     * The editor: a report is stored and, once the user has seen the result, the page moves to it (a new report) or
     * shows it again (an edited one).
     * @param {import('@/libs/metaList/metaListStore').MetaEntry | null} entry  the report to edit; none for a new one
     * @param {{ sources?: string[], view?: import('@/composables/useMapReport').MapReportView | null }} [initial]  what a new report was opened with
     * @returns {Promise<{ uid: string } | null>}
     */
    async function openEditor(entry, initial) {
        // A change of the report settings from the editor (Edit template) shows too, even when the editor is cancelled
        let settingsChanged = false;
        /** @type {{ uid: string } | null} */
        const saved = await dialogs.open(ReportEditorDialog, {
            dataset, entry, initial, user: reg.getUsername() || '', choose, onSettingsChanged: () => { settingsChanged = true; }
        });
        if (saved || settingsChanged) onChanged();
        return saved;
    }

    /**
     * A new report, from the dataset page (nothing given: the editor fills it in) or the map (its file and view).
     * @param {{ sources?: string[], view?: import('@/composables/useMapReport').MapReportView | null }} [initial]
     */
    async function create(initial) {
        const saved = await openEditor(null, initial);
        if (saved) await router.push(urlOf(saved.uid));
        return saved;
    }

    /** @param {import('@/libs/metaList/metaListStore').MetaEntry} entry */
    const edit = entry => openEditor(entry);

    /**
     * A report of the same content under a new name. A report of a newer version is refused, as the editor refuses it:
     * this application cannot tell what such a definition holds, so it cannot store a copy of it.
     * @param {import('@/libs/metaList/metaListStore').MetaEntry} entry
     */
    function duplicate(entry) {
        return attempt('Cannot duplicate the report', async () => {
            if (entry.newerVersion) throw new Error(NEWER_REPORT_TEXT);
            // The store gives the copy its own uid and audit fields
            return saveNewReport(dataset, { ...entry.data, name: copyName(entry.name) }, { user: reg.getUsername() || '' });
        });
    }

    /**
     * Deletes a report, or an item that cannot be read as one, after the question.
     * @param {{ uid: string|null, name: string|null, id?: string, error?: string|null }} report  a report, or an item that cannot be read as one (it has an `error`)
     * @returns {Promise<boolean>} whether it was deleted
     */
    async function remove(report) {
        const readable = !report.error;
        const ok = await confirm({
            title: report.name ? `Delete "${report.name}"` : 'Delete the report that cannot be read',
            message: 'Delete this report? Its links will stop working. The measurement files are not deleted.',
            confirmText: 'Delete',
            danger: true
        });
        if (!ok) return false;
        return attempt('Cannot delete the report', () => (readable
            ? deleteReport(dataset, /** @type {string} */ (report.uid))
            : deleteUnreadableReport(dataset, /** @type {any} */ (report))));
    }

    return { open, copyLink, create, edit, duplicate, remove };
}
