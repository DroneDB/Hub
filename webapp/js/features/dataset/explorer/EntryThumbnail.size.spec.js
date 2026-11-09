/**
 * The tile follows the size the user chooses (FR-EXP-43): the box of the thumbnail grows with the `size` prop (it was fixed
 * when the tile was created), and a thumbnail on show is requested again at the step of the new size
 * (thumbnailRequestSize: 192 CSS px is 256 at ratio 1, so S to M loads another bitmap, M to L does not).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { thumbs, entry as ddbEntry } from 'ddb';
import { createThumbnailQueue } from '@/libs/thumbnailQueue';

const EntryThumbnail = (await import('./EntryThumbnail.vue')).default;

const file = {
    label: 'a.jpg', path: 'ddb://hub.test/acme/site/a.jpg', icon: 'fa-solid fa-image', selected: false,
    entry: { path: 'a.jpg', type: ddbEntry.type.GEOIMAGE, hash: 'h' }
};
const mountTile = size => mount(EntryThumbnail, { props: { file, size, dataset: { org: 'acme', ds: 'site' } } });
const requested = () => thumbs.fetch.mock.calls.map(c => c[1]);

beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 1);
    vi.spyOn(thumbs, 'fetch').mockImplementation((uri, size) => `/orgs/acme/ds/site/thumb?size=${size}`);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('EntryThumbnail size (FR-EXP-43)', () => {
    it('draws its box and its icon at the size, in rem', () => {
        const w = mountTile(192);
        expect(w.find('.container').attributes('style')).toContain('width: 12rem');
        expect(w.find('.container').attributes('style')).toContain('height: 12rem');
        expect(w.find('.thumbnail').attributes('style')).toContain('max-width: 12rem');
        w.unmount();
    });

    it('follows a new size, the box as well', async () => {
        const w = mountTile(128);
        expect(w.find('.container').attributes('style')).toContain('width: 8rem');
        await w.setProps({ size: 256 });
        expect(w.find('.container').attributes('style')).toContain('width: 16rem');
        expect(w.find('.container').attributes('style')).toContain('height: 16rem');
        w.unmount();
    });

    it('requests the thumbnail again when the size needs another step: S 128 px to M 192 CSS px is 128 then 256', async () => {
        const w = mountTile(128);
        await flushPromises();
        expect(requested()).toEqual([128]);
        await w.setProps({ size: 192 });
        await flushPromises();
        expect(requested()).toEqual([128, 256]);
        expect(w.find('img').attributes('src')).toBe('/orgs/acme/ds/site/thumb?size=256');
        w.unmount();
    });

    it('keeps the bitmap when the step is the same: M to L is 256 px for both', async () => {
        const w = mountTile(192);
        await flushPromises();
        await w.setProps({ size: 256 });
        await flushPromises();
        expect(requested()).toEqual([256]);
        w.unmount();
    });

    it('asks for twice the pixels on a 2x screen: L is 512 px', async () => {
        vi.stubGlobal('devicePixelRatio', 2);
        const w = mountTile(256);
        await flushPromises();
        expect(requested()).toEqual([512]);
        w.unmount();
    });
});

/**
 * In the Explorer a tile loads when it is in view and when the queue gives it a turn: the URL takes the size of the
 * moment the request starts, only tiles in view load again at a new size (the others when they come into view), and a
 * thumbnail shown stays on show, without a spinner, until the new one is there.
 */
