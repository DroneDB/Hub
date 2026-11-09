/**
 * Tests for the Progress column rendering rules in TasksTable.vue:
 * which states render a bar, with what value and what mode, and a DOM-level
 * check that PrimeVue renders the result as expected.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ProgressBar from 'primevue/progressbar';

const reg = vi.hoisted(() => ({ features: { value: () => [] } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksTable } = await import('./TasksTable.vue');

const { progressKind, progressValue, barMode } = TasksTable.methods;
const render = (task) => ({ kind: progressKind(task), value: progressValue(task), mode: barMode(task) });

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

    it('Failed renders no bar: a Failed tag and the error instead (TasksTable.failed.spec)', () => {
        expect(progressKind({ state: 'Failed', progressPercent: 37, errorType: 'JobAbortedException' })).toBe('failed');
        expect(progressKind({ state: 'Failed', progressPercent: 100, error: 'The file is damaged' })).toBe('failed');
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

    it('queued states render no bar: the label of their state (FR-PRC-42)', () => {
        for (const state of ['Created', 'Enqueued', 'Scheduled', 'Reused', 'Awaiting']) {
            expect(progressKind({ state, progressPercent: null })).toBe('queued');
        }
    });

    it('Deleted (cancelled) renders no bar', () => {
        expect(progressKind({ state: 'Deleted' })).toBe('none');
    });
});

describe('PrimeVue ProgressBar DOM rendering', () => {
    it('determinate 100 renders a full-width fill and a "100%" label', () => {
        const wrapper = mount(ProgressBar, { props: { value: 100, mode: 'determinate', showValue: true } });
        const el = wrapper.element;
        const fill = el.querySelector('.p-progressbar-value');
        expect(fill, 'determinate fill must exist').toBeTruthy();
        expect(fill.style.width).toBe('100%');
        const label = el.querySelector('.p-progressbar-label');
        expect(label, '100% label must exist').toBeTruthy();
        expect(label.textContent).toBe('100%');
        wrapper.unmount();
    });

    it('indeterminate renders a fill with no width and no label, regardless of value', () => {
        const wrapper = mount(ProgressBar, { props: { value: 100, mode: 'indeterminate', showValue: true } });
        const el = wrapper.element;
        const fill = el.querySelector('.p-progressbar-value');
        expect(fill, 'indeterminate fill must exist').toBeTruthy();
        expect(fill.style.width).toBe('');
        expect(el.querySelector('.p-progressbar-label'), 'indeterminate must have no label').toBeNull();
        wrapper.unmount();
    });

    it('determinate 0 renders an empty fill and no label', () => {
        const wrapper = mount(ProgressBar, { props: { value: 0, mode: 'determinate', showValue: true } });
        const el = wrapper.element;
        const fill = el.querySelector('.p-progressbar-value');
        expect(fill, 'determinate fill must exist').toBeTruthy();
        expect(fill.style.width).toBe('0%');
        expect(el.querySelector('.p-progressbar-label'), '0 must have no label').toBeNull();
        wrapper.unmount();
    });
});

describe('the Progress column of a row', () => {
    const base = { toolId: 'build', version: '1', createdAt: '2026-10-31T00:58:56Z' };
    let wrapper;
    afterEach(() => wrapper?.unmount());

    const progressOf = task => {
        wrapper = mount(TasksTable, { props: { tasks: [{ ...base, taskId: 't', ...task }], rows: 10 }, global: { plugins: [PrimeVue] } });
        return wrapper.findAll('tbody tr')[0].find('.col-progress');
    };

    it('shows 5 % as text of its own, next to a bar without a label (FR-PRC-39)', () => {
        const progress = progressOf({ state: 'Processing', progressPercent: 5, phaseMessage: 'opensfm' });

        expect(progress.find('.task-percent').text()).toBe('5%');
        expect(progress.find('.p-progressbar-label').exists()).toBe(false);
        expect(progress.find('.p-progressbar-value').attributes('style')).toContain('width: 5%');
        expect(progress.text()).toContain('opensfm');
    });

    it('shows no percent text for a bar that has none (indeterminate)', () => {
        expect(progressOf({ state: 'Processing', progressPercent: null }).find('.task-percent').exists()).toBe(false);
    });

    it('shows an Enqueued build with the label of its state and what it waits behind (FR-PRC-42)', () => {
        const progress = progressOf({ state: 'Enqueued', path: 'small.tif', phaseMessage: 'Waiting behind orthos/big.tif' });

        expect(progress.find('.p-tag').text()).toBe('Enqueued');
        expect(progress.find('.queued-reason').text()).toBe('Waiting behind orthos/big.tif');
        expect(progress.find('.p-progressbar').exists()).toBe(false);
    });

    it('shows the count of the builds folded under a task (FR-PRC-26)', () => {
        wrapper = mount(TasksTable, {
            props: { tasks: [{ ...base, toolId: 'photogrammetry', taskId: 'pg', state: 'Succeeded', childBuilds: { total: 9, active: 0 } }], rows: 10 },
            global: { plugins: [PrimeVue] }
        });

        expect(wrapper.find('.child-builds').text()).toBe('9 builds');
    });
});
