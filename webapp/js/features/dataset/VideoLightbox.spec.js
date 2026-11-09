/**
 * The video lightbox is an overlay of the overlay stack (FR-VWR-30): the focus moves into it
 * when it is mounted visible, Tab stays inside, Escape closes it, and the focus goes back to
 * the opener.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import VideoLightbox from './VideoLightbox.vue';

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
});
