import { describe, it, expect, vi } from 'vitest';
import { userMenuItems, primaryNavItems, storageEntry, percentText } from './userMenuItems';

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
        expect(labels(admin)).toEqual(['Manage Users', 'Tasks', 'Configuration', 'Hangfire', 'API Docs']);
        // The administrator's entries are not among the account's, nor the account's among them
        expect(labels(group(items, 'Account').items)).not.toContain('Tasks');
        expect(labels(admin)).not.toContain('Preferences');
        // The pages of Hangfire and the API open in a new tab, safely
        expect(admin.find(i => i.label === 'Hangfire')).toMatchObject({ url: '/hangfire', target: '_blank', rel: 'noopener' });
        expect(admin.find(i => i.label === 'API Docs')).toMatchObject({ url: '/scalar/v1', target: '_blank', rel: 'noopener' });
    });

    it('has no Administration group for a user who is not an administrator', () => {
        expect(userMenuItems(state()).map(i => i.label)).not.toContain('Administration');
    });

    it('has no Manage Users without local authentication, and no My Account for a remote user', () => {
        const items = userMenuItems(state({ isAdmin: true, usersManagement: false, accountManagement: false }));
        expect(labels(group(items, 'Administration').items)).toEqual(['Tasks', 'Configuration', 'Hangfire', 'API Docs']);
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
        expect(labels(account).slice(0, 2)).toEqual(['My Datasets', '10.00%']);
        account[1].command();
        expect(s.run.storage).toHaveBeenCalledTimes(1);
    });
});

describe('storageEntry', () => {
    const rowOf = info => { const e = storageEntry(info, () => {}); return e && [e.label, e.ariaLabel]; };

    it('says what the bare number is', () => {
        expect(rowOf({ total: 10737418240, used: 1073741824, usedPercentage: 0.1 })).toEqual(['10.00%', 'Storage: 10.00% used']);
        expect(rowOf({ total: 10737418240, used: 0 })).toEqual(['10 GB', 'Storage: 10 GB total, none used']);
        expect(rowOf({ total: null, used: 2048 })).toEqual(['2 KB', 'Storage: 2 KB used']);
    });

    it('is nothing before the storage is read', () => {
        expect(storageEntry(null)).toBeNull();
    });

    it('opens the breakdown only for a row that has one', () => {
        const open = vi.fn();
        storageEntry({ total: 1000, used: 10, usedPercentage: 0.01 }, open).command();
        expect(open).toHaveBeenCalledTimes(1);
        expect(() => storageEntry({ total: 1000, used: 0 }, open).command()).not.toThrow();
        expect(open).toHaveBeenCalledTimes(1);
    });
});

describe('percentText', () => {
    it('writes a fraction as a percentage, and nothing for none', () => {
        expect(percentText(0.1234, 1)).toBe('12.3%');
        expect(percentText(0, 1)).toBe('');
        expect(percentText(null, 1)).toBe('');
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
