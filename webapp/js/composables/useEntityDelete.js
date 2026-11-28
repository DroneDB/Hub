// @ts-check
/**
 * useEntityDelete - delete a dataset or an organization from its list: ask, mark the row as deleting, delete, report.
 *
 *   const deleteEntity = useEntityDelete(dialogs);
 *   deleteEntity(ds, { kind: 'dataset', name: ds.name, warning: 'All the files will be deleted too.',
 *                      remove: () => org.Dataset(ds.slug).delete(), done: () => reload() });
 *
 * The question comes from libs/deleteConfirmation.js: the item by its name (display name), its
 * slug after it when they differ, what goes with it (`lost`), and a typed confirmation of the
 * slug with `typed`.
 */
import { deleteConfirmation, namedItem } from '@/libs/deleteConfirmation';
import { notify } from '@/libs/notify';
import { useConfirm } from '@/composables/useConfirm';

/**
 * @param {{ open: Function }} dialogs  from useDialogs() (rendered by a DialogHost)
 */
export function useEntityDelete(dialogs) {
    const confirm = useConfirm(dialogs);

    /**
     * @param {{ slug: string, deleting?: boolean }} entity  the list row
     * @param {{ kind: string, name?: string|null, lost?: string[], typed?: boolean, warning: string, remove: () => Promise<any>, done: () => any }} options
     *   name   the display name (the slug when empty); lost: what goes with it ("3 datasets");
     *   typed  the user types the slug to confirm
     * @returns {Promise<boolean>} deleted
     */
    return async function deleteEntity(entity, { kind, name, lost = [], typed = false, warning, remove, done }) {
        const Kind = kind[0].toUpperCase() + kind.slice(1);
        const yes = await confirm(deleteConfirmation({
            kind,
            items: [namedItem(name, entity.slug)],
            lost,
            typed: typed ? entity.slug : false,
            warning
        }));
        if (!yes) return false;
        entity.deleting = true;
        try {
            if (!await remove()) throw new Error(`the server refused to delete "${entity.slug}"`);
            await done();
            notify.success(`${Kind} deleted successfully`, { summary: `${Kind} Deleted` });
            return true;
        } catch (e) {
            console.error(e);
            notify.error(`Failed to delete ${kind}: ${/** @type {Error} */ (e).message}`);
            entity.deleting = false;
            return false;
        }
    };
}
