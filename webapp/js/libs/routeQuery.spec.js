import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';
import { replaceQueryKeys, replaceHash, applyQueryUpdates, currentLocation, currentPath } from './routeQuery';

const go = url => window.history.replaceState({ current: url, back: '/before', position: 3 }, '', url);
const address = () => window.location.pathname + window.location.search + window.location.hash;

describe('replaceQueryKeys', () => {
    beforeEach(() => {
        document.title = 'Map';
        go('/r/o/d/view/abc/map');
    });

    it('adds a key to an address without a query', () => {
        replaceQueryKeys({ layer: ['a', 'b'] });
        expect(address()).toBe('/r/o/d/view/abc/map?layer=a&layer=b');
    });

    it('keeps the other keys in their order and the hash', () => {
        go('/r/o/d/view/abc/map?z=1&layer=old&a=2#ph=ndvi');
        replaceQueryKeys({ layer: ['x', 'y'] });
        expect(address()).toBe('/r/o/d/view/abc/map?z=1&layer=x&layer=y&a=2#ph=ndvi');
    });

    it('removes a key with null or an empty array and drops a query left empty', () => {
        go('/r/o/d/view/abc/map?layer=a&layer=b&k=1#h');
        replaceQueryKeys({ layer: null });
        expect(address()).toBe('/r/o/d/view/abc/map?k=1#h');
        go('/r/o/d/view/abc/map?layer=a#h');
        replaceQueryKeys({ layer: [] });
        expect(address()).toBe('/r/o/d/view/abc/map#h');
    });

    it('sets a string value and several keys at once', () => {
        go('/p?a=1&b=2');
        replaceQueryKeys({ a: '9', c: 'new', b: null });
        expect(address()).toBe('/p?a=9&c=new');
    });

    it('updates the history state the router reads, keeping the rest of it, and the title', () => {
        go('/r/o/d/view/abc/map?k=1#h');
        const length = window.history.length;
        replaceQueryKeys({ layer: ['a'] });
        expect(window.history.state).toEqual({ current: '/r/o/d/view/abc/map?k=1&layer=a#h', back: '/before', position: 3 });
        expect(document.title).toBe('Map');
        // A replacement: Back does not step through it
        expect(window.history.length).toBe(length);
    });

    it('does nothing when the address would not change', () => {
        go('/p?layer=a&layer=b&k=1#h');
        const before = window.history.state;
        const length = window.history.length;
        replaceQueryKeys({ layer: ['a', 'b'] });
        replaceQueryKeys({ missing: null });
        expect(window.history.state).toBe(before);
        expect(window.history.length).toBe(length);
        expect(address()).toBe('/p?layer=a&layer=b&k=1#h');
    });

    it('encodes what needs it', () => {
        replaceQueryKeys({ q: 'a b&c' });
        expect(address()).toBe('/r/o/d/view/abc/map?q=a%20b%26c');
    });
});

describe('applyQueryUpdates', () => {
    it('keeps the other keys as they were written', () => {
        expect(applyQueryUpdates('?t=a%20b&layer=1', { layer: ['2'] })).toBe('t=a%20b&layer=2');
    });
});

describe('replaceHash', () => {
    it('sets and removes the hash, keeping the path, the query and the history state', () => {
        go('/r/o/d/view/abc/map?layer=a#old');
        replaceHash('path=x&preset=ndvi');
        expect(address()).toBe('/r/o/d/view/abc/map?layer=a#path=x&preset=ndvi');
        expect(window.history.state).toEqual({ current: '/r/o/d/view/abc/map?layer=a#path=x&preset=ndvi', back: '/before', position: 3 });
        replaceHash('#');
        expect(address()).toBe('/r/o/d/view/abc/map?layer=a');
    });
});

describe('the address as it is now', () => {
    it('reads what replaceQueryKeys and replaceHash wrote', () => {
        go('/r/o/d/view/abc/map?t=a%20b&k');
        replaceQueryKeys({ layer: ['x', 'y'] });
        replaceHash('path=f.tif');
        expect(currentLocation()).toEqual({ query: { t: 'a b', k: null, layer: ['x', 'y'] }, hash: '#path=f.tif' });
        expect(currentPath()).toBe('/r/o/d/view/abc/map?t=a%20b&k&layer=x&layer=y#path=f.tif');
    });

    it('applies updates to the query without writing them', () => {
        go('/p?a=1&preferences=units&b=2#h');
        expect(currentLocation({ preferences: null, c: '3' })).toEqual({ query: { a: '1', b: '2', c: '3' }, hash: '#h' });
        expect(address()).toBe('/p?a=1&preferences=units&b=2#h');
    });
});

describe('a router navigation after a write without one', () => {
    let router;
    beforeEach(async () => {
        go('/');
        router = createRouter({
            history: createWebHistory(),
            routes: [
                { path: '/r/:org/:ds/view/:path/map', component: { render: () => null } },
                { path: '/:any(.*)*', component: { render: () => null } }
            ]
        });
        await router.push('/r/o/d/view/abc/map?t=1');
    });
    afterEach(() => router.options.history.destroy());

    it('keeps the written query and hash when it starts from the address as it is now', async () => {
        replaceQueryKeys({ layer: ['a', 'b'] });
        replaceHash('path=f.tif');
        // The route still has the address of its last navigation
        expect(router.currentRoute.value.fullPath).toBe('/r/o/d/view/abc/map?t=1');
        await router.push(currentLocation({ preferences: 'stockpiles' }));
        expect(address()).toBe('/r/o/d/view/abc/map?t=1&layer=a&layer=b&preferences=stockpiles#path=f.tif');
        expect(router.currentRoute.value.query.layer).toEqual(['a', 'b']);
    });

    it('comes back to the written address', async () => {
        replaceQueryKeys({ layer: ['a'] });
        replaceHash('path=f.tif');
        await router.push('/other');
        router.back();
        await expect.poll(address).toBe('/r/o/d/view/abc/map?t=1&layer=a#path=f.tif');
    });
});
