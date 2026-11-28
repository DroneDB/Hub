/**
 * A sign-out in another tab reaches this one (FR-ACC-19): the browser's storage event, sent after the token keys are
 * cleared in the other tab, makes the store read the session again; a session that ended that way is told once, as an info
 * toast ("You signed out in another tab.") with a Sign in action (FR-XC-13, FR-XC-23).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const reg = vi.hoisted(() => ({
    url: 'https://hub.test',
    session: { user: 'alice', loggedIn: true, admin: false },
    getUsername() { return this.session.user; },
    isLoggedIn() { return this.session.loggedIn; },
    isAdmin() { return this.session.admin; },
    listeners: {},
    addEventListener(event, cb) { (this.listeners[event] ??= []).push(cb); },
    emit(event) { (this.listeners[event] ?? []).forEach(cb => cb()); },
    login: vi.fn(() => Promise.resolve()),
    features: { get: () => null, load: vi.fn(() => Promise.resolve({})) }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { useAuthStore } = await import('@/stores/auth');
const { setToastService } = await import('@/libs/notify');

const { xAuthSignOut, xAuthAvailable } = await import('@/libs/api/xauth');

let add;
let auth;

const clearTokenInOtherTab = () => {
    reg.session = { user: '', loggedIn: false, admin: false };
    window.dispatchEvent(new StorageEvent('storage', { key: 'https://hub.test_jwt_token', oldValue: 'x', newValue: null }));
};

beforeEach(() => {
    reg.listeners = {};
    reg.features.load.mockReset();
    reg.features.load.mockResolvedValue({});
    reg.login.mockClear();
    localStorage.clear();
    reg.session = { user: 'alice', loggedIn: true, admin: false };
    add = vi.fn();
    setToastService({ add, remove: vi.fn() });
    setActivePinia(createPinia());
    auth = useAuthStore();
});
afterEach(() => setToastService(null));

describe('the auth store follows the other tabs', () => {
    it('sets isLoggedIn to false when the token keys are cleared in another tab', () => {
        expect(auth.isLoggedIn).toBe(true);
        clearTokenInOtherTab();
        expect(auth.isLoggedIn).toBe(false);
        expect(auth.username).toBe('');
    });

    it('also follows the clearing of the whole storage (key null), and ignores the other keys', () => {
        reg.session = { user: '', loggedIn: false, admin: false };
        window.dispatchEvent(new StorageEvent('storage', { key: 'https://hub.test_other_setting' }));
        expect(auth.isLoggedIn).toBe(true);
        window.dispatchEvent(new StorageEvent('storage', { key: null }));
        expect(auth.isLoggedIn).toBe(false);
    });

    it('says "You signed out in another tab." once, as an info toast with a Sign in action', () => {
        clearTokenInOtherTab();
        clearTokenInOtherTab();
        expect(add).toHaveBeenCalledTimes(1);
        const toast = add.mock.calls[0][0];
        expect(toast).toMatchObject({ severity: 'info', summary: 'Signed out', detail: 'You signed out in another tab.' });
        expect(toast.data.action.label).toBe('Sign in');
    });

    it('sends the Sign in action to Login, back to this page afterwards', () => {
        const push = vi.fn(() => Promise.resolve());
        auth.bindRouter({ push });
        window.history.replaceState(null, '', '/r/acme/site?tab=files');
        clearTokenInOtherTab();
        add.mock.calls[0][0].data.action.run();
        expect(push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r/acme/site?tab=files' } });
    });

    it('says nothing when a session starts in another tab, but follows it', () => {
        reg.session = { user: '', loggedIn: false, admin: false };
        auth.sync();
        reg.session = { user: 'bob', loggedIn: true, admin: false };
        window.dispatchEvent(new StorageEvent('storage', { key: 'https://hub.test_jwt_token_expires', newValue: '1' }));
        expect(auth.isLoggedIn).toBe(true);
        expect(auth.username).toBe('bob');
        expect(add).not.toHaveBeenCalled();
    });
});

describe('the feature flags follow the session', () => {
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    it('are loaded again when the session ends, as the flags of the signed-out visitor', async () => {
        reg.session = { user: '', loggedIn: false, admin: false };
        reg.emit('logout');
        await settle();
        expect(reg.features.load).toHaveBeenCalledTimes(1);
        expect(auth.isLoggedIn).toBe(false);
        expect(auth.featuresVersion).toBe(1);
    });

    it('are loaded again when another tab ends the session', async () => {
        clearTokenInOtherTab();
        await settle();
        // (the stores of the earlier tests still listen to the window: at least the one of this test)
        expect(reg.features.load).toHaveBeenCalled();
    });

    it('are loaded one request after the other: the answer of the sign-out cannot overwrite the sign-in\'s', async () => {
        let answerSignedOut;
        reg.features.load.mockImplementationOnce(() => new Promise(resolve => { answerSignedOut = resolve; }));
        reg.session = { user: '', loggedIn: false, admin: false };
        reg.emit('logout');
        const signedIn = auth.login('bob', 'pw');
        await settle();
        // The sign-in's load waits for the sign-out's
        expect(reg.features.load).toHaveBeenCalledTimes(1);
        answerSignedOut({});
        await signedIn;
        expect(reg.features.load).toHaveBeenCalledTimes(2);
    });
});

describe('the website\'s single sign-on after a sign-out on purpose', () => {
    const cookie = token => { document.cookie = `xAuthToken=${encodeURIComponent(`${token}|https://dronedb.app/wp-login.php?action=logout&_wpnonce=abc`)};path=/`; };
    beforeEach(() => {
        vi.spyOn(document.body, 'append').mockImplementation(() => { });
        cookie('unused-token');
        xAuthSignOut();
        cookie('fresh-token');
    });
    afterEach(() => {
        document.cookie = 'xAuthToken=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
        vi.restoreAllMocks();
    });

    it('stays off when the Hub signs in with the cookie itself', async () => {
        expect(xAuthAvailable()).toBe(false);
    });

    it('is on again after the user signs in with their credentials', async () => {
        await auth.login('bob', 'pw');
        expect(xAuthAvailable()).toBe(true);
    });

    it('is not turned on by a sign-in through the cookie (the token is no choice of the user)', async () => {
        await auth.login(null, null, 'fresh-token');
        expect(xAuthAvailable()).toBe(false);
    });
});
