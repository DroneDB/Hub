/**
 * Unit tests for libs/potree/potreeResources.js
 */
import { describe, it, expect } from 'vitest';
import { POTREE_RESOURCES, POTREE_BASE, versioned, fixPotreePaths } from './potreeResources';

describe('potreeResources', () => {
    it('puts the Hub version in every URL, keeping the order', () => {
        const urls = versioned(POTREE_RESOURCES, '2.7.0');
        expect(urls).toHaveLength(POTREE_RESOURCES.length);
        expect(urls[0]).toBe(POTREE_RESOURCES[0] + '?v=2.7.0');
        expect(urls.every(u => u.endsWith('?v=2.7.0'))).toBe(true);
        expect(versioned(['/a.js'], null)).toEqual(['/a.js']);
    });

    it('sets the paths Potree derives from a versioned script URL to its folder', () => {
        // what `new URL(src + '/..')` gives for `.../potree.js?v=2.7.0`
        const potree = { scriptPath: 'http://hub.test/potree/build/potree/potree.js?v=2.7.0/..', resourcePath: 'x' };
        fixPotreePaths(potree, 'http://hub.test');
        expect(potree.scriptPath).toBe('http://hub.test' + POTREE_BASE);
        expect(potree.resourcePath).toBe('http://hub.test' + POTREE_BASE + '/resources');
    });
});
