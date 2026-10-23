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
import { describe, it, expect, vi } from 'vitest';
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
        expect(url).toBe(`${base}/tiles/12/3/4.webp?path=ortho%20%26%20crop.tif`);
        // A raw '&' would truncate the path parameter server-side (the original bug).
        expect(url.indexOf('&', url.indexOf('?'))).toBe(-1);
    });

    it('tileUrl keeps retina and encodes all reserved characters', () => {
        const url = ds.tileUrl(NASTY, 1, 2, 3, { retina: true });
        expect(url).toContain('@2x.webp?path=');
        expect(url.split('?path=')[1]).not.toContain('&');
        expect(url).toContain(encodeURIComponent(NASTY));
    });

    it('thumbUrl encodes path and appends size as its own parameter', () => {
        const url = ds.thumbUrl('a & b.tif', 256);
        expect(url).toBe(`${base}/thumb?path=a%20%26%20b.tif&size=256`);
    });

    it('tileUrl and thumbUrl append the entry hash as v when given (REG-03)', () => {
        expect(ds.tileUrl('o.tif', 1, 2, 3, { retina: true, hash: 'abc' }))
            .toBe(`${base}/tiles/1/2/3@2x.webp?path=o.tif&v=abc`);
        expect(ds.thumbUrl('o.tif', 256, 'abc')).toBe(`${base}/thumb?path=o.tif&size=256&v=abc`);
        expect(ds.thumbUrl('o.tif', undefined, 'abc')).toBe(`${base}/thumb?path=o.tif&v=abc`);
        // Without a hash the URLs are unchanged.
        expect(ds.tileUrl('o.tif', 1, 2, 3)).toBe(`${base}/tiles/1/2/3.webp?path=o.tif`);
        expect(ds.thumbUrl('o.tif', 256)).toBe(`${base}/thumb?path=o.tif&size=256`);
    });

    // The extension chooses the format the server sends (WebP is the smaller one, PNG the universal one)
    it('tileUrl asks for WebP unless a format is given', () => {
        expect(ds.tileUrl('o.tif', 1, 2, 3)).toContain('/3.webp?');
        expect(ds.tileUrl('o.tif', 1, 2, 3, { format: 'png' })).toBe(`${base}/tiles/1/2/3.png?path=o.tif`);
        expect(ds.tileUrl('o.tif', 1, 2, 3, { format: 'jpg', retina: true })).toContain('/3@2x.jpg?');
        expect(ds.tileExUrl('o.tif', 1, 2, 3, {})).toContain('/tiles-ex/1/2/3.webp?');
        expect(ds.tileExUrl('o.tif', 1, 2, 3, {}, { format: 'png' })).toContain('/3.png?');
    });

    it('tileUrl keeps the {z}/{x}/{y} placeholders of a tile source template', () => {
        expect(ds.tileUrl('o.tif', '{z}', '{x}', '{y}', { hash: 'abc' }))
            .toBe(`${base}/tiles/{z}/{x}/{y}.webp?path=o.tif&v=abc`);
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

describe('Dataset.checkDownloadSlot — error message of a refused download', () => {
    function datasetAnswering(status, contentType, body) {
        const response = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
        const registry = { remote: 'hub.example.com', secure: true, fetchRaw: vi.fn(async () => response) };
        return new Dataset(registry, 'my_org', 'my_ds');
    }

    it('reads a ProblemDetails body (application/problem+json)', async () => {
        const ds = datasetAnswering(429, 'application/problem+json', { title: 'Too Many Requests', status: 429, detail: 'Too many downloads in progress' });
        await expect(ds.checkDownloadSlot('/x')).rejects.toMatchObject({ message: 'Too many downloads in progress', status: 429 });
    });

    it('still reads the legacy { error } body', async () => {
        const ds = datasetAnswering(429, 'application/json; charset=utf-8', { error: 'Busy' });
        await expect(ds.checkDownloadSlot('/x')).rejects.toMatchObject({ message: 'Busy', status: 429 });
    });
});
