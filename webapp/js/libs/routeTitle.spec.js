import { describe, it, expect } from 'vitest';
import { navigationTitle } from './routeTitle';

const route = (path, extra = {}) => ({ path, matched: [{}], meta: { title: 'Map' }, ...extra });
const start = { path: '/', matched: [], meta: {} };

describe('navigationTitle', () => {
    it('gives the route title on the first navigation', () => {
        expect(navigationTitle(route('/r/a/b/view/x/map'), start)).toBe('Map');
        expect(navigationTitle(route('/r/a/b/view/x/map'), undefined)).toBe('Map');
    });

    it('gives the route title when the path changes', () => {
        expect(navigationTitle(route('/r/a/b/view/y/map'), route('/r/a/b/view/x/map'))).toBe('Map');
        expect(navigationTitle(route('/r/a/b', { meta: { title: 'View Dataset' } }), route('/r/a/b/view/x/map'))).toBe('View Dataset');
    });

    it('gives the route title when only the params change (a different path)', () => {
        const from = route('/r/a/b', { params: { org: 'a', ds: 'b' } });
        const to = route('/r/a/c', { params: { org: 'a', ds: 'c' } });
        expect(navigationTitle(to, from)).toBe('Map');
    });

    it('keeps the title of the view when only the query changes', () => {
        const from = route('/r/a/b/view/x/map', { query: {} });
        const to = route('/r/a/b/view/x/map', { query: { preferences: 'units' } });
        expect(navigationTitle(to, from)).toBeNull();
    });

    it('keeps the title of the view when only the hash changes', () => {
        const from = route('/r/a/b/view/x/map', { hash: '' });
        const to = route('/r/a/b/view/x/map', { hash: '#pos' });
        expect(navigationTitle(to, from)).toBeNull();
    });

    it('gives nothing for a route without a title', () => {
        expect(navigationTitle({ path: '/x', matched: [{}], meta: {} }, start)).toBeNull();
    });
});
