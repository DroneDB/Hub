/** Organization builds its endpoints and reads paged results. */
import { describe, it, expect, vi } from 'vitest';
import Organization from './organization';

describe('Organization', () => {
    it('builds the dataset list URL from the query', () => {
        const org = new Organization({}, 'acme');
        expect(org.datasetsUrl()).toBe('/orgs/acme/ds');
        expect(org.datasetsUrl({ skip: 20, take: 10, q: 'roof', sort: 'name', desc: true, includeThumbnailCheck: true }))
            .toBe('/orgs/acme/ds?includeThumbnailCheck=true&skip=20&take=10&q=roof&sort=name&desc=true');
    });

    it('takes the total from X-Total-Count, else from the items', async () => {
        const headers = new Headers({ 'X-Total-Count': '42' });
        const registry = { getRequest: vi.fn(async (url, o) => { o.onHeaders(headers); return [1, 2]; }) };
        expect(await new Organization(registry, 'a').datasetsPage({ skip: 0, take: 2 })).toEqual({ items: [1, 2], total: 42 });

        const bare = { getRequest: vi.fn(async (url, o) => { o.onHeaders(new Headers()); return [1, 2, 3]; }) };
        expect(await new Organization(bare, 'a').datasetsPage({ skip: 0, take: 3 })).toEqual({ items: [1, 2, 3], total: 3 });
    });

    it('reads the locations of the datasets without caching, and passes the signal on', async () => {
        const locations = [{ slug: 'a', name: 'A', bbox: [1, 2, 3, 4] }, { slug: 'b', name: null, bbox: null }];
        const registry = { getRequest: vi.fn(async () => locations) };
        const signal = new AbortController().signal;
        expect(await new Organization(registry, 'acme').datasetLocations({ signal })).toEqual(locations);
        expect(registry.getRequest).toHaveBeenCalledWith('/orgs/acme/locations', { cache: false, signal });
    });

    it('takes an answer that is not a list for no locations, and lets a failure through', async () => {
        expect(await new Organization({ getRequest: async () => null }, 'a').datasetLocations()).toEqual([]);
        const failing = { getRequest: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); } };
        await expect(new Organization(failing, 'a').datasetLocations()).rejects.toMatchObject({ status: 403 });
    });
});
