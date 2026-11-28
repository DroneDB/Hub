/**
 * Unit tests for libs/potree/potreeSession.js
 * Run with: npx vitest run webapp/js/libs/potree/potreeSession.spec.js
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PotreeSession, pointBudgetFor } from './potreeSession';
import { deviceMemoryGb } from '@/libs/responsive';

// The jQuery that PotreeViewer.vue loads (public/potree), bound to the test window
function vendoredJQuery() {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../public/potree/libs/jquery/jquery-3.1.1.min.js'), 'utf8');
    const module = { exports: {} };
    new Function('module', 'window', src)(module, window);
    return module.exports;
}

function fakeTarget() {
    const handlers = new Set();
    return {
        added: 0,
        removed: 0,
        addEventListener(type, h) { this.added++; handlers.add(type + ':' + h.name); },
        removeEventListener(type, h) { this.removed++; handlers.delete(type + ':' + h.name); },
        get live() { return handlers.size; }
    };
}

function fakeViewer() {
    const canvas = { parentNode: { removeChild: vi.fn() } };
    return {
        renderer: { setAnimationLoop: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(), domElement: canvas },
        scene: { pointclouds: [{ dispose: vi.fn() }, { dispose: vi.fn() }] }
    };
}

describe('PotreeSession', () => {
    it('removes every tracked listener on dispose', () => {
        const session = new PotreeSession({ window: {} });
        const doc = fakeTarget();
        const scene = fakeTarget();
        session.track(doc, 'keydown', function undo() {});
        session.track(doc, 'keydown', function remove() {});
        session.track(scene, 'measurement_added', function count() {});

        session.dispose();

        expect(doc.added).toBe(doc.removed);
        expect(scene.added).toBe(scene.removed);
        expect(doc.live + scene.live).toBe(0);
    });

    it('untrack removes one listener only once', () => {
        const session = new PotreeSession({ window: {} });
        const doc = fakeTarget();
        const handler = function click() {};
        session.track(doc, 'click', handler);
        session.untrack(doc, 'click', handler);
        session.dispose();
        expect(doc.removed).toBe(1);
    });

    it('stops rendering and releases the viewer, its canvas and the global', () => {
        const win = { $: undefined };
        const viewer = fakeViewer();
        win.viewer = viewer;
        const container = { innerHTML: '<canvas>' };
        const session = new PotreeSession({ window: win });
        session.attach(viewer, container);

        session.dispose();

        expect(viewer.renderer.setAnimationLoop).toHaveBeenCalledWith(null);
        viewer.scene.pointclouds.forEach(pc => expect(pc.dispose).toHaveBeenCalled());
        expect(viewer.renderer.dispose).toHaveBeenCalled();
        expect(viewer.renderer.forceContextLoss).toHaveBeenCalled();
        expect(viewer.renderer.domElement.parentNode.removeChild).toHaveBeenCalled();
        expect(container.innerHTML).toBe('');
        expect('viewer' in win).toBe(false);
        expect(session.viewer).toBeNull();
    });

    it('empties the container through jQuery when it is loaded, and removes adopted nodes', () => {
        const empty = vi.fn();
        const win = { $: vi.fn(() => ({ empty })) };
        const container = {};
        const tooltip = { parentNode: { removeChild: vi.fn() } };
        const session = new PotreeSession({ window: win });
        session.attach(fakeViewer(), container);
        session.adopt(tooltip);

        session.dispose();
        session.dispose(); // idempotent

        expect(win.$).toHaveBeenCalledWith(container);
        expect(empty).toHaveBeenCalledTimes(1);
        expect(tooltip.parentNode.removeChild).toHaveBeenCalledWith(tooltip);
    });
});

describe('PotreeSession, what Potree adds to the page after the viewer exists', () => {
    it('removes the profile window, the colour pickers and the window handlers, and nothing else', () => {
        const $ = vendoredJQuery();
        window.$ = $;
        const container = document.createElement('div');
        document.body.appendChild(container);
        const appToast = document.createElement('div');
        appToast.className = 'p-toast';
        document.body.appendChild(appToast);
        const keep = () => {};
        $(window).resize(keep);   // bound before the viewer: not the session's

        const viewer = fakeViewer();
        viewer.profileWindow = { renderer: { dispose: vi.fn(), forceContextLoss: vi.fn() } };
        window.viewer = viewer;
        const session = new PotreeSession({ window });
        session.attach(viewer, container);

        // What Potree does once the viewer runs: profile.html, spectrum pickers, a resize handler
        const profile = $('<div id="profile_window"><canvas></canvas></div>').appendTo(document.body)[0];
        $('<div class="sp-container sp-hidden"></div><div class="sp-container sp-hidden"></div>').appendTo(document.body);
        const onResize = vi.fn();
        $(window).resize(onResize);
        $(profile).data('viewer', viewer);

        session.dispose();

        expect(document.getElementById('profile_window')).toBeNull();
        expect(document.querySelectorAll('.sp-container').length).toBe(0);
        expect(document.body.contains(appToast)).toBe(true);
        expect(viewer.profileWindow.renderer.dispose).toHaveBeenCalled();
        expect(viewer.profileWindow.renderer.forceContextLoss).toHaveBeenCalled();
        $(window).trigger('resize');
        expect(onResize).not.toHaveBeenCalled();
        expect($._data(window, 'events').resize.map(h => h.handler)).toEqual([keep]);

        $(window).off('resize');
        appToast.remove();
        container.remove();
        delete window.$;
    });
});

describe('PotreeSession, a viewer closed while its GUI still loads', () => {
    // What Potree's loadGUI does: it queues the callbacks until profile.html is in, then they run
    function lateGuiViewer() {
        const viewer = fakeViewer();
        viewer.guiLoaded = false;
        viewer.guiLoadTasks = [];
        viewer.onGUILoaded = callback => { if (viewer.guiLoaded) callback(); else viewer.guiLoadTasks.push(callback); };
        viewer.finishGui = ($, profileRenderer) => {
            // profile.html arrives: the window with its renderer, a resize handler, a colour picker
            $('<div id="profile_window"><canvas></canvas></div>').appendTo(document.body);
            $('<div class="sp-container sp-hidden"></div>').appendTo(document.body);
            $(window).resize(viewer.onResize);
            viewer.profileWindow = { renderer: profileRenderer };
            viewer.guiLoaded = true;
            viewer.guiLoadTasks.forEach(task => task());
        };
        viewer.onResize = vi.fn();
        return viewer;
    }

    it('removes the profile window, its renderer, the colour pickers and its resize handler once the GUI has added them', () => {
        const $ = vendoredJQuery();
        window.$ = $;
        const keep = () => {};
        $(window).resize(keep);
        const viewer = lateGuiViewer();
        const session = new PotreeSession({ window });
        session.attach(viewer, document.createElement('div'));

        // The viewer is left before profile.html is in
        session.dispose();
        expect(viewer.guiLoadTasks).toHaveLength(1);

        const renderer = { dispose: vi.fn(), forceContextLoss: vi.fn() };
        viewer.finishGui($, renderer);

        expect(document.getElementById('profile_window')).toBeNull();
        expect(document.querySelectorAll('.sp-container').length).toBe(0);
        expect(renderer.dispose).toHaveBeenCalled();
        expect(renderer.forceContextLoss).toHaveBeenCalled();
        $(window).trigger('resize');
        expect(viewer.onResize).not.toHaveBeenCalled();
        expect($._data(window, 'events').resize.map(h => h.handler)).toEqual([keep]);

        $(window).off('resize');
        delete window.$;
    });

    it('asks for nothing more when the GUI had finished before the viewer was left', () => {
        const viewer = lateGuiViewer();
        viewer.guiLoaded = true;
        const session = new PotreeSession({ window: {} });
        session.attach(viewer, []);
        session.dispose();
        expect(viewer.guiLoadTasks).toHaveLength(0);
    });
});

describe('PotreeSession, Potree caches', () => {
    it('drops the nodes of its point clouds from the global LRU and frees them, not the others', () => {
        const mine = {}, other = {};
        const nodes = [{ id: 1, owner: mine, dispose: vi.fn() }, { id: 2, owner: other, dispose: vi.fn() }, { id: 3, pcoGeometry: mine, dispose: vi.fn() }];
        const lru = {
            items: Object.fromEntries(nodes.map(n => [n.id, { node: n }])),
            remove(node) { delete this.items[node.id]; }
        };
        const viewer = fakeViewer();
        viewer.scene.pointclouds = [{ dispose: vi.fn(), pcoGeometry: mine }];
        const transformVersion = new Map([[viewer.scene.pointclouds[0], 1]]);
        const session = new PotreeSession({ window: { Potree: { lru, _pointcloudTransformVersion: transformVersion } } });
        session.attach(viewer, { innerHTML: '' });

        session.dispose();

        expect(Object.keys(lru.items)).toEqual(['2']);
        expect(nodes[0].dispose).toHaveBeenCalled();
        expect(nodes[2].dispose).toHaveBeenCalled();
        expect(nodes[1].dispose).not.toHaveBeenCalled();
        expect(transformVersion.size).toBe(0);
    });

    it('ends the idle decoder workers of the pool', () => {
        const worker = () => ({ onmessage: () => {}, terminate: vi.fn() });
        const workers = { '/workers/a.js': [worker(), worker()], '/workers/b.js': [worker()] };
        const all = Object.values(workers).flat();
        const session = new PotreeSession({ window: { Potree: { workerPool: { workers } } } });
        session.attach(fakeViewer(), null);

        session.dispose();

        all.forEach(w => { expect(w.terminate).toHaveBeenCalled(); expect(w.onmessage).toBeNull(); });
        expect(Object.values(workers).every(list => list.length === 0)).toBe(true);
    });

    it('ends the workers handed out to the viewer, also those still busy', () => {
        const made = [];
        class Pool {
            constructor() { this.workers = {}; }
            getWorker(url) {
                const list = this.workers[url] ?? (this.workers[url] = []);
                if (list.length > 0) return list.pop();
                const w = { url, onmessage: null, terminate: vi.fn() };
                made.push(w);
                return w;
            }
            returnWorker(url, worker) { (this.workers[url] ??= []).push(worker); }
        }
        const pool = new Pool();
        const potree = { workerPool: pool, numNodesLoading: 0 };
        const session = new PotreeSession({ window: { Potree: potree } });
        session.attach(fakeViewer(), null);

        const busy = pool.getWorker('/workers/EptLaszipDecoderWorker.js');
        busy.onmessage = () => {}; // its job is still running when the viewer closes
        const returned = pool.getWorker('/workers/EptLaszipDecoderWorker.js');
        pool.returnWorker('/workers/EptLaszipDecoderWorker.js', returned); // back in the pool
        potree.numNodesLoading = 1; // the busy job's load
        session.dispose();

        expect(busy.terminate).toHaveBeenCalled();
        expect(busy.onmessage).toBeNull();
        expect(returned.terminate).toHaveBeenCalledTimes(1);
        expect(potree.numNodesLoading).toBe(0); // the next viewer is not throttled by it
    });

    it('ends the workers that late loads of the closed viewer take, until the next viewer', () => {
        class Pool {
            constructor() { this.workers = {}; }
            getWorker(url) { return { url, onmessage: null, terminate: vi.fn() }; }
            returnWorker(url, worker) { (this.workers[url] ??= []).push(worker); }
        }
        const pool = new Pool();
        const closed = new PotreeSession({ window: { Potree: { workerPool: pool } } });
        closed.attach(fakeViewer(), null);
        closed.dispose();

        // a fetch of the closed viewer completes: its decoding job takes a worker and returns it
        const late = pool.getWorker('/workers/w.js');
        late.onmessage = () => {};
        pool.returnWorker('/workers/w.js', late);
        expect(late.terminate).toHaveBeenCalled();
        expect(pool.workers['/workers/w.js'] ?? []).toHaveLength(0);

        // the next viewer pools its workers again
        const next = new PotreeSession({ window: { Potree: { workerPool: pool } } });
        next.attach(fakeViewer(), null);
        const reused = pool.getWorker('/workers/w.js');
        pool.returnWorker('/workers/w.js', reused);
        expect(reused.terminate).not.toHaveBeenCalled();
        expect(pool.workers['/workers/w.js']).toEqual([reused]);
    });

    it('releases the shared screen quad: its geometry is disposed and it drops the last material', () => {
        const quad = { geometry: { dispose: vi.fn() }, material: { edl: true } };
        const session = new PotreeSession({ window: { Potree: { Utils: { screenPass: { screenQuad: quad } } } } });
        session.attach(fakeViewer(), null);

        session.dispose();

        expect(quad.geometry.dispose).toHaveBeenCalled();
        expect(quad.material).toBeNull();
    });
});

describe('PotreeSession, jQuery ready callbacks', () => {
    it('runs $(fn) after the page is ready without keeping fn, the way jQuery would run it', async () => {
        const $ = vendoredJQuery();
        await new Promise(resolve => $(resolve)); // the document is ready
        window.$ = $;
        const session = new PotreeSession({ window });
        session.create(() => fakeViewer(), null);

        const fn = vi.fn();
        $(fn);
        expect($.fn.ready.nonRetaining).toBe(true);
        expect(fn).not.toHaveBeenCalled(); // asynchronous, as with jQuery
        await new Promise(r => setTimeout(r, 0));
        expect(fn).toHaveBeenCalledWith($);
        expect(fn.mock.contexts[0]).toBe(document);

        session.dispose();
        delete window.$;
    });
});

describe('PotreeSession, jQuery ready after the viewer is closed', () => {
    it('gives $.fn.ready back to jQuery, so nothing of the closed viewer stays in the replacement', async () => {
        const $ = vendoredJQuery();
        await new Promise(resolve => $(resolve));
        window.$ = $;
        const original = $.fn.ready;
        const first = new PotreeSession({ window });
        first.create(() => fakeViewer(), null);
        expect($.fn.ready).not.toBe(original);

        first.dispose();
        expect($.fn.ready).toBe(original);

        // A later viewer installs its own again, and puts it back too
        const second = new PotreeSession({ window });
        second.create(() => fakeViewer(), null);
        expect($.fn.ready.nonRetaining).toBe(true);
        second.dispose();
        expect($.fn.ready).toBe(original);
        delete window.$;
    });

    it('is put back only by the session that installed it', async () => {
        const $ = vendoredJQuery();
        await new Promise(resolve => $(resolve));
        window.$ = $;
        const original = $.fn.ready;
        const old = new PotreeSession({ window });
        old.create(() => fakeViewer(), null);
        const current = new PotreeSession({ window });
        current.create(() => fakeViewer(), null);
        current.dispose();
        // The older one installed it and puts it back with its own end
        expect($.fn.ready.nonRetaining).toBe(true);
        old.dispose();
        expect($.fn.ready).toBe(original);
        delete window.$;
    });
});

describe('PotreeSession.create', () => {
    it('owns the window and document listeners the viewer constructor adds, and restores addEventListener', () => {
        const onOrientation = vi.fn();
        const onKey = vi.fn();
        const before = () => {};
        window.addEventListener('orientationchange', before);
        const windowAdd = window.addEventListener, documentAdd = document.addEventListener;
        const session = new PotreeSession({ window });

        const viewer = session.create(() => {
            // what DeviceOrientationControls does in Potree's Viewer constructor
            window.addEventListener('orientationchange', onOrientation);
            document.addEventListener('keydown', onKey);
            return fakeViewer();
        }, document.createElement('div'));

        expect(session.viewer).toBe(viewer);
        expect(window.addEventListener).toBe(windowAdd);
        expect(document.addEventListener).toBe(documentAdd);
        window.dispatchEvent(new Event('orientationchange'));
        expect(onOrientation).toHaveBeenCalledTimes(1);

        session.dispose();

        window.dispatchEvent(new Event('orientationchange'));
        document.dispatchEvent(new Event('keydown'));
        expect(onOrientation).toHaveBeenCalledTimes(1);
        expect(onKey).not.toHaveBeenCalled();
        window.removeEventListener('orientationchange', before);
    });

    it('restores addEventListener when the viewer cannot be created', () => {
        const windowAdd = window.addEventListener;
        const session = new PotreeSession({ window });
        expect(() => session.create(() => { throw new Error('no WebGL'); }, null)).toThrow('no WebGL');
        expect(window.addEventListener).toBe(windowAdd);
    });
});

describe('PotreeSession, reading COPC files', () => {
    it('gives Potree its range transport while the viewer lives, and stops its reads and retries with it', async () => {
        const fetch = vi.fn(async () => new Response('busy', { status: 503 }));
        vi.stubGlobal('fetch', fetch);
        try {
            const win = { Potree: { createCopcGetter: null } };
            const session = new PotreeSession({ window: win });
            session.attach(fakeViewer(), []);
            expect(win.Potree.createCopcGetter).toBe(session.createCopcGetter);

            const reading = win.Potree.createCopcGetter('/copc/cloud.copc.laz')(0, 4).then(() => null, e => e);
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
            const [, init] = fetch.mock.calls[0];
            expect(init).toMatchObject({ cache: 'no-store', headers: { Range: 'bytes=0-3' } });

            session.dispose();
            expect(init.signal.aborted).toBe(true);
            expect((await reading).name).toBe('AbortError');
            expect(win.Potree.createCopcGetter).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    describe('a read the server refuses for good', () => {
        const readAnswering = async status => {
            vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status })));
            const win = { Potree: { createCopcGetter: null } };
            const onReadRefused = vi.fn();
            const session = new PotreeSession({ window: win, onReadRefused });
            session.attach(fakeViewer(), []);
            const get = win.Potree.createCopcGetter('/copc/cloud.copc.laz');
            const results = [await get(0, 4).catch(e => e), await get(4, 8).catch(e => e)];
            return { onReadRefused, results };
        };
        afterEach(() => vi.unstubAllGlobals());

        it.each([401, 404])('is told once whatever the number of reads that fail (%i)', async status => {
            const { onReadRefused, results } = await readAnswering(status);
            expect(results.map(e => e.status)).toEqual([status, status]);
            expect(onReadRefused).toHaveBeenCalledTimes(1);
            expect(onReadRefused.mock.calls[0][0].status).toBe(status);
        });

        it('is not told of a failure that can pass (a 503) nor of a stopped read', async () => {
            vi.useFakeTimers();
            try {
                vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
                const win = { Potree: { createCopcGetter: null } };
                const onReadRefused = vi.fn();
                const session = new PotreeSession({ window: win, onReadRefused });
                session.attach(fakeViewer(), []);
                const reading = win.Potree.createCopcGetter('/copc/cloud.copc.laz')(0, 4).catch(e => e);
                await vi.advanceTimersByTimeAsync(10000);
                expect((await reading).status).toBe(503);
                expect(onReadRefused).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });
    });

    it('leaves the transport of a newer viewer in place when it is disposed', () => {
        const win = { Potree: { createCopcGetter: null } };
        const old = new PotreeSession({ window: win });
        old.attach(fakeViewer(), []);
        const current = new PotreeSession({ window: win });
        current.attach(fakeViewer(), []);
        old.dispose();
        expect(win.Potree.createCopcGetter).toBe(current.createCopcGetter);
    });
});

describe('pointBudgetFor', () => {
    it('keeps 10 M points on desktops with 8 GB or more, less on smaller devices and phones', () => {
        expect(pointBudgetFor(8, false, true)).toBe(10_000_000);
        expect(pointBudgetFor(4, false, true)).toBe(4_000_000);
        expect(pointBudgetFor(0.5, false, true)).toBe(1_000_000);
        expect(pointBudgetFor(8, true, true)).toBe(3_000_000);
        expect(pointBudgetFor(2, true, true)).toBe(2_000_000);
    });

    it('keeps 10 M points on a desktop whose browser does not report its memory (desktop Firefox, Safari)', () => {
        // What deviceMemoryGb() gives there: its 4 GB default, which is not the memory of the desktop
        expect(pointBudgetFor(4, false, false)).toBe(10_000_000);
        expect(pointBudgetFor(undefined, false, false)).toBe(10_000_000);
        // A phone that does not say stays within the phone budget
        expect(pointBudgetFor(4, true, false)).toBe(3_000_000);
    });

    it('asks the browser whether it reported the memory when the caller does not say', () => {
        const nav = globalThis.navigator;
        const had = Object.getOwnPropertyDescriptor(nav, 'deviceMemory');
        try {
            // No navigator.deviceMemory (the test browser): a desktop keeps 10 M
            delete nav.deviceMemory;
            expect(pointBudgetFor(deviceMemoryGb(), false)).toBe(10_000_000);
            Object.defineProperty(nav, 'deviceMemory', { value: 4, configurable: true });
            expect(pointBudgetFor(deviceMemoryGb(), false)).toBe(4_000_000);
        } finally {
            if (had) Object.defineProperty(nav, 'deviceMemory', had);
            else delete nav.deviceMemory;
        }
    });
});
