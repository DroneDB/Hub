/**
 * The drag-and-drop folder walker (libs/dragDropUtils.getFilesFromDrop) resolves the
 * files of a dropped folder in parallel, bounded by TRAVERSAL_CONCURRENCY, instead of
 * paying one serial browser round trip per file before the upload dialog opens.
 *
 * Run with: npx vitest run webapp/js/specs/dragDropTraversal.spec.js
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/libs/eventBus', () => ({ default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }));
vi.mock('ddb', () => ({ default: { entry: { type: {}, isDirectory: () => false }, pathutils: {} } }));

const { getFilesFromDrop } = await import('@/libs/dragDropUtils');

/** Fake FileSystemEntry tree with an observable, delayed entry.file() / readEntries(). */
function makeTree(folders, filesPerFolder, stats, delayMs = 1) {
    const mkFile = (name) => ({
        isFile: true, isDirectory: false, name,
        file(resolve) {
            stats.inFlight++; stats.peak = Math.max(stats.peak, stats.inFlight); stats.calls++;
            setTimeout(() => { stats.inFlight--; resolve({ name, size: 1 }); }, delayMs);
        }
    });
    const mkDir = (name, children) => ({
        isFile: false, isDirectory: true, name,
        createReader() {
            let served = false;
            return {
                readEntries(resolve) {
                    stats.readEntries++;
                    setTimeout(() => { if (served) { resolve([]); } else { served = true; resolve(children); } }, delayMs);
                }
            };
        }
    });
    const dirs = [];
    for (let d = 0; d < folders; d++) {
        const files = [];
        for (let f = 0; f < filesPerFolder; f++) files.push(mkFile(`img_${d}_${f}.jpg`));
        dirs.push(mkDir(`flight_${d}`, files));
    }
    return mkDir('root', dirs);
}

function dropEvent(entry) {
    return { dataTransfer: { items: [{ kind: 'file', webkitGetAsEntry: () => entry }] } };
}

describe('drag-and-drop folder traversal', () => {
    it('keeps the tree order (depth first, reading order)', async () => {
        const stats = { inFlight: 0, peak: 0, calls: 0, readEntries: 0 };
        const files = await getFilesFromDrop(dropEvent(makeTree(4, 50, stats)));
        expect(files).toHaveLength(200);
        expect(files[0].fullPath).toBe('root/flight_0/img_0_0.jpg');
        expect(files[49].fullPath).toBe('root/flight_0/img_0_49.jpg');
        expect(files[50].fullPath).toBe('root/flight_1/img_1_0.jpg');
        expect(files[199].fullPath).toBe('root/flight_3/img_3_49.jpg');
        expect(stats.calls).toBe(200);
    });

    it('file resolution is parallel but bounded (4 <= peak in-flight <= 32)', async () => {
        const stats = { inFlight: 0, peak: 0, calls: 0, readEntries: 0 };
        const files = await getFilesFromDrop(dropEvent(makeTree(4, 50, stats)));
        expect(files).toHaveLength(200);
        expect(stats.peak).toBeGreaterThanOrEqual(4);
        expect(stats.peak).toBeLessThanOrEqual(32);
    });

    it('1000 files resolve in well under N round trips with fake 1 ms latency', async () => {
        vi.useFakeTimers();
        try {
            const stats = { inFlight: 0, peak: 0, calls: 0, readEntries: 0 };
            let done = false;
            const p = getFilesFromDrop(dropEvent(makeTree(10, 100, stats, 1))).then(r => { done = true; return r; });
            await vi.advanceTimersByTimeAsync(300); // < 1/3 of the serial time
            expect(done).toBe(true);
            expect(await p).toHaveLength(1000);
        } finally {
            vi.useRealTimers();
        }
    });
});
