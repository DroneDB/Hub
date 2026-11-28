// @ts-check
/**
 * The page title a navigation should set. Views refine the title after they load (the file name
 * of a viewer, the dataset name), so a navigation that stays on the same page (only its query or
 * hash changes) must keep the title the view set instead of falling back to the route's.
 *
 * @param {import('vue-router').RouteLocationNormalized} to
 * @param {import('vue-router').RouteLocationNormalized} [from]
 * @returns {string | null}  the route's title, or null to leave the current title as it is
 */
export function navigationTitle(to, from) {
    const firstNavigation = !from || !from.matched || !from.matched.length;
    if (!firstNavigation && to.path === from.path) return null;
    const title = to.meta && to.meta.title;
    return typeof title === 'string' && title ? title : null;
}
