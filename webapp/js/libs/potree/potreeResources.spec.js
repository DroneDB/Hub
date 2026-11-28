/**
 * Unit tests for libs/potree/potreeResources.js
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { POTREE_RESOURCES, POTREE_BASE, POTREE_FILES_DIGEST, versioned, potreeVersion, fixPotreePaths } from './potreeResources';

/** The digest of the files of POTREE_RESOURCES as they are in public/, whatever the line ends of the checkout. */
function digestOfShippedFiles() {
    const hash = createHash('sha256');
    for (const url of POTREE_RESOURCES) {
        const text = fs.readFileSync(path.resolve(__dirname, '../../../public', `.${url}`), 'utf8').replace(/\r\n/g, '\n');
        hash.update(`${url}\0${text}\0`);
    }
    return hash.digest('hex').slice(0, 12);
}

describe('potreeResources', () => {
    it('puts the Hub version in every URL, keeping the order', () => {
        const urls = versioned(POTREE_RESOURCES, '2.7.0');
        expect(urls).toHaveLength(POTREE_RESOURCES.length);
        expect(urls[0]).toBe(POTREE_RESOURCES[0] + '?v=2.7.0');
        expect(urls.every(u => u.endsWith('?v=2.7.0'))).toBe(true);
        expect(versioned(['/a.js'], null)).toEqual(['/a.js']);
    });

    it('names the files it ships in its URLs: a file of Potree changed with no new Hub version is fetched again', () => {
        // The Registry serves a versioned URL as immutable for a year: a changed file needs a changed URL. If this fails, a
        // file of Potree changed: set POTREE_FILES_DIGEST in potreeResources.js to the digest below.
        expect(POTREE_FILES_DIGEST).toBe(digestOfShippedFiles());
        expect(potreeVersion('3.0.0')).toBe(`3.0.0-${POTREE_FILES_DIGEST}`);
        expect(versioned(['/a.js'], potreeVersion('3.0.0'))).toEqual([`/a.js?v=3.0.0-${POTREE_FILES_DIGEST}`]);
    });

    it('has no version without a Hub version, as in a development build', () => {
        expect(potreeVersion(null)).toBeNull();
        expect(potreeVersion('')).toBe('');
        expect(versioned(['/a.js'], potreeVersion(null))).toEqual(['/a.js']);
    });

    it('sets the paths Potree derives from a versioned script URL to its folder', () => {
        // what `new URL(src + '/..')` gives for `.../potree.js?v=2.7.0`
        const potree = { scriptPath: 'http://hub.test/potree/build/potree/potree.js?v=2.7.0/..', resourcePath: 'x' };
        fixPotreePaths(potree, 'http://hub.test');
        expect(potree.scriptPath).toBe('http://hub.test' + POTREE_BASE);
        expect(potree.resourcePath).toBe('http://hub.test' + POTREE_BASE + '/resources');
    });
});
