/**
 * The video lightbox is an overlay of the overlay stack (FR-VWR-30): the focus moves into it
 * when it is mounted visible, Tab stays inside, Escape closes it, and the focus goes back to
 * the opener.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import VideoLightbox from './VideoLightbox.vue';
import { DOWNLOAD_LIMIT_MESSAGE } from '@/libs/constants';
import fs from 'node:fs';
import path from 'node:path';

const notifyError = vi.hoisted(() => vi.fn());
vi.mock('@/libs/notify', async importOriginal => {
    const original = await importOriginal();
    return { ...original, notify: { ...original.notify, error: notifyError } };
});

const mounted = [];
async function open(props = {}) {
    const w = mount(VideoLightbox, {
        props: { visible: true, src: '/video.mp4', entry: { path: 'flights/house.mp4' }, ...props },
        attachTo: document.body, global: { plugins: [PrimeVue] }
    });
    mounted.push(w);
    await flushPromises();
    return w;
}
const dataset = { downloadWithCheck: vi.fn(() => Promise.resolve()) };
// A <video> that fails with a MediaError code (MEDIA_ERR_NETWORK 2, MEDIA_ERR_SRC_NOT_SUPPORTED 4)
async function fail(w, code) {
    const video = document.querySelector('video');
    Object.defineProperty(video, 'error', { value: code ? { code } : null, configurable: true });
    video.dispatchEvent(new Event('error'));
    await flushPromises();
    return video;
}
const overlay = () => document.querySelector('.video-lightbox-overlay');

afterEach(() => {
    mounted.splice(0).forEach(w => w.unmount());
    document.body.innerHTML = '';
});

describe('VideoLightbox', () => {
    it('moves the focus to its Close button when it is mounted visible', async () => {
        await open();
        expect(overlay().contains(document.activeElement)).toBe(true);
        expect(document.activeElement.getAttribute('aria-label')).toBe('Close');
    });

    it('traps Tab inside: the focus trap wraps the overlay', async () => {
        await open();
        const sentinels = overlay().querySelectorAll('[data-p-hidden-focusable="true"]');
        expect(sentinels).toHaveLength(2);
        expect(overlay().firstElementChild).toBe(sentinels[0]);
        expect(overlay().lastElementChild).toBe(sentinels[1]);
    });

    it('closes on Escape and gives the focus back to the opener', async () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const w = await open();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(w.emitted('close')).toHaveLength(1);
        await w.setProps({ visible: false });
        expect(document.activeElement).toBe(opener);
    });

    it('does not react to Escape while hidden', async () => {
        const w = await open({ visible: false });
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(w.emitted('close')).toBeUndefined();
    });

    describe('when the video fails (FR-VWR-32)', () => {
        it('hides the player so that the message does not cover its controls', async () => {
            const w = await open();
            const video = await fail(w, 4);
            expect(video.style.display).toBe('none');
            const box = document.querySelector('.video-lightbox-error');
            expect(box).not.toBeNull();
            expect(box.contains(video)).toBe(false);
            expect(box.getAttribute('role')).toBe('alert');
        });

        it('explains an unsupported format (code 4) and mentions H.265/HEVC', async () => {
            const w = await open();
            await fail(w, 4);
            const text = document.querySelector('.video-lightbox-error-text').textContent;
            expect(text).toContain('not supported');
            expect(text).toContain('H.265/HEVC');
            expect(text).not.toContain('codec ');
        });

        it('names the codec when the entry has one', async () => {
            const w = await open({ entry: { path: 'flights/house.mp4', properties: { codec: 'hevc' } } });
            await fail(w, 4);
            expect(document.querySelector('.video-lightbox-error-text').textContent).toContain('(codec hevc)');
        });

        it('reports a network error (code 2)', async () => {
            const w = await open();
            await fail(w, 2);
            const text = document.querySelector('.video-lightbox-error-text').textContent;
            expect(text).toContain('Network error');
            expect(text).not.toContain('HEVC');
        });

        it('is generic for the other codes, and when the code is unknown', async () => {
            const w = await open();
            await fail(w, 3);
            expect(document.querySelector('.video-lightbox-error-text').textContent).toContain('Could not play this video');
            await w.setProps({ visible: false });
            await w.setProps({ visible: true });
            await fail(w, 0);
            expect(document.querySelector('.video-lightbox-error-text').textContent).toContain('Could not play this video');
        });

        it('offers Open in new tab, and Download through the dataset', async () => {
            dataset.downloadWithCheck.mockClear();
            const w = await open({ dataset });
            await fail(w, 4);
            const open_ = document.querySelector('.video-lightbox-open');
            expect(open_.getAttribute('href')).toBe('/video.mp4');
            expect(open_.getAttribute('target')).toBe('_blank');
            document.querySelector('.video-lightbox-download').click();
            await flushPromises();
            expect(dataset.downloadWithCheck).toHaveBeenCalledWith(['flights/house.mp4']);
        });

        it('a failed Download says so as the dataset page does: the download limit (429) has its own message', async () => {
            notifyError.mockClear();
            const limited = { downloadWithCheck: vi.fn(() => Promise.reject(Object.assign(new Error('Too many requests'), { status: 429 }))) };
            const w = await open({ dataset: limited });
            await fail(w, 4);
            document.querySelector('.video-lightbox-download').click();
            await flushPromises();
            expect(notifyError).toHaveBeenCalledWith(DOWNLOAD_LIMIT_MESSAGE, { summary: 'Download Limit' });

            const failed = new Error('Server error');
            limited.downloadWithCheck.mockImplementation(() => Promise.reject(failed));
            document.querySelector('.video-lightbox-download').click();
            await flushPromises();
            expect(notifyError).toHaveBeenLastCalledWith(failed, { summary: 'Download Error' });
            expect(document.querySelector('.video-lightbox-download').disabled).toBe(false);
        });

        it('has no Download without a dataset', async () => {
            const w = await open();
            await fail(w, 4);
            expect(document.querySelector('.video-lightbox-download')).toBeNull();
            expect(document.querySelector('.video-lightbox-open')).not.toBeNull();
        });

        it('clears the message when it opens again', async () => {
            const w = await open();
            await fail(w, 4);
            await w.setProps({ visible: false });
            await w.setProps({ visible: true });
            expect(document.querySelector('.video-lightbox-error')).toBeNull();
        });
    });
});

// jsdom has no layout: the rule of the player is read from the component's style (FR-VWR-35)
describe('VideoLightbox player size (FR-VWR-35)', () => {
    const css = fs.readFileSync(path.join(__dirname, 'VideoLightbox.vue'), 'utf8').split('<style')[1];
    const rule = selector => new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

    it('fills the free area and keeps the aspect ratio, so a 320x240 clip grows on a 4K screen', () => {
        const player = rule('.video-lightbox-player');
        expect(player).toMatch(/width:\s*100%/);
        expect(player).toMatch(/height:\s*100%/);
        expect(player).toMatch(/object-fit:\s*contain/);
        // Only a maximum would leave the video at its pixel size
        expect(player).not.toMatch(/max-width/);
        expect(player).not.toMatch(/max-height/);
    });

    it('lets its content area shrink under the toolbar, so the video follows a window size change', () => {
        expect(rule('.video-lightbox-content')).toMatch(/min-height:\s*0/);
    });
});
