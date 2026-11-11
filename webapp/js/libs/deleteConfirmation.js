// @ts-check
/**
 * The text of every delete confirmation, as useConfirm() options (or ConfirmDialog props):
 *
 *   confirm(deleteConfirmation({ kind: 'organization', items: [{ name: 'Acme', note: '(acme)' }],
 *                                lost: ['3 datasets'], typed: 'acme' }))
 *
 * - The title is `Delete <kind> “<name>”` for one item, `Delete <n> items` for several (plain
 *   text: the window shows it as text).
 * - The buttons are Delete and Cancel; the dialog is a danger one (focus on Cancel).
 * - The body names the items (HTML-escaped: the names come from the user) and what goes with
 *   them; several items get the same body, as a list of the first names.
 * - `typed` asks for a typed confirmation: true for the name of the one item or the number of
 *   items, a string for that text (an organization's slug).
 * - `summary` is a plain-text line under the items ("Total size: 9.3 MB"), for what the items
 *   amount to.
 * - Items that have no names of their own (the saved measurements of a view) are a
 *   `description` instead: the title is `Delete <kind>`.
 *
 * An inline <ConfirmDialog v-bind="confirmDialogProps(...)"> takes the same text as props.
 */
import { escapeHtml } from '@/libs/sanitize';

/** Names listed in a bulk delete before "and N more" */
export const LISTED_NAMES = 5;

export const IRREVERSIBLE = 'This cannot be undone.';

/**
 * @typedef {string | { name: string, note?: string }} DeleteItem  a name, or a name and a
 *   plain-text note shown after it ("(acme)", "and everything inside it")
 */

/** @param {DeleteItem} item */
const nameOf = item => (typeof item === 'string' ? item : item.name);

/** @param {DeleteItem} item */
const itemHtml = item => {
    const note = typeof item === 'string' ? '' : item.note;
    return `<strong>${escapeHtml(nameOf(item))}</strong>${note ? ` ${escapeHtml(note)}` : ''}`;
};

/**
 * An item known by a display name and a slug: the slug follows the name when they differ.
 * @param {string|null|undefined} name @param {string} slug
 * @returns {{ name: string, note: string }}
 */
export function namedItem(name, slug) {
    const shown = name || slug;
    return { name: shown, note: shown !== slug ? `(${slug})` : '' };
}

/**
 * @param {{ kind: string, items?: DeleteItem[], description?: string, summary?: string, lost?: string[], typed?: boolean | string, warning?: string }} options
 *   kind     what one item is ("dataset", "organization", "user", "file", "folder")
 *   items    the items as the user sees them
 *   description  plain text naming items that have no names (with no items)
 *   summary  one line under the items, plain text ("Total size: 9.3 MB")
 *   lost     what goes with them, plain text ("3 datasets", "1.5 GB of files")
 *   typed    typed confirmation (see above)
 *   warning  plain-text warning shown under the body, titled "This cannot be undone."
 * @returns {{ title: string, message: string, confirmText: string, cancelText: string, danger: true, requireText: string, warningTitle?: string, warningMessage?: string }}
 */
export function deleteConfirmation({ kind, items = [], description = '', summary = '', lost = [], typed = false, warning = '' }) {
    const one = items.length === 1;
    const title = description ? `Delete ${kind}` : one ? `Delete ${kind} “${nameOf(items[0])}”` : `Delete ${items.length} items`;

    let body;
    if (description) {
        body = `<p>This deletes ${escapeHtml(description)}.</p>`;
    } else if (one) {
        body = `<p>This deletes the ${escapeHtml(kind)} ${itemHtml(items[0])}.</p>`;
    } else {
        const listed = items.slice(0, LISTED_NAMES).map(item => `<li>${itemHtml(item)}</li>`);
        const more = items.length - LISTED_NAMES;
        if (more > 0) listed.push(`<li>and ${more} more</li>`);
        body = `<p>This deletes ${items.length} items:</p><ul>${listed.join('')}</ul>`;
    }
    if (summary) body += `<p>${escapeHtml(summary)}</p>`;
    const gone = lost.filter(Boolean);
    if (gone.length) body += `<p>Also deleted: ${gone.map(escapeHtml).join(', ')}.</p>`;
    if (!warning) body += `<p>${IRREVERSIBLE}</p>`;

    const requireText = typeof typed === 'string' ? typed : typed ? (one ? nameOf(items[0]) : String(items.length)) : '';

    return {
        title,
        message: body,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
        requireText,
        ...(warning ? { warningTitle: IRREVERSIBLE, warningMessage: warning } : {})
    };
}

/**
 * The same question as ConfirmDialog props, for a dialog written in a template.
 * @param {Parameters<typeof deleteConfirmation>[0]} options
 */
export function confirmDialogProps(options) {
    const { danger, ...props } = deleteConfirmation(options);
    return { ...props, confirmButtonClass: danger ? 'danger' : 'primary' };
}
