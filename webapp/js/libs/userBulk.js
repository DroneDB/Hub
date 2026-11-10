// @ts-check
/**
 * What the bulk actions of the Users list decide (FR-ADM-23), as pure functions: which users a row can select, who may
 * take over the data of deleted users, and the one summary text of a bulk action.
 */
import { isDisabledUser } from '@/libs/roles';
import { userDeleteBlockReason } from '@/libs/deleteBlockReason';
import { countOf } from '@/libs/format';

/**
 * Whether the row of a user has a checkbox: every user but the built-in administrator.
 * @param {{ userName?: string|null }|null|undefined} user
 */
export function selectableUser(user) {
    return !userDeleteBlockReason(user);
}

/**
 * The users that can take over the data of the users being deleted: not one of them, and not a disabled user, who
 * cannot sign in to use it.
 * @param {{ userName: string, roles?: string[]|null }[]} users  every user
 * @param {string[]} deleting  the user names being deleted
 * @returns {{ label: string, value: string }[]}
 */
export function successorChoices(users, deleting) {
    return users
        .filter(user => !deleting.includes(user.userName) && !isDisabledUser(user))
        .map(user => ({ label: user.userName, value: user.userName }));
}

/**
 * @typedef {object} BulkOutcome
 * @property {string[]} done  the user names the action succeeded for
 * @property {{ userName: string, message: string }[]} failed  the ones it failed for, with the Registry's message
 * @property {string[]} [skipped]  the ones it had nothing to do for
 */

/**
 * The one sentence that reports a bulk action: "Disabled 2 users. 1 failed: bob (Cannot disable your own account)."
 * @param {string} verb  past tense, capitalised ("Disabled", "Added the role editor to")
 * @param {BulkOutcome} outcome
 */
export function bulkSummary(verb, { done, failed, skipped = [] }) {
    let text = `${verb} ${countOf(done.length, 'user')}.`;
    if (skipped.length) text += ` Already so for ${skipped.join(', ')}.`;
    if (failed.length) text += ` ${failed.length} failed: ${failed.map(f => `${f.userName} (${f.message})`).join('; ')}.`;
    return text;
}

const COUNTS = Object.freeze([
    'organizationsTransferred', 'organizationsDeleted', 'datasetsTransferred', 'datasetsDeleted', 'batchesDeleted'
]);

/**
 * What the delete of several users did in all, in the shape of the result of one delete (the result window shows both).
 * @param {Record<string, any>[]} results  the result of each delete
 * @param {string|null} successor  who took the data over, if anybody did
 */
export function sumDeleteResults(results, successor) {
    /** @type {Record<string, any>} */
    const total = { successor: successor || null };
    for (const key of COUNTS) total[key] = results.reduce((sum, result) => sum + (Number(result?.[key]) || 0), 0);
    return total;
}
