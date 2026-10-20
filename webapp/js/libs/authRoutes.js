// @ts-check
/** Route decisions that depend on the session (HQ-04); shared by the router, Login and the 401 handler. */

/**
 * Where to send a navigation to a protected route (HQ-04): anonymous users to Login
 * (coming back afterwards), signed-in non-admins to their organisations.
 * @param {import('vue-router').RouteLocationNormalized} to
 * @param {{ isLoggedIn: boolean, isAdmin: boolean }} auth
 * @returns {true|import('vue-router').RouteLocationRaw}
 */
export function guard(to, auth) {
    const needsAdmin = to.matched.some(r => r.meta.requiresAdmin);
    const needsAuth = needsAdmin || to.matched.some(r => r.meta.requiresAuth);
    if (needsAuth && !auth.isLoggedIn) return loginLocation(to.fullPath);
    if (needsAdmin && !auth.isAdmin) return { name: 'Organizations' };
    return true;
}

/**
 * The Login route, returning to `redirect` after sign-in.
 * @param {string} [redirect]  an in-app path
 */
export function loginLocation(redirect) {
    return redirect && isAppPath(redirect) && !/^\/(login)?(\?|$)/.test(redirect)
        ? { name: 'Login', query: { redirect } }
        : { name: 'Login' };
}

/** An absolute path inside this app (not `//host/...` or a URL). @param {unknown} path */
export function isAppPath(path) {
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

/**
 * What the app does when the server rejects a request with 401 (registered with
 * `reg.onUnauthorized`): end a session the server no longer accepts, then sign in
 * and come back. Nothing happens on the Login page itself.
 * @param {import('vue-router').Router} router
 * @param {{ isLoggedIn: boolean, logout: () => void }} auth
 */
export function handleUnauthorized(router, auth) {
    const route = router.currentRoute.value;
    if (route.name === 'Login' || route.name === 'LoginHome') return;
    if (auth.isLoggedIn) auth.logout();
    router.push(loginLocation(route.fullPath)).catch(() => { });
}
