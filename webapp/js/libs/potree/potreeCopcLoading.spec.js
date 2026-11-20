import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readSource } from '@/specs/cssSource';
import { loadPotree } from './potreeLibs.fixtures';

/**
 * How the vendored Potree (with copc.js) loads a COPC point cloud when a read or a decoding fails: the node gives back
 * its loading slot and is asked for again later, a header that cannot be read is a loading failure, and the file is
 * read through the getter the page gives (Potree.createCopcGetter). The bundle is the real one; the reads, the
 * hierarchy pages and the decoder worker are stand-ins.
 */
let Potree;
let Copc;
beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    Potree = loadPotree({ copc: true });
    Copc = window.Copc;
    vi.mocked(console.log).mockRestore();
});

/** The header and info of a COPC file of one cube of side 8, as copc.js gives them. */
const COPC = {
    header: { min: [0, 0, 0], max: [8, 8, 8], scale: [0.01, 0.01, 0.01], offset: [0, 0, 0], pointCount: 10 },
    info: { cube: [0, 0, 0, 8, 8, 8], spacing: 0.1, rootHierarchyPage: { pageOffset: 0, pageLength: 32 } },
    wkt: null,
    eb: []
};
/** The hierarchy page of the root: the root has the points of bytes [100, 140). */
const PAGE = { nodes: { '0-0-0-0': { pointCount: 10, pointDataOffset: 100, pointDataLength: 40 } }, pages: {} };

/** What the decoder worker answers for a node of n points. */
function decoded(n = 10) {
    const buffer = size => new ArrayBuffer(size);
    return {
        position: buffer(n * 12), color: buffer(n * 4), intensity: buffer(n * 4), classification: buffer(n),
        returnNumber: buffer(n), numberOfReturns: buffer(n), pointSourceId: buffer(n * 2), indices: buffer(n * 4),
        gpsTime: buffer(n * 4), gpsMeta: { offset: 0, range: 0 }, ranges: {},
        tightBoundingBox: { min: [0, 0, 0], max: [8, 8, 8] }, mean: [4, 4, 4]
    };
}

let workers;
let pool;
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Potree.numNodesLoading = 0;
    Potree.createCopcGetter = null;
    // The decoder workers: each one records what it is sent; the spec answers for it
    workers = [];
    pool = { getWorker: vi.fn(() => { const w = { postMessage: vi.fn() }; workers.push(w); return w; }), returnWorker: vi.fn() };
    Potree.workerPool = pool;
    vi.spyOn(Copc.Copc, 'loadHierarchyPage').mockResolvedValue(PAGE);
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/** The root node of a COPC point cloud read with `getter`. */
function rootOf(getter) {
    const geometry = new Potree.PointCloudCopcGeometry(getter, COPC);
    return new Potree.PointCloudCopcGeometryNode(geometry);
}
const bytes = () => Promise.resolve(new Uint8Array(40));

