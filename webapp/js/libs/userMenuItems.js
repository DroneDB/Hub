// @ts-check
/**
 * userMenuItems - what the header offers a signed-in user, as pure functions of the state (FR-NAV-01): the model
 * of the user menu in labelled groups (Account, Administration), and the main destinations the header shows as
 * links (Organizations, Upload). The header renders them and owns what each command does, which it passes in.
 * The same pattern as libs/dataset/explorerTools.js and libs/contextMenuItems.js.
 */
import { bytesToSize } from '@/libs/utils';

/**
 * @typedef {object} StorageInfo
 * @property {number|null} [total]  bytes the user may store (null: no limit)
 * @property {number} [used]  bytes stored
 * @property {number|null} [usedPercentage]  used / total, 0..1
 */

/**
 * @typedef {object} MenuItem  an item of the model of a PrimeVue Menu
 * @property {string} [label]
 * @property {string} [ariaLabel]  the accessible name, when the label alone does not say what the row is
 * @property {string} [icon]
 * @property {boolean} [disabled]
 * @property {boolean} [separator]
 * @property {string} [class]
 * @property {string} [url]
 * @property {string} [target]
 * @property {string} [rel]
 * @property {() => void} [command]
 * @property {MenuItem[]} [items]  the items of a group; the label of an item with items is the group's title
 */

/**
 * @typedef {object} MenuState
 * @property {boolean} loggedIn  nobody signed in: no menu
 * @property {string} username
 * @property {boolean} isAdmin
 * @property {boolean} accountManagement  the user manages their account here (a local user)
 * @property {boolean} usersManagement  users are managed here (local authentication)
 * @property {StorageInfo|null} storage  null: not read, or hidden
 * @property {Record<'myDatasets'|'storage'|'account'|'preferences'|'users'|'tasks'|'config'|'logout', () => void>} run
 *   what each entry does
 */

/**
 * A fraction as a percentage ('12.50%'); nothing for 0 or none.
 * @param {number|null|undefined} value  0..1
 * @param {number} places
 * @returns {string}
 */
export function percentText(value, places) {
    if (!value) return '';
    return (value * 100).toFixed(places) + '%';
}

/**
 * The storage row of the menu: what is used, or what the quota is. The row shows a bare number, so its name says what
 * the number is. Null when there is nothing to show.
 * @param {StorageInfo|null|undefined} info
 * @param {() => void} [open]  what the row does when there is a breakdown to show
 * @returns {MenuItem|null}
 */
export function storageEntry(info, open) {
    if (!info) return null;
    const row = (/** @type {string} */ label, /** @type {string} */ ariaLabel, command = () => {}) =>
        ({ label, ariaLabel, icon: 'fa-regular fa-hard-drive', command });
    if (info.total != null && Number(info.used) > 0) {
        const used = percentText(info.usedPercentage, 2);
        return row(used, `Storage: ${used} used`, open);
    }
    if (info.total != null && !info.used) {
        const total = bytesToSize(info.total);
        return row(total, `Storage: ${total} total, none used`);
    }
    if (info.total == null) {
        const used = bytesToSize(info.used);
        return row(used, `Storage: ${used} used`);
    }
    return null;
}

/**
 * The user menu, in groups. The first entry names the user (disabled). The Account group has the user's datasets,
 * their storage, My Account (a local user), Preferences and Logout; the Administration group, for an administrator,
 * has Users (local authentication), Tasks, Configuration, and the Hangfire and API documentation pages, which open
 * in a new tab.
 * @param {MenuState} state
 * @returns {MenuItem[]}  empty when nobody is signed in
 */
export function userMenuItems(state) {
    const { loggedIn, username, isAdmin, accountManagement, usersManagement, storage, run } = state;
    if (!loggedIn) return [];

    /** @type {MenuItem[]} */
    const account = [{ label: 'My Datasets', icon: 'fa-solid fa-database', command: run.myDatasets }];
    const storageRow = storageEntry(storage, run.storage);
    if (storageRow) account.push(storageRow);
    if (accountManagement) account.push({ label: 'My Account', icon: 'fa-solid fa-user', command: run.account });
    account.push({ label: 'Preferences', icon: 'fa-solid fa-sliders', command: run.preferences });
    account.push({ separator: true });
    account.push({ label: 'Logout', icon: 'fa-solid fa-right-from-bracket', command: run.logout });

    /** @type {MenuItem[]} */
    const items = [
        { label: username + (isAdmin && username !== 'admin' ? ' - admin' : ''), disabled: true, class: 'user-menu-header' },
        { label: 'Account', items: account }
    ];

    if (isAdmin) {
        /** @type {MenuItem[]} */
        const admin = [];
        if (usersManagement) admin.push({ label: 'Manage Users', icon: 'fa-solid fa-users', command: run.users });
        admin.push({ label: 'Tasks', icon: 'fa-solid fa-list-check', command: run.tasks });
        admin.push({ label: 'Configuration', icon: 'fa-solid fa-gear', command: run.config });
        admin.push({ label: 'Hangfire', icon: 'fa-solid fa-fire', url: '/hangfire', target: '_blank', rel: 'noopener' });
        admin.push({ label: 'API Docs', icon: 'fa-solid fa-code', url: '/scalar/v1', target: '_blank', rel: 'noopener' });
        items.splice(1, 0, { label: 'Administration', items: admin });
    }
    return items;
}

/**
 * @typedef {object} NavLink
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {import('vue-router').RouteLocationRaw} to
 */

/**
 * The main destinations the header shows to a signed-in user, as links: Organizations (the datasets of the one
 * organization of a one-organization install, which is home there) and Upload, unless creating datasets is off.
 * @param {{ loggedIn: boolean, fileUploads: boolean, home: { name: string, params?: Record<string, string> } }} state
 * @returns {NavLink[]}
 */
export function primaryNavItems({ loggedIn, fileUploads, home }) {
    if (!loggedIn) return [];
    /** @type {NavLink[]} */
    const links = [{
        id: 'organizations',
        label: home.name === 'Organizations' ? 'Organizations' : 'Datasets',
        icon: home.name === 'Organizations' ? 'fa-solid fa-sitemap' : 'fa-solid fa-database',
        to: home
    }];
    if (fileUploads) links.push({ id: 'upload', label: 'Upload', icon: 'fa-solid fa-cloud-arrow-up', to: { name: 'Upload' } });
    return links;
}
