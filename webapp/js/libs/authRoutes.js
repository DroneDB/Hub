// @ts-check
/** Route decisions that depend on the session; shared by the router, Login and the 401 handler. */
import { applyQueryUpdates, currentPath, replaceQueryKeys } from './routeQuery';
import { notify } from './notify';

/**
 * The query that opens the Preferences window on any page, on the tab it names
 * (`/r?preferences=notifications`, the opt-out link of the e-mails). The header opens the
 * window and removes the query; the window needs a session, so the guard signs the user in first.
 */
export const PREFERENCES_QUERY = 'preferences';

/**
 * The query of the one-shot notices (FR-XC-13): why the app brought the user to this page.
 * One handler (handleNotice, run after every navigation) shows it once and removes it from the
 * address, so a reload, a step back or a copied link does not show it again.
 */
export const NOTICE_QUERY = 'notice';

/** The values of NOTICE_QUERY; `denied` is written `denied:<route name>` (deniedLocation). */
export const Notice = Object.freeze({
    /** A session the server no longer accepts was ended: sign in again */
    EXPIRED: 'expired',
    /** A non-admin opened an admin page */
    DENIED: 'denied',
    /** The session was ended in another tab */
    SIGNED_OUT: 'signed-out'
});

export const EXPIRED_TEXT = 'Your session has expired. Please sign in again.';
export const SIGNED_OUT_TEXT = 'You signed out in another tab.';

/**
 * Where "home" is, for everyone, signed in or not: the Organizations page, or the datasets of
 * the one organization of a one-organization install (HubOptions.singleOrganization). The logo,
 * the page states, the landing after sign-in and the admin refusals go there (FR-NAV-06).
 * @returns {{ name: string, params?: Record<string, string> }}
 */
export function homeLocation() {
    const single = /** @type {any} */ (globalThis).HubOptions?.singleOrganization;
    return single !== undefined && single !== null && single !== ''
        ? { name: 'Datasets', params: { org: String(single) } }
        : { name: 'Organizations' };
}

/**
 * Home, with the notice that `routeName` needs administrator rights (FR-ACC-15): the guard
 * and the pages whose admin request is refused (403) send the user there.
 * @param {string} [routeName]
 */
export function deniedLocation(routeName) {
    return { ...homeLocation(), query: { [NOTICE_QUERY]: `${Notice.DENIED}:${routeName ?? ''}` } };
}

/**
 * Where to send a navigation to a protected route: anonymous users to Login
 * (coming back afterwards; a session that has just expired says so), signed-in non-admins
 * home with a notice. A link to the Preferences window (PREFERENCES_QUERY) counts as protected.
 * @param {import('vue-router').RouteLocationNormalized} to
 * @param {{ isLoggedIn: boolean, isAdmin: boolean }} auth
 * @returns {true|import('vue-router').RouteLocationRaw}
 */
export function guard(to, auth) {
    const needsAdmin = to.matched.some(r => r.meta.requiresAdmin);
    const needsAuth = needsAdmin || to.matched.some(r => r.meta.requiresAuth) || Object.hasOwn(to.query ?? {}, PREFERENCES_QUERY);
    if (needsAuth && !auth.isLoggedIn) {
        return loginLocation(to.fullPath, to.query?.[NOTICE_QUERY] === Notice.EXPIRED ? Notice.EXPIRED : undefined);
    }
    if (needsAdmin && !auth.isAdmin) return deniedLocation(typeof to.name === 'string' ? to.name : undefined);
    return true;
}

/**
 * The Login route, returning to `redirect` after sign-in, with a one-shot notice.
 * @param {string} [redirect]  an in-app path (a notice it carries is dropped)
 * @param {string} [notice]  a Notice value
 */
export function loginLocation(redirect, notice) {
    const target = redirect && isAppPath(redirect) ? withoutNotice(redirect) : '';
    /** @type {Record<string, string>} */
    const query = {};
    if (target && !/^\/(login)?(\?|$)/.test(target)) query.redirect = target;
    if (notice) query[NOTICE_QUERY] = notice;
    return Object.keys(query).length ? { name: 'Login', query } : { name: 'Login' };
}

/**
 * `path` without NOTICE_QUERY: a notice is shown once, never carried to the next page.
 * @param {string} path  path, query and hash
 */
