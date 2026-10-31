import { describe, it, expect } from 'vitest';
import { b64urlDecode } from '@/libs/base64';
import { compareUrl } from './compareLinks';

describe('compareUrl', () => {
    it('lists the layers in order and asks for the picker', () => {
        const url = compareUrl({ org: 'o', ds: 'my ds' }, { paths: ['a/x.tif', 'b/ü.tif'], pick: true });
        const [path, qs] = url.split('?');
        expect(path).toBe('/r/o/my%20ds/compare');
        const q = new URLSearchParams(qs);
        expect(q.getAll('p').map(b64urlDecode)).toEqual(['a/x.tif', 'b/ü.tif']);
        expect(q.get('pick')).toBe('1');
    });

    it('names a saved comparison', () => {
        expect(compareUrl({ org: 'o', ds: 'd' }, { uid: 'c_1' })).toBe('/r/o/d/compare?c=c_1');
    });
});
