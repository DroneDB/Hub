/**
 * The photo viewer (FR-VWR-12, FR-EXP-38): an overlay dialog on an <img> with zoom, a gallery of the
 * folder's photos, an Information panel that follows the photo on show, and a bitmap sized to the
 * stage in device pixels (never above the photo's long side).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import PhotoLightbox from './PhotoLightbox.vue';
import VideoLightbox from './VideoLightbox.vue';
import { pointCoordinatesText } from '@/libs/propertiesUtils';

const dataset = {
    thumbUrl: (path, size) => `/thumb/${path}?size=${size}`,
    downloadUrl: (path, options) => `/download/${path}${options?.inline ? '?inline=1' : ''}`
};

const photo = (path, properties = {}, extra = {}) => ({
    path,
    entry: { type: 6, path, size: 1234, properties, ...extra }
});
const big = path => photo(path, { width: 6000, height: 4000 });

const mounted = [];
async function open(props = {}) {
    const w = mount(PhotoLightbox, {
        props: { dataset, photos: [big('a.jpg'), big('b.jpg'), big('c.jpg')], index: 0, ...props },
        attachTo: document.body, global: { plugins: [PrimeVue] }
    });
    mounted.push(w);
    await flushPromises();
    return w;
}
const q = sel => document.querySelector(sel);
const img = () => q('.photo-lightbox-image');
const click = async (label, w) => { q(`[aria-label="${label}"]`).click(); await w.vm.$nextTick(); };

function setScreen(width, height, ratio) {
    window.innerWidth = width;
    window.innerHeight = height;
    Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });
}

beforeEach(() => setScreen(1920, 1080, 1));
afterEach(() => {
    mounted.splice(0).forEach(w => w.unmount());
    document.body.innerHTML = '';
});

describe('PhotoLightbox: the dialog', () => {
    it('is a modal dialog on an <img> named after the photo, with the focus on Close', async () => {
        await open();
        const dialog = q('.photo-lightbox-overlay');
        expect(dialog.getAttribute('role')).toBe('dialog');
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-label')).toBe('a.jpg');
        expect(img().tagName).toBe('IMG');
        expect(img().getAttribute('alt')).toBe('a.jpg');
        expect(document.activeElement.getAttribute('aria-label')).toBe('Close');
        expect(dialog.querySelectorAll('[data-p-hidden-focusable="true"]')).toHaveLength(2);
    });

    it('closes on Escape, and only the topmost overlay', async () => {
        const photos = await open();
        const video = mount(VideoLightbox, { props: { visible: true, src: '/v.mp4', entry: { path: 'v.mp4' } }, attachTo: document.body, global: { plugins: [PrimeVue] } });
        mounted.push(video);
        await flushPromises();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(video.emitted('close')).toHaveLength(1);
        expect(photos.emitted('close')).toBeUndefined();
        await video.setProps({ visible: false });
        q('.photo-lightbox-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(photos.emitted('close')).toHaveLength(1);
    });

    it('closes with the Close button', async () => {
        const w = await open();
        await click('Close', w);
        expect(w.emitted('close')).toHaveLength(1);
    });

    it('keeps Open in new tab: the file itself, inline', async () => {
        await open();
        const link = q('a[aria-label="Open in new tab"]');
        expect(link.getAttribute('href')).toBe('/download/a.jpg?inline=1');
        expect(link.getAttribute('target')).toBe('_blank');
    });

    it('shows the position in the gallery, and the place and altitude over the photo', async () => {
        const point_geom = { type: 'Feature', geometry: { type: 'Point', coordinates: [11.25, 46.5, 300.456] } };
        await open({ photos: [photo('a.jpg', {}, { point_geom }), big('b.jpg')] });
        expect(q('.photo-lightbox-count').textContent).toBe('1 / 2');
        expect(q('.photo-lightbox-coords').textContent).toContain(pointCoordinatesText({ type: 'Point', coordinates: [11.25, 46.5] }));
        expect(q('.photo-lightbox-coords').textContent).not.toContain('300');
        // 300.456 m with one decimal, in the user's units (metric)
        expect(q('.photo-lightbox-altitude').textContent).toContain('300.5 m');
    });
});

describe('PhotoLightbox: the bitmap (FR-EXP-38)', () => {
    it('asks for the stage in device pixels, in the steps of FR-XC-32', async () => {
        await open();
        expect(img().getAttribute('src')).toBe('/thumb/a.jpg?size=2048');
    });

    it('asks for more on a high-density screen', async () => {
        setScreen(1920, 1080, 2);
        await open();
        expect(img().getAttribute('src')).toBe('/thumb/a.jpg?size=4096');
    });

    it('follows the window: the screen changes its size and its ratio', async () => {
        const w = await open();
        setScreen(1280, 720, 1);
        window.dispatchEvent(new Event('resize'));
        await w.vm.$nextTick();
        expect(img().getAttribute('src')).toBe('/thumb/a.jpg?size=2048');
        setScreen(800, 600, 1);
        window.dispatchEvent(new Event('resize'));
        await w.vm.$nextTick();
        expect(img().getAttribute('src')).toBe('/thumb/a.jpg?size=1024');
    });

    it('uses the inline file for a photo the step would not shrink', async () => {
        await open({ photos: [photo('small.jpg', { width: 1600, height: 1200 })] });
        expect(img().getAttribute('src')).toBe('/download/small.jpg?inline=1');
    });

    it('never asks for more than the photo has: its long side is the cap, so the file is used', async () => {
        setScreen(1920, 1080, 2);
        await open({ photos: [photo('p.jpg', { width: 3000, height: 2000 })] });
        expect(img().getAttribute('src')).toBe('/download/p.jpg?inline=1');
    });

    it('asks for a step when the size of the photo is unknown', async () => {
        await open({ photos: [photo('u.jpg')] });
        expect(img().getAttribute('src')).toBe('/thumb/u.jpg?size=2048');
    });

    it('loads the full image when zoomed, and keeps it after zooming back to the fit', async () => {
        const w = await open();
        expect(img().getAttribute('src')).toContain('/thumb/');
        await click('Zoom in', w);
        expect(img().getAttribute('src')).toBe('/download/a.jpg?inline=1');
        await click('Zoom out', w);
        expect(img().getAttribute('src')).toBe('/download/a.jpg?inline=1');
        // another photo starts at the preview
        await w.setProps({ index: 1 });
        expect(img().getAttribute('src')).toBe('/thumb/b.jpg?size=2048');
    });
});

describe('PhotoLightbox: a photo the browser cannot show (FR-EXP-38)', () => {
    it('a 1280 x 960 TIFF in a 1920 stage is a thumbnail at its own size, not the file', async () => {
        await open({ photos: [photo('scan.tif', { width: 1280, height: 960 })] });
        expect(img().getAttribute('src')).toBe('/thumb/scan.tif?size=1280');
    });

    it('stays a thumbnail when zoomed: the largest step, capped at the photo', async () => {
        const w = await open({ photos: [photo('big.TIF', { width: 6000, height: 4000 }), photo('scan.tiff', { width: 1280, height: 960 })] });
        expect(img().getAttribute('src')).toBe('/thumb/big.TIF?size=2048');
        await click('Zoom in', w);
        expect(img().getAttribute('src')).toBe('/thumb/big.TIF?size=4096');
        await w.setProps({ index: 1 });
        await click('Zoom in', w);
        expect(img().getAttribute('src')).toBe('/thumb/scan.tiff?size=1280');
    });

    it.each(['jpg', 'JPEG', 'png', 'webp', 'gif', 'avif', 'bmp'])('uses the file of a .%s the step would not shrink', async ext => {
        await open({ photos: [photo(`small.${ext}`, { width: 1280, height: 960 })] });
        expect(img().getAttribute('src')).toBe(`/download/small.${ext}?inline=1`);
    });
});

describe('PhotoLightbox: a full image that does not load', () => {
    it('falls back to the preview when zoomed, without an error', async () => {
        const w = await open();
        await click('Zoom in', w);
        expect(img().getAttribute('src')).toBe('/download/a.jpg?inline=1');
        img().dispatchEvent(new Event('error'));
        await flushPromises();
        expect(img().getAttribute('src')).toBe('/thumb/a.jpg?size=2048');
        expect(q('.photo-lightbox-failed')).toBeNull();
        // The preview that fails too is an error
        img().dispatchEvent(new Event('error'));
        await flushPromises();
        expect(q('.photo-lightbox-failed')).not.toBeNull();
    });

    it('falls back to a thumbnail of a small photo shown as its file', async () => {
        await open({ photos: [photo('small.jpg', { width: 1600, height: 1200 })] });
        expect(img().getAttribute('src')).toBe('/download/small.jpg?inline=1');
        img().dispatchEvent(new Event('error'));
        await flushPromises();
        expect(img().getAttribute('src')).toBe('/thumb/small.jpg?size=1600');
        expect(q('.photo-lightbox-failed')).toBeNull();
    });

    it('goes straight to the error for a photo the browser cannot show whose preview is its file', async () => {
        // A TIFF too small for a step: the preview is the thumbnail at its own size, and so is the full image
        await open({ photos: [photo('scan.tif', { width: 1280, height: 960 })] });
        expect(img().getAttribute('src')).toBe('/thumb/scan.tif?size=1280');
        img().dispatchEvent(new Event('error'));
        await flushPromises();
        expect(q('.photo-lightbox-failed')).not.toBeNull();
    });

    it('tries the file again on the next photo', async () => {
        const w = await open();
        await click('Zoom in', w);
        img().dispatchEvent(new Event('error'));
        await flushPromises();
        await w.setProps({ index: 1 });
        await click('Zoom in', w);
        expect(img().getAttribute('src')).toBe('/download/b.jpg?inline=1');
    });
});

/**
 * Pointers as a browser sends them: pointerdown, pointermove and pointerup go to the element under the
 * pointer, or to the element that captured it; the click that ends a press goes to the captured element
 * too (so a stage that captured every press would get every click).
 */
