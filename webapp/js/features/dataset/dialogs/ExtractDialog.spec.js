/**
 * Extract Archive (FR-PRC-02): one click starts one task, not forced, so the Registry's dedup and
 * output checks apply; the dialog is busy while it runs, and a refusal (409) shows the server's message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import ExtractDialog from './ExtractDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const runHeavyTask = vi.fn();
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask }) }));

const WindowStub = {
    props: ['confirmLabel', 'confirmDisabled', 'busy'],
    emits: ['confirm', 'close'],
    template: '<div><slot /><button data-confirm :disabled="confirmDisabled || busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

function open() {
    const dataset = { list: vi.fn(async () => [{ path: 'archives', type: ddb.entry.type.DIRECTORY }]) };
    const w = mount(ExtractDialog, {
        props: { file: { entry: { path: 'archives/a.zip' } }, dataset },
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub, FolderPicker: true } }
    });
    return { w, dataset };
}

describe('ExtractDialog submit', () => {
    beforeEach(() => { runHeavyTask.mockReset(); });

    it('starts one task on a double click, without force, and is busy while it runs', async () => {
        runHeavyTask.mockImplementation(() => new Promise(() => {}));
        const { w } = open();
        await flushPromises();

        const window = w.findComponent(WindowStub);
        window.vm.$emit('confirm');
        window.vm.$emit('confirm');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        const [, toolId, options] = runHeavyTask.mock.calls[0];
        expect(toolId).toBe('archive-extract');
        expect(options.force).toBeUndefined();
        expect(options.params).toMatchObject({ sourcePath: 'archives/a.zip', destPath: 'archives', overwrite: false });
        expect(window.props('busy')).toBe(true);
    });

    it('shows the message of a refusal and submits nothing more', async () => {
        runHeavyTask.mockRejectedValue(new ApiError("A file or folder named 'a.txt' already exists in this folder", 409,
            { conflictPath: 'archives/a.txt' }));
        const { w } = open();
        await flushPromises();

        await w.find('[data-confirm]').trigger('click');
        await flushPromises();

        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(w.text()).toContain("A file or folder named 'a.txt' already exists in this folder");
        expect(w.findComponent(WindowStub).props('busy')).toBe(false);
    });
});
