/**
 * useOpenItem - what a double click on a dataset file does:
 * a folder opens, a viewer opens in a new tab once its build output exists (or the build
 * dialog explains why not), archives extract, text opens in the editor, PDFs in the
 * viewer, photos and videos in the lightbox, anything else in the browser.
 */
import ddb from 'ddb';
import emitter from '@/libs/eventBus';
import { b64encode } from '@/libs/base64';
import { openInBrowser } from '@/libs/openInBrowser';
import { defaultViewFor } from '@/libs/openItemDefaults';
import { isArchiveFile } from '@/libs/entryTypes';
import { shouldOpenAsText, isPdfFile } from '@/libs/textFileUtils';
import FileAvailabilityChecker from '@/libs/build/fileAvailabilityChecker';
import { useNotify } from '@/composables/useNotify';
import FileAvailabilityDialog from '@/features/dataset/dialogs/FileAvailabilityDialog.vue';

const { pathutils } = ddb;

/**
 * @param {object} ctx
 * @param {any} ctx.dataset
 * @param {{ org: string, ds: string }} ctx.route
 * @param {import('vue').Ref<boolean>} ctx.canWrite
 * @param {ReturnType<typeof import('./useDialogs').useDialogs>} ctx.dialogs
 * @param {ReturnType<typeof import('./useDatasetActions').useDatasetActions>} ctx.actions
 * @param {(node: any) => boolean} ctx.showInLightbox   false when the lightbox does not show it
 * @param {(node: any, options: any) => void} ctx.openPlantHealth  on the Map tab
 */
export function useOpenItem({ dataset, route, canWrite, dialogs, actions, showInLightbox, openPlantHealth }) {
    const notify = useNotify();

    /** The viewer route of an entry in a new tab (one tab per file and viewer). */
    function openViewer(entryPath, view) {
        const [, path] = ddb.utils.datasetPathFromUri(entryPath);
        window.open(`/r/${route.org}/${route.ds}/view/${b64encode(path)}/${view}`, `${path}-${view}`);
    }

    function explainUnavailable(availability, node) {
        const dialog = dialogs.open(FileAvailabilityDialog, {
            show: true, dataset, entry: node.entry,
            title: availability.title, message: availability.message, status: availability.status,
            actions: availability.actions, buildState: availability.buildState,
            onBuildStarted: entry => notify.info(`Build started for ${pathutils.basename(entry.path)}`, { summary: 'Build Started' }),
            // The job has ended: the viewer opens when the entry lists what it needs (a job that
            // succeeded can leave the build on hold), else the dialog says what is missing
            onBuildCompleted: async entry => {
                dialog.close();
                try {
                    const view = defaultViewFor(entry);
                    if (!view) return;
                    const availability = await FileAvailabilityChecker.check(dataset, entry, view);
                    if (!availability.available) {
                        explainUnavailable(availability, node);
                        return;
                    }
                    notify.success(`Build completed for ${entry.path}. Opening viewer...`, { summary: 'Build Completed' });
                    openViewer(node.path, view);
                } catch (e) {
                    actions.showError(e.message, 'Error');
                }
            },
            onBuildFailed: buildState => actions.showError(`Build failed for ${buildState.path}`, 'Build Error'),
            onTimeout: () => {
                dialog.close();
                actions.showError('Timeout while waiting for build completion. Please try again later.', 'Timeout');
            },
            onError: e => actions.showError(e, 'Error')
        });
    }

    /**
     * @param {{ path: string, entry: any, label?: string }} node  an explorer item
     * @param {string} [view]  a viewer ('map', 'pointcloud', ...); the type's default otherwise
     * @param {any} [options]  for 'planthealth'
     */
    async function openItem(node, view, options) {
        const entry = node.entry;
        if (ddb.entry.isDirectory(entry)) {
            emitter.emit('folderOpened', pathutils.getTree(entry.path));
            return;
        }
        // .3tz archives indexed as generic by older ddb open in the 3D viewer
        view = view || defaultViewFor(entry) || (/\.3tz$/i.test(entry.path || '') ? 'unified' : undefined);
        if (!view) {
            if (canWrite.value && isArchiveFile(entry)) actions.extract(node);
            else if (shouldOpenAsText(entry)) actions.editText(entry);
            else if (isPdfFile(entry)) actions.viewPdf(entry);
            else if (!showInLightbox(node)) openInBrowser(node.path);
            return;
        }
        if (view === 'planthealth') {
            openPlantHealth(node, options);
            return;
        }
        try {
            const availability = await FileAvailabilityChecker.check(dataset, entry, view);
            if (availability.available) openViewer(node.path, view);
            else explainUnavailable(availability, node);
        } catch (e) {
            actions.showError(e.message, 'Error');
        }
    }

    return { openItem };
}
