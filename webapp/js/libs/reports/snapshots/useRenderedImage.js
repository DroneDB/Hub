// @ts-check
/**
 * What a block of the live page needs to show a figure that is drawn on demand: the image is asked for when the block
 * comes into the viewport (not before: a report of fifty items has fifty snapshots and the page shows two or three), in
 * the shared render queue (at most two at a time), and its address is given back when the block goes.
 *
 *   const figure = useRenderedImage(() => root.value?.$el, signal => renderMapSnapshot(block, { dataset, signal }));
 *   figure.url.value, figure.note.value, figure.state.value ('waiting' | 'rendering' | 'done' | 'failed'), figure.error.value, figure.retry()
 */
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { sharedRenderQueue } from '@/libs/reports/snapshots/renderQueue';

/**
 * @param {() => Element | null | undefined} element  the element whose coming into view starts the render
 * @param {(signal: AbortSignal) => Promise<{ image: Blob | null, note: string | null }>} render
 * @param {{ queue?: { run: Function }, observe?: typeof IntersectionObserver | null }} [options]
 */
export function useRenderedImage(element, render, { queue = sharedRenderQueue, observe = globalThis.IntersectionObserver } = {}) {
    const url = ref('');
    const note = ref('');
    const error = ref('');
    /** @type {import('vue').Ref<'waiting' | 'rendering' | 'done' | 'failed'>} */
    const state = ref('waiting');
    /** @type {import('vue').ShallowRef<AbortController | null>} */
    const controller = shallowRef(null);
    /** @type {IntersectionObserver | null} */
    let observer = null;
    let started = false;

    const forgetImage = () => {
        if (url.value) URL.revokeObjectURL(url.value);
        url.value = '';
    };

    async function start() {
        if (started) return;
        started = true;
        state.value = 'waiting';
        error.value = '';
        const own = new AbortController();
        controller.value = own;
        try {
            const result = await queue.run(async (/** @type {AbortSignal} */ signal) => {
                state.value = 'rendering';
                return render(signal);
            }, { signal: own.signal });
            if (own.signal.aborted) return;
            forgetImage();
            note.value = result.note || '';
            if (result.image) url.value = URL.createObjectURL(result.image);
            state.value = 'done';
        } catch (e) {
            if (own.signal.aborted) return;
            console.warn('A figure of the report could not be drawn:', e);
            error.value = e instanceof Error && e.message ? e.message : 'The figure could not be drawn';
            state.value = 'failed';
        }
    }

    function stopWatching() {
        if (observer) observer.disconnect();
        observer = null;
    }

    /** Draws it again (after a failure, or the block changed). A figure not yet in view is drawn with what the block is then. */
    function retry() {
        if (!started) return;
        controller.value?.abort();
        started = false;
        start();
    }

    onMounted(() => {
        const target = element();
        // No IntersectionObserver (an old browser): the figure is drawn at once, through the same queue
        if (!observe || !target) {
            start();
            return;
        }
        observer = new observe(entries => {
            if (entries.some(e => e.isIntersecting)) {
                stopWatching();
                start();
            }
        }, { rootMargin: '200px' });
        observer.observe(target);
    });

    onBeforeUnmount(() => {
        stopWatching();
        controller.value?.abort();
        forgetImage();
    });

    return { url, note, error, state, retry };
}
