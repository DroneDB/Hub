/**
 * useDatasetActions - what the dataset page does with its files, each through its dialog.
 * Dialogs open on the registry (useDialogs + DialogHost); an action
 * receives the items it acts on (the explorer selection or the tree's).
 *
 *   const actions = useDatasetActions({ dataset, listing, dialogs, busy, route });
 *   actions.rename(file);  actions.remove(files);  actions.upload();
 */
import { ref } from 'vue';
import ddb from 'ddb';
import { countOf } from '@/libs/format';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { clone } from '@/libs/utils';
import { lazyComponent } from '@/libs/lazyComponent';
import { renameDataset } from '@/libs/api/registryUtils';
import BuildManager from '@/libs/build/buildManager';
import { isBuildableType } from '@/libs/entryTypeCapabilities';
import emitter from '@/libs/eventBus';
import { itemFor } from '@/libs/dataset/explorerItems';
import { CONFIRM_RESCAN, CONFIRM_REBUILD, deleteFilesConfirmation } from '@/libs/dataset/confirmations';
import { describeSelection, selectionSize } from '@/libs/dataset/selection';
import { transferModeFor } from '@/libs/dataset/transferMode';
import { formatAlignResult } from '@/libs/dataset/alignResult';
import { skippedSentence } from '@/libs/tasks/extractSummary';
import { useNotify } from '@/composables/useNotify';
import { useConfirm } from '@/composables/useConfirm';
import { useConfirmReplace, existingItem, replaceConflictPath, conflictIsFolder } from '@/composables/useConfirmReplace';
import { namesClash, nameClashMessage } from '@/libs/nameRules';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { MASK_BORDERS_TOOL, maskedOutputPath } from '@/libs/dataset/maskBorders';
import Alert from '@/components/HubAlert.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import DeleteResultDialog from '@/features/dataset/dialogs/DeleteResultDialog.vue';
import RenameDialog from '@/features/dataset/dialogs/RenameDialog.vue';
import NewFolderDialog from '@/features/dataset/dialogs/NewFolderDialog.vue';
import TransferDialog from '@/features/dataset/dialogs/TransferDialog.vue';
import SettingsDialog from '@/features/dataset/dialogs/SettingsDialog.vue';
import Properties from '@/features/dataset/explorer/EntryProperties.vue';
import ShareEmbed from '@/features/dataset/ShareEmbed.vue';

const lazy = loader => lazyComponent(loader);
const AddToDatasetDialog = lazy(() => import(/* webpackChunkName: "dataset-upload" */ '@/features/dataset/dialogs/AddToDatasetDialog.vue'));
const TextEditorDialog = lazy(() => import(/* webpackChunkName: "dataset-editor" */ '@/features/dataset/dialogs/TextEditorDialog.vue'));
const PdfViewerDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/viewers/map/PdfViewerDialog.vue'));
const MergeMultispectralDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/MergeMultispectralDialog.vue'));
const AlignDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/AlignDialog.vue'));
const MaskBordersDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/MaskBordersDialog.vue'));
const ExtractDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/ExtractDialog.vue'));
const SetCrsDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/SetCrsDialog.vue'));
const SplatTrainingExportDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/SplatTrainingExportDialog.vue'));
const ImportFromUrlDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/ImportFromUrlDialog.vue'));

const { pathutils } = ddb;

/**
 * @param {object} ctx
 * @param {any} ctx.dataset
 * @param {ReturnType<typeof import('./useDatasetListing').useDatasetListing>} ctx.listing
 * @param {ReturnType<typeof import('./useDialogs').useDialogs>} ctx.dialogs
 * @param {import('vue').Ref<boolean>} ctx.busy  the page's loader
 * @param {import('vue').Ref<boolean>} ctx.canWrite
 * @param {{ org: string, ds: string }} ctx.route
 * @param {(item: any) => void} ctx.openItem   opens an item as a double click does
 * @param {() => void} ctx.refresh            re-reads the folder on show (tree and list)
 */
