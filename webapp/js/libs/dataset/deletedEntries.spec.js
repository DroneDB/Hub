/** The deleteEntries event names its dataset with its paths; a bare list of paths still gives them. */
import { describe, it, expect } from 'vitest';
import { deletedEntriesEvent, deletedPathsOf, deletedDatasetOf } from './deletedEntries';

describe('the deleteEntries event', () => {
    it('names the slugs of the dataset and the paths, and keeps no reference to the list it was given', () => {
        const paths = ['a.jpg', 'photos'];
        const event = deletedEntriesEvent({ org: 'acme', ds: 'site', baseApi: '/orgs/acme/ds/site' }, paths);
        paths.push('later.jpg');
        expect(event).toEqual({ dataset: { org: 'acme', ds: 'site' }, paths: ['a.jpg', 'photos'] });
        expect(deletedPathsOf(event)).toEqual(['a.jpg', 'photos']);
        expect(deletedDatasetOf(event)).toEqual({ org: 'acme', ds: 'site' });
    });

    it('reads a bare list of paths as its paths, with no dataset', () => {
        expect(deletedPathsOf(['a.jpg'])).toEqual(['a.jpg']);
        expect(deletedDatasetOf(['a.jpg'])).toBeNull();
    });

    it('gives no paths and no dataset for anything else', () => {
        for (const event of [undefined, null, 'a.jpg', {}, { paths: 'a.jpg' }]) {
            expect(deletedPathsOf(event)).toEqual([]);
            expect(deletedDatasetOf(event)).toBeNull();
        }
        expect(deletedDatasetOf({ dataset: { org: 'acme' }, paths: ['a.jpg'] })).toBeNull();
    });
});
