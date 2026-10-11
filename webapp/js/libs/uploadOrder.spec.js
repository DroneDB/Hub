/**
 * Unit tests for libs/uploadOrder.js
 * Run with: npx vitest run webapp/js/libs/uploadOrder.spec.js
 */
import { describe, it, expect } from 'vitest';
import { orderCompanionsFirst } from '@/libs/uploadOrder';

const f = name => ({ name });
const names = files => files.map(file => file.name);

describe('orderCompanionsFirst', () => {
    it('puts companions before models, preserving relative order in each group', () => {
        const input = ['a.obj', 'a.mtl', 'tex1.jpg', 'b.ply', 'b.png', 'c.gltf', 'c.bin', 'd.glb', 'notes.txt'].map(f);
        expect(names(orderCompanionsFirst(input))).toEqual([
            'a.mtl', 'tex1.jpg', 'b.png', 'c.bin', 'notes.txt',
            'a.obj', 'b.ply', 'c.gltf', 'd.glb'
        ]);
    });

    it('matches model extensions case-insensitively', () => {
        const input = ['M.OBJ', 'tex.JPG', 'P.Ply', 'S.GLTF', 'mat.MTL', 'B.GlB'].map(f);
        expect(names(orderCompanionsFirst(input))).toEqual(['tex.JPG', 'mat.MTL', 'M.OBJ', 'P.Ply', 'S.GLTF', 'B.GlB']);
    });

    it('keeps the order when there are no models', () => {
        const input = ['z.jpg', 'a.tif', 'm.mtl', 'cloud.laz'].map(f);
        expect(names(orderCompanionsFirst(input))).toEqual(['z.jpg', 'a.tif', 'm.mtl', 'cloud.laz']);
    });

    it('keeps the order when there are only models', () => {
        const input = ['z.ply', 'a.obj', 'm.glb', 'b.gltf'].map(f);
        expect(names(orderCompanionsFirst(input))).toEqual(['z.ply', 'a.obj', 'm.glb', 'b.gltf']);
    });

    it('treats files without a model extension as companions', () => {
        const input = ['model.obj', 'README', 'obj', '.obj', 'trailing.', 'model.obj.bak', 'archive.ply.zip'].map(f);
        expect(names(orderCompanionsFirst(input))).toEqual([
            'README', 'obj', '.obj', 'trailing.', 'model.obj.bak', 'archive.ply.zip', 'model.obj'
        ]);
    });

    it('uses the file name only, not the folder path', () => {
        const input = [
            { name: 'scene.obj', fullPath: 'folder.obj/scene.obj' },
            { name: 'scene.mtl', fullPath: 'folder.obj/scene.mtl' }
        ];
        expect(names(orderCompanionsFirst(input))).toEqual(['scene.mtl', 'scene.obj']);
    });

    it('returns a new array and does not mutate the input', () => {
        const input = ['a.obj', 'a.mtl', 'tex.png'].map(f);
        const snapshot = input.slice();
        const result = orderCompanionsFirst(input);
        expect(result).not.toBe(input);
        expect(input).toEqual(snapshot);
        input.forEach((file, i) => expect(file).toBe(snapshot[i]));
        // Same object references are returned (File objects must not be copied)
        expect(result[0]).toBe(input[1]);
        expect(result[2]).toBe(input[0]);
    });

    it('accepts array-like inputs such as FileList', () => {
        const fileList = { 0: f('a.glb'), 1: f('a.png'), length: 2 };
        expect(names(orderCompanionsFirst(fileList))).toEqual(['a.png', 'a.glb']);
    });

    it('handles empty and missing input', () => {
        expect(orderCompanionsFirst([])).toEqual([]);
        expect(orderCompanionsFirst(null)).toEqual([]);
        expect(orderCompanionsFirst(undefined)).toEqual([]);
    });
});
