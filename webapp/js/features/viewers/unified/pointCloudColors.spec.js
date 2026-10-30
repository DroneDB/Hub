import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Uint8BufferAttribute, Uint16BufferAttribute } from 'three';
import { colorShift, toEightBitColors, withColorDepth } from './pointCloudColors';

// Giro3D's modules include the code of its web workers, which sets the worker's onmessage
vi.hoisted(() => { globalThis.onmessage = null; });
const { default: COPCSource } = await import('@giro3d/giro3d/sources/COPCSource.js');
const { setLazPerfWasmBinary } = await import('@giro3d/giro3d/sources/las/config.js');

const COLOR = { name: 'Color', interpretation: 'color', dimension: 3 };

describe('colour depth of a point cloud', () => {
    it('is 8 bits when no sample is above 255, 16 bits otherwise', () => {
        expect(colorShift([0, 128, 255, 12, 34, 56])).toBe(0);
        expect(colorShift([0, 128, 256])).toBe(8);
        expect(colorShift([65535, 0, 0])).toBe(8);
    });

    it('keeps 8-bit colours and drops the low byte of 16-bit ones', () => {
        expect([...toEightBitColors([0, 128, 255], 0)]).toEqual([0, 128, 255]);
        expect([...toEightBitColors([0, 32768, 65535], 8)]).toEqual([0, 128, 255]);
    });
});

/** A COPCSource stand-in: the stored values of each node, as Giro3D returns them uncompressed. */
class FakeSource {
    static stored = {};
    static reads = [];
    constructor(options) { this.options = options; }
    async getMetadata() { return { attributes: [COLOR, { name: 'Z', interpretation: 'unknown', size: 4 }] }; }
    async getHierarchy() { return { id: 'root' }; }
    async getNodeData({ node, attributes }) {
        FakeSource.reads.push(node.id);
        const values = FakeSource.stored[node.id];
        return { pointCount: values.length / 3, attributes: attributes.map(() => new Uint16BufferAttribute(new Uint16Array(values), 3, true)) };
    }
}
const Source = withColorDepth(FakeSource, Uint8BufferAttribute);

describe('a COPC source with the colour depth of its cloud', () => {
    beforeAll(() => { FakeSource.reads = []; });

    it('reads the stored values, not the ones Giro3D squeezes into 8 bits', () => {
        expect(new Source({ url: 'x' }).options.compressColorsTo8Bit).toBe(false);
    });

    it('describes its colours as 8-bit values', async () => {
        const { attributes } = await new Source({ url: 'x' }).getMetadata();
        expect(attributes[0]).toMatchObject({ interpretation: 'color', size: 1, max: 255 });
        expect(attributes[1].size).toBe(4);
    });

    it('shows the 8-bit colours of a cloud at full brightness', async () => {
        FakeSource.stored = { root: [10, 200, 255], child: [0, 128, 64] };
        const source = new Source({ url: 'x' });
        await source.getHierarchy();
        const data = await source.getNodeData({ node: { id: 'child' }, attributes: [COLOR] });
        const colors = data.attributes[0];
        expect(colors).toBeInstanceOf(Uint8BufferAttribute);
        expect(colors.normalized).toBe(true);
        expect([...colors.array]).toEqual([0, 128, 64]);
    });

    it('takes the depth of the cloud from its root: a dark node of a 16-bit cloud stays dark', async () => {
        FakeSource.stored = { root: [65535, 30000, 0], dark: [200, 100, 0] };
        FakeSource.reads = [];
        const source = new Source({ url: 'x' });
        await source.getHierarchy();
        const dark = await source.getNodeData({ node: { id: 'dark' }, attributes: [COLOR] });
        expect([...dark.attributes[0].array]).toEqual([0, 0, 0]);
        const root = await source.getNodeData({ node: { id: 'root' }, attributes: [COLOR] });
        expect([...root.attributes[0].array]).toEqual([255, 117, 0]);
        // The root is read once for the depth, then once as a node of its own
        expect(FakeSource.reads.filter(id => id === 'root')).toHaveLength(2);
    });

    it('leaves a request without colours as it is', async () => {
        FakeSource.stored = { root: [1, 2, 3] };
        const source = new Source({ url: 'x' });
        await source.getHierarchy();
        const z = { name: 'Z', interpretation: 'unknown' };
        const data = await source.getNodeData({ node: { id: 'root' }, attributes: [z] });
        expect(data.attributes[0]).toBeInstanceOf(Uint16BufferAttribute);
    });
});

// 100 white points whose colours are stored as 255, as ODM and many other writers store them
describe('a COPC cloud of 8-bit colours read by Giro3D', () => {
    const file = fs.readFileSync(path.join(__dirname, 'fixtures', 'rgb8.copc.laz'));
    // A range past the end gets the bytes there are, as from the server
    const getter = async (begin, end) => new Uint8Array(file.subarray(begin, Math.min(end, file.length)));

    beforeAll(() => {
        const wasm = fs.readFileSync(path.join(process.cwd(), 'node_modules/laz-perf/lib/laz-perf.wasm'));
        setLazPerfWasmBinary(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
    });

    async function rootColors(source) {
        await source.initialize();
        const color = (await source.getMetadata()).attributes.find(a => a.interpretation === 'color');
        const root = await source.getHierarchy();
        const data = await source.getNodeData({ node: root, attributes: [color], position: false });
        return data.attributes[0].array;
    }

    it('turns black with Giro3D alone', async () => {
        const colors = await rootColors(new COPCSource({ url: getter, enableWorkers: false }));
        expect(Math.max(...colors)).toBe(0);
    });

    it('stays white with the colour depth of the cloud', async () => {
        const ColorDepthCOPCSource = withColorDepth(COPCSource, Uint8BufferAttribute);
        const colors = await rootColors(new ColorDepthCOPCSource({ url: getter, enableWorkers: false }));
        expect(colors.length).toBe(300);
        expect(colors.every(c => c === 255)).toBe(true);
    });
});
