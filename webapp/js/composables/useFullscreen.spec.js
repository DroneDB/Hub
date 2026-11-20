/**
 * The fullscreen button of the map and of the viewers says what it does next, and follows the browser: leaving full
 * screen with Esc or the browser's controls turns it back.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useFullscreen } from './useFullscreen';
import { EXIT_FULLSCREEN_ICON, FULLSCREEN_ICON } from '@/libs/glyphs';

let scope;
const run = () => {
    scope = effectScope();
    return scope.run(() => useFullscreen());
};
const enter = (element, event = 'fullscreenchange') => {
    Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
    document.dispatchEvent(new Event(event));
};

afterEach(() => {
    scope?.stop();
    delete document.fullscreenElement;
    delete document.exitFullscreen;
    delete HTMLElement.prototype.requestFullscreen;
});

describe('useFullscreen', () => {
    it('is Fullscreen with the expand glyph, then Exit fullscreen with the compress glyph', async () => {
        const state = run();
        expect([state.isFullscreen.value, state.label.value, state.icon.value]).toEqual([false, 'Fullscreen', FULLSCREEN_ICON]);
        enter(document.body);
        await nextTick();
        expect([state.isFullscreen.value, state.label.value, state.icon.value]).toEqual([true, 'Exit fullscreen', EXIT_FULLSCREEN_ICON]);
    });

    it('turns back when the browser leaves full screen by itself (Esc), with the prefixed event too', async () => {
        const state = run();
        enter(document.body);
        enter(null, 'webkitfullscreenchange');
        await nextTick();
        expect([state.isFullscreen.value, state.label.value]).toEqual([false, 'Fullscreen']);
    });

    it('starts in the state of the page: a map opened while the page is in full screen shows Exit fullscreen', () => {
        enter(document.body);
        expect(run().label.value).toBe('Exit fullscreen');
    });

    it('asks the element for full screen, and leaves it when the page is in it', () => {
        const request = vi.fn();
        const exit = vi.fn();
        HTMLElement.prototype.requestFullscreen = request;
        document.exitFullscreen = exit;
        const state = run();
        const element = document.createElement('div');
        state.toggle(element);
        expect(request.mock.contexts).toEqual([element]);
        enter(element);
        state.toggle(element);
        expect(exit).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('stops following the page with its owner', async () => {
        const state = run();
        scope.stop();
        enter(document.body);
        await nextTick();
        expect(state.isFullscreen.value).toBe(false);
    });
});
