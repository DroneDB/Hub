/**
 * The list of an upload queue: a row with an expanded error stays with its file when the list changes (a filter, a file
 * that finishes), instead of showing the expansion on whichever file takes its position.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import UploadQueueView from './UploadQueueView.vue';

const failed = (id, reason) => ({ id, name: `${id}.jpg`, size: 4, status: 'error', progress: 0, canRetry: false, errorMessage: reason });
const FILES = [failed('a', 'Reason of a'), failed('b', 'Reason of b'), failed('c', 'Reason of c')];

// happy-dom lays nothing out: the scroll element gets a height, so the virtualizer has rows to draw
beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 400, top: 0, left: 0, right: 300, bottom: 400, x: 0, y: 0 });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
});
afterEach(() => vi.restoreAllMocks());

async function mountQueue(rows) {
    const w = mount(UploadQueueView, { props: { rows }, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return w;
}
const expandedReasons = w => w.findAll('.error-text').filter(t => t.attributes('aria-expanded') === 'true').map(t => t.text());

describe('UploadQueueView rows', () => {
    it('keeps the expanded error with its file when the order changes', async () => {
        const w = await mountQueue(FILES);
        const reasons = w.findAll('.error-text');
        expect(reasons.map(t => t.text())).toEqual(['Reason of a', 'Reason of b', 'Reason of c']);
        await reasons[1].trigger('click');
        expect(expandedReasons(w)).toEqual(['Reason of b']);

        await w.setProps({ rows: [FILES[1], FILES[2], FILES[0]] });

        expect(w.findAll('.error-text').map(t => t.text())).toEqual(['Reason of b', 'Reason of c', 'Reason of a']);
        expect(expandedReasons(w)).toEqual(['Reason of b']);
        w.unmount();
    });

    it('keeps it when a file before it leaves the list (a filter, a file that is done)', async () => {
        const w = await mountQueue(FILES);
        await w.findAll('.error-text')[1].trigger('click');

        await w.setProps({ rows: [FILES[1], FILES[2]] });

        expect(w.findAll('.error-text').map(t => t.text())).toEqual(['Reason of b', 'Reason of c']);
        expect(expandedReasons(w)).toEqual(['Reason of b']);
        w.unmount();
    });
});
