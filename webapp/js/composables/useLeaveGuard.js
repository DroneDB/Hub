// @ts-check
/**
 * useLeaveGuard - a page with unsaved edits asks before a route change or a page unload drops
 * them. One guard per route: a page gathers the dirty state of its children into its one guard.
 *
 *   const dialogs = useDialogs();                      // template: <DialogHost :dialogs="dialogs" />
 *   useLeaveGuard({ isDirty: () => text.value !== original.value, save, dialogs });
 *
 * - A route change asks with a ConfirmDialog: Save (the default button), Discard and Cancel
 *   when `save` is given, Discard and Cancel otherwise. Cancel keeps the page and the edits.
 *   Both kinds of route change ask: leaving the route record, and a change of the route that
 *   keeps the component (two records with one component, other params).
 * - A route change that keeps the page is not a leave: by default one with the same path (a query
 *   key such as ?preferences opens a window); `ignore(to, from)` replaces that rule.
 * - The question shows once: a navigation that comes while it is open gets the same answer.
 * - After Save the page is left only when nothing is dirty any more and the save did not move
 *   the page itself (a save that creates a view moves it to the view's route); otherwise it stays.
 *   A navigation started during the save is the save's own and goes ahead.
 * - A page unload (reload, closing the tab, another address) shows the browser's own question,
 *   while the page is dirty only: the listener is there only then, so a download by address
 *   on a clean page asks nothing.
 */
import { getCurrentInstance, onMounted, toValue, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useListenerBag } from '@/composables/useEventListener';

/** @typedef {{ path: string, fullPath?: string, params: Record<string, any>, query?: Record<string, any> }} GuardRoute */
/** @typedef {string | (() => string)} Text */

/**
 * The default `ignore`: a route change that keeps the path (only the query or the hash change).
 * @param {GuardRoute} to @param {GuardRoute} from
 */
export const samePath = (to, from) => to.path === from.path;

/**
 * @param {object} options
 * @param {(() => boolean) | import('vue').Ref<boolean>} options.isDirty  whether the page holds unsaved edits (reactive)
 * @param {{ open: (component: any, props: any) => Promise<any> }} options.dialogs  the page's useDialogs(), rendered by a DialogHost
 * @param {() => Promise<unknown> | unknown} [options.save]  saves the edits; the guard checks isDirty afterwards
 * @param {(to: GuardRoute, from: GuardRoute) => boolean} [options.ignore]  a route change that is not a leave (default: samePath)
 * @param {Text} [options.title]  the question's title (text)
 * @param {Text} [options.message]  the question (HTML, sanitised by ConfirmDialog: put no user text in it)
 * @param {{ currentRoute?: { value: { fullPath: string } } }} [options.router]  the router (default: useRouter())
 */
export function useLeaveGuard({ isDirty, dialogs, save, ignore = samePath, title = 'Unsaved changes', message, router }) {
    if (!dialogs) throw new Error('useLeaveGuard needs the dialogs of the page (useDialogs) to ask');
    const nav = router ?? useRouter();
    const dirty = () => !!toValue(isDirty);
    // Where the page is: the router's route, or the address without a router
    const where = () => nav?.currentRoute?.value?.fullPath ?? window.location.href;

    /** The open question, which a navigation during it shares. @type {Promise<boolean>|null} */
    let asking = null;
    let saving = false;

    async function decide() {
        const choice = await dialogs.open(ConfirmDialog, {
            title: toValue(title),
            message: toValue(message) ?? (save
                ? 'You have unsaved changes. Save them before you leave?'
                : 'You have unsaved changes. Leave and discard them?'),
            ...(save
                ? { confirmText: 'Save', confirmButtonClass: 'primary', secondaryText: 'Discard', secondaryButtonClass: 'danger' }
                : { confirmText: 'Discard', confirmButtonClass: 'danger' }),
            cancelText: 'Cancel'
        });
        if (!save) return choice === 'confirm';
        if (choice === 'secondary') return true;
        if (choice !== 'confirm') return false;
        const before = where();
        saving = true;
        try {
            await save();
        } catch (e) {
            console.error('Save before leaving failed:', e);
            return false;
        } finally {
            saving = false;
        }
        return !dirty() && where() === before;
    }

    /**
     * Asks whether the page may drop its edits; true at once when there are none.
     * @returns {Promise<boolean>}
     */
    function confirmLeave() {
        if (!dirty()) return Promise.resolve(true);
        if (!asking) asking = decide().finally(() => { asking = null; });
        return asking;
    }

    /** @param {GuardRoute} to @param {GuardRoute} from */
    function guard(to, from) {
        if (saving || !dirty() || ignore(to, from)) return true;
        return confirmLeave();
    }

    onBeforeRouteLeave(guard);
    onBeforeRouteUpdate(guard);

    /** @param {BeforeUnloadEvent} e */
    function onBeforeUnload(e) {
        if (!dirty()) return;
        e.preventDefault();
        // Older browsers show the question only when returnValue is set
        e.returnValue = '';
    }

    const listeners = useListenerBag();
    /** @type {(() => void) | null} */
    let detach = null;
    // From the mount (an Options-API page has its data only after setup), after each render (a
    // page that reads its children's state through template refs sees them)
    const follow = () => watch(dirty, now => {
        if (now && !detach) {
            detach = listeners.add(window, 'beforeunload', onBeforeUnload);
        } else if (!now && detach) {
            detach();
            detach = null;
        }
    }, { immediate: true, flush: 'post' });
    if (getCurrentInstance()) onMounted(follow);
    else follow();

    return { confirmLeave };
}
