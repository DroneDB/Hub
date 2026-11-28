/**
 * PotreeSession - owns everything one Potree viewer creates, so closing the viewer frees it
 * (every open and close used to leak the whole scene, about 130 MB and a WebGL context).
 *
 * Potree 1.8 lives in globals (window.viewer, its render loop on the renderer, jQuery UI in
 * the page), so nothing is released by unmounting the component. The session:
 * - registers every listener through track() and removes them all on dispose();
 * - adopts DOM nodes created outside the viewer's container (tooltips on document.body);
 * - stops the render loop, disposes the point clouds and the renderer, loses the WebGL
 *   context, empties the container through jQuery (its data and handlers too) and drops
 *   window.viewer;
 * - creates the viewer (create()) and owns the listeners its constructor adds to window,
 *   document and body (device orientation controls, drag and drop), which reference the viewer;
 * - makes jQuery's $(fn) stop keeping fn once the page is ready (jQuery 3 adds every ready
 *   callback to a list it never empties, so each viewer that called $(fn) stayed reachable);
 * - destroys the sidebar's colour pickers (the spectrum plugin keeps every instance in a
 *   module-level array);
 * - removes what Potree puts outside the container after the viewer is created: the profile
 *   window (with its own WebGL renderer) and the colour pickers it appends to document.body,
 *   and the jQuery handlers it binds on window (the profile window's resize handler keeps
 *   the whole viewer reachable);
 * - when the viewer is closed before its GUI has finished loading (sidebar.html, then profile.html), removes what the
 *   GUI adds after that moment too, once it has added it (viewer.onGUILoaded): the profile window, its renderer and
 *   its resize handler would stay for the life of the page;
 * - gives jQuery's $(fn) back its own implementation when the viewer closes (the replacement above is the session's),
 *   or, for a viewer closed while its GUI still loads, once that GUI has made its last $(fn) calls: those go through
 *   the replacement too, or jQuery would keep them, and the closed viewer with them, for the life of the page;
 * - tells once, through `onReadRefused`, that the server refused a read of the COPC for good (a 401 or a 404), which
 *   Potree then never asks for again;
 * - reads the COPC files of its viewer through the Hub's range transport (Potree.createCopcGetter,
 *   libs/http/rangeRequests) and stops those reads, and their retries, when it is disposed.
 */
import { ListenerBag } from '@/libs/listenerBag';
import { createRangeGetter } from '@/libs/http/rangeRequests';
import { DEFAULT_DEVICE_MEMORY_GB, reportsDeviceMemory } from '@/libs/responsive';

// Nodes Potree 1.8 appends to document.body: the profile window (profile.html) and the
// spectrum colour pickers of the sidebar
const BODY_NODES = '#profile_window, .sp-container';

export class PotreeSession {
    /**
     * @param {object} [env] injectable globals (tests)
     */
    constructor(env = {}) {
        this.win = env.window ?? globalThis.window;
        this.listeners = new ListenerBag();
        this.nodes = [];
        this.viewer = null;
        this.containers = [];
        this.disposed = false;
        this.reads = new AbortController();
        // Called once with the error when the server refused a read of the COPC for good (4xx: the transport does not retry)
        this.onReadRefused = env.onReadRefused ?? null;
        this.readRefusedTold = false;
        this.createCopcGetter = url => this.telling(createRangeGetter(url, { signal: this.reads.signal }));
    }

    /** The getter of the transport, telling `onReadRefused` of the first read the server refused for good. */
    telling(get) {
        return async (begin, end) => {
            try {
                return await get(begin, end);
            } catch (error) {
                this.tellRefused(error);
                throw error;
            }
        };
    }

    tellRefused(error) {
        const refused = error?.retryable === false && error.status >= 400 && error.status < 500;
        if (!refused || this.readRefusedTold || this.disposed) return;
        this.readRefusedTold = true;
        this.onReadRefused?.(error);
    }

    /**
     * Creates the viewer with factory() and attaches it. The listeners its constructor adds to
     * window, document and body are the session's: Potree never removes them, and each one keeps
     * the viewer, its scene and its point clouds reachable after the viewer is closed.
     */
    create(factory, containers) {
        this.restoreReady = nonRetainingReady(this.jquery(), this.win?.document);
        const doc = this.win?.document;
        const restores = [this.win, doc, doc?.body]
            .filter(t => typeof t?.addEventListener === 'function')
            .map(t => intercept(t, 'addEventListener', add => (type, handler, options) => {
                add.call(t, type, handler, options);
                this.listeners.adopt(t, type, handler, options);
            }));
        let viewer;
        try {
            viewer = factory();
        } finally {
            restores.forEach(restore => restore());
        }
        return this.attach(viewer, containers);
    }

