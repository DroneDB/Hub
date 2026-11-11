/**
 * navKeys - the keys of the 3D viewer's canvas (FR-VWR-16, D-001, D-019): arrows orbit, Shift+arrows
 * pan, +/- zoom, all through the navigation interface; the list of the Controls help; the one-time
 * hint. The keys on a real scene with both strategies: navControls.spec.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ViewerShell from '@/components/ViewerShell.vue';
import { navigateByKey, NAV_GESTURES, NAV_HINT, KEY_ORBIT_STEP, KEY_PAN_STEP, showNavHintOnce } from './navKeys';

// The interface of a strategy, recorded
function controls(scaleFactor = 1.1) {
    return { scaleFactor, orbit: vi.fn(), pan: vi.fn(), zoomAt: vi.fn() };
}

describe('navigateByKey', () => {
    it('turns the step of an orbit and a pan into 5 degrees and 5 % of the view height', () => {
        expect(KEY_ORBIT_STEP).toBeCloseTo(0.0872664626, 9);
        expect(KEY_PAN_STEP).toBe(0.05);
    });

    it.each([
        ['ArrowLeft', [-0.0872664626, 0]],
        ['ArrowRight', [0.0872664626, 0]],
        ['ArrowUp', [0, 0.0872664626]],
        ['ArrowDown', [0, -0.0872664626]]
    ])('%s orbits around the pivot, the camera going the way of the arrow', (key, [dx, dy]) => {
        const c = controls();
        expect(navigateByKey(c, { key })).toBe(true);
        expect(c.orbit).toHaveBeenCalledTimes(1);
        expect(c.orbit.mock.calls[0][0]).toBeCloseTo(dx, 9);
        expect(c.orbit.mock.calls[0][1]).toBeCloseTo(dy, 9);
        expect(c.pan).not.toHaveBeenCalled();
        expect(c.zoomAt).not.toHaveBeenCalled();
    });

    it.each([
        ['ArrowLeft', [-0.05, 0]],
        ['ArrowRight', [0.05, 0]],
        ['ArrowUp', [0, 0.05]],
        ['ArrowDown', [0, -0.05]]
    ])('Shift+%s pans', (key, [dx, dy]) => {
        const c = controls();
        expect(navigateByKey(c, { key, shiftKey: true })).toBe(true);
        expect(c.pan).toHaveBeenCalledTimes(1);
        expect(c.pan.mock.calls[0][0]).toBeCloseTo(dx, 12);
        expect(c.pan.mock.calls[0][1]).toBeCloseTo(dy, 12);
        expect(c.orbit).not.toHaveBeenCalled();
    });

    it.each(['+', '=', 'PageUp'])('%s zooms in by the scale factor of the strategy, to the pivot', key => {
        const c = controls(1.25);
        expect(navigateByKey(c, { key })).toBe(true);
        expect(c.zoomAt).toHaveBeenCalledWith(undefined, 1.25);
    });

    it.each(['-', '_', 'PageDown'])('%s zooms out', key => {
        const c = controls(1.25);
        expect(navigateByKey(c, { key })).toBe(true);
        expect(c.zoomAt).toHaveBeenCalledWith(undefined, 0.8);
    });

    it('zooms x1.1 when the strategy gives no scale factor', () => {
        const c = controls(undefined);
        navigateByKey(c, { key: '+', shiftKey: true });
        expect(c.zoomAt).toHaveBeenCalledWith(undefined, 1.1);
    });

    it.each([
        [{ key: 'a' }], [{ key: 'W' }], [{ key: 'Tab' }], [{ key: 'Home' }], [{ key: '?' }],
        [{ key: 'ArrowLeft', ctrlKey: true }], [{ key: 'ArrowLeft', metaKey: true }], [{ key: '+', altKey: true }]
    ])('leaves %j to the browser', event => {
        const c = controls();
        const before = vi.fn();
        expect(navigateByKey(c, event, before)).toBe(false);
        expect(before).not.toHaveBeenCalled();
        [c.orbit, c.pan, c.zoomAt].forEach(fn => expect(fn).not.toHaveBeenCalled());
    });

    it('runs beforeMove before the move, only for a key it uses', () => {
        const c = controls();
        const order = [];
        c.orbit.mockImplementation(() => order.push('orbit'));
        navigateByKey(c, { key: 'ArrowUp' }, () => order.push('before'));
        expect(order).toEqual(['before', 'orbit']);
    });
});

describe('the help of the controls', () => {
    it('lists the pointer gestures and the keys, for the Controls help of the toolbar', () => {
        expect(NAV_GESTURES).toEqual([
            { input: 'Left drag', action: 'Rotate' },
            { input: 'Right drag or Ctrl + left drag', action: 'Pan' },
            { input: 'Wheel', action: 'Zoom to the cursor' },
            { input: 'Shift + wheel', action: 'Field of view' },
            { input: 'Double click', action: 'Focus on the point' },
            { input: 'Two fingers', action: 'Drag to pan, pinch to zoom, twist to turn' },
            { input: 'Arrow keys', action: 'Rotate (the view focused)' },
            { input: 'Shift + arrow keys', action: 'Pan' },
            { input: '+ and -', action: 'Zoom' }
        ]);
    });
});

describe('the "?" button of the toolbar (FR-VWR-16)', () => {
    let wrapper;
    afterEach(() => {
        wrapper?.unmount();
        document.body.innerHTML = '';
    });

    it('opens the list of the 3D viewer: the gestures, the keys and Home', async () => {
        globalThis.HubOptions = {};
        const Page = { render: () => null };
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page }] });
        await router.push('/');
        wrapper = mount(ViewerShell, {
            props: { navToolbar: true, ready: true, gestures: NAV_GESTURES },
            slots: { default: '<div />' },
            global: { plugins: [router, PrimeVue], provide: { embed: false } },
            attachTo: document.body
        });
        await flushPromises();
        const help = wrapper.find('button[aria-label="Controls"]');
        expect(help.attributes('aria-expanded')).toBe('false');
        await help.trigger('click');
        expect(help.attributes('aria-expanded')).toBe('true');
        const rows = wrapper.findAll('.viewer-help-list dt').map((dt, i) => [dt.text(), wrapper.findAll('.viewer-help-list dd')[i].text()]);
        expect(rows).toEqual([
            ...NAV_GESTURES.map(g => [g.input, g.action]),
            ['Home, H or 0', 'Back to the framed view']
        ]);
        expect(rows).toContainEqual(['Arrow keys', 'Rotate (the view focused)']);
        expect(rows).toContainEqual(['Shift + wheel', 'Field of view']);
    });
});

describe('showNavHintOnce', () => {
    it('tells the user once, and keeps it from being told again', () => {
        const notify = { info: vi.fn() };
        const seen = ref(false);
        expect(showNavHintOnce(notify, seen)).toBe(true);
        expect(seen.value).toBe(true);
        expect(notify.info).toHaveBeenCalledWith(NAV_HINT, { summary: '3D view controls', life: 'long' });
        expect(showNavHintOnce(notify, seen)).toBe(false);
        expect(notify.info).toHaveBeenCalledTimes(1);
    });

    it('says where the keys and the help are', () => {
        expect(NAV_HINT).toContain('arrow keys');
        expect(NAV_HINT).toContain('? button');
    });
});
