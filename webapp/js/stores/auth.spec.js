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
    addEventListener: () => {},
    features: { get: () => null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { useAuthStore } = await import('@/stores/auth');
const { setToastService } = await import('@/libs/notify');

let add;
let auth;

const clearTokenInOtherTab = () => {
    reg.session = { user: '', loggedIn: false, admin: false };
    window.dispatchEvent(new StorageEvent('storage', { key: 'https://hub.test_jwt_token', oldValue: 'x', newValue: null }));
};

beforeEach(() => {
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