    /**
     * The viewer and the elements it fills (render area, sidebar). Call it right after
     * creating the viewer: what Potree adds to the page afterwards is the session's to remove.
     * @param {object} viewer
     * @param {Element|Element[]} containers emptied on dispose()
     */
    attach(viewer, containers) {
        this.viewer = viewer;
        this.containers = [].concat(containers ?? []).filter(Boolean);
        this.bodyBefore = new Set(this.win?.document?.body?.children ?? []);
        this.windowHandlersBefore = new Set(jqueryWindowHandlers(this.jquery(), this.win).map(h => h.handler));
        this.trackWorkers(this.win?.Potree?.workerPool);
        if (this.win?.Potree) this.win.Potree.createCopcGetter = this.createCopcGetter;
        return viewer;
    }

    // Every decoder worker the pool hands out while this viewer lives: a worker still busy when
    // the viewer closes keeps the viewer through its onmessage handler (it is not in the pool
    // then), so dispose() ends those too
    trackWorkers(pool) {
        if (typeof pool?.getWorker !== 'function' || this.workers) return;
        const original = originalPoolMethods(pool);
        this.workers = new Set();
        this.pool = pool;
        pool.getWorker = url => {
            const worker = original.getWorker.call(pool, url);
            this.workers.add(worker);
            return worker;
        };
        pool.returnWorker = original.returnWorker;
    }

    jquery() {
        const $ = this.win?.$ ?? this.win?.jQuery;
        return typeof $ === 'function' ? $ : null;
    }

    /**
     * addEventListener that dispose() undoes. Works for DOM targets and Potree/three.js
     * EventDispatchers alike (both have addEventListener/removeEventListener).
     */
    track(target, type, handler, options) {
        if (!target || this.disposed) return handler;
        this.listeners.add(target, type, handler, options);
        return handler;
    }

    /** removeEventListener of a tracked listener. */
    untrack(target, type, handler) {
        this.listeners.remove(target, type, handler);
    }

    /** A node added outside the viewer's container: removed on dispose(). */
    adopt(node) {
        if (node) this.nodes.push(node);
        return node;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;

        this.reads.abort();
        if (this.win?.Potree?.createCopcGetter === this.createCopcGetter) this.win.Potree.createCopcGetter = null;
        this.listeners.dispose();

        for (const node of this.nodes) node.parentNode?.removeChild(node);
        this.nodes = [];

        const viewer = this.viewer;
        const bodyBefore = this.bodyBefore;
        const windowHandlersBefore = this.windowHandlersBefore;
        if (viewer) {
            const renderer = viewer.renderer;
            // Potree 1.8 renders through renderer.setAnimationLoop(viewer.loop)
            renderer?.setAnimationLoop?.(null);

            const pointclouds = viewer.scene?.pointclouds ?? [];
            for (const pc of pointclouds) {
                try {
                    pc.dispose?.();
                } catch (e) {
                    console.warn('Cannot dispose a point cloud', e);
                }
                // Potree keeps a global (not weak) map keyed by point cloud
                this.win?.Potree?._pointcloudTransformVersion?.delete?.(pc);
            }
            releaseCachedNodes(this.win?.Potree?.lru, new Set(pointclouds.map(pc => pc.pcoGeometry).filter(Boolean)));

            releaseRenderer(renderer);
            releaseScreenPass(this.win?.Potree?.Utils?.screenPass);
            endWorkers(this.win?.Potree, this.workers);
            closeWorkerPool(this.pool);
            this.workers = null;
            this.pool = null;
        }

        // jQuery keeps data and handlers per element: remove the sidebar through it
        const $ = this.jquery();
        for (const container of this.containers) {
            // spectrum's destroy also drops the instance from its global list
            if (typeof $?.fn?.spectrum === 'function') $(container).find('*').spectrum('destroy');
            if ($) $(container).empty();
            else container.innerHTML = '';
        }

        // What Potree added outside the container since attach(). A viewer closed while its GUI still loads gets the
        // profile window, the colour pickers and the resize handler after this moment: the same clean-up runs again then
        const leftovers = () => releaseGuiLeftovers(this.win, $, viewer, bodyBefore, windowHandlersBefore);
        leftovers();
        // $(fn) is jQuery's own again once this viewer makes no more $(fn) calls (the replacement of create() was its)
        const restoreReady = this.restoreReady ?? (() => {});
        this.restoreReady = null;
        if (viewer && !viewer.guiLoaded && typeof viewer.onGUILoaded === 'function') {
            // The GUI still loads: its next $(fn) calls (the sidebar, then the one that marks the GUI loaded and runs
            // these tasks) must not reach jQuery's own, which keeps them. Its tasks run inside the last of them
            viewer.onGUILoaded(() => {
                leftovers();
                restoreReady();
            });
        } else {
            restoreReady();
        }
        this.bodyBefore = null;
        this.windowHandlersBefore = null;

        if (this.win && this.win.viewer === viewer) delete this.win.viewer;
        this.viewer = null;
        this.containers = [];
    }
}

