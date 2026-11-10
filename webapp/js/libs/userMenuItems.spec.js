import { describe, it, expect, vi } from 'vitest';
import { userMenuItems, primaryNavItems, storageEntry, versionsLine } from './userMenuItems';

const run = () => ({
    myDatasets: vi.fn(), storage: vi.fn(), account: vi.fn(), preferences: vi.fn(), users: vi.fn(), tasks: vi.fn(), config: vi.fn(), logout: vi.fn()
});
const state = (over = {}) => ({
    loggedIn: true, username: 'maria', isAdmin: false, accountManagement: true, usersManagement: true, storage: null, run: run(), ...over
});
const group = (items, title) => items.find(i => i.label === title);
const labels = items => items.filter(i => !i.separator).map(i => i.label);

describe('userMenuItems (FR-NAV-01)', () => {
    it('is empty for nobody', () => {
        expect(userMenuItems(state({ loggedIn: false }))).toEqual([]);
    });

    it('names the user first, disabled, and gives a user an Account group with the one to leave last', () => {
        const items = userMenuItems(state());
        expect(items[0]).toMatchObject({ label: 'maria', disabled: true, class: 'user-menu-header' });
        expect(items.map(i => i.label)).toEqual(['maria', 'Account']);
        expect(labels(group(items, 'Account').items)).toEqual(['My Datasets', 'My Account', 'Preferences', 'Logout']);
    });

    it('names an administrator whose name is not admin', () => {
        expect(userMenuItems(state({ isAdmin: true }))[0].label).toBe('maria - admin');
        expect(userMenuItems(state({ isAdmin: true, username: 'admin' }))[0].label).toBe('admin');
    });

    it('groups the entries of an administrator under Administration, apart from the Account group', () => {
        const items = userMenuItems(state({ isAdmin: true }));
        expect(items.map(i => i.label)).toEqual(['maria - admin', 'Administration', 'Account']);
        const admin = group(items, 'Administration').items;
        expect(labels(admin)).toEqual(['Manage Users', 'Tasks', 'Configuration', 'Hangfire', 'API Docs', 'System health']);
        // The administrator's entries are not among the account's, nor the account's among them
        expect(labels(group(items, 'Account').items)).not.toContain('Tasks');
        expect(labels(admin)).not.toContain('Preferences');
        // The pages of Hangfire and the API open in a new tab, safely
        expect(admin.find(i => i.label === 'Hangfire')).toMatchObject({ url: '/hangfire', target: '_blank', rel: 'noopener' });
        expect(admin.find(i => i.label === 'API Docs')).toMatchObject({ url: '/scalar/v1', target: '_blank', rel: 'noopener' });
        expect(admin.find(i => i.label === 'System health')).toMatchObject({ url: '/health', target: '_blank', rel: 'noopener' });
    });

    it('has no Administration group for a user who is not an administrator', () => {
        expect(userMenuItems(state()).map(i => i.label)).not.toContain('Administration');
    });

    it('has no Manage Users without local authentication, and no My Account for a remote user', () => {
        const items = userMenuItems(state({ isAdmin: true, usersManagement: false, accountManagement: false }));
        expect(labels(group(items, 'Administration').items)).toEqual(['Tasks', 'Configuration', 'Hangfire', 'API Docs', 'System health']);
        expect(labels(group(items, 'Account').items)).not.toContain('My Account');
    });

    it('runs what the header passes in', () => {
        const s = state({ isAdmin: true });
        const items = userMenuItems(s);
        const all = items.flatMap(i => i.items ?? [i]);
        for (const [label, key] of [['My Datasets', 'myDatasets'], ['My Account', 'account'], ['Preferences', 'preferences'],
            ['Logout', 'logout'], ['Manage Users', 'users'], ['Tasks', 'tasks'], ['Configuration', 'config']]) {
            all.find(i => i.label === label).command();
            expect(s.run[key]).toHaveBeenCalledTimes(1);
        }
    });

    it('puts the storage row after the datasets in the Account group', () => {
        const s = state({ storage: { total: 1000, used: 100, usedPercentage: 0.1 } });
        const account = group(userMenuItems(s), 'Account').items;
        expect(labels(account).slice(0, 2)).toEqual(['My Datasets', 'Storage: 100 B of 1,000 B · 10%']);
        account[1].command();
        expect(s.run.storage).toHaveBeenCalledTimes(1);
    });
});

