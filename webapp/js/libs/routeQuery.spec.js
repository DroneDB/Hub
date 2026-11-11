import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';
import {
    replaceQueryKeys, replaceHash, applyQueryUpdates, currentLocation, currentPath, readHistoryState, writeHistoryState
} from './routeQuery';

const go = url => window.history.replaceState({ current: url, back: '/before', position: 3 }, '', url);
const address = () => window.location.pathname + window.location.search + window.location.hash;

describe('replaceQueryKeys', () => {
    beforeEach(() => {
        document.title = 'Map';
        go('/r/o/d/view/abc/map');
    });

    it('adds a key to an address without a query', () => {
        replaceQueryKeys({ add: ['a', 'b'] });
        expect(address()).toBe('/r/o/d/view/abc/map?add=a&add=b');
    });

    it('keeps the other keys in their order and the hash', () => {
        go('/r/o/d/view/abc/map?z=1&add=old&a=2#ph=ndvi');
        replaceQueryKeys({ add: ['x', 'y'] });
        expect(address()).toBe('/r/o/d/view/abc/map?z=1&add=x&add=y&a=2#ph=ndvi');
    });

    it('removes a key with null or an empty array and drops a query left empty', () => {
        go('/r/o/d/view/abc/map?add=a&add=b&k=1#h');
        replaceQueryKeys({ add: null });
        expect(address()).toBe('/r/o/d/view/abc/map?k=1#h');
        go('/r/o/d/view/abc/map?add=a#h');
        replaceQueryKeys({ add: [] });
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
        replaceQueryKeys({ add: ['a'] });
        expect(window.history.state).toEqual({ current: '/r/o/d/view/abc/map?k=1&add=a#h', back: '/before', position: 3 });
        expect(document.title).toBe('Map');
        // A replacement: Back does not step through it
        expect(window.history.length).toBe(length);
    });

    it('does nothing when the address would not change', () => {
        go('/p?add=a&add=b&k=1#h');
        const before = window.history.state;
        const length = window.history.length;
        replaceQueryKeys({ add: ['a', 'b'] });
        replaceQueryKeys({ missing: null });
        expect(window.history.state).toBe(before);
        expect(window.history.length).toBe(length);
        expect(address()).toBe('/p?add=a&add=b&k=1#h');
    });

    it('encodes what needs it', () => {
        replaceQueryKeys({ q: 'a b&c' });
        expect(address()).toBe('/r/o/d/view/abc/map?q=a%20b%26c');
    });

    it('leaves an entry with no state without one, for the router made after it to fill in', () => {
        window.history.replaceState(null, '', '/p?a=1#h');
        replaceQueryKeys({ b: '2' });
        expect(address()).toBe('/p?a=1&b=2#h');
        expect(window.history.state).toBeNull();
        replaceHash('x');
        expect(address()).toBe('/p?a=1&b=2#x');
        expect(window.history.state).toBeNull();
    });
});

describe('applyQueryUpdates', () => {
    it('keeps the other keys as they were written', () => {
        expect(applyQueryUpdates('?t=a%20b&add=1', { add: ['2'] })).toBe('t=a%20b&add=2');
    });
});

describe('replaceHash', () => {
    it('sets and removes the hash, keeping the path, the query and the history state', () => {
        go('/r/o/d/view/abc/map?add=a#old');
        replaceHash('path=x&preset=ndvi');
        expect(address()).toBe('/r/o/d/view/abc/map?add=a#path=x&preset=ndvi');
        expect(window.history.state).toEqual({ current: '/r/o/d/view/abc/map?add=a#path=x&preset=ndvi', back: '/before', position: 3 });
        replaceHash('#');
        expect(address()).toBe('/r/o/d/view/abc/map?add=a');
    });
});

describe('the history entry a page keeps data in', () => {
    beforeEach(() => go('/r/o/d/views/v_1?k=1#h'));

    it('writes a value under its key and reads it back, keeping the router keys and the address', () => {
        const length = window.history.length;
        writeHistoryState('mapView', { identity: 'view:v_1', state: { v: 1 } });
        expect(readHistoryState('mapView')).toEqual({ identity: 'view:v_1', state: { v: 1 } });
        expect(window.history.state).toEqual({
            current: '/r/o/d/views/v_1?k=1#h', back: '/before', position: 3, mapView: { identity: 'view:v_1', state: { v: 1 } }
        });
        expect(address()).toBe('/r/o/d/views/v_1?k=1#h');
        expect(window.history.length).toBe(length);
    });

    it('replaces the value of its own key and leaves other keys that were written alike', () => {
        writeHistoryState('mapView', { n: 1 });
        writeHistoryState('other', 'x');
        writeHistoryState('mapView', { n: 2 });
        expect(readHistoryState('mapView')).toEqual({ n: 2 });
        expect(readHistoryState('other')).toBe('x');
    });

    it('removes the key with null or undefined, and only that key', () => {
        writeHistoryState('mapView', { n: 1 });
        writeHistoryState('other', 'x');
        writeHistoryState('mapView', undefined);
        expect(window.history.state).toEqual({ current: '/r/o/d/views/v_1?k=1#h', back: '/before', position: 3, other: 'x' });
        writeHistoryState('other', null);
        expect(window.history.state).toEqual({ current: '/r/o/d/views/v_1?k=1#h', back: '/before', position: 3 });
    });

    it('does not touch the entry when there is nothing to remove', () => {
        const before = window.history.state;
        writeHistoryState('mapView', undefined);
        expect(window.history.state).toBe(before);
    });

    it('reads undefined when the entry has no state or no such key', () => {
        window.history.replaceState(null, '');
        expect(readHistoryState('mapView')).toBeUndefined();
        writeHistoryState('mapView', { n: 1 });
        expect(readHistoryState('nothing')).toBeUndefined();
    });

    it('is kept when the address is written after it, as the viewer does on every pan', () => {
        writeHistoryState('mapView', { n: 1 });
        replaceQueryKeys({ t: '1' });
        expect(readHistoryState('mapView')).toEqual({ n: 1 });
        expect(window.history.state.current).toBe('/r/o/d/views/v_1?k=1&t=1#h');
    });
});

describe('the address as it is now', () => {
    it('reads what replaceQueryKeys and replaceHash wrote', () => {
        go('/r/o/d/view/abc/map?t=a%20b&k');
        replaceQueryKeys({ add: ['x', 'y'] });
        replaceHash('path=f.tif');
        expect(currentLocation()).toEqual({ query: { t: 'a b', k: null, add: ['x', 'y'] }, hash: '#path=f.tif' });
        expect(currentPath()).toBe('/r/o/d/view/abc/map?t=a%20b&k&add=x&add=y#path=f.tif');
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
        replaceQueryKeys({ add: ['a', 'b'] });
        replaceHash('path=f.tif');
        // The route still has the address of its last navigation
        expect(router.currentRoute.value.fullPath).toBe('/r/o/d/view/abc/map?t=1');
        await router.push(currentLocation({ preferences: 'stockpiles' }));
        expect(address()).toBe('/r/o/d/view/abc/map?t=1&add=a&add=b&preferences=stockpiles#path=f.tif');
        expect(router.currentRoute.value.query.add).toEqual(['a', 'b']);
    });

    it('comes back to the written address', async () => {
        replaceQueryKeys({ add: ['a'] });
        replaceHash('path=f.tif');
        await router.push('/other');
        router.back();
        await expect.poll(address).toBe('/r/o/d/view/abc/map?t=1&add=a#path=f.tif');
    });
});
