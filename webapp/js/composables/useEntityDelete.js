// @ts-check
/**
 * useEntityDelete - delete a dataset or an organization from its list (HQ-09:
 * DeleteDatasetDialog and DeleteOrganizationDialog differed in three lines, and both list
 * pages copied the same handler): ask, mark the row as deleting, delete, report.
 *
 *   const deleteEntity = useEntityDelete(dialogs);
 *   deleteEntity(ds, { kind: 'dataset', warning: 'All the files will be deleted too.',
 *                      remove: () => org.Dataset(ds.slug).delete(), done: () => reload() });
 */
import { escapeHtml } from '@/libs/sanitize';
import { notify } from '@/libs/notify';
import { useConfirm } from '@/composables/useConfirm';

/**
 * @param {{ open: Function }} dialogs  from useDialogs() (rendered by a DialogHost)
 */
export function useEntityDelete(dialogs) {
    const confirm = useConfirm(dialogs);

    /**
     * @param {{ slug: string, deleting?: boolean }} entity  the list row
     * @param {{ kind: string, warning: string, remove: () => Promise<any>, done: () => any }} options
     * @returns {Promise<boolean>} deleted
     */
    return async function deleteEntity(entity, { kind, warning, remove, done }) {
        const Kind = kind[0].toUpperCase() + kind.slice(1);
        const yes = await confirm({
            title: 'Confirm delete',
            message: `Are you sure you want to delete the ${kind} '${escapeHtml(entity.slug)}'?`,
            confirmText: 'Remove',
            cancelText: 'Close',
            danger: true,
            warningTitle: 'This action is irreversible.',
            warningMessage: warning
        });
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