export function useDatasetActions({ dataset, listing, dialogs, busy, canWrite, route, openItem, refresh }) {
    const notify = useNotify();
    const confirm = useConfirm(dialogs);
    const confirmReplace = useConfirmReplace(dialogs);
    const { runHeavyTask } = useHeavyTask();

    function showError(error, title = 'Error') {
        dialogs.open(Alert, { title, message: String((error && error.message) || error) });
    }

    /** Runs `work` with the page's loader on. */
    async function withBusy(work) {
        busy.value = true;
        try {
            return await work();
        } finally {
            busy.value = false;
        }
    }

    // ---- Upload and folders --------------------------------------------------------------

    function upload(files = null) {
        const dialog = dialogs.open(AddToDatasetDialog, () => ({
            path: listing.currentPath.value, organization: dataset.org, dataset: dataset.ds, filesToUpload: files, open: true,
            onClose: (uploaded, ok) => {
                if (!uploaded || !uploaded.length) return;
                listing.uploaded(uploaded);
                if (ok) notify.success(`Uploaded ${countOf(uploaded.length, 'file')}`, { summary: 'Upload Complete' });
            },
            onImportFromUrl: () => {
                dialog.close();
                importFromUrl('');
            }
        }));
    }

    /**
     * The New folder dialog. It runs the request itself (`createFolder` below), so that a refusal of the Registry (a name
     * that exists: 409) shows at its name field and the dialog stays open with the typed text (FR-EXP-15, FR-XC-11).
     */
    function newFolder() {
        const folder = listing.currentPath.value || '';
        dialogs.open(NewFolderDialog, () => ({
            folder,
            siblings: entryPaths(listing.files.value),
            createFolder: name => createFolder(name, folder)
        }));
    }

    /** The dataset paths of the items of a listing (what the name checks of the dialogs compare). */
    function entryPaths(items) {
        return (items || []).map(f => f?.entry?.path).filter(Boolean);
    }

    /** Creates the folder and adds it to the listing; a failure is thrown for the dialog to show at its field. */
    function createFolder(name, folder = listing.currentPath.value) {
        return withBusy(async () => {
            const entry = await dataset.createFolder(folder ? `${folder}/${name}` : name);
            listing.added([itemFor(dataset, entry, { empty: true })]);
            return entry;
        });
    }

    // ---- Delete --------------------------------------------------------------------------

    /**
     * Asks, then deletes (FR-EXP-08, D-011): the question names the items and gives their total
     * size. A folder's size is read from the server meanwhile ("Calculating size…"); the user can
     * delete before it arrives.
     */
    async function remove(files) {
        if (!files.length) return;
        const size = ref(null);
        const failed = ref(false);
        const reading = new AbortController();
        if (describeSelection(files).hasFolder) {
            selectionSize(dataset, files, { signal: reading.signal })
                .then(total => { size.value = total; })
                .catch(e => { if (!reading.signal.aborted) { failed.value = true; console.warn('Cannot read the size of the selection:', e); } });
        }
        const answer = await dialogs.open(ConfirmDialog, () => {
            const { danger, ...question } = deleteFilesConfirmation(files, { size: size.value, failed: failed.value });
            return { ...question, confirmButtonClass: danger ? 'danger' : 'primary' };
        });
        reading.abort();
        if (answer === 'confirm') deleteFiles(files);
    }

    async function deleteFiles(files) {
        await withBusy(async () => {
            try {
                const res = await dataset.deleteObjs(files.map(f => f.entry.path));
                const deleted = res.deleted || [];
                if (deleted.length) {
                    listing.removed(deleted);
                    // "2 files and 1 folder", from the types of the selection
                    const gone = new Set(deleted);
                    const folders = files.filter(f => gone.has(f.entry.path) && ddb.entry.isDirectory(f.entry)).length;
                    const parts = [deleted.length - folders > 0 && countOf(deleted.length - folders, 'file'), folders > 0 && countOf(folders, 'folder')].filter(Boolean);
                    notify.success(`${parts.join(' and ')} deleted successfully`, { summary: 'Deleted' });
                }
                if (res.failed && Object.keys(res.failed).length) dialogs.open(DeleteResultDialog, { deleted, failed: res.failed });
            } catch (e) {
                showError(e, 'Delete');
            }
        });
    }

    // ---- Rename and move -----------------------------------------------------------------

    /**
     * Moves or renames an item on the server and in the views. A pure move never triggers a
     * build (builds are by hash); a rename does when it makes the file buildable. A drag move offers Undo in its
     * toast (FR-EXP-16, FR-XC-23): the item goes back to the path it came from. The Registry never moves onto a name
     * that exists (409, D-040): a move replaces nothing, and a refused one says that the name is taken, with no Undo.
     * Resolves to the item at its new path, or null when the move failed (with `throws`, the failure is thrown instead).
     */
    async function moveItem(file, newPath, { action = 'rename', silent = false, throws = false } = {}) {
        try {
            const oldPath = file.entry.path;
            const updated = await dataset.moveObj(oldPath, newPath);
            const item = clone(file);
            item.path = dataset.remoteUri(newPath);
            item.label = pathutils.basename(newPath);
            if (updated && typeof updated === 'object') item.entry = updated;
            else item.entry.path = newPath;
            // The path was free on the server (a name that exists is refused): an item the views still show there is stale
            listing.drop([newPath]);
            listing.removed([oldPath]);
            listing.added([item]);
            if (action === 'rename' && !isBuildableType(file.entry.type) && isBuildableType(item.entry.type)) {
                BuildManager.onFilesAdded(dataset, [item.entry]);
            }
            if (!silent) {
                if (action === 'move') {
                    notify.success('File moved successfully', { summary: 'Moved', action: { label: 'Undo', run: () => undoMove(item, oldPath) } });
                } else if (action === 'undo') {
                    notify.success('The move was undone', { summary: 'Moved' });
                } else {
                    notify.success('File renamed successfully', { summary: 'Renamed' });
                }
            }
            return item;
        } catch (e) {
            // A caller that shows the failure itself (the Rename dialog, at its field) gets it thrown
            if (throws) throw e;
            if (action === 'move' && e?.status === 409) {
                // The name is taken in the destination folder (D-040): the Registry's words, and nothing moved
                showError(e.message || nameClashMessage(pathutils.basename(newPath)), 'Name already taken');
                return null;
            }
            showError(e, action === 'rename' ? 'Rename file' : action === 'undo' ? 'Undo move' : 'Move file');
            return null;
        }
    }

    /**
     * The Undo of a drag move: the item at its new path goes back to the path it came from, when that path is still
     * free (the server's listing of its folder). An entry that came there meanwhile would be replaced: the Undo is
     * refused and nothing moves.
     */
    function undoMove(item, oldPath) {
        return withBusy(async () => {
            let taken;
            try {
                taken = await pathTaken(oldPath);
            } catch (e) {
                showError(e, 'Undo move');
                return null;
            }
            if (taken) {
                notify.warn(`Cannot undo: ${oldPath} exists again`, { summary: 'Undo move' });
                return null;
            }
            return moveItem(item, oldPath, { action: 'undo' });
        });
    }

    /** Whether the dataset has an entry at `path` (any letter case, D-040), from the server's listing of its folder. */
    async function pathTaken(path) {
        const entries = await dataset.list(pathutils.getParentFolder(path) || undefined);
        return (entries || []).some(e => namesClash(e?.path, path));
    }

    /**
     * The Rename dialog. It runs the request itself (`renameEntry`, `renameDataset` for the dataset root): a name that exists
     * is refused at its field before any request, and a refusal of the Registry (a 409, a slug that is taken) shows there
     * too, with the dialog open and the typed name (FR-EXP-04, FR-XC-11).
     */
    function rename(file) {
        if (!file) return;
        dialogs.open(RenameDialog, () => ({
            file, allEntries: listing.files.value, siblings: entryPaths(listing.files.value),
            renameEntry: (newPath, { sidecars } = {}) => renameWithSidecars(file, newPath, sidecars),
            renameDataset: name => renameThisDataset(name)
        }));
    }

    /** Renames the item, then its sidecars. A failure of the item is thrown (the dialog shows it); a sidecar's is a toast. */
    function renameWithSidecars(file, newPath, sidecars = []) {
        return withBusy(async () => {
            await moveItem(file, newPath, { silent: sidecars.length > 0, throws: true });
            if (!sidecars.length) return;
            try {
                for (const sc of sidecars) {
                    const item = listing.files.value.find(f => f.entry.path === sc.oldPath);
                    if (item) await moveItem(item, sc.newPath, { silent: true, throws: true });
                    else await dataset.moveObj(sc.oldPath, sc.newPath);
                }
                notify.success(`File and ${countOf(sidecars.length, 'sidecar')} renamed successfully`, { summary: 'Renamed' });
            } catch (e) {
                showError(e, 'Rename');
            }
        });
    }

    /**
     * Renames this dataset: its name and the slug made of it. A failure is thrown for the dialog to show at its field; a
     * renamed dataset is opened at its new URL (the page stays busy until it goes).
     */
    async function renameThisDataset(name) {
        busy.value = true;
        try {
            const ds = await renameDataset(route.org, route.ds, name);
            window.location.href = `/r/${route.org}/${ds?.slug || route.ds}`;
        } catch (e) {
            busy.value = false;
            throw e;
        }
    }

    /**
     * Drag-and-drop move: into a folder, to the root, or into a file's folder; refuses a
     * move onto itself or into a descendant.
     */
    async function move(source, dest) {
        if (!source || !source.entry || !dest || !dest.entry) return;
        const T = ddb.entry.type;
        if (source.entry.type === T.DRONEDB) {
            notify.warn('Cannot move dataset root', { summary: 'Move', life: 'short' });
            return;
        }
        const name = pathutils.basename(source.entry.path);
        const folder = ddb.entry.isDirectory(dest.entry)
            ? (dest.entry.type === T.DRONEDB ? null : dest.entry.path)
            : pathutils.getParentFolder(dest.entry.path);
        const destPath = folder ? pathutils.join(folder, name) : name;
        if (destPath === source.entry.path) {
            notify.info('Item is already in this folder', { summary: 'Move' });
        } else if (ddb.entry.isDirectory(source.entry) && (destPath + '/').startsWith(source.entry.path + '/')) {
            notify.warn('Cannot move a folder onto itself or one of its descendants', { summary: 'Move' });
        } else {
            // A move onto a name that exists is refused by the Registry (409, D-040): it says that the name is taken, with no Undo
            await withBusy(() => moveItem(source, destPath, { action: 'move' }));
        }
    }

    /** To another dataset: a move for a writer, a copy for a user who can only read this dataset. */
    function transfer(files) {
        if (!files.length) return;
        const mode = transferModeFor(canWrite.value);
        dialogs.open(TransferDialog, {
            files, sourceOrg: dataset.org, sourceDs: dataset.ds, keepSource: mode.keepSource,
            onClose: (id, sent) => {
                if (id !== 'transferred' || !sent || !sent.length) return;
                if (!mode.keepSource) listing.removed(sent.map(f => f.entry.path));
                notify.success(`${countOf(sent.length, 'item')} ${mode.done} successfully`, { summary: mode.summary });
            }
        });
    }

    // ---- Information ---------------------------------------------------------------------

    const properties = files => { if (files.length) dialogs.open(Properties, { files }); };
    const share = file => dialogs.open(ShareEmbed, { file });

    function settings() {
        const dialog = dialogs.open(SettingsDialog, () => ({
            dataset, canWrite: canWrite.value,
            onRescanRequested: () => rescan(dialog),
            onAddMarkdown: (document, entry) => {
                listing.uploaded([entry]);
                dialog.close();
                openItem({ label: document, entry, path: dataset.remoteUri(document) });
            }
        }));
    }

    async function rescan(settingsDialog) {
        if (!await confirm(CONFIRM_RESCAN)) return;
        if (settingsDialog) settingsDialog.close();
        await withBusy(async () => {
            try {
                // A heavy task: progress in the Tasks tab
                await dataset.submitTask('rescan-index', { params: { stopOnError: false }, force: true });
                notify.info('The dataset index rescan is running. Check the Tasks tab for progress.', { summary: 'Rescan Started', life: 'long' });
            } catch (e) {
                showError(e.message, 'Rescan Error');
            }
        });
    }

    /** Asks before a build that replaces existing output. */
    async function confirmBuild(file, onConfirm) {
        if (await confirm(CONFIRM_REBUILD)) onConfirm();
    }

    // ---- Cover ---------------------------------------------------------------------------

    /** The file's thumbnail becomes the dataset cover (replacing any cover, after asking). */
    async function setAsCover(file) {
        try {
            const candidates = reg.features.value(Features.DATASET_THUMBNAIL_CANDIDATES);
            if (!candidates || !candidates.length) {
                showError('Dataset thumbnail candidates not configured');
                return;
            }
            const names = new Set(candidates.map(c => c.toLowerCase()));
            const covers = (await dataset.list()).filter(e => names.has(pathutils.basename(e.path).toLowerCase()));
            if (covers.length && !await confirm({
                title: 'Replace Dataset Cover', danger: true, confirmText: 'Replace',
                message: 'A dataset cover already exists. Do you want to replace it? This action is irreversible.'
            })) return;
            await withBusy(async () => {
                if (covers.length) {
                    const paths = covers.map(e => e.path);
                    await dataset.deleteObjs(paths);
                    emitter.emit('deleteEntries', paths);
                }
                const res = await dataset.registry.fetchRaw(dataset.thumbUrl(file.entry.path, 1024));
                if (!res.ok) throw new Error(`Failed to fetch thumbnail: ${res.statusText}`);
                const blob = await res.blob();
                // The replace was confirmed above
                await dataset.uploadObj(candidates[0], new File([blob], candidates[0], { type: blob.type }), { overwrite: true });
                notify.success('Dataset cover set successfully', { summary: 'Cover Set' });
                emitter.emit('addItems', []);
            });
        } catch (e) {
            showError(e, 'Set as Dataset Cover');
        }
    }

    // ---- Processing ----------------------------------------------------------------------

    function mergeMultispectral(files) {
        if (!files || files.length < 2) return;
        dialogs.open(MergeMultispectralDialog, () => ({
            files, dataset, allEntries: listing.files.value,
            onClose: async (action, result) => {
                if (action !== 'merged' || !result) return;
                const sources = result.sourceNames || [];
                const list = sources.length > 3 ? `${sources.slice(0, 3).join(', ')} and ${sources.length - 3} more` : sources.join(', ');
                notify.success(`${list} merged into ${result.outputPath || 'output'}`, { summary: 'Merge Completed', life: 'long' });
                try {
                    await listing.addEntry(result.outputPath);
                    // The merge task deleted the sources itself, after the output was written and opened (FR-PRC-02)
                    if (result.deleteSource && result.sourcePaths && result.sourcePaths.length) {
                        listing.removed(result.sourcePaths);
                    }
                } catch (e) {
                    console.warn('Could not refresh file browser after merge:', e);
                }
            }
        }));
    }

    function align(entry) {
        if (!entry) return;
        dialogs.open(AlignDialog, () => ({
            sourceEntry: entry, dataset, allEntries: listing.files.value,
            // The window stays open with the result until the user closes it (FR-PRC-11): the page refreshes its
            // list and says the numbers when the align is done, and opens the output on the map when asked
            onAligned: async result => {
                if (!result || !result.outputPath) return;
                const numbers = formatAlignResult(result.result);
                notify.success(`Output saved as ${result.outputPath}${numbers ? ` (${numbers})` : ''}`, { summary: 'Alignment complete', life: 'long' });
                await listing.addEntry(result.outputPath).catch(e => console.warn('Could not refresh file browser after align:', e));
            },
            onClose: async (action, result) => {
                if (action !== 'map' || !result || !result.outputPath) return;
                // The output is in the list in view, else the Registry is asked; no answer (a failed read, or no such
                // entry) is said in words, not as the TypeError of a missing entry
                const entry = listing.files.value.find(f => f.entry.path === result.outputPath)?.entry
                    ?? await dataset.listOne(result.outputPath).catch(() => null);
                if (!entry) {
                    showError(`The aligned file ${result.outputPath} could not be found in the dataset. Refresh the file list and open it from there.`, 'Open on map');
                    return;
                }
                try {
                    openItem({ label: pathutils.basename(entry.path), entry, path: dataset.remoteUri(entry.path) });
                } catch (e) {
                    showError(e, 'Open on map');
                }
            }
        }));
    }

    function importFromUrl(url = '') {
        dialogs.open(ImportFromUrlDialog, {
            dataset, initialUrl: url, initialFolder: listing.currentPath.value || '',
            onClose: (action, result) => { if (action === 'imported') listing.reload(result && result.folder); }
        });
    }

    function setCrs(file) {
        if (!file) return;
        dialogs.open(SetCrsDialog, {
            file, dataset,
            onClose: (action, result) => {
                if (action !== 'set' || !result) return;
                notify.success(`${result.prjPath} written: the drawing is rebuilt with it`, { summary: 'Coordinate System Set', life: 'normal' });
                // The .prj appears next to the drawing, whose properties change once indexed
                refresh();
            }
        });
    }

    function extract(file) {
        if (!file) return;
        dialogs.open(ExtractDialog, {
            file, dataset,
            onClose: async (action, result) => {
                if (action !== 'extracted' || !result) return;
                // The entries the extraction skipped are named with their reason (FR-PRC-30)
                const skipped = skippedSentence(result.summary);
                const where = `Archive extracted to ${result.destPath || 'root folder'}`;
                if (skipped) notify.warn(`${where}. ${skipped}`, { summary: 'Extract Completed', life: 'long' });
                else notify.success(where, { summary: 'Extract Completed', life: 'normal' });
                await listing.reload(result.destPath);
                if (result.deletedArchive && result.archivePath) listing.removed([result.archivePath]);
            }
        });
    }

    function exportSplatTrainingData(file) {
        if (!file) return;
        dialogs.open(SplatTrainingExportDialog, { file, dataset });
    }

    /**
     * Mask Borders is a heavy task like Align (FR-PRC-12, D-013): the Registry writes `<name>_masked.tif` next to the source,
     * indexes it and queues its build under its own name. When the task ends the new file joins the list at once and the
     * toast names it. An existing copy is replaced only after the user confirmed it (FR-XC-07): from the listing in view,
     * or from the 409 of a copy that appeared since.
     */
    function maskBorders(item) {
        dialogs.open(MaskBordersDialog, {
            entry: item,
            onClose: async action => {
                if (action !== 'confirm') return;
                const source = item.entry.path;
                const submit = overwrite => runHeavyTask(dataset, MASK_BORDERS_TOOL, {
                    params: { path: source, overwrite }, notify: false,
                    onSubmitted: () => notify.info(`Masking started for ${item.label}...`, { summary: 'Mask Borders', life: 'normal' })
                });
                try {
                    // The copy is where the Registry writes it, in the letter case of an existing entry (D-040)
                    let outputPath = maskedOutputPath(source);
                    const listed = existingItem(outputPath, listing.files.value);
                    let overwrite = false;
                    if (listed) {
                        if (!await confirmReplace(listed.entry.path)) return;
                        overwrite = true;
                        outputPath = listed.entry.path;
                    }
                    try {
                        await submit(overwrite);
                    } catch (e) {
                        // The copy appeared after the list was read: ask once, then replace it. A folder is never replaced
                        const conflict = overwrite ? null : replaceConflictPath(e);
                        if (!conflict || await conflictIsFolder(dataset, conflict, listing.files.value)) throw e;
                        if (!await confirmReplace(conflict)) return;
                        outputPath = conflict;
                        await submit(true);
                    }
                    await listing.addEntry(outputPath).catch(e => console.warn('Could not show the masked file in the list:', e));
                    notify.success(`Masked file ready: ${pathutils.basename(outputPath)}`, { summary: 'Mask Borders', life: 'normal' });
                } catch (e) {
                    // The task's row says why it failed: the toast says it too, with the reason of the Registry
                    notify.error(e.message, { summary: 'Mask Borders failed', life: 'long' });
                }
            }
        });
    }

    // ---- Documents -----------------------------------------------------------------------

    function editText(entry, readonly = false) {
        dialogs.open(TextEditorDialog, {
            dataset, entry, readonly: readonly || !canWrite.value,
            onSaved: path => notify.success(`File saved: ${path}`, { summary: 'File Saved' })
        });
    }

    const viewPdf = entry => dialogs.open(PdfViewerDialog, { dataset, entry });

    return {
        showError, upload, newFolder, remove, rename, move, transfer, properties, share, settings, confirmBuild,
        setAsCover, mergeMultispectral, align, importFromUrl, setCrs, extract, exportSplatTrainingData, maskBorders, editText, viewPdf
    };
}
