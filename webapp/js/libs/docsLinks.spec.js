/**
 * Links to the documentation are built in one place, so a page that moves in the docs is
 * changed once: no other source file writes the docs address.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DOCS, DOCS_BASE_URL, docsUrl } from './docsLinks';

const JS = path.resolve(__dirname, '..');
const sources = [];
const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|vue)$/.test(entry.name) && !entry.name.endsWith('.spec.js')) sources.push(full);
    }
};
walk(JS);

describe('docs links', () => {
    it('builds a page URL, with a heading when one is given', () => {
        expect(docsUrl('reference/formats')).toBe(`${DOCS_BASE_URL}/reference/formats`);
        expect(docsUrl('reference/formats', 'rasters')).toBe(`${DOCS_BASE_URL}/reference/formats#rasters`);
    });

    it('names the pages of the windows that link to the docs', () => {
        expect(DOCS.alignRaster).toBe('https://docs.dronedb.app/docs/hub-guide/processing/align-raster');
        expect(DOCS.maskBorders).toBe('https://docs.dronedb.app/docs/hub-guide/processing/mask-borders');
        expect(DOCS.largeUploads).toBe('https://docs.dronedb.app/docs/self-hosting/troubleshooting#tuning-the-reverse-proxy-for-large-uploads');
    });

    it('is the only source file that writes the docs address', () => {
        const writers = sources.filter(file => fs.readFileSync(file, 'utf8').includes('docs.dronedb.app'))
            .map(file => path.relative(JS, file));
        expect(writers).toEqual([path.join('libs', 'docsLinks.js')]);
    });
});
