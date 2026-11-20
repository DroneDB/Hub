/**
 * SplatInfoPanel (FR-VWR-22): the About panel documents the budget of the paged splats and what
 * Spark holds, and follows the pager while it is open.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SplatInfoPanel from './SplatInfoPanel.vue';
import { pagedSplatBudget } from './splatMemory';

const tick = vi.hoisted(() => ({ fn: null }));
vi.mock('@/libs/clock', () => ({ onTick: fn => { tick.fn = fn; return () => { tick.fn = null; }; } }));

let wrapper;
afterEach(() => { wrapper?.unmount(); wrapper = null; });

const info = { entry: { path: 'a.rad', properties: { splatCount: 2500000, shDegree: 3 } }, bounds: null, scale: { metersPerUnit: 1, unit: 'm' }, streaming: true };
const rowsOf = () => Object.fromEntries([...wrapper.element.querySelectorAll('dt')].map((dt, i) => [dt.textContent, wrapper.element.querySelectorAll('dd')[i].textContent]));

describe('SplatInfoPanel memory rows', () => {
    it('shows the budget from the 4 GB device, and what is in use after a tick', async () => {
        const budget = pagedSplatBudget({ memoryGb: 4, mobile: false, shDegree: 3 });
        let pager = null;
        wrapper = mount(SplatInfoPanel, {
            props: { info, readMemory: () => ({ budget, reported: false, pager, heapBytes: null }) }
        });
        expect(rowsOf()['Splat memory budget']).toBe('816 MB (68 pages, 4 GB device, assumed: the browser does not report it)');
        expect(rowsOf()['Splat memory in use']).toBe('Nothing allocated yet');

        pager = { bytes: 855638016, pages: 5, maxPages: 68 };
        tick.fn();
        await wrapper.vm.$nextTick();
        expect(rowsOf()['Splat memory in use']).toBe('816 MB of 816 MB, 5 of 68 pages filled');
    });

    it('has no memory rows before the stage exists', () => {
        wrapper = mount(SplatInfoPanel, { props: { info } });
        expect(Object.keys(rowsOf())).not.toContain('Splat memory budget');
    });
});
