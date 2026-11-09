import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

const guards = vi.hoisted(() => ({ leave: [], update: [] }));
vi.mock('vue-router', async importOriginal => {
    const actual = await importOriginal();
    const { getCurrentInstance } = await import('vue');
    return {
        ...actual,
        onBeforeRouteLeave: fn => (getCurrentInstance() ? actual.onBeforeRouteLeave(fn) : guards.leave.push(fn)),
        onBeforeRouteUpdate: fn => (getCurrentInstance() ? actual.onBeforeRouteUpdate(fn) : guards.update.push(fn)),
        useRouter: () => (getCurrentInstance() ? actual.useRouter() : undefined)
    };
});
vi.mock('@/components/ConfirmDialog.vue', () => ({ default: { name: 'ConfirmDialog' } }));

const { useLeaveGuard, samePath } = await import('./useLeaveGuard');

const from = { path: '/r/o/d/view/x/markdown', fullPath: '/r/o/d/view/x/markdown' };
const away = { path: '/r/o/d', fullPath: '/r/o/d' };

/** A dialog registry whose questions the test answers. */
function fakeDialogs() {
    const questions = [];
    return {
        questions,
        open: vi.fn((component, props) => new Promise(resolve => { questions.push({ component, props, answer: resolve }); }))
    };
}

/** A router whose route a test (or a save) moves. */
const fakeRouter = (fullPath = from.fullPath) => ({ currentRoute: ref({ fullPath }) });

// Every guard of a test, stopped after it (a test may make two)
const scopes = [];
let scope;
function guard(options) {
    guards.leave.length = 0;
    guards.update.length = 0;
    const dialogs = options.dialogs ?? fakeDialogs();
    const router = options.router ?? fakeRouter();
    let api;
    scope = effectScope();
    scopes.push(scope);
    scope.run(() => { api = useLeaveGuard({ dialogs, router, ...options }); });
    return { api, dialogs, router, leave: guards.leave[0], update: guards.update[0] };
}
const unload = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e;
};

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
    scopes.splice(0).forEach(s => s.stop());
    vi.restoreAllMocks();
});

