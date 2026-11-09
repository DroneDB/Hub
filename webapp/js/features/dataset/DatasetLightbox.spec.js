/**
 * The dataset page's lightbox: a photo opens the zoom viewer on the photos of the folder, at the
 * clicked one, with prev/next and an Information panel that follows the photo; a video opens the
 * video lightbox with the dataset (for its Download); other entries are not supported.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import DatasetLightbox from './DatasetLightbox.vue';

const dataset = {
    thumbUrl: vi.fn((path, size) => `/thumb/${path}?size=${size}`),
    downloadUrl: vi.fn((path, options) => `/download/${path}${options?.inline ? '?inline=1' : ''}`),
    downloadWithCheck: vi.fn(() => Promise.resolve())
};

const file = (name, type, properties = {}) => ({
    path: `ddb://localhost/org/ds/photos/${name}`,
    entry: { type, path: `photos/${name}`, size: 10, properties }
});
const IMAGE = 6;
const GEOIMAGE = 3;
const VIDEO = 9;
const PLAIN = 1;

const files = [
    file('a.jpg', IMAGE, { width: 6000, height: 4000, make: 'DJI' }),
    file('notes.txt', PLAIN),
    file('clip.mp4', VIDEO),
    file('b.jpg', GEOIMAGE, { width: 6000, height: 4000, make: 'Parrot' }),
    file('c.jpg', IMAGE, { width: 6000, height: 4000, make: 'Autel' })
];

const mounted = [];
function mountLightbox() {
    const w = mount(DatasetLightbox, { props: { dataset }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    mounted.push(w);
    return w;
}
const q = sel => document.querySelector(sel);
// The viewers are lazy components. Their first import transforms the SFCs and their dependencies,
// which can take seconds when the whole suite runs in parallel: load them once, up front, with a
// generous hook timeout, so that the tests only wait for the (then cached) async component to render.
beforeAll(async () => {
    await Promise.all([import('./PhotoLightbox.vue'), import('./VideoLightbox.vue')]);
}, 60000);
const shown = sel => vi.waitFor(() => expect(q(sel)).not.toBeNull(), { timeout: 5000, interval: 10 });

afterEach(() => {
    mounted.splice(0).forEach(w => w.unmount());
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('DatasetLightbox', () => {
    it('supports photos and videos only', () => {
        const w = mountLightbox();
        expect(w.vm.supports(files[0].entry)).toBe(true);
        expect(w.vm.supports(files[3].entry)).toBe(true);
        expect(w.vm.supports(files[2].entry)).toBe(true);
        expect(w.vm.supports(files[1].entry)).toBe(false);
    });

    it('shows nothing until something is opened', async () => {
        mountLightbox();
        await flushPromises();
        expect(q('[role="dialog"]')).toBeNull();
    });

    it('opens a photo in the zoom viewer, with the photos of the folder and not its other files', async () => {
        const w = mountLightbox();
        w.vm.open(files[3], files);
        await shown('.photo-lightbox-overlay');
        expect(q('.photo-lightbox-overlay')).not.toBeNull();
        expect(q('.photo-lightbox-name').textContent).toBe('b.jpg');
        // b.jpg is the second photo of three (the text file and the video are not photos)
        expect(q('.photo-lightbox-count').textContent).toBe('2 / 3');
        expect(q('.photo-lightbox-image').getAttribute('src')).toMatch(/^\/thumb\/photos\/b\.jpg\?size=\d+$/);
    });

    it('goes to the next photo and the Information panel follows it', async () => {
        const w = mountLightbox();
        w.vm.open(files[0], files);
        await shown('.photo-lightbox-overlay');
        q('[aria-label="Information"]').click();
        await flushPromises();
        expect(q('.photo-lightbox-info').textContent).toContain('DJI');
        q('[aria-label="Next photo"]').click();
        await flushPromises();
        expect(q('.photo-lightbox-name').textContent).toBe('b.jpg');
        expect(q('.photo-lightbox-info').textContent).toContain('Parrot');
        q('[aria-label="Previous photo"]').click();
        await flushPromises();
        q('[aria-label="Previous photo"]').click();
        await flushPromises();
        // around the start: the last photo
        expect(q('.photo-lightbox-name').textContent).toBe('c.jpg');
        expect(q('.photo-lightbox-info').textContent).toContain('Autel');
    });

    it('closes the viewer', async () => {
        const w = mountLightbox();
        w.vm.open(files[0], files);
        await shown('.photo-lightbox-overlay');
        q('[aria-label="Close"]').click();
        await flushPromises();
        expect(q('.photo-lightbox-overlay')).toBeNull();
    });

    it('opens a video in the video lightbox, with the dataset path and the inline URL', async () => {
        const w = mountLightbox();
        w.vm.open(files[2], files);
        await shown('.video-lightbox-overlay');
        expect(q('.photo-lightbox-overlay')).toBeNull();
        expect(q('.video-lightbox-overlay')).not.toBeNull();
        expect(q('video').getAttribute('src')).toBe('/download/photos/clip.mp4?inline=1');
        expect(q('.video-lightbox-name').textContent).toBe('clip.mp4');
    });

    it('offers the Download of the video when it cannot play it', async () => {
        const w = mountLightbox();
        w.vm.open(files[2], files);
        await shown('.video-lightbox-overlay');
        q('video').dispatchEvent(new Event('error'));
        await flushPromises();
        q('.video-lightbox-download').click();
        await flushPromises();
        expect(dataset.downloadWithCheck).toHaveBeenCalledWith(['photos/clip.mp4']);
    });

    it('does nothing for a folder without photos', async () => {
        const w = mountLightbox();
        w.vm.open(files[1], [files[1]]);
        await flushPromises();
        expect(q('[role="dialog"]')).toBeNull();
    });
});