function pointerDevice() {
    const stage = q('.photo-lightbox-stage');
    const captured = new Set();
    stage.setPointerCapture = vi.fn(id => captured.add(id));
    stage.hasPointerCapture = id => captured.has(id);
    stage.releasePointerCapture = id => captured.delete(id);
    const to = (target, id) => (captured.has(id) ? stage : target);
    // A press holds the primary button down until it goes up (`buttons`, as a browser sends it)
    const fire = (target, type, { x = 0, y = 0, id = 1, pointerType = 'mouse', buttons = type === 'pointerup' ? 0 : 1 } = {}) => to(target, id).dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType, isPrimary: id === 1, clientX: x, clientY: y, buttons, bubbles: true, cancelable: true
    }));
    return {
        stage,
        down: (target, options) => fire(target, 'pointerdown', options),
        move: (target, options) => fire(target, 'pointermove', options),
        up(target, options = {}) {
            const id = options.id ?? 1;
            const clickTarget = to(target, id);
            fire(target, 'pointerup', options);
            captured.delete(id);
            return clickTarget;
        },
        /** A whole click: down, up, click (with its count, as `detail`) */
        click(target, options = {}, detail = 1) {
            this.down(target, options);
            const clickTarget = this.up(target, options);
            clickTarget.dispatchEvent(new MouseEvent('click', { clientX: options.x ?? 0, clientY: options.y ?? 0, detail, bubbles: true, cancelable: true }));
        }
    };
}
const dblclick = target => target.dispatchEvent(new MouseEvent('dblclick', { clientX: 0, clientY: 0, detail: 2, bubbles: true, cancelable: true }));