describe('useLeaveGuard', () => {
    it('needs the dialogs of the page', () => {
        expect(() => useLeaveGuard({ isDirty: () => true })).toThrow(/dialogs/);
    });

    it('guards both a leave of the route and a change of it', () => {
        const { leave, update } = guard({ isDirty: () => false });
        expect(leave).toBeTypeOf('function');
        expect(update).toBe(leave);
    });

    it('lets a clean page go without asking', async () => {
        const { leave, dialogs } = guard({ isDirty: () => false });
        expect(await leave(away, from)).toBe(true);
        expect(dialogs.open).not.toHaveBeenCalled();
    });

    it('does not ask for a change of the query or hash on the same path (Preferences)', async () => {
        const { update, dialogs } = guard({ isDirty: () => true });
        expect(await update({ ...from, query: { preferences: 'general' } }, from)).toBe(true);
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(samePath({ path: '/a' }, { path: '/a' })).toBe(true);
    });

    it('lets a page say which route changes are its own', async () => {
        const ignore = vi.fn(to => to.path === '/mine');
        const { leave, dialogs } = guard({ isDirty: () => true, ignore });
        expect(await leave({ path: '/mine' }, from)).toBe(true);
        expect(dialogs.open).not.toHaveBeenCalled();
        void leave(away, from);
        expect(dialogs.open).toHaveBeenCalledTimes(1);
    });

    describe('without save', () => {
        it('offers Discard and Cancel: Discard leaves', async () => {
            const { leave, dialogs } = guard({ isDirty: () => true });
            const answer = leave(away, from);
            expect(dialogs.questions[0].props).toMatchObject({ title: 'Unsaved changes', confirmText: 'Discard', confirmButtonClass: 'danger', cancelText: 'Cancel' });
            expect(dialogs.questions[0].props.secondaryText).toBeUndefined();
            dialogs.questions[0].answer('confirm');
            expect(await answer).toBe(true);
        });

        it('Cancel (or closing the question) stays', async () => {
            const { leave, dialogs } = guard({ isDirty: () => true });
            const answer = leave(away, from);
            dialogs.questions[0].answer('cancel');
            expect(await answer).toBe(false);
            const again = leave(away, from);
            dialogs.questions[1].answer(undefined);
            expect(await again).toBe(false);
        });
    });

    describe('with save', () => {
        it('offers Save, Discard and Cancel, with its own title and message', async () => {
            const { leave, dialogs } = guard({ isDirty: () => true, save: vi.fn(), title: () => 'Save changes to A?', message: 'Text' });
            void leave(away, from);
            expect(dialogs.questions[0].props).toMatchObject({
                title: 'Save changes to A?', message: 'Text', confirmText: 'Save', secondaryText: 'Discard', secondaryButtonClass: 'danger', cancelText: 'Cancel'
            });
        });

        it('Discard leaves without saving', async () => {
            const save = vi.fn();
            const { leave, dialogs } = guard({ isDirty: () => true, save });
            const answer = leave(away, from);
            dialogs.questions[0].answer('secondary');
            expect(await answer).toBe(true);
            expect(save).not.toHaveBeenCalled();
        });

        it('Save saves, then leaves once nothing is dirty', async () => {
            const dirty = ref(true);
            const save = vi.fn(async () => { dirty.value = false; });
            const { leave, dialogs } = guard({ isDirty: dirty, save });
            const answer = leave(away, from);
            dialogs.questions[0].answer('confirm');
            expect(await answer).toBe(true);
            expect(save).toHaveBeenCalledTimes(1);
        });

        it('stays when the save did not save (still dirty, or it failed)', async () => {
            const { leave, dialogs } = guard({ isDirty: () => true, save: vi.fn(async () => {}) });
            const answer = leave(away, from);
            dialogs.questions[0].answer('confirm');
            expect(await answer).toBe(false);

            const failing = guard({ isDirty: () => true, save: vi.fn(async () => { throw new Error('offline'); }) });
            const second = failing.leave(away, from);
            failing.dialogs.questions[0].answer('confirm');
            expect(await second).toBe(false);
        });

        it('stays when the save moved the page itself, and lets that move go', async () => {
            const dirty = ref(true);
            let guarded;
            const router = fakeRouter();
            const save = vi.fn(async () => {
                // A save that creates a view moves the page to its route, through the guard
                guarded = await leave({ path: '/r/o/d/views/v1' }, from);
                router.currentRoute.value = { fullPath: '/r/o/d/views/v1' };
                dirty.value = false;
            });
            const { leave, dialogs } = guard({ isDirty: dirty, save, router });
            const answer = leave(away, from);
            dialogs.questions[0].answer('confirm');
            expect(await answer).toBe(false);
            expect(guarded).toBe(true);
            expect(dialogs.open).toHaveBeenCalledTimes(1);
        });
    });

    it('asks once for navigations that come while the question is open; they get its answer', async () => {
        const { leave, update, dialogs } = guard({ isDirty: () => true });
        const first = leave(away, from);
        const second = update({ path: '/r/o/d/view/y/markdown' }, from);
        expect(dialogs.open).toHaveBeenCalledTimes(1);
        dialogs.questions[0].answer('cancel');
        expect(await first).toBe(false);
        expect(await second).toBe(false);
        // A later navigation asks again
        void leave(away, from);
        expect(dialogs.open).toHaveBeenCalledTimes(2);
    });

    it('confirmLeave asks the same question, and is true at once on a clean page', async () => {
        const dirty = ref(false);
        const { api, dialogs } = guard({ isDirty: dirty });
        expect(await api.confirmLeave()).toBe(true);
        dirty.value = true;
        const answer = api.confirmLeave();
        dialogs.questions[0].answer('confirm');
        expect(await answer).toBe(true);
    });

    describe('page unload', () => {
        it('asks only while the page is dirty, and stops with the page', async () => {
            const dirty = ref(false);
            const add = vi.spyOn(window, 'addEventListener');
            guard({ isDirty: dirty });
            await nextTick();
            expect(add).not.toHaveBeenCalledWith('beforeunload', expect.anything(), undefined);
            expect(unload().defaultPrevented).toBe(false);

            dirty.value = true;
            await nextTick();
            expect(unload().defaultPrevented).toBe(true);

            dirty.value = false;
            await nextTick();
            expect(unload().defaultPrevented).toBe(false);

            dirty.value = true;
            await nextTick();
            scope.stop();
            expect(unload().defaultPrevented).toBe(false);
        });
    });

    describe('with a real router', () => {
        // As in the app: a header and a content view (keyed by the dataset), the route component
        // (MapViewer) shared by two records, the guard in the page inside it (MapViewerPage)
        async function app() {
            const { createRouter, createMemoryHistory, RouterView } = await import('vue-router');
            const { mount, flushPromises } = await import('@vue/test-utils');
            const { defineComponent, h } = await import('vue');
            const dirty = ref(false);
            const dialogs = fakeDialogs();
            const Page = defineComponent({
                setup() {
                    useLeaveGuard({ isDirty: dirty, dialogs, ignore: (to, from) => to.path === from.path || to.meta.own === true });
                    return () => h('div', 'page');
                }
            });
            const Viewer = defineComponent({ render: () => h(Page) });
            const Header = defineComponent({ render: () => h('header') });
            const router = createRouter({
                history: createMemoryHistory(),
                routes: [
                    { path: '/r/o/d/view/f/map', components: { content: Viewer, header: Header } },
                    { path: '/r/o/d/views/v1', components: { content: Viewer, header: Header }, meta: { own: true } },
                    { path: '/r/o/d', components: { content: { render: () => h('div', 'dataset') }, header: Header } }
                ]
            });
            await router.push('/r/o/d/view/f/map');
            const App = defineComponent({
                render: () => [h(RouterView, { name: 'header' }), h(RouterView, { name: 'content', key: 'o/d' })]
            });
            const wrapper = mount(App, { global: { plugins: [router] } });
            await flushPromises();
            return { router, dirty, dialogs, wrapper, flushPromises };
        }

        it('still asks after the page moved to another record of its component (a save that creates a view)', async () => {
            const { router, dirty, dialogs, wrapper, flushPromises } = await app();
            // moveTo: router.replace to the saved view's record, the same page kept
            await router.replace('/r/o/d/views/v1');
            await flushPromises();
            expect(router.currentRoute.value.path).toBe('/r/o/d/views/v1');
            expect(wrapper.text()).toContain('page');
            dirty.value = true;

            const leaving = router.push('/r/o/d');
            await flushPromises();
            expect(dialogs.open).toHaveBeenCalledTimes(1);
            dialogs.questions[0].answer('cancel');
            await leaving;
            expect(router.currentRoute.value.path).toBe('/r/o/d/views/v1');

            // Discard leaves
            const again = router.push('/r/o/d');
            await flushPromises();
            dialogs.questions[1].answer('confirm');
            await again;
            expect(router.currentRoute.value.path).toBe('/r/o/d');
            wrapper.unmount();
        });

        it('asks nothing once the page is gone', async () => {
            const { router, dirty, dialogs, wrapper, flushPromises } = await app();
            dirty.value = true;
            const leaving = router.push('/r/o/d');
            await flushPromises();
            dialogs.questions[0].answer('confirm');
            await leaving;
            await router.push('/r/o/d?tab=files');
            await router.push('/r/o/d/view/f/map').then(() => { dirty.value = false; });
            await router.push('/r/o/d');
            await flushPromises();
            expect(dialogs.open).toHaveBeenCalledTimes(1);
            expect(router.currentRoute.value.path).toBe('/r/o/d');
            wrapper.unmount();
        });
    });
});