export function withoutNotice(path) {
    const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(path);
    if (!match || !match[2]) return path;
    const search = applyQueryUpdates(match[2], { [NOTICE_QUERY]: null });
    return `${match[1]}${search ? `?${search}` : ''}${match[3] ?? ''}`;
}

/** An absolute path inside this app (not `//host/...` or a URL). @param {unknown} path */
export function isAppPath(path) {
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

/**
 * The notice of a NOTICE_QUERY value, or null when it is not one.
 * @param {unknown} value
 * @returns {{ kind: string, route?: string } | null}
 */
export function parseNotice(value) {
    if (typeof value !== 'string') return null;
    if (value === Notice.EXPIRED || value === Notice.SIGNED_OUT) return { kind: value };
    if (value === Notice.DENIED || value.startsWith(`${Notice.DENIED}:`)) {
        return { kind: Notice.DENIED, route: value.slice(Notice.DENIED.length + 1) };
    }
    return null;
}

/**
 * The text of a notice.
 * @param {{ kind: string, route?: string }} notice
 * @param {import('vue-router').Router} [router]  names the page of a `denied` notice
 */
export function noticeText(notice, router) {
    if (notice.kind === Notice.EXPIRED) return EXPIRED_TEXT;
    if (notice.kind === Notice.SIGNED_OUT) return SIGNED_OUT_TEXT;
    const title = notice.route && router?.getRoutes().find(r => r.name === notice.route)?.meta?.title;
    return `You need administrator rights to open ${typeof title === 'string' ? title : 'this page'}.`;
}

/**
 * The one place that handles NOTICE_QUERY (router.afterEach): removes it from the address and
 * shows it once, as a toast; Login shows `expired` on the page itself (LoginPage).
 * @param {import('vue-router').RouteLocationNormalized} to
 * @param {import('vue-router').Router} router
 * @returns {{ kind: string, route?: string } | null}  the notice shown
 */
export function handleNotice(to, router) {
    if (!Object.hasOwn(to.query ?? {}, NOTICE_QUERY)) return null;
    replaceQueryKeys({ [NOTICE_QUERY]: null });
    const notice = parseNotice(to.query[NOTICE_QUERY]);
    if (!notice) return null;
    const onLogin = to.name === 'Login' || to.name === 'LoginHome';
    if (notice.kind === Notice.DENIED) notify.warn(noticeText(notice, router), { summary: 'No access' });
    else if (!(onLogin && notice.kind === Notice.EXPIRED)) {
        notify.info(noticeText(notice, router), { summary: notice.kind === Notice.EXPIRED ? 'Session expired' : 'Signed out' });
    }
    return notice;
}

/**
 * Marks the address the app opens at with the `expired` notice: boot() ended a session the
 * server no longer accepts (or whose token had expired). A page that needs a session sends the
 * user to Login with it (guard); any other page says so in a toast.
 */
export function markSessionExpired() {
    replaceQueryKeys({ [NOTICE_QUERY]: Notice.EXPIRED });
}

/**
 * The boot decision (main.js, once the stored session was checked and refreshed): a session
 * that was stored and is gone now was ended by the app, so say why. An embedded view has no
 * sign-in to offer; no stored session, or one that is still good, says nothing.
 * @param {{ hadSession: boolean, isLoggedIn: boolean, embed: boolean }} boot
 * @returns {boolean}  whether the address was marked
 */
export function markStaleSession({ hadSession, isLoggedIn, embed }) {
    if (!hadSession || isLoggedIn || embed) return false;
    markSessionExpired();
    return true;
}

/**
 * What the app does when the server rejects a request with 401 (registered with
 * `reg.onUnauthorized`): end a session the server no longer accepts, then sign in
 * and come back, told why (`expired`). A visitor without a session stays on the page, which
 * shows the "sign in" state of its primary resource (ResourceState, D-048); a private route
 * sends them to Login through the route guard. Nothing happens on the Login page itself.
 * @param {import('vue-router').Router} router
 * @param {{ isLoggedIn: boolean, logout: () => void }} auth
 */
export function handleUnauthorized(router, auth) {
    const route = router.currentRoute.value;
    if (route.name === 'Login' || route.name === 'LoginHome') return;
    if (!auth.isLoggedIn) return;
    auth.logout();
    // The address as it is now: a map writes its layers without a navigation, so the route's
    // fullPath may be the address the page opened with
    router.push(loginLocation(currentPath(), Notice.EXPIRED)).catch(() => { });
}