describe('storageEntry (FR-ACC-11)', () => {
    const MB = 1024 * 1024;
    const rowOf = info => { const e = storageEntry(info, () => {}); return e && e.label; };

    it('writes a text that says what the numbers are, for each shape of the storage', () => {
        expect(rowOf({ total: 40 * MB, used: 5 * MB })).toBe('Storage: 5 MB of 40 MB · 12.5%');
        expect(rowOf({ total: 40 * MB, used: 0 })).toBe('Storage: 0 B of 40 MB');
        expect(rowOf({ total: null, used: 190.86 * MB })).toBe('Storage: 190.86 MB used · Unlimited');
        expect(rowOf({ total: null, used: 0 })).toBe('Storage: 0 B used · Unlimited');
    });

    it('has no separate accessible name: the visible text is the name', () => {
        expect(storageEntry({ total: 40 * MB, used: 5 * MB }, () => {})).not.toHaveProperty('ariaLabel');
    });

    it('is nothing before the storage is read', () => {
        expect(storageEntry(null, () => {})).toBeNull();
    });

    it('does the same for every shape: it opens the Storage Info (never an empty command)', () => {
        for (const info of [{ total: 1000, used: 10 }, { total: 1000, used: 0 }, { total: null, used: 2048 }, { total: null, used: 0 }]) {
            const open = vi.fn();
            const row = storageEntry(info, open);
            expect(typeof row.command).toBe('function');
            row.command();
            expect(open).toHaveBeenCalledTimes(1);
        }
    });

    it('is amber from 90 % and red from 100 % of the quota (D-030), and plain below', () => {
        expect(storageEntry({ total: 100, used: 89 }, () => {}).class).toBe('user-menu-storage');
        expect(storageEntry({ total: 100, used: 90 }, () => {}).class).toBe('user-menu-storage user-menu-storage-warn');
        expect(storageEntry({ total: 100, used: 130 }, () => {}).class).toBe('user-menu-storage user-menu-storage-over');
        expect(rowOf({ total: 100, used: 130 })).toBe('Storage: 130 B of 100 B · 130%');
        expect(storageEntry({ total: null, used: 1e9 }, () => {}).class).toBe('user-menu-storage');
    });
});

describe('versions and System health (FR-NAV-08)', () => {
    const adminState = over => state({ isAdmin: true, ...over });
    const adminItems = s => group(userMenuItems(s), 'Administration').items;

    it('writes the running versions as one line, leaving out the ones not known', () => {
        expect(versionsLine({ registryVersion: '2.7.1', hubVersion: '2.7.0', ddbVersion: '2.2.0' })).toBe('Registry 2.7.1 · Hub 2.7.0 · ddb 2.2.0');
        expect(versionsLine({ registryVersion: '2.7.1', hubVersion: null })).toBe('Registry 2.7.1');
        expect(versionsLine({})).toBe('');
        expect(versionsLine(null)).toBe('');
    });

    it('shows an administrator the versions on a disabled line after the links', () => {
        const items = adminItems(adminState({ versions: { registryVersion: '2.7.1', hubVersion: '2.7.0', ddbVersion: '2.2.0' } }));
        const line = items[items.length - 1];
        expect(line).toMatchObject({ label: 'Registry 2.7.1 · Hub 2.7.0 · ddb 2.2.0', disabled: true });
        expect(line).not.toHaveProperty('command');
        expect(items[items.length - 2]).toEqual({ separator: true });
    });

    it('has no version line when no version is known, and none for a user who is not an administrator', () => {
        expect(adminItems(adminState({ versions: {} })).map(i => i.label)).not.toContain(undefined);
        expect(adminItems(adminState({ versions: {} })).some(i => i.class === 'user-menu-version')).toBe(false);
        const items = userMenuItems(state({ versions: { registryVersion: '2.7.1' } }));
        expect(JSON.stringify(items)).not.toContain('2.7.1');
        expect(JSON.stringify(items)).not.toContain('System health');
    });

    it('says in the name of each page that opens in a new tab that it does, and marks it', () => {
        const external = adminItems(adminState()).filter(i => i.url);
        expect(external.map(i => i.ariaLabel)).toEqual(['Hangfire (opens in a new tab)', 'API Docs (opens in a new tab)', 'System health (opens in a new tab)']);
        for (const item of external) {
            expect(item.class).toBe('user-menu-external');
            expect(item.ariaLabel.startsWith(item.label)).toBe(true);
        }
    });
});

describe('primaryNavItems (FR-NAV-01)', () => {
    const home = { name: 'Organizations' };

    it('are Organizations and Upload for a signed-in user', () => {
        expect(primaryNavItems({ loggedIn: true, fileUploads: true, home })).toEqual([
            { id: 'organizations', label: 'Organizations', icon: 'fa-solid fa-sitemap', to: { name: 'Organizations' } },
            { id: 'upload', label: 'Upload', icon: 'fa-solid fa-cloud-arrow-up', to: { name: 'Upload' } }
        ]);
    });

    it('have no Upload when the creation of datasets is off', () => {
        expect(primaryNavItems({ loggedIn: true, fileUploads: false, home }).map(l => l.id)).toEqual(['organizations']);
    });

    it('lead to the datasets of the one organization of a one-organization install', () => {
        const [first] = primaryNavItems({ loggedIn: true, fileUploads: true, home: { name: 'Datasets', params: { org: 'acme' } } });
        expect(first).toMatchObject({ label: 'Datasets', to: { name: 'Datasets', params: { org: 'acme' } } });
    });

    it('are none for a visitor', () => {
        expect(primaryNavItems({ loggedIn: false, fileUploads: true, home })).toEqual([]);
    });
});