describe('EntryThumbnail size in the Explorer queue (FR-EXP-43)', () => {
    const S = '/orgs/acme/ds/site/thumb?size=128';
    const L = '/orgs/acme/ds/site/thumb?size=256';

    // The visibility tracker of the Explorer, driven by the test; the real queue, one load at a time
    function loader() {
        const seen = new Map();
        return {
            queue: createThumbnailQueue({ concurrency: 1 }),
            visibility: { observe: (el, cb) => seen.set(el, cb), unobserve: el => seen.delete(el) },
            show: async (w, visible = true) => { seen.get(w.vm.$el)(visible); await flushPromises(); }
        };
    }
    const mountLazy = (thumbnailLoader, name = 'a.jpg') => mount(EntryThumbnail, {
        props: { file: { ...file, label: name, path: `ddb://hub.test/acme/site/${name}` }, size: 128, lazyLoad: true, dataset: { org: 'acme', ds: 'site' } },
        global: { provide: { thumbnailLoader } }
    });
    const src = w => w.find('img').exists() ? w.find('img').attributes('src') : null;
    const spinner = w => w.find('i.loading').exists();

    it('asks at the size of the moment its turn comes: queued at S, its turn after the change to L, it loads L', async () => {
        const l = loader();
        const busy = l.queue.enqueue(() => {}); // the one slot is taken
        const w = mountLazy(l);
        await l.show(w);
        expect(spinner(w)).toBe(true);
        expect(src(w)).toBe(null);

        await w.setProps({ size: 256 });
        busy.release();
        await flushPromises();
        expect(src(w)).toBe(L);
        expect(requested()).toEqual([256]);
        w.unmount();
    });

    it('gives its turn back when a build starts while its image loads or waits (the image is no longer shown)', async () => {
        const l = loader();
        const w = mountLazy(l);
        await l.show(w);
        expect(l.queue.running).toBe(1);
        w.vm.onBuildStarted({ dataset: w.props('dataset'), filePath: 'a.jpg' });
        await flushPromises();
        expect(l.queue.running).toBe(0);

        const busy = l.queue.enqueue(() => {});
        const v = mountLazy(l, 'b.jpg');
        await l.show(v);
        v.vm.onBuildStarted({ dataset: v.props('dataset'), filePath: 'a.jpg' });
        busy.release();
        await flushPromises();
        expect(l.queue.running).toBe(0);
        expect(src(v)).toBe(null);
        w.unmount();
        v.unmount();
    });

    it('a tile whose image is loading when the size changes ends with the L image', async () => {
        const l = loader();
        const w = mountLazy(l);
        await l.show(w);
        expect(src(w)).toBe(S); // its turn came, the image is loading (no load event yet)
        expect(l.queue.running).toBe(1);

        await w.setProps({ size: 256 });
        await flushPromises();
        expect(src(w)).toBe(L);
        // The image of before ending late gives no slot away: the L request holds it until it ends
        expect(l.queue.running).toBe(1);
        await w.find('img').trigger('load');
        expect(l.queue.running).toBe(0);
        w.unmount();
    });

    it('keeps the thumbnail shown, without a spinner, until its turn to load at the new size', async () => {
        const l = loader();
        const w = mountLazy(l);
        await l.show(w);
        await w.find('img').trigger('load');
        const busy = l.queue.enqueue(() => {}); // another tile loads meanwhile

        await w.setProps({ size: 256 });
        await flushPromises();
        expect(src(w)).toBe(S);
        expect(spinner(w)).toBe(false);

        busy.release();
        await flushPromises();
        expect(src(w)).toBe(L);
        expect(spinner(w)).toBe(false);
        w.unmount();
    });

    it('a request again that waits for its turn takes the size of when the turn comes: S, M, back to S loads nothing', async () => {
        const l = loader();
        const w = mountLazy(l);
        await l.show(w);
        await w.find('img').trigger('load');
        const busy = l.queue.enqueue(() => {});

        await w.setProps({ size: 192 });
        await flushPromises();
        await w.setProps({ size: 128 });
        await flushPromises();
        busy.release();
        await flushPromises();
        expect(src(w)).toBe(S);
        // Nothing to load: the slot is free for the next tile
        expect(l.queue.running).toBe(0);
        w.unmount();
    });

    it('loads again only the tiles in view; a tile out of view loads at the new size when it comes into view', async () => {
        const l = loader();
        const onScreen = mountLazy(l, 'a.jpg');
        const offScreen = mountLazy(l, 'b.jpg');
        await l.show(onScreen);
        await onScreen.find('img').trigger('load');
        await l.show(offScreen);
        await offScreen.find('img').trigger('load');
        await l.show(offScreen, false);
        expect(requested()).toEqual([128, 128]);

        await onScreen.setProps({ size: 256 });
        await offScreen.setProps({ size: 256 });
        await flushPromises();
        expect(thumbs.fetch.mock.calls.map(c => [c[0], c[1]])).toEqual([
            ['ddb://hub.test/acme/site/a.jpg', 128], ['ddb://hub.test/acme/site/b.jpg', 128], ['ddb://hub.test/acme/site/a.jpg', 256]
        ]);
        expect(src(offScreen)).toBe(S);

        await onScreen.find('img').trigger('load');
        await l.show(offScreen);
        expect(thumbs.fetch.mock.calls.at(-1)).toEqual(['ddb://hub.test/acme/site/b.jpg', 256, 'h']);
        expect(src(offScreen)).toBe(L);
        onScreen.unmount();
        offScreen.unmount();
    });
});
