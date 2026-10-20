/**
 * useDatasetActions - what the dataset page does with its files, each through its dialog
 * (HQ-09: replaces the useDialogManager / useFileOperations mixins, 25 template blocks
 * and 18 open flags). Dialogs open on the registry (useDialogs + DialogHost); an action
 * receives the items it acts on (the explorer selection or the tree's).
 *
 *   const actions = useDatasetActions({ dataset, listing, dialogs, busy, route });
 *   actions.rename(file);  actions.remove(files);  actions.upload();
 */
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { clone } from '@/libs/utils';
import { lazyComponent } from '@/libs/lazyComponent';
import { renameDataset } from '@/libs/api/registryUtils';
import BuildManager from '@/libs/build/buildManager';
import emitter from '@/libs/eventBus';
import { itemFor } from '@/libs/dataset/explorerItems';
import { confirmDelete, CONFIRM_RESCAN, CONFIRM_REBUILD } from '@/libs/dataset/confirmations';
import { useNotify } from '@/composables/useNotify';
import { useConfirm } from '@/composables/useConfirm';
import Alert from '@/components/HubAlert.vue';
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
const ImportFromUrlDialog = lazy(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/dataset/dialogs/ImportFromUrlDialog.vue'));

const { pathutils } = ddb;
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

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
                if (ok) notify.success(`Uploaded ${plural(uploaded.length, 'file')}`, { summary: 'Upload Complete' });
            },
            onImportFromUrl: () => {
                dialog.close();
                importFromUrl('');
            }
        }));
    }

    function newFolder() {
        dialogs.open(NewFolderDialog, () => ({
            busy: busy.value,
            onClose: (id, name) => { if (id === 'createFolder' && name) createFolder(name); }
        }));
    }

    async function createFolder(name) {
        const folder = listing.currentPath.value;
        await withBusy(async () => {
            try {
                const entry = await dataset.createFolder(folder ? `${folder}/${name}` : name);
                listing.added([itemFor(dataset, entry, { empty: true })]);
            } catch (e) {
                showError(e, 'Create folder');
            }
        });
    }

    // ---- Delete --------------------------------------------------------------------------

    async function remove(files) {
        if (files.length && await confirm(confirmDelete(files))) deleteFiles(files);
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
                    const parts = [deleted.length - folders > 0 && plural(deleted.length - folders, 'file'), folders > 0 && plural(folders, 'folder')].filter(Boolean);
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
     * build (builds are by hash); a rename does when it makes the file buildable.
     */
    async function moveItem(file, newPath, { action = 'rename', silent = false } = {}) {
        try {
            const oldPath = file.entry.path;
            const updated = await dataset.moveObj(oldPath, newPath);
            const item = clone(file);
            item.path = dataset.remoteUri(newPath);
            item.label = pathutils.basename(newPath);
            if (updated && typeof updated === 'object') item.entry = updated;
            else item.entry.path = newPath;
            // A replace: the destination's old item goes too
            listing.drop([newPath]);
            listing.removed([oldPath]);
            listing.added([item]);
            if (action === 'rename' && !BuildManager.isBuildableType(file.entry.type) && BuildManager.isBuildableType(item.entry.type)) {
                BuildManager.onFilesAdded(dataset, [item.entry]);
            }
            if (!silent) notify.success(action === 'move' ? 'File moved successfully' : 'File renamed successfully', { summary: action === 'move' ? 'Moved' : 'Renamed' });
        } catch (e) {
            showError(e, action === 'move' ? 'Move file' : 'Rename file');
        }
    }

    function rename(file) {
        if (!file) return;
        dialogs.open(RenameDialog, () => ({
            busy: busy.value, file, allEntries: listing.files.value,
            onClose: (id, newPath, entry, sidecarsInfo) => {
                if (!newPath) return;
                if (id === 'rename') renameWithSidecars(file, newPath, sidecarsInfo);
                else if (id === 'renameddb') renameThisDataset(newPath);
            }
        }));
    }

    async function renameWithSidecars(file, newPath, sidecarsInfo) {
        const sidecars = (sidecarsInfo && sidecarsInfo.sidecars) || [];
        await withBusy(async () => {
            await moveItem(file, newPath, { silent: sidecars.length > 0 });
            if (!sidecars.length) return;
            try {
                for (const sc of sidecars) {
                    const item = listing.files.value.find(f => f.entry.path === sc.oldPath);
                    if (item) await moveItem(item, sc.newPath, { silent: true });
                    else await dataset.moveObj(sc.oldPath, sc.newPath);
                }
                notify.success(`File and ${plural(sidecars.length, 'sidecar')} renamed successfully`, { summary: 'Renamed' });
            } catch (e) {
                showError(e, 'Rename');
            }
        });
    }

    async function renameThisDataset(slug) {
        busy.value = true;
        try {
            const ds = await renameDataset(route.org, route.ds, slug);
            window.location.href = `/r/${route.org}/${ds.slug}`;
        } catch (e) {
            showError(e, 'Rename');
            busy.value = false;
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
            await withBusy(() => moveItem(source, destPath, { action: 'move' }));
        }
    }

    function transfer(files) {
        if (!files.length) return;
        dialogs.open(TransferDialog, {
            files, sourceOrg: dataset.org, sourceDs: dataset.ds,
            onClose: (id, moved) => {
                if (id !== 'transferred' || !moved || !moved.length) return;
                listing.removed(moved.map(f => f.entry.path));
                notify.success(`${plural(moved.length, 'item')} transferred successfully`, { summary: 'Transfer Complete' });
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
                await dataset.uploadObj(candidates[0], new File([blob], candidates[0], { type: blob.type }));
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
        dialogs.open(MergeMultispectralDialog, {
            files, dataset,
            onClose: async (action, result) => {
                if (action !== 'merged' || !result) return;
                const sources = result.sourceNames || [];
                const list = sources.length > 3 ? `${sources.slice(0, 3).join(', ')} and ${sources.length - 3} more` : sources.join(', ');
                notify.success(`${list} merged into ${result.outputPath || 'output'}`, { summary: 'Merge Completed', life: 'long' });
                try {
                    await listing.addEntry(result.outputPath);
                    if (result.deleteSource && result.sourcePaths && result.sourcePaths.length) {
                        await dataset.deleteObjs(result.sourcePaths);
                        listing.removed(result.sourcePaths);
                    }
                } catch (e) {
                    console.warn('Could not refresh file browser after merge:', e);
                }
            }
        });
    }

    function align(entry) {
        if (!entry) return;
        dialogs.open(AlignDialog, () => ({
            sourceEntry: entry, dataset, allEntries: listing.files.value,
            onClose: async (action, result) => {
                if (action !== 'aligned' || !result || !result.outputPath) return;
                notify.success(`Output saved as ${result.outputPath}`, { summary: 'Alignment complete', life: 'long' });
                await listing.addEntry(result.outputPath).catch(e => console.warn('Could not refresh file browser after align:', e));
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
                notify.success(`Archive extracted to ${result.destPath || 'root folder'}`, { summary: 'Extract Completed', life: 'normal' });
                await listing.reload(result.destPath);
                if (result.deletedArchive && result.archivePath) listing.removed([result.archivePath]);
            }
        });
    }

    function maskBorders(item) {
        dialogs.open(MaskBordersDialog, {
            entry: item,
            onClose: async action => {
                if (action !== 'confirm') return;
                try {
                    const check = await dataset.checkMaskedFileExists(item.entry.path);
                    if (check.exists && !await confirm({
                        title: 'Mask Borders', danger: true, confirmText: 'Overwrite',
                        message: `The file <strong>${check.outputPath}</strong> already exists. Do you want to overwrite it?`
                    })) return;
                    await dataset.maskBorders(item.entry.path);
                    notify.info(`Masking started for ${item.label}...`, { summary: 'Mask Borders', life: 'normal' });
                    BuildManager.startPolling(dataset);
                } catch (e) {
                    notify.error(e.message);
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
        setAsCover, mergeMultispectral, align, importFromUrl, setCrs, extract, maskBorders, editText, viewPdf
    };
}
