import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import Window from '@/components/HubWindow.vue';
import { hasOpenOverlay } from '@/composables/useOverlay';
import { thumbs } from 'ddb';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('ddb', async importOriginal => {
    const actual = await importOriginal();
    return { ...actual, thumbs: { fetch: vi.fn(() => '/thumb.webp') } };
});

const { default: MapFilePopup } = await import('./MapFilePopup.vue');

const photo = name => ({
    path: `ddb://localhost/org/ds/${name}`,
    entry: { path: name, type: ddb.entry.type.GEOIMAGE, properties: {}, point_geom: { type: 'Point', coordinates: [9, 45, 100] } }
});

async function popupOf(file) {
    const target = document.createElement('div');
    target.tabIndex = -1;
    document.body.appendChild(target);
    // OpenLayers wraps the popup in the overlay's own element, which the map puts in the page
    const map = { addOverlay: vi.fn(o => target.appendChild(o.getElement().parentElement)), removeOverlay: vi.fn(), getTargetElement: () => target };
    const w = mount(MapFilePopup, { props: { map }, attachTo: document.body });
    w.vm.show(file, [0, 0]);
    await flushPromises();
    return w;
}

describe('MapFilePopup', () => {
    it('closes when the map shows other files (another folder)', async () => {
        const a = photo('folder1/a.jpg');
        const w = await popupOf(a);
        expect(w.find('.image-popup-title').text()).toBe('a.jpg');

        expect(w.vm.closeUnlessIn([photo('folder2/b.jpg')])).toBe(true);
        await flushPromises();
        expect(w.find('.image-popup-title').text()).toBe('');
        expect(w.find('.image-popup').element.style.display).toBe('none');
        w.unmount();
    });

    it('stays open while its file is still on the map', async () => {
        const a = photo('folder1/a.jpg');
        const w = await popupOf(a);
        expect(w.vm.closeUnlessIn([photo('folder1/c.jpg'), { ...a }])).toBe(false);
        await flushPromises();
        expect(w.find('.image-popup-title').text()).toBe('a.jpg');
        w.unmount();
    });
});

describe('MapFilePopup in the overlay stack (MAP-20)', () => {
    const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    it('closes on Escape and tells the map the user closed it', async () => {
        const w = await popupOf(photo('a.jpg'));
        escape();
        await flushPromises();
        expect(w.find('.image-popup').element.style.display).toBe('none');
        expect(w.emitted('dismiss')).toHaveLength(1);
        escape();
        expect(w.emitted('dismiss')).toHaveLength(1);
        w.unmount();
    });

    it('gives the keyboard back to the map when its Close button closes it', async () => {
        const w = await popupOf(photo('a.jpg'));
        const close = w.find('.image-popup-close');
        close.element.focus();
        await close.trigger('click');
        await flushPromises();
        expect(w.emitted('dismiss')).toHaveLength(1);
        expect(document.activeElement).toBe(w.props('map').getTargetElement());
        w.unmount();
    });

    it('stays open when Escape closes a dialog above it', async () => {
        const w = await popupOf(photo('a.jpg'));
        const dialog = mount(Window, { props: { visible: true, title: 'Above' }, attachTo: document.body, global: { plugins: [PrimeVue] } });
        escape();
        await flushPromises();
        expect(dialog.emitted('close')).toHaveLength(1);
        expect(w.emitted('dismiss')).toBeUndefined();
        expect(w.find('.image-popup-title').text()).toBe('a.jpg');
        dialog.unmount();
        w.unmount();
    });

    describe('in a hidden map tab', () => {
        // What a browser reports: the popup's box, gone under a tab hidden with display: none
        const observers = [];
        class FakeResizeObserver {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe() {}
            disconnect() {}
        }
        afterEach(() => {
            vi.unstubAllGlobals();
            observers.length = 0;
        });

        it('is off the stack: Escape is not taken, and no overlay is open', async () => {
            vi.stubGlobal('ResizeObserver', FakeResizeObserver);
            const w = await popupOf(photo('a.jpg'));
            expect(hasOpenOverlay()).toBe(true);
            observers.forEach(o => o.callback([{ contentRect: { width: 0, height: 0 } }]));
            await flushPromises();
            expect(hasOpenOverlay()).toBe(false);
            escape();
            expect(w.emitted('dismiss')).toBeUndefined();
            expect(w.find('.image-popup-title').text()).toBe('a.jpg');

            // The tab is shown again: the popup is back on the stack
            observers.forEach(o => o.callback([{ contentRect: { width: 260, height: 200 } }]));
            await flushPromises();
            escape();
            expect(w.emitted('dismiss')).toHaveLength(1);
            w.unmount();
        });
    });
});

describe('MapFilePopup photo size (FR-MAP-31)', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); thumbs.fetch.mockClear(); });

    /** The popup is `maxWidth` CSS px wide at most (--ddb-popup-width: jsdom has no layout) */
    async function requestedSize(maxWidth, ratio) {
        vi.stubGlobal('devicePixelRatio', ratio);
        const real = globalThis.getComputedStyle.bind(globalThis);
        vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((el, ...rest) => (
            el?.classList?.contains('image-popup') ? { maxWidth: `${maxWidth}px` } : real(el, ...rest)));
        const w = await popupOf(photo('a.jpg'));
        const size = thumbs.fetch.mock.calls.at(-1)[1];
        w.unmount();
        return size;
    }

    it('asks for the drawn width times the pixel ratio: a 422 px popup is 512 px at ratio 1 and 1024 px at ratio 2', async () => {
        expect(await requestedSize(422, 1)).toBe(512);
        expect(await requestedSize(422, 2)).toBe(1024);
    });

    it('asks for 1024 px for the 640 px popup of a 4K screen at ratio 1 (not the fixed 512 px)', async () => {
        expect(await requestedSize(640, 1)).toBe(1024);
    });

    it('takes the widest popup (640 px) when its width cannot be measured', async () => {
        vi.stubGlobal('devicePixelRatio', 1);
        const w = await popupOf(photo('a.jpg'));
        expect(thumbs.fetch.mock.calls.at(-1)[1]).toBe(1024);
        w.unmount();
    });

    it('takes its width from the popup token and its photo height from the viewport', () => {
        const css = fs.readFileSync(path.join(__dirname, 'MapFilePopup.vue'), 'utf8').split('<style')[1];
        expect(css).toMatch(/max-width:\s*min\(var\(--ddb-popup-width\),\s*calc\(100vw - 2rem\)\)/);
        expect(css).toMatch(/max-height:\s*clamp\(15rem,\s*25vh,\s*28rem\)/);
        // The 20rem limit of before
        expect(css).not.toMatch(/max-width:\s*min\(20rem/);
    });
});
