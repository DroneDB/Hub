/**
 * The lazy rendering of a figure of the live page: nothing is asked for until the block comes into view, the render goes
 * through the queue, the address of the image is given back when the block goes, and a failure can be tried again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createRenderQueue } from './renderQueue';
import { useRenderedImage } from './useRenderedImage';

class FakeObserver {
    static instances = [];
    constructor(callback) { this.callback = callback; this.disconnected = false; FakeObserver.instances.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
    show() { this.callback([{ isIntersecting: true }]); }
}

let figure;
function mountFigure(render, options = {}) {
    const Probe = defineComponent({
        setup() {
            figure = useRenderedImage(() => document.body, render, { observe: FakeObserver, ...options });
            return () => h('div');
        }
    });
    return mount(Probe);
}
const result = (note = null) => ({ image: new Blob(['x']), note });

beforeEach(() => {
    FakeObserver.instances = [];
    URL.createObjectURL = vi.fn(() => 'blob:figure');
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('useRenderedImage', () => {
    it('asks for nothing until the block comes into view, then renders once', async () => {
        const render = vi.fn(async () => result('a note'));
        mountFigure(render);
        await flushPromises();
        expect(render).not.toHaveBeenCalled();
        expect(figure.state.value).toBe('waiting');

        FakeObserver.instances[0].show();
        await flushPromises();
        expect(render).toHaveBeenCalledTimes(1);
        expect(FakeObserver.instances[0].disconnected).toBe(true);
        expect(figure.state.value).toBe('done');
        expect(figure.url.value).toBe('blob:figure');
        expect(figure.note.value).toBe('a note');
    });

    it('draws at most two at a time across the blocks of a page, by the queue', async () => {
        const queue = createRenderQueue();
        let running = 0;
        let peak = 0;
        const render = async () => { peak = Math.max(peak, ++running); await new Promise(r => setTimeout(r, 5)); running--; return result(); };
        const wrappers = Array.from({ length: 6 }, () => mountFigure(render, { queue }));
        const observers = [...FakeObserver.instances];
        observers.forEach(o => o.show());
        await new Promise(r => setTimeout(r, 60));
        expect(peak).toBe(2);
        wrappers.forEach(w => w.unmount());
    });

    it('draws at once when the browser has no IntersectionObserver', async () => {
        const render = vi.fn(async () => result());
        mountFigure(render, { observe: null });
        await flushPromises();
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('says a figure that has no image (a chart with no elevation layer) with its note only', async () => {
        mountFigure(async () => ({ image: null, note: 'No elevation layer in the cover view' }), { observe: null });
        await flushPromises();
        expect(figure.url.value).toBe('');
        expect(figure.note.value).toBe('No elevation layer in the cover view');
        expect(figure.state.value).toBe('done');
    });

    it('reports a failure and draws again on retry', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const render = vi.fn().mockRejectedValueOnce(new Error('No tiles')).mockResolvedValue(result());
        mountFigure(render, { observe: null });
        await flushPromises();
        expect(figure.state.value).toBe('failed');
        expect(figure.error.value).toBe('No tiles');
        figure.retry();
        await flushPromises();
        expect(render).toHaveBeenCalledTimes(2);
        expect(figure.state.value).toBe('done');
        expect(figure.error.value).toBe('');
    });

    it('does not draw a figure that was not yet in view when it is asked to retry', async () => {
        const render = vi.fn(async () => result());
        mountFigure(render);
        figure.retry();
        await flushPromises();
        expect(render).not.toHaveBeenCalled();
    });

    it('aborts the render and gives the address back when the block goes', async () => {
        let signal;
        const render = vi.fn(signalOfRender => { signal = signalOfRender; return new Promise(() => {}); });
        const wrapper = mountFigure(render, { observe: null });
        await nextTick();
        await flushPromises();
        expect(signal.aborted).toBe(false);
        wrapper.unmount();
        expect(signal.aborted).toBe(true);

        const done = mountFigure(async () => result(), { observe: null });
        await flushPromises();
        done.unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:figure');
    });

    it('stops watching when the block goes before it came into view', () => {
        const wrapper = mountFigure(vi.fn());
        wrapper.unmount();
        expect(FakeObserver.instances[0].disconnected).toBe(true);
    });
});
