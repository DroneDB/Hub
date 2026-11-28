// @ts-check
/**
 * The website's single sign-on cookie. The website (dronedb.app) writes `xAuthToken` for a signed-in
 * subscriber, and the Hub signs the visitor in with it (Login). The value is
 *
 *     <auth token>|<logout url>
 *
 * written by PHP `setcookie`, which URL-encodes it: the logout URL is a whole URL with `&` and `=` in it (the
 * nonce WordPress asks for), so the value is read from the first `=` of the pair, decoded, and cut at the FIRST `|`.
 *
 * An explicit sign-out is final: the website keeps writing a fresh token for as long as its own session lives,
 * so the Hub deletes the cookie itself and remembers the sign-out until the next explicit sign-in
 * (`clearXAuthSignedOut`). Until then no sign-in goes through the cookie.
 */
import { getCookie } from '@/libs/utils';
import { safeStorage } from '@/libs/preferences';

const COOKIE = 'xAuthToken';
const SIGNED_OUT_KEY = 'xAuthSignedOut';

/** How long the sign-out of the website may take before the Hub goes on without it. */
export const XAUTH_LOGOUT_TIMEOUT_MS = 5000;

/**
 * The token and the logout URL of the cookie's value, cut at the first `|` (a token has none; the URL may).
 * @param {string|undefined} value
 * @returns {{ token: string, logoutUrl: string }}
 */
export function parseXAuthValue(value) {
    const text = value ?? '';
    const bar = text.indexOf('|');
    return bar < 0 ? { token: text, logoutUrl: '' } : { token: text.slice(0, bar), logoutUrl: text.slice(bar + 1) };
}

const cookieValue = () => parseXAuthValue(getCookie(COOKIE));

/** Whether the visitor signed out on purpose and has not signed in on purpose since. */
export const xAuthSignedOut = () => safeStorage.getItem(SIGNED_OUT_KEY) !== null;

/** An explicit sign-in (credentials typed on Login): the cookie may sign the visitor in again. */
export function clearXAuthSignedOut() {
    safeStorage.removeItem(SIGNED_OUT_KEY);
}

/** Whether there is a cookie to sign in with: it exists and the visitor has not signed out on purpose. */
export function xAuthAvailable() {
    return !xAuthSignedOut() && !!cookieValue().token;
}

export function getXAuthToken() {
    return xAuthAvailable() ? cookieValue().token : '';
}

/** The domains the cookie may have been set for: this host and each parent that is not a bare suffix; none for an address. */
function cookieDomains() {
    const host = window.location.hostname;
    if (!host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host)) return [];
    const labels = host.split('.');
    return labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'));
}

/** Deletes the cookie for the host alone and for each domain it may have been set on (the website sets it on its own domain). */
function deleteCookie() {
    const gone = `${COOKIE}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = gone;
    for (const domain of cookieDomains()) document.cookie = `${gone};domain=${domain}`;
}

/**
 * Loads `url` (the website's logout) in a hidden frame; resolves when it loaded or after XAUTH_LOGOUT_TIMEOUT_MS.
 * Only http(s): the URL comes from a cookie.
 * @param {string} url
 * @returns {Promise<void>}
 */
function visitLogoutUrl(url) {
    return new Promise((resolve, reject) => {
        let target;
        try {
            target = new URL(url);
        } catch {
            reject(new Error('The sign-out address of the website is not a URL'));
            return;
        }
        if (target.protocol !== 'https:' && target.protocol !== 'http:') {
            reject(new Error('The sign-out address of the website is not an http address'));
            return;
        }
        const el = document.createElement('iframe');
        const done = () => {
            clearTimeout(timer);
            el.remove();
            resolve();
        };
        const timer = setTimeout(done, XAUTH_LOGOUT_TIMEOUT_MS);
        el.src = target.href;
        el.onload = done;
        el.onerror = () => {
            clearTimeout(timer);
            el.remove();
            reject(new Error('The sign-out of the website failed'));
        };
        el.width = '1';
        el.height = '1';
        document.body.append(el);
    });
}

/**
 * The sign-out of the visitor, to call where the session ends (before Login shows): when the website has
 * signed the visitor in (there is a cookie) it remembers the sign-out and deletes the cookie, all at once, so that
 * nothing signs the visitor in again; then the returned promise signs out of the website in a hidden frame (best
 * effort: it rejects when that cannot be done, and resolves at once without a cookie). A visitor the website never
 * signed in has nothing to remember: a sign-in on the website later is a new one.
 * @returns {Promise<void>}
 */
export function xAuthSignOut() {
    const { token, logoutUrl } = cookieValue();
    if (!token) return Promise.resolve();
    safeStorage.setItem(SIGNED_OUT_KEY, '1');
    deleteCookie();
    return logoutUrl ? visitLogoutUrl(logoutUrl) : Promise.resolve();
}
