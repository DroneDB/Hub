import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, nextTick } from 'vue';

const h = vi.hoisted(() => ({
    sys: { updateInfo: null, saveUpdateCheckSettings: null },
    auth: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { sys: h.sys } }));
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({
        isLoggedIn: true,
        isAdmin: true,
        flags: { updateCheckEnabled: true },
        feature(name) { return this.flags[name]; }
    });
    return { useAuthStore: () => h.auth };
});

const { useUpdateCheck, resetUpdateCheck, updateLinks } = await import('./useUpdateCheck');

const INFO = { currentVersion: '2.0.0', latestVersion: '2.1.0', isUpdateAvailable: true };
const use = () => effectScope().run(() => useUpdateCheck());
const settle = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve(); };

beforeEach(() => {
    resetUpdateCheck();
    h.auth.isLoggedIn = true;
    h.auth.isAdmin = true;
    h.auth.flags.updateCheckEnabled = true;
    h.sys.updateInfo = vi.fn(() => Promise.resolve(INFO));
    h.sys.saveUpdateCheckSettings = vi.fn(() => Promise.resolve({ ...INFO, useDeclaration: 'personal' }));
});

describe('useUpdateCheck', () => {
    it('does not ask the server when the update check is off', async () => {
        h.auth.flags.updateCheckEnabled = false;
        const { load, updateInfo } = use();
        await load();
        expect(h.sys.updateInfo).not.toHaveBeenCalled();
        expect(updateInfo.value).toBeNull();
    });

    it('does not ask for a user who is not an admin or not logged in', async () => {
        h.auth.isAdmin = false;
        await use().load();
        h.auth.isAdmin = true;
        h.auth.isLoggedIn = false;
        await use().load();
        expect(h.sys.updateInfo).not.toHaveBeenCalled();
    });

    it('asks once for several callers, also while the first answer is on its way', async () => {
        const a = use();
        const b = use();
        await Promise.all([a.load(), b.load()]);
        await a.load();
        expect(h.sys.updateInfo).toHaveBeenCalledTimes(1);
        expect(b.updateInfo.value).toEqual(INFO);
    });

    it('reports an available update only for an admin on a server with the check on', async () => {
        const { load, updateAvailable } = use();
        await load();
        expect(updateAvailable.value).toBe(true);
        h.auth.flags.updateCheckEnabled = false;
        expect(updateAvailable.value).toBe(false);
    });

    it('fails silently and does not retry', async () => {
        h.sys.updateInfo = vi.fn(() => Promise.reject(new Error('offline')));
        const { load, updateInfo, error } = use();
        await expect(load()).resolves.toBeUndefined();
        await load();
        expect(h.sys.updateInfo).toHaveBeenCalledTimes(1);
        expect(updateInfo.value).toBeNull();
        expect(error.value).toBe('offline');
    });

    it('asks again when forced, and past a disabled check when told to', async () => {
        h.auth.flags.updateCheckEnabled = false;
        const { load } = use();
        await load({ ignoreGate: true });
        await load({ ignoreGate: true, force: true });
        expect(h.sys.updateInfo).toHaveBeenCalledTimes(2);
    });

    it('clears the cache on logout and ignores an answer that arrives after it', async () => {
        let answer;
        h.sys.updateInfo = vi.fn(() => new Promise(resolve => { answer = resolve; }));
        const { load, updateInfo } = use();
        const pending = load();
        h.auth.isLoggedIn = false;
        await settle();
        answer(INFO);
        await pending;
        expect(updateInfo.value).toBeNull();

        h.sys.updateInfo = vi.fn(() => Promise.resolve(INFO));
        h.auth.isLoggedIn = true;
        await load();
        expect(updateInfo.value).toEqual(INFO);
        h.auth.isLoggedIn = false;
        await settle();
        expect(updateInfo.value).toBeNull();
    });

    it('saves the settings and keeps the server answer as the cache', async () => {
        const { saveSettings, updateInfo } = use();
        const settings = { useDeclaration: 'personal', contactEmail: null, contactConsent: false };
        await saveSettings(settings);
        expect(h.sys.saveUpdateCheckSettings).toHaveBeenCalledWith(settings);
        expect(updateInfo.value.useDeclaration).toBe('personal');
        expect(h.sys.updateInfo).not.toHaveBeenCalled();
    });

    it('lets a refused save reach the caller and leaves the cache alone', async () => {
        h.sys.saveUpdateCheckSettings = vi.fn(() => Promise.reject(new Error('no consent')));
        const { saveSettings, updateInfo } = use();
        await expect(saveSettings({ useDeclaration: null, contactEmail: 'a@b.c', contactConsent: false })).rejects.toThrow('no consent');
        expect(updateInfo.value).toBeNull();
    });
});

describe('updateLinks', () => {
    const info = { compareUrl: 'https://github.com/x/compare/a...b', changelogUrl: 'https://example.com/log', licenseRequestUrl: 'https://dronedb.app/request-license?instance=1' };

    it('takes the addresses from the server answer', () => {
        expect(updateLinks(info)).toEqual({ changes: info.compareUrl, licence: info.licenseRequestUrl });
    });

    it('falls back to the changelog when there is no compare address', () => {
        expect(updateLinks({ ...info, compareUrl: null }).changes).toBe(info.changelogUrl);
    });

    it('has no licence link for a licensed deployment', () => {
        expect(updateLinks({ ...info, useDeclaration: 'commercial_licensed' }).licence).toBeNull();
    });

    it('refuses addresses that are not web pages', () => {
        const bad = updateLinks({ compareUrl: 'javascript:alert(1)', licenseRequestUrl: 'data:text/html,x' });
        expect(bad).toEqual({ changes: null, licence: null });
        expect(updateLinks(null)).toEqual({ changes: null, licence: null });
    });
});
