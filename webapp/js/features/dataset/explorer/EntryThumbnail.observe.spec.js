/**
 * The Explorer loads a tile's thumbnail when the tile comes into view (FR-EXP-43): it observes the tile's element. The
 * comments before the root element of the template make the component a fragment in a development build (and in the
 * tests), where this.$el is a text node and IntersectionObserver.observe() throws, which broke the dataset page; the
 * tile is observed by its template ref, an element, and the same element is unobserved when it goes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { thumbs, entry as ddbEntry } from 'ddb';
import { createThumbnailQueue } from '@/libs/thumbnailQueue';

const EntryThumbnail = (await import('./EntryThumbnail.vue')).default;

const file = {
    label: 'a.jpg', path: 'ddb://hub.test/acme/site/a.jpg', icon: 'fa-solid fa-image', selected: false,
    entry: { path: 'a.jpg', type: ddbEntry.type.GEOIMAGE, hash: 'h' }
};

afterEach(() => vi.restoreAllMocks());

describe('EntryThumbnail in view (FR-EXP-43)', () => {
    it('observes the tile element, which an IntersectionObserver accepts, and unobserves it when unmounted', () => {
        vi.spyOn(thumbs, 'fetch').mockImplementation((uri, size) => `/thumb?size=${size}`);
        const observed = [];
        const unobserved = [];
        // As IntersectionObserver.observe does: anything but an Element is a TypeError
        const observe = el => {
            if (!(el instanceof Element)) throw new TypeError("Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.");
            observed.push(el);
        };
        const thumbnailLoader = {
            queue: createThumbnailQueue({ concurrency: 1 }),
            visibility: { observe, unobserve: el => unobserved.push(el) }
        };
        const w = mount(EntryThumbnail, {
            props: { file, size: 128, lazyLoad: true, dataset: { org: 'acme', ds: 'site', getTasks: async () => [] } },
            global: { provide: { thumbnailLoader } }
        });
        const tile = w.find('.thumbnail').element;
        expect(observed).toEqual([tile]);
        w.unmount();
        expect(unobserved).toEqual([tile]);
    });
});