describe('PhotoLightbox: clicks on the photo and around it', () => {
    it('a click on the photo does not close it, and the stage does not capture the pointer', async () => {
        const w = await open();
        const device = pointerDevice();
        device.click(img());
        await w.vm.$nextTick();
        expect(w.emitted('close')).toBeUndefined();
        expect(device.stage.setPointerCapture).not.toHaveBeenCalled();
    });

    it('a double click on the photo zooms it: two clicks and the dblclick', async () => {
        const w = await open();
        const device = pointerDevice();
        device.click(img(), {}, 1);
        device.click(img(), {}, 2);
        dblclick(img());
        await w.vm.$nextTick();
        expect(w.emitted('close')).toBeUndefined();
        expect(img().style.transform).toContain('scale(2.5)');
    });

    it('a click on the empty stage closes it', async () => {
        const w = await open();
        const device = pointerDevice();
        device.click(device.stage);
        expect(w.emitted('close')).toHaveLength(1);
    });

    it('a press on the photo released over the empty stage does not close it', async () => {
        const w = await open();
        const device = pointerDevice();
        device.down(img());
        device.up(device.stage);
        device.stage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(w.emitted('close')).toBeUndefined();
    });

    it('a click of less than 4 px on a zoomed photo or around it does not close it', async () => {
        const w = await open();
        await click('Zoom in', w);
        const device = pointerDevice();
        for (const target of [img(), device.stage]) {
            device.down(target, { x: 100, y: 100 });
            device.move(target, { x: 102, y: 101 });
            const clickTarget = device.up(target, { x: 102, y: 101 });
            clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
        expect(w.emitted('close')).toBeUndefined();
        expect(device.stage.setPointerCapture).not.toHaveBeenCalled();
    });

    it('a drag of a zoomed photo captures the pointer, pans, and its click does not close it', async () => {
        const w = await open();
        await click('Zoom in', w);
        const device = pointerDevice();
        device.down(img(), { x: 100, y: 100 });
        device.move(img(), { x: 130, y: 100 });
        expect(device.stage.setPointerCapture).toHaveBeenCalledWith(1);
        // Captured: the rest goes to the stage, and so does the click
        const clickTarget = device.up(img(), { x: 130, y: 100 });
        expect(clickTarget).toBe(device.stage);
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(w.emitted('close')).toBeUndefined();
    });

    it('a drag that starts on the empty stage at the fit does not close it', async () => {
        const w = await open();
        const device = pointerDevice();
        device.down(device.stage, { x: 10, y: 10 });
        device.move(device.stage, { x: 60, y: 10 });
        const clickTarget = device.up(device.stage, { x: 60, y: 10 });
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(w.emitted('close')).toBeUndefined();
    });

    it('a mouse press at the fit released outside the stage does not pan after a wheel zoom', async () => {
        const w = await open();
        const device = pointerDevice();
        // Not captured at the fit: its pointerup goes to the page, not to the stage
        device.down(device.stage, { x: 10, y: 10 });
        device.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
        await w.vm.$nextTick();
        const before = img().style.transform;
        expect(before).not.toContain('scale(1)');
        // The mouse moves over the stage with no button down
        device.move(device.stage, { x: 200, y: 150, buttons: 0 });
        device.move(device.stage, { x: 300, y: 200, buttons: 0 });
        await w.vm.$nextTick();
        expect(img().style.transform).toBe(before);
        expect(device.stage.classList.contains('dragging')).toBe(false);
    });

    it('a pinch captures both pointers', async () => {
        await open();
        const device = pointerDevice();
        device.down(img(), { id: 1, x: 100, y: 100, pointerType: 'touch' });
        device.down(img(), { id: 2, x: 200, y: 100, pointerType: 'touch' });
        expect(device.stage.setPointerCapture.mock.calls.map(c => c[0]).sort()).toEqual([1, 2]);
    });

    describe('with a touch', () => {
        const touch = { pointerType: 'touch', x: 50, y: 50 };

        it('a tap on the photo does not close it', async () => {
            const w = await open();
            pointerDevice().click(img(), touch);
            expect(w.emitted('close')).toBeUndefined();
            expect(img().style.transform).toContain('scale(1)');
        });

        it('a double tap on the photo zooms it, and a dblclick the browser adds does not undo it', async () => {
            const w = await open();
            const device = pointerDevice();
            device.click(img(), touch);
            device.click(img(), touch, 2);
            dblclick(img());
            await w.vm.$nextTick();
            expect(w.emitted('close')).toBeUndefined();
            expect(img().style.transform).toContain('scale(2.5)');
        });

        it('a tap on the empty stage closes it', async () => {
            const w = await open();
            const device = pointerDevice();
            device.click(device.stage, touch);
            expect(w.emitted('close')).toHaveLength(1);
        });
    });
});

describe('PhotoLightbox: zoom', () => {
    it('zooms with the + and - buttons, and fits with the percentage', async () => {
        const w = await open();
        expect(q('[aria-label="Zoom out"]').disabled).toBe(true);
        await click('Zoom in', w);
        expect(img().style.transform).toContain('scale(1.5)');
        expect(q('.photo-lightbox-zoom').textContent.trim()).toBe('150%');
        await click('Fit to screen', w);
        expect(img().style.transform).toContain('scale(1)');
    });

    it('zooms with the wheel and a double click on the stage', async () => {
        const w = await open();
        const stage = q('.photo-lightbox-stage');
        stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
        await w.vm.$nextTick();
        expect(q('.photo-lightbox-stage').classList.contains('zoomed')).toBe(true);
        await click('Fit to screen', w);
        stage.dispatchEvent(new MouseEvent('dblclick', { clientX: 0, clientY: 0, bubbles: true }));
        await w.vm.$nextTick();
        expect(img().style.transform).toContain('scale(2.5)');
    });

    it('zooms with the keys + - 0', async () => {
        const w = await open();
        const key = k => q('.photo-lightbox-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
        key('+');
        await w.vm.$nextTick();
        expect(img().style.transform).toContain('scale(1.5)');
        key('0');
        await w.vm.$nextTick();
        expect(img().style.transform).toContain('scale(1)');
    });
});

describe('PhotoLightbox: the gallery', () => {
    const key = k => q('.photo-lightbox-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

    it('goes to the next and the previous photo with the buttons, around the ends', async () => {
        const w = await open();
        await click('Next photo', w);
        expect(w.emitted('update:index').at(-1)).toEqual([1]);
        await click('Previous photo', w);
        expect(w.emitted('update:index').at(-1)).toEqual([2]);
    });

    it('has no buttons for a single photo', async () => {
        await open({ photos: [big('a.jpg')] });
        expect(q('[aria-label="Next photo"]')).toBeNull();
        expect(q('.photo-lightbox-count')).toBeNull();
    });

    it('changes the photo with ArrowLeft and ArrowRight at the fit', async () => {
        const w = await open({ index: 1 });
        key('ArrowRight');
        expect(w.emitted('update:index').at(-1)).toEqual([2]);
        key('ArrowLeft');
        expect(w.emitted('update:index').at(-1)).toEqual([0]);
    });

    it('pans with the arrows when zoomed instead of changing the photo', async () => {
        const w = await open({ index: 1 });
        await click('Zoom in', w);
        key('ArrowRight');
        await w.vm.$nextTick();
        expect(w.emitted('update:index')).toBeUndefined();
        expect(img().style.transform).toContain('translate(-80px, 0px)');
        key('ArrowLeft');
        await w.vm.$nextTick();
        expect(img().style.transform).toContain('translate(0px, 0px)');
    });

    it('goes back to the fit and the preview on another photo', async () => {
        const w = await open();
        await click('Zoom in', w);
        await w.setProps({ index: 2 });
        expect(img().style.transform).toContain('scale(1)');
        expect(img().getAttribute('src')).toBe('/thumb/c.jpg?size=2048');
    });
});

describe('PhotoLightbox: Information', () => {
    it('toggles the properties of the photo, with the Information button and the I key', async () => {
        const w = await open({ photos: [photo('a.jpg', { width: 6000, height: 4000, make: 'DJI' })] });
        expect(q('.photo-lightbox-info')).toBeNull();
        expect(q('[aria-label="Information"]').getAttribute('aria-pressed')).toBe('false');
        await click('Information', w);
        expect(q('[aria-label="Information"]').getAttribute('aria-pressed')).toBe('true');
        expect(q('.photo-lightbox-info').textContent).toContain('a.jpg');
        expect(q('.photo-lightbox-info').textContent).toContain('DJI');
        q('.photo-lightbox-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }));
        await w.vm.$nextTick();
        expect(q('.photo-lightbox-info')).toBeNull();
    });

    it('follows the current photo when it changes', async () => {
        const w = await open({ photos: [photo('a.jpg', { make: 'DJI' }), photo('b.jpg', { make: 'Parrot' })] });
        await click('Information', w);
        expect(q('.photo-lightbox-info').textContent).toContain('DJI');
        await w.setProps({ index: 1 });
        await flushPromises();
        expect(q('.photo-lightbox-info')).not.toBeNull();
        expect(q('.photo-lightbox-info').textContent).toContain('Parrot');
        expect(q('.photo-lightbox-info').textContent).not.toContain('DJI');
    });
});

describe('PhotoLightbox: a photo that fails', () => {
    it('says so and keeps Open in new tab', async () => {
        await open();
        img().dispatchEvent(new Event('error'));
        await flushPromises();
        expect(q('.photo-lightbox-failed').textContent).toContain('Could not load this photo');
        expect(q('a[aria-label="Open in new tab"]')).not.toBeNull();
    });
});

