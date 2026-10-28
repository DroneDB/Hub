import { describe, it, expect } from 'vitest';
import { layerLabels } from './layerLabels';

const labelsOf = paths => Object.fromEntries(layerLabels(paths));

describe('layerLabels', () => {
    it('uses the file name when it is unique', () => {
        expect(labelsOf(['a/ortho.tif', 'b/dsm.tif'])).toEqual({ 'a/ortho.tif': 'ortho.tif', 'b/dsm.tif': 'dsm.tif' });
    });

    it('keeps root-level files as they are', () => {
        expect(labelsOf(['ortho.tif', 'flights/dsm.tif'])).toEqual({ 'ortho.tif': 'ortho.tif', 'flights/dsm.tif': 'dsm.tif' });
    });

    it('adds the shortest segments that tell colliding names apart', () => {
        expect(labelsOf([
            'a/2024/odm_orthophoto/odm_orthophoto.tif',
            'a/2025/odm_orthophoto/odm_orthophoto.tif'
        ])).toEqual({
            'a/2024/odm_orthophoto/odm_orthophoto.tif': '2024/odm_orthophoto/odm_orthophoto.tif',
            'a/2025/odm_orthophoto/odm_orthophoto.tif': '2025/odm_orthophoto/odm_orthophoto.tif'
        });
    });

    it('goes only as deep as each collision needs', () => {
        expect(labelsOf(['x/ortho.tif', 'y/ortho.tif', 'y/z/ortho.tif', 'dsm.tif'])).toEqual({
            'x/ortho.tif': 'x/ortho.tif',
            'y/ortho.tif': 'y/ortho.tif',
            'y/z/ortho.tif': 'z/ortho.tif',
            'dsm.tif': 'dsm.tif'
        });
    });

    it('labels a root file against a nested file of the same name by its full path', () => {
        expect(labelsOf(['ortho.tif', 'a/ortho.tif'])).toEqual({ 'ortho.tif': 'ortho.tif', 'a/ortho.tif': 'a/ortho.tif' });
    });

    it('does not let a short path swallow the suffix of a longer one', () => {
        // "b/ortho.tif" is a suffix of "a/b/ortho.tif": the longer one needs a further segment
        expect(labelsOf(['b/ortho.tif', 'a/b/ortho.tif'])).toEqual({
            'b/ortho.tif': 'b/ortho.tif',
            'a/b/ortho.tif': 'a/b/ortho.tif'
        });
    });

    it('gives a repeated path one label', () => {
        const labels = layerLabels(['a/ortho.tif', 'a/ortho.tif', 'b/ortho.tif']);
        expect(labels.size).toBe(2);
        expect(labels.get('a/ortho.tif')).toBe('a/ortho.tif');
        expect(labels.get('b/ortho.tif')).toBe('b/ortho.tif');
    });

    it('gives a repeated unique name its file name', () => {
        expect(labelsOf(['a/ortho.tif', 'a/ortho.tif'])).toEqual({ 'a/ortho.tif': 'ortho.tif' });
    });

    it('returns an empty map for no paths', () => {
        expect(layerLabels([]).size).toBe(0);
    });
});
