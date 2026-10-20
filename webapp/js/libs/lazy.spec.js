/**
 * Unit tests for libs/lazy.js
 * Run with: npx vitest run webapp/js/libs/lazy.spec.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadResources } from '@/libs/lazy';

// Elements are captured instead of being connected (the test DOM would try to fetch them)
let added;
beforeEach(() => {
    added = [];
    const capture = el => { added.push(el); return el; };
    vi.spyOn(document.body, 'appendChild').mockImplementation(capture);
    vi.spyOn(document.head, 'appendChild').mockImplementation(capture);
});

const scripts = () => added.filter(e => e.tagName === 'SCRIPT');
const links = () => added.filter(e => e.tagName === 'LINK');

describe('loadResources', () => {
    it('starts every download at once and keeps the script order', async () => {
        const done = loadResources(['/a.js', '/b.css', '/c.js']);
        expect(scripts().map(s => s.getAttribute('src'))).toEqual(['/a.js', '/c.js']);
        expect(scripts().every(s => s.async === false)).toBe(true);
        expect(links()).toHaveLength(1);

        scripts().forEach(s => s.onload());
        links()[0].onload();
        await expect(done).resolves.toEqual(['/a.js', '/b.css', '/c.js']);
    });

    it('shares a request already in flight', () => {
        loadResources('/same.js');
        loadResources('/same.js');
        expect(scripts().filter(s => s.getAttribute('src') === '/same.js')).toHaveLength(1);
    });

    it('rejects when a stylesheet fails, and allows loading it again', async () => {
        const first = loadResources('/broken.css');
        links()[0].onerror();
        await expect(first).rejects.toThrow('/broken.css');

        loadResources('/broken.css');
        expect(links()).toHaveLength(2);
    });

    it('takes the type from the path of a versioned URL', async () => {
        const done = loadResources(['/v.css?v=2.7.0', '/v.js?v=2.7.0']);
        expect(links().map(l => l.getAttribute('href'))).toEqual(['/v.css?v=2.7.0']);
        expect(scripts().map(s => s.getAttribute('src'))).toEqual(['/v.js?v=2.7.0']);
        links()[0].onload();
        scripts()[0].onload();
        await expect(done).resolves.toEqual(['/v.css?v=2.7.0', '/v.js?v=2.7.0']);
    });
});
