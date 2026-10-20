/** HQ-05: Organization builds its endpoints and reads paged results. */
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
});