// jQuery 3: $(fn) is readyList.then(fn), and then() also registers on the progress list of
// readyList, which is never notified and never emptied: the closures there share their scope
// with fn, so every fn (and what it references: Potree's viewer) stays reachable for the life
// of the page. Once the document is ready, $(fn) only has to call fn soon, which needs no list.
// The replacement is shared by the viewers that need it at the same time (a closed one whose GUI still loads, the
// open one): the returned function says that one of them no longer does, and the last one puts jQuery's own back.
function nonRetainingReady($, doc) {
    const current = $?.fn?.ready;
    if (typeof current !== 'function') return () => {};
    let patched = current;
    if (!current.nonRetaining) {
        const ready = current;
        patched = function (fn) {
            if ($.isReady && typeof fn === 'function') {
                setTimeout(() => fn.call(doc, $));
                return this;
            }
            return ready.call(this, fn);
        };
        patched.nonRetaining = true;
        patched.original = ready;
        patched.holders = 0;
        $.fn.ready = patched;
    }
    patched.holders++;
    let released = false;
    // Put back with the last viewer that needs it: left in place, the replacement (and what it was made in) outlives
    // every viewer
    return () => {
        if (released) return;
        released = true;
        if (--patched.holders > 0) return;
        if ($.fn.ready === patched) $.fn.ready = patched.original;
    };
}

// What Potree puts outside the container after the viewer is created: the profile window (profile.html) with its own
// WebGL renderer, the colour pickers of the sidebar, and the handlers bound with jQuery on window (the profile window's
// resize handler keeps the whole viewer reachable). Safe to run more than once.
function releaseGuiLeftovers(win, $, viewer, bodyBefore, windowHandlersBefore) {
    releaseRenderer(viewer?.profileWindow?.renderer);
    const body = win?.document?.body;
    if (body && bodyBefore) {
        for (const node of Array.from(body.children)) {
            if (bodyBefore.has(node) || !node.matches?.(BODY_NODES)) continue;
            if ($) $(node).remove();
            else node.remove();
        }
    }
    if ($ && windowHandlersBefore) {
        for (const h of jqueryWindowHandlers($, win)) {
            if (!windowHandlersBefore.has(h.handler)) $(win).off(h.type, h.handler);
        }
    }
}

// Potree.Utils.screenPass is one quad for every viewer of the page: it keeps the material of
// the last viewer that rendered through it (its EDL material), and three.js keeps, on the
// quad's geometry, a dispose listener per renderer that drew it. Disposing the geometry lets
// every renderer drop its buffers and listener; the next viewer uploads the quad again.
function releaseScreenPass(screenPass) {
    const quad = screenPass?.screenQuad;
    if (!quad) return;
    quad.geometry?.dispose?.();
    quad.material = null; // render() sets the material of each pass
}

// Potree.workerPool keeps its decoder workers for the next viewer, each with the onmessage
// handler of its last job (which references that job's node, point cloud and viewer) and its
// own WebAssembly heap. The idle ones and the ones still busy for this viewer are ended; the
// next viewer starts new ones.
function endWorkers(potree, handedOut) {
    const pool = potree?.workerPool;
    const idle = new Set();
    for (const list of Object.values(pool?.workers ?? {})) {
        for (const worker of list.splice(0)) {
            idle.add(worker);
            endWorker(worker);
        }
    }
    // A busy worker is a node load that will never report back: Potree's global count of loads
    // in flight would stay up and throttle the next viewer
    let busy = 0;
    for (const worker of handedOut ?? []) {
        if (idle.has(worker)) continue;
        busy++;
        endWorker(worker);
    }
    if (busy > 0 && typeof potree.numNodesLoading === 'number')
        potree.numNodesLoading = Math.max(0, potree.numNodesLoading - busy);
}

