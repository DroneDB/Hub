// @ts-check
/**
 * userMenuItems - what the header offers a signed-in user, as pure functions of the state (FR-NAV-01): the model
 * of the user menu in labelled groups (Account, Administration), and the main destinations the header shows as
 * links (Organizations, Upload). The header renders them and owns what each command does, which it passes in.
 * The same pattern as libs/dataset/explorerTools.js and libs/contextMenuItems.js.
 */
import { storageUsage } from '@/libs/storageUsage';

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
 * @property {Versions|null} [versions]  the running versions (an administrator sees them, with System health)
 * @property {Record<'myDatasets'|'storage'|'account'|'preferences'|'users'|'tasks'|'config'|'logout', () => void>} run
 *   what each entry does
 */

/**
 * The storage row of the menu (FR-ACC-11): the text says what the numbers are ("Storage: 190.86 MB used · Unlimited",
 * "Storage: 0 B of 40 MB", "Storage: 5 MB of 40 MB · 12.5%") whatever the shape of the storage, and the row always does one
 * thing: it opens the Storage Info (`open`). From 90 % of the quota the row is amber, from 100 % red (D-030). Null when
 * there is nothing to show.
 * @param {StorageInfo|null|undefined} info
 * @param {() => void} open  what the row does
 * @returns {MenuItem|null}
 */
export function storageEntry(info, open) {
    if (!info) return null;
    const usage = storageUsage(info.used, info.total);
    return {
        label: `Storage: ${usage.label}`,
        icon: 'fa-regular fa-hard-drive',
        class: usage.severity === 'ok' ? 'user-menu-storage' : `user-menu-storage user-menu-storage-${usage.severity}`,
        command: open
    };
}

/**
 * @typedef {object} Versions  what GET /sys/features says about the running software
 * @property {string|null} [registryVersion]
 * @property {string|null} [hubVersion]
 * @property {string|null} [ddbVersion]
 */

/**
 * The running versions as one line ("Registry 2.7.1 · Hub 2.7.0 · ddb 2.2.0"); '' when none is known.
 * @param {Versions|null|undefined} versions
 */
export function versionsLine(versions) {
    if (!versions) return '';
    return [['Registry', versions.registryVersion], ['Hub', versions.hubVersion], ['ddb', versions.ddbVersion]]
        .filter(([, version]) => version)
        .map(([name, version]) => `${name} ${version}`)
        .join(' · ');
}

/**
 * A page of the server that opens in a new tab: its name says so, and the menu marks it with an arrow.
 * @param {string} label @param {string} icon @param {string} url
 * @returns {MenuItem}
 */
function externalEntry(label, icon, url) {
    return { label, ariaLabel: `${label} (opens in a new tab)`, icon, url, target: '_blank', rel: 'noopener', class: 'user-menu-external' };
}

/**
 * The user menu, in groups. The first entry names the user (disabled). The Account group has the user's datasets,
 * their storage, My Account (a local user), Preferences and Logout; the Administration group, for an administrator,
 * has Users (local authentication), Tasks, Configuration, and the Hangfire, API documentation and System health pages,
 * which open in a new tab (their names say so), and the running versions on a line of their own (FR-NAV-08).
 * @param {MenuState} state
 * @returns {MenuItem[]}  empty when nobody is signed in
 */
export function userMenuItems(state) {
    const { loggedIn, username, isAdmin, accountManagement, usersManagement, storage, versions, run } = state;
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
        admin.push(externalEntry('Hangfire', 'fa-solid fa-fire', '/hangfire'));
        admin.push(externalEntry('API Docs', 'fa-solid fa-code', '/scalar/v1'));
        admin.push(externalEntry('System health', 'fa-solid fa-heart-pulse', '/health'));
        const running = versionsLine(versions);
        if (running) {
            admin.push({ separator: true });
            admin.push({ label: running, disabled: true, class: 'user-menu-version' });
        }
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
