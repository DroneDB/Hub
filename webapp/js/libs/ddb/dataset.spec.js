/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * dataset.spec - URL-builder regression tests for the Dataset API client.
 *
 * Guards the special-character contract for entry paths: file names may contain
 * '&' (the original "path not found" tile bug: dataset.tileUrl interpolated the
 * path raw into the query string, so the server saw the path truncated at the
 * ampersand), ',' (multi-path download transport), '#', '%' and spaces.
 */
import { describe, it, expect } from 'vitest';
import Dataset from './dataset';

const NASTY = 'ortho & #25%, 100%slope (field) “café” #hash?.tif';

function makeDataset() {
    const registry = { remote: 'hub.example.com', secure: true };
    return new Dataset(registry, 'my_org', 'my_ds');
}

describe('Dataset URL builders — special characters in paths', () => {
    const ds = makeDataset();
    const base = '/orgs/my_org/ds/my_ds';

    it('tileUrl percent-encodes the path query parameter (& , # % space)', () => {
        const url = ds.tileUrl('ortho & crop.tif', 12, 3, 4);
        expect(url).toBe(`${base}/tiles/12/3/4.png?path=ortho%20%26%20crop.tif`);
        // A raw '&' would truncate the path parameter server-side (the original bug).
        expect(url.indexOf('&', url.indexOf('?'))).toBe(-1);
    });

    it('tileUrl keeps retina and encodes all reserved characters', () => {
        const url = ds.tileUrl(NASTY, 1, 2, 3, { retina: true });
        expect(url).toContain('@2x.png?path=');
        expect(url.split('?path=')[1]).not.toContain('&');
        expect(url).toContain(encodeURIComponent(NASTY));
    });

    it('thumbUrl encodes path and appends size as its own parameter', () => {
        const url = ds.thumbUrl('a & b.tif', 256);
        expect(url).toBe(`${base}/thumb?path=a%20%26%20b.tif&size=256`);
    });

    it('tileExUrl encodes path and viz params', () => {
        const url = ds.tileExUrl('x & y.tif', 1, 2, 3, { bands: '1&2', colormap: 'a b' });
        expect(url).toContain(`path=${encodeURIComponent('x & y.tif')}`);
        expect(url).toContain(`bands=${encodeURIComponent('1&2')}`);
    });

    it('downloadUrl single path: encodes per path segment, keeps separators', () => {
        const url = ds.downloadUrl('folder/sub #1 & stuff.tif');
        expect(url).toBe(`${base}/download/folder/sub%20%231%20%26%20stuff.tif`);
        // Separators survive as separators, never encoded to %2F:
        expect(ds.downloadUrl('a/b/c.tif')).toBe(`${base}/download/a/b/c.tif`);
    });

    it('downloadUrl single path: inline flag is a separate query param', () => {
        const url = ds.downloadUrl('p & q.tif', { inline: true });
        expect(url).toBe(`${base}/download/p%20%26%20q.tif?inline=1`);
    });

    it('downloadUrl multi path: one repeated path= param per file, commas encoded', () => {
        const url = ds.downloadUrl(['a,one.tif', 'b & two.tif']);
        expect(url.startsWith(`${base}/download?`)).toBe(true);
        expect(url.match(/(?:^|[?&])path=/g)).toHaveLength(2);
        // Assert via the canonical parser on both sides (URLSearchParams encodes
        // spaces as '+', which servers decode back to space):
        const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
        expect(params.getAll('path')).toEqual(['a,one.tif', 'b & two.tif']);
    });

    it('downloadUrl empty/undefined paths produce a bare endpoint (no undefined segment)', () => {
        expect(ds.downloadUrl([])).toBe(`${base}/download`);
        expect(ds.downloadUrl(undefined)).toBe(`${base}/download`);
    });

    it('all builders never emit a raw & or an unescaped # and round-trip the path', () => {
        const cases = [
            { url: ds.tileUrl(NASTY, 1, 2, 3), expected: [NASTY] },
            { url: ds.thumbUrl(NASTY, 512), expected: [NASTY] },
            { url: ds.downloadUrl([NASTY, 'x.tif']), expected: [NASTY, 'x.tif'] },
            { url: ds.downloadUrl(NASTY, { inline: true }), expected: null }
        ];
        for (const { url, expected } of cases) {
            const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
            // A raw # would start a URL fragment and truncate the path server-side.
            expect(url).not.toContain('#');
            // Raw & may only appear as a KVP separator in front of a known key.
            expect(query.replace(/&(?=(path|size|inline)=)/g, '')).not.toContain('&');
            if (expected) {
                // Server-side parser must recover the exact paths.
                expect(new URLSearchParams(query).getAll('path')).toEqual(expected);
            } else {
                // Route-segment form: decode each segment and compare.
                const seg = url.slice(`${base}/download/`.length).split('?')[0];
                expect(seg.split('/').map(decodeURIComponent).join('/')).toBe(NASTY);
                expect(new URLSearchParams(query).get('inline')).toBe('1');
            }
        }
    });
});