describe('a node of a COPC point cloud whose load fails', () => {
    it('gives back its loading slot, waits, and loads when it is asked for again', async () => {
        const getter = vi.fn().mockRejectedValueOnce(new TypeError('net::ERR_CACHE_OPERATION_NOT_SUPPORTED')).mockImplementation(bytes);
        const root = rootOf(getter);

        await root.load();
        expect(root.loading).toBe(false);
        expect(Potree.numNodesLoading).toBe(0);
        expect(root.isWaitingToRetry()).toBe(true);

        // Asked again at once (the next frame): it waits
        await root.load();
        expect(getter).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1000);
        expect(root.isWaitingToRetry()).toBe(false);
        await root.load();
        expect(getter).toHaveBeenLastCalledWith(100, 140);
        expect(root.loading).toBe(true);
        expect(Potree.numNodesLoading).toBe(1);

        workers[0].onmessage({ data: decoded() });
        expect(root.loaded).toBe(true);
        expect(Potree.numNodesLoading).toBe(0);
        expect(pool.returnWorker).toHaveBeenCalledWith(expect.any(String), workers[0]);
        expect(root.isWaitingToRetry()).toBe(false);
    });

    it('waits longer after each failure in a row, up to 30 s', async () => {
        const root = rootOf(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const waits = [];
        for (let i = 0; i < 7; i++) {
            await root.load();
            waits.push(root.retryAt - Date.now());
            vi.advanceTimersByTime(root.retryAt - Date.now());
        }
        expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    });

    it('fails when its hierarchy page cannot be read, and reads it again on the next try', async () => {
        Copc.Copc.loadHierarchyPage.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const root = rootOf(vi.fn(bytes));
        await root.load();
        expect(root.nodeinfo).toBeUndefined();
        expect(Potree.numNodesLoading).toBe(0);

        vi.advanceTimersByTime(1000);
        await root.load();
        expect(root.nodeinfo).toEqual(PAGE.nodes['0-0-0-0']);
        expect(workers).toHaveLength(1);
    });

    it('gives back its slot and the worker when the decoding fails in the worker or on its answer', async () => {
        const root = rootOf(vi.fn(bytes));
        await root.load();
        const preventDefault = vi.fn();
        workers[0].onerror({ message: 'bad chunk', preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(root.loading).toBe(false);
        expect(Potree.numNodesLoading).toBe(0);
        expect(pool.returnWorker).toHaveBeenCalledWith(expect.any(String), workers[0]);

        vi.advanceTimersByTime(1000);
        await root.load();
        // An answer the page cannot use
        workers[1].onmessage({ data: {} });
        expect(root.loaded).toBe(false);
        expect(Potree.numNodesLoading).toBe(0);
        expect(pool.returnWorker).toHaveBeenCalledWith(expect.any(String), workers[1]);
    });

    it('does not keep other nodes from loading: maxNodesLoading failures leave every slot free', async () => {
        const failing = Array.from({ length: Potree.maxNodesLoading }, () => rootOf(vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))));
        for (const node of failing) await node.load();
        expect(Potree.numNodesLoading).toBe(0);

        const next = rootOf(vi.fn(bytes));
        await next.load();
        expect(next.loading).toBe(true);
    });

    it('reports no failure when the reads were stopped on purpose (the viewer closed)', async () => {
        const root = rootOf(vi.fn().mockRejectedValue(new DOMException('The viewer closed', 'AbortError')));
        await root.load();
        expect(Potree.numNodesLoading).toBe(0);
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('takes no turn of a frame while it waits (the renderer skips it when it picks the nodes to load)', () => {
        const source = readSource(__dirname, '../../../public/potree/build/potree/potree.js');
        expect(source).toContain('if (!(node.isWaitingToRetry && node.isWaitingToRetry())) unloadedGeometry.push(node);');
    });
});

describe('opening a COPC point cloud', () => {
    const URL_ = '/orgs/o/ds/d/build/h@v/copc/cloud.copc.laz';
    const opened = () => new Promise(resolve => Potree.loadPointCloud(URL_, 'cloud', resolve));
    // The material of a point cloud paints its gradients on a 2D canvas, which happy-dom does not draw
    beforeEach(() => {
        const context = new Proxy({}, { get: (t, key) => (key in t ? t[key] : () => context) });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    });

    it('is a loading failure when its header cannot be read', async () => {
        vi.spyOn(Copc.Copc, 'create').mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await opened()).toEqual({ type: 'loading_failed' });
    });

    it('reads the file through the getter the page gives', async () => {
        const getter = vi.fn(bytes);
        Potree.createCopcGetter = vi.fn(() => getter);
        const create = vi.spyOn(Copc.Copc, 'create').mockResolvedValue(COPC);
        const e = await opened();
        expect(Potree.createCopcGetter).toHaveBeenCalledWith(URL_);
        expect(create).toHaveBeenCalledWith(getter);
        expect(e.type).toBe('pointcloud_loaded');
        expect(e.pointcloud.pcoGeometry.copc).toBe(COPC);
    });

    it('reads it with copc.js when the page gives no getter', async () => {
        const http = vi.spyOn(Copc.Getter, 'http').mockReturnValue(vi.fn(bytes));
        vi.spyOn(Copc.Copc, 'create').mockResolvedValue(COPC);
        await opened();
        expect(http).toHaveBeenCalledWith(URL_);
    });
});
