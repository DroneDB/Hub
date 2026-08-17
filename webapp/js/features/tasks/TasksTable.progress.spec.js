/**
 * Tests for the Progress column rendering rules in TasksTable.vue:
 * which states render a bar, with what value and what mode, and a DOM-level
 * check that PrimeVue renders the result as expected.
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import ProgressBar from 'primevue/progressbar';
import TasksTable from './TasksTable.vue';

const { progressKind, progressValue, barMode } = TasksTable.methods;
const render = (task) => ({ kind: progressKind(task), value: progressValue(task), mode: barMode(task) });

/**
 * Mounts a real PrimeVue ProgressBar with the given props and keeps it mounted.
 * Returns { el, cleanup } — call cleanup() after asserting; unmounting first
 * would wipe the DOM under test.
 */
async function mountBar(props) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp({ render: () => h(ProgressBar, props) });
    app.mount(el);
    await nextTick();
    return {
        el,
        cleanup() {
            app.unmount();
            el.remove();
        }
    };
}

describe('progress rendering rules', () => {
    it('Succeeded renders a determinate 100% bar', () => {
        expect(render({ state: 'Succeeded', progressPercent: 100 })).toEqual({
            kind: 'bar', value: 100, mode: 'determinate'
        });
        // even if the tool never reported a percent before finishing
        expect(render({ state: 'Succeeded', progressPercent: null })).toEqual({
            kind: 'bar', value: 100, mode: 'determinate'
        });
    });

    it('Failed renders a determinate 100% bar (with error text shown separately in the cell)', () => {
        expect(render({ state: 'Failed', progressPercent: 37, errorType: 'JobAbortedException' })).toEqual({
            kind: 'bar', value: 100, mode: 'determinate'
        });
    });

    it('Processing without a real percent renders indeterminate', () => {
        expect(render({ state: 'Processing', progressPercent: null })).toEqual({
            kind: 'bar', value: 0, mode: 'indeterminate'
        });
        expect(render({ state: 'Processing', progressPercent: 0 })).toEqual({
            kind: 'bar', value: 0, mode: 'indeterminate'
        });
    });

    it('Processing with a real percent renders determinate at that percent', () => {
        expect(render({ state: 'Processing', progressPercent: 42 })).toEqual({
            kind: 'bar', value: 42, mode: 'determinate'
        });
    });

    it('queued states render no bar', () => {
        for (const state of ['Created', 'Enqueued', 'Scheduled', 'Reused', 'Awaiting']) {
            expect(progressKind({ state, progressPercent: null })).toBe('none');
        }
    });

    it('Deleted (cancelled) renders no bar', () => {
        expect(progressKind({ state: 'Deleted' })).toBe('none');
    });
});

describe('PrimeVue ProgressBar DOM rendering', () => {
    it('determinate 100 renders a full-width fill and a "100%" label', async () => {
        const { el, cleanup } = await mountBar({ value: 100, mode: 'determinate', showValue: true });
        try {
            const fill = el.querySelector('.p-progressbar-value');
            expect(fill, 'determinate fill must exist').toBeTruthy();
            expect(fill.style.width).toBe('100%');
            const label = el.querySelector('.p-progressbar-label');
            expect(label, '100% label must exist').toBeTruthy();
            expect(label.textContent).toBe('100%');
        } finally {
            cleanup();
        }
    });

    it('indeterminate renders a fill with no width and no label, regardless of value', async () => {
        const { el, cleanup } = await mountBar({ value: 100, mode: 'indeterminate', showValue: true });
        try {
            const fill = el.querySelector('.p-progressbar-value');
            expect(fill, 'indeterminate fill must exist').toBeTruthy();
            expect(fill.style.width).toBe('');
            expect(el.querySelector('.p-progressbar-label'), 'indeterminate must have no label').toBeNull();
        } finally {
            cleanup();
        }
    });

    it('determinate 0 renders an empty fill and no label', async () => {
        const { el, cleanup } = await mountBar({ value: 0, mode: 'determinate', showValue: true });
        try {
            const fill = el.querySelector('.p-progressbar-value');
            expect(fill, 'determinate fill must exist').toBeTruthy();
            expect(fill.style.width).toBe('0%');
            expect(el.querySelector('.p-progressbar-label'), '0 must have no label').toBeNull();
        } finally {
            cleanup();
        }
    });
});