const POOL_METHODS = Symbol('potreeSession.pool');

// The pool's own getWorker/returnWorker, kept once for every session
function originalPoolMethods(pool) {
    pool[POOL_METHODS] ??= { getWorker: pool.getWorker, returnWorker: pool.returnWorker };
    return pool[POOL_METHODS];
}

// Until the next viewer: node loads of the closed viewer that were still fetching ask the pool
// for a worker after dispose(). Such a worker is ended when its job returns it, instead of
// waiting in the pool with that job's onmessage (and the closed viewer) attached
function closeWorkerPool(pool) {
    if (!pool) return;
    const original = originalPoolMethods(pool);
    const late = new WeakSet();
    pool.getWorker = url => {
        const worker = original.getWorker.call(pool, url);
        late.add(worker);
        return worker;
    };
    pool.returnWorker = (url, worker) => {
        if (late.has(worker)) endWorker(worker);
        else original.returnWorker.call(pool, url, worker);
    };
}

function endWorker(worker) {
    worker.onmessage = null;
    worker.terminate?.();
}

// Replaces obj[name] with wrap(original) until the returned function restores it (an own
// property is put back, an inherited one is uncovered again)
function intercept(obj, name, wrap) {
    const own = Object.prototype.hasOwnProperty.call(obj, name) ? obj[name] : null;
    obj[name] = wrap(obj[name]);
    return () => {
        if (own) obj[name] = own;
        else delete obj[name];
    };
}

// Potree's global LRU of loaded nodes outlives the viewer: the nodes of its point clouds go,
// with their point buffers
function releaseCachedNodes(lru, geometries) {
    if (!lru?.items || geometries.size === 0) return;
    for (const item of Object.values(lru.items)) {
        const node = item?.node;
        const geometry = node?.owner ?? node?.pcoGeometry ?? node?.octreeGeometry;
        if (!geometries.has(geometry)) continue;
        lru.remove(node);
        try {
            node.dispose?.();
        } catch (e) {
            console.warn('Cannot dispose a point cloud node', e);
        }
    }
}

function releaseRenderer(renderer) {
    if (!renderer) return;
    // Potree logs the context-lost event (console.log(e)) and the console keeps what it logged:
    // the event, its canvas and every listener on that canvas, the viewer with them. The
    // context is lost without telling anyone (capture listeners run first on the target)
    // lifetime: element (one-shot listener on a canvas that is dropped right after)
    renderer.domElement?.addEventListener?.('webglcontextlost', e => e.stopImmediatePropagation(), { capture: true, once: true });
    renderer.dispose?.();
    renderer.forceContextLoss?.();
    renderer.domElement?.parentNode?.removeChild(renderer.domElement);
}

// The handlers bound with jQuery on window ($(window).resize(...)), from jQuery's own registry
function jqueryWindowHandlers($, win) {
    const events = $ && win ? $._data?.(win, 'events') : null;
    return Object.entries(events ?? {}).flatMap(([type, list]) => list.map(h => ({ type, handler: h.handler })));
}

/**
 * Points rendered at once for this device: 10 M where memory allows, fewer on devices with
 * less memory (deviceMemoryGb() of libs/responsive.js, GB, capped at 8 by browsers; a value that
 * is not usable is the default of that helper) and on phones. A desktop whose browser does not
 * report its memory (`reported` false: desktop Firefox and Safari) keeps the 10 M it always had;
 * the 4 GB default of deviceMemoryGb() sizes the other budgets and a phone's.
 * @param {number} memoryGb deviceMemoryGb()
 * @param {boolean} mobile isMobile()
 * @param {boolean} [reported] whether the browser gave memoryGb (reportsDeviceMemory())
 */
export function pointBudgetFor(memoryGb, mobile, reported = reportsDeviceMemory()) {
    const known = reported && Number.isFinite(memoryGb) && memoryGb > 0;
    const memory = known ? memoryGb : mobile ? DEFAULT_DEVICE_MEMORY_GB : 8;
    let budget = memory >= 8 ? 10_000_000 : Math.max(1_000_000, memory * 1_000_000);
    if (mobile) budget = Math.min(budget, 3_000_000);
    return budget;
}
