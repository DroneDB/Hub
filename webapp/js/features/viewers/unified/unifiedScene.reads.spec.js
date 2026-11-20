/**
 * The COPC reads of the 3D viewer stop when the viewer closes: the range transport retries a failed read up to three
 * times, and a read of a viewer that is gone must not go on loading a file nobody looks at. The scene owns the signal
 * of its reads and aborts it in dispose. The range transport and the scene are the real ones; Giro3D's COPC source is
 * a stand-in that reads the header of the file on initialize, and fetch is stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import ddb from 'ddb';
import { UnifiedScene } from './unifiedScene';
import { LOADERS } from './loaders';

afterEach(() => vi.unstubAllGlobals());

describe('the COPC reads of the 3D viewer', () => {
    it('are stopped, with their retries, when the scene is disposed while the cloud loads', async () => {
        // A busy server: the transport retries
        const fetch = vi.fn(async () => new Response('busy', { status: 503 }));
        vi.stubGlobal('fetch', fetch);
        class COPCSource {
            constructor({ url }) { this.read = url; }
            addEventListener() {}
            async initialize() { await this.read(0, 375); }
        }
        const scene = new UnifiedScene({ COPCSource }, null, { settings: {}, view: { layers: [] }, notify: { info() {} } });
        const entry = { type: ddb.entry.type.POINTCLOUD, path: 'cloud.laz' };
        const dataset = { Entry: () => ({ getCopc: () => '/build/cloud.copc.laz' }) };

        const loading = LOADERS[ddb.entry.type.POINTCLOUD](scene, entry, dataset).then(() => null, error => error);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe('/build/cloud.copc.laz');
        expect(init).toMatchObject({ headers: { Range: 'bytes=0-374' } });

        scene.dispose();

        expect(init.signal.aborted).toBe(true);
        expect((await loading)?.name).toBe('AbortError');
        // No retry after the close
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
