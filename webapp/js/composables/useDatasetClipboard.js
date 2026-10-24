/**
 * useDatasetClipboard - copy, cut and paste of dataset files, within a dataset or across datasets (server-side transfer).
 * Ctrl+C / Ctrl+X / Ctrl+V and the context menu end here.
 */
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { useClipboardStore } from '@/stores/clipboard';
import { resolvePasteStrategy } from '@/composables/usePasteStrategy';
import { selectionBasePath } from '@/features/dataset/explorer/treeSelection';
import { itemFor, isInFolder } from '@/libs/dataset/explorerItems';
import { useNotify } from '@/composables/useNotify';
import PasteConflictDialog from '@/features/dataset/dialogs/PasteConflictDialog.vue';
import PasteResultDialog from '@/features/dataset/dialogs/PasteResultDialog.vue';

const { pathutils } = ddb;
const plural = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`;

/**
 * @param {object} ctx
 * @param {any} ctx.dataset
 * @param {ReturnType<typeof import('./useDatasetListing').useDatasetListing>} ctx.listing
 * @param {ReturnType<typeof import('./useDialogs').useDialogs>} ctx.dialogs
 * @param {import('vue').Ref<boolean>} ctx.busy
 * @param {import('vue').Ref<boolean>} ctx.canWrite
 * @param {(e: any, title: string) => void} ctx.showError
 */
export function useDatasetClipboard({ dataset, listing, dialogs, busy, canWrite, showError }) {
    const notify = useNotify();
    const clipboard = useClipboardStore();
    const here = () => ({ orgSlug: dataset.org, dsSlug: dataset.ds });

    /**
     * Items and the folder they are relative to: an explicit list (from the tree, any
     * folder: their common parent) or the explorer selection (the folder on show).
     */
    function pick(selection) {
        const explicit = Array.isArray(selection);
        const items = (explicit ? selection : listing.selected.value).filter(f => f.entry && f.entry.type !== ddb.entry.type.DRONEDB);
        return { items, basePath: explicit ? selectionBasePath(items) : (listing.currentPath.value || '') };
    }

    function copy(selection) {
        const { items, basePath } = pick(selection);
        if (!items.length) return notify.info('No items selected', { summary: 'Copy' });
        clipboard.copy({ ...here(), basePath }, items);
        notify.success(`${plural(items.length, 'item')} copied to clipboard`, { summary: 'Copied' });
    }

    function cut(selection) {
        if (!canWrite.value) return notify.warn('You do not have write access to this dataset', { summary: 'Cut', life: 'short' });
        const { items, basePath } = pick(selection);
        if (!items.length) return notify.info('No items selected', { summary: 'Cut' });
        clipboard.cut({ ...here(), basePath }, items);
        notify.success(`${plural(items.length, 'item')} ready to move`, { summary: 'Cut' });
    }

    // Names in the destination, from the server: the loaded view can hold only part of the
    // folder (a file selected in the tree), which would hide conflicts
    async function namesIn(folder) {
        try {
            return new Set(((await dataset.list(folder || undefined)) || []).map(e => pathutils.basename(e.path)));
        } catch (e) {
            console.warn(`Could not list paste destination "${folder}", using the loaded view:`, e);
            return new Set(listing.files.value.filter(f => isInFolder(f.entry.path, folder)).map(f => pathutils.basename(f.entry.path)));
        }
    }

    const askConflict = items => new Promise(resolve => {
        const dialog = dialogs.open(PasteConflictDialog, { items, onResolve: mode => { dialog.close(); resolve(mode); } });
    });

    /** New items for what was pasted, from the clipboard's entries (hash and properties kept). */
    async function pastedItems(succeeded, items) {
        const byPath = new Map(items.map(it => [it.path, it]));
        const made = succeeded.map(s => {
            const original = byPath.get(s.source);
            // A copy: the clipboard keeps its own entry
            const entry = original && original.entry
                ? { ...JSON.parse(JSON.stringify(original.entry)), path: s.dest }
                : { path: s.dest, type: original ? original.type : ddb.entry.type.GENERIC, size: original ? original.size : 0 };
            return itemFor(dataset, entry, { empty: ddb.entry.isDirectory(entry) });
        });
        // Clipboards saved before entries were kept: read the entry so viewers can open it
        await Promise.all(made.filter(it => !it.entry.hash && !ddb.entry.isDirectory(it.entry)).map(async it => {
            try {
                const fetched = await dataset.listOne(it.entry.path);
                if (fetched) Object.assign(it, { entry: fetched, empty: ddb.entry.isDirectory(fetched), isExpandable: ddb.entry.isDirectory(fetched) });
            } catch (e) {
                console.warn(`Could not fetch entry for pasted item ${it.entry.path}:`, e);
            }
        }));
        return made;
    }

    async function paste() {
        if (clipboard.isEmpty) return;
        if (!canWrite.value) return notify.warn('You do not have write access to this dataset', { summary: 'Paste', life: 'short' });
        const { mode, source } = clipboard;
        const items = clipboard.items.slice();
        const target = { ...here(), basePath: listing.currentPath.value || '', dataset };
        const sameDataset = source && source.orgSlug === target.orgSlug && source.dsSlug === target.dsSlug;
        if (sameDataset && (source.basePath || '') === target.basePath) {
            return notify.info(mode === 'cut' ? 'Cannot move into the same folder' : 'Cannot copy into the same folder', { summary: 'Paste' });
        }

        let strategy;
        try {
            strategy = resolvePasteStrategy(source, mode, target);
        } catch (e) {
            return showError(e, 'Paste');
        }
        const existing = await namesIn(target.basePath);
        const conflicts = items.filter(it => existing.has(pathutils.basename(it.path)));
        const conflictMode = conflicts.length ? await askConflict(conflicts) : 'overwrite';
        if (conflictMode === 'cancel') return;

        const sourceDataset = sameDataset ? dataset : reg.Organization(source.orgSlug).Dataset(source.dsSlug);
        busy.value = true;
        let result;
        try {
            result = await strategy.execute(items, { ...source, dataset: sourceDataset }, target, { conflictMode });
        } catch (e) {
            return showError(e, 'Paste');
        } finally {
            busy.value = false;
        }

        if (mode === 'cut' && sameDataset && result.succeeded.length) listing.removed(result.succeeded.map(s => s.source));
        if (result.succeeded.length) listing.added(await pastedItems(result.succeeded, items));
        // A cut is used up; a copy stays on the clipboard
        if (mode === 'cut') clipboard.clear();

        if (!Object.keys(result.failed).length && !result.skipped.length) {
            notify.success(`${plural(result.succeeded.length, 'item')} ${mode === 'cut' ? 'moved' : 'copied'} successfully`, { summary: 'Paste' });
        } else {
            dialogs.open(PasteResultDialog, { mode, succeeded: result.succeeded, failed: result.failed, skipped: result.skipped });
        }
    }

    return { copy, cut, paste };
}
