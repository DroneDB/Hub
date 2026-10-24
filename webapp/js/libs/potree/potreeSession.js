/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PotreeSession - owns everything one Potree viewer creates, so closing the viewer frees it
 * (HUB-04: every open/close used to leak the whole scene, about 130 MB and a WebGL context).
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
 *   the whole viewer reachable).
 */
import { ListenerBag } from '@/libs/listenerBag';

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
    }

    /**
     * Creates the viewer with factory() and attaches it. The listeners its constructor adds to
     * window, document and body are the session's: Potree never removes them, and each one keeps
     * the viewer, its scene and its point clouds reachable after the viewer is closed.
     */
    create(factory, containers) {
        nonRetainingReady(this.jquery(), this.win?.document);
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

        this.listeners.dispose();

        for (const node of this.nodes) node.parentNode?.removeChild(node);
        this.nodes = [];

        const viewer = this.viewer;
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
            releaseRenderer(viewer.profileWindow?.renderer);
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

        // What Potree added outside the container since attach()
        const body = this.win?.document?.body;
        if (body && this.bodyBefore) {
            for (const node of Array.from(body.children)) {
                if (this.bodyBefore.has(node) || !node.matches?.(BODY_NODES)) continue;
                if ($) $(node).remove();
                else node.remove();
            }
        }
        if ($ && this.windowHandlersBefore) {
            for (const h of jqueryWindowHandlers($, this.win)) {
                if (!this.windowHandlersBefore.has(h.handler)) $(this.win).off(h.type, h.handler);
            }
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
function nonRetainingReady($, doc) {
    const ready = $?.fn?.ready;
    if (typeof ready !== 'function' || ready.nonRetaining) return;
    const patched = function (fn) {
        if ($.isReady && typeof fn === 'function') {
            setTimeout(() => fn.call(doc, $));
            return this;
        }
        return ready.call(this, fn);
    };
    patched.nonRetaining = true;
    $.fn.ready = patched;
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
 * less memory (navigator.deviceMemory, GB, capped at 8 by browsers) and on phones.
 */
export function pointBudgetFor(deviceMemoryGb, mobile) {
    const memory = Number.isFinite(deviceMemoryGb) && deviceMemoryGb > 0 ? deviceMemoryGb : 8;
    let budget = memory >= 8 ? 10_000_000 : Math.max(1_000_000, memory * 1_000_000);
    if (mobile) budget = Math.min(budget, 3_000_000);
    return budget;
}
