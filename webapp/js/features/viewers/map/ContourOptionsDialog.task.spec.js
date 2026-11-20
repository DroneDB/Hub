/**
 * The contour dialog follows its task (FR-RAS-11, NFR-001, FR-XC-15): a long run (more than 50 levels) shows the estimate and
 * asks before it starts, the task has its progress and its Cancel (HeavyTaskStatus) and nothing covers the dialog meanwhile.
 * The Hat Creek mosaic has the range 145 to 402: at the default interval of 1 that is 257 levels, at 50 it is 6.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ContourOptionsDialog from './ContourOptionsDialog.vue';

const confirm = vi.fn();
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }));
const cancelHeavyTask = vi.fn();
vi.mock('@/composables/useHeavyTaskCancel', async () => {
    const { ref } = await import('vue');
    return { useHeavyTaskCancel: () => ({ cancelHeavyTask, cancelling: ref(false) }) };
});

const text = selector => document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
const button = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);

function open(props = {}) {
    return mount(ContourOptionsDialog, {
        props: { visible: true, unit: 'm', rasterMin: 145, rasterMax: 402, ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { transition: false } }
    });
}

describe('ContourOptionsDialog task', () => {
    beforeEach(() => {
        confirm.mockReset();
        cancelHeavyTask.mockReset();
    });
    afterEach(() => { document.body.innerHTML = ''; });

    it('warns of the 257 levels of an interval of 1 on a range of 145 to 402', async () => {
        const w = open();
        await flushPromises();

        expect(text('[data-testid="contour-levels-warning"]')).toContain('About 257 contour levels');
        w.unmount();
    });

    it('does not warn for an interval of 50 (6 levels), and Generate starts at once', async () => {
        const w = open();
        await flushPromises();
        w.vm.interval = 50;
        await flushPromises();

        expect(document.querySelector('[data-testid="contour-levels-warning"]')).toBeNull();
        button('Generate').click();
        await flushPromises();

        expect(confirm).not.toHaveBeenCalled();
        expect(w.emitted('generate')).toEqual([[expect.objectContaining({ interval: 50, count: null })]]);
        w.unmount();
    });

    it('narrows the estimate with the elevation limits', async () => {
        const w = open();
        await flushPromises();
        w.vm.minElev = 200;
        w.vm.maxElev = 300;
        await flushPromises();

        expect(text('[data-testid="contour-levels-warning"]')).toContain('About 100 contour levels');
        w.unmount();
    });

    it('does not warn for a target count of 50 or fewer', async () => {
        const w = open();
        await flushPromises();
        w.vm.mode = 'count';
        w.vm.count = 50;
        await flushPromises();

        expect(document.querySelector('[data-testid="contour-levels-warning"]')).toBeNull();
        button('Generate').click();
        await flushPromises();
        expect(confirm).not.toHaveBeenCalled();
        expect(w.emitted('generate')).toEqual([[expect.objectContaining({ interval: null, count: 50 })]]);
        w.unmount();
    });

    it('warns of a target count of more than 50 levels, and asks before the run', async () => {
        const w = open();
        await flushPromises();
        w.vm.mode = 'count';
        w.vm.count = 120;
        await flushPromises();

        expect(text('[data-testid="contour-levels-warning"]')).toContain('About 120 contour levels. A large raster');
        confirm.mockResolvedValueOnce(true);
        button('Generate').click();
        await flushPromises();
        expect(confirm).toHaveBeenCalledOnce();
        expect(confirm.mock.calls[0][0].message).toContain('Use fewer levels');
        expect(w.emitted('generate')).toEqual([[expect.objectContaining({ interval: null, count: 120 })]]);
        w.unmount();
    });

    it('asks before a run of more than 50 levels, and starts it only when the user confirms', async () => {
        const w = open();
        await flushPromises();

        confirm.mockResolvedValueOnce(false);
        button('Generate').click();
        await flushPromises();
        expect(confirm).toHaveBeenCalledOnce();
        expect(confirm.mock.calls[0][0]).toMatchObject({ confirmText: 'Generate', cancelText: 'Change settings' });
        expect(confirm.mock.calls[0][0].message).toContain('About 257 contour levels');
        expect(w.emitted('generate')).toBeUndefined();

        confirm.mockResolvedValueOnce(true);
        button('Generate').click();
        await flushPromises();
        expect(confirm).toHaveBeenCalledTimes(2);
        expect(w.emitted('generate')).toEqual([[expect.objectContaining({ interval: 1, baseOffset: 0 })]]);
        w.unmount();
    });

    it('asks once for a double click', async () => {
        const w = open();
        await flushPromises();
        let answer;
        confirm.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));

        button('Generate').click();
        button('Generate').click();
        await flushPromises();
        expect(confirm).toHaveBeenCalledOnce();
        answer(true);
        await flushPromises();

        expect(w.emitted('generate')).toHaveLength(1);
        w.unmount();
    });

    it('shows the task with its phase, its percent and a Cancel, and nothing covers the dialog', async () => {
        const task = { taskId: 't1', toolId: 'raster-contours', state: 'Processing', percent: 42, phase: 'levels' };
        const w = open({ loading: true, task, dataset: { name: 'ds' } });
        await flushPromises();

        expect(text('[data-testid="heavy-task-status"]')).toContain('levels');
        expect(text('[data-testid="heavy-task-status"]')).toContain('42%');
        expect(document.querySelector('.contour-gen-overlay')).toBeNull();
        expect(button('Generate').disabled, 'the dialog is busy: no second request').toBe(true);

        document.querySelector('[data-testid="heavy-task-cancel"]').click();
        expect(cancelHeavyTask).toHaveBeenCalledWith(task, 'Contour lines');
        w.unmount();
    });

    it('shows a failed task with the message of the server, and the options stay editable', async () => {
        const task = { taskId: 't1', toolId: 'raster-contours', state: 'Failed', error: 'Canceled by the cancel token' };
        const w = open({ loading: false, task });
        await flushPromises();

        expect(text('[data-testid="heavy-task-error"]')).toBe('Canceled by the cancel token');
        expect(document.querySelector('[data-testid="heavy-task-cancel"]')).toBeNull();
        expect(button('Generate').disabled).toBe(false);
        w.unmount();
    });

    it('shows why a request has no task', async () => {
        const w = open({ error: "'minElev' must be less than 'maxElev'" });
        await flushPromises();

        expect(text('[data-testid="contour-error"]')).toBe("'minElev' must be less than 'maxElev'");
        w.unmount();
    });
});
