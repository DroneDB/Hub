import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PathBreadcrumb from './PathBreadcrumb.vue';
import SortHeader from './SortHeader.vue';
import ColormapDropdown from './ColormapDropdown.vue';
import HistogramChart from './HistogramChart.vue';
import RasterProfileChart from '@/features/viewers/map/RasterProfileChart.vue';
import pathutils from '@/libs/ddb/pathutils';

describe('pathutils.crumbs', () => {
    it('lists the folders of a relative path, outermost first', () => {
        expect(pathutils.crumbs('')).toEqual([]);
        expect(pathutils.crumbs('a/b')).toEqual([{ name: 'a', path: 'a' }, { name: 'b', path: 'a/b' }]);
        expect(pathutils.crumbs('/a//b/')).toEqual([{ name: 'a', path: 'a' }, { name: 'b', path: 'a/b' }]);
    });
});

describe('PathBreadcrumb', () => {
    it('shows nothing at the root', () => {
        expect(mount(PathBreadcrumb, { props: { path: '' } }).find('nav, .p-breadcrumb').exists()).toBe(false);
    });

    it('makes every folder but the current one a button that navigates', async () => {
        const w = mount(PathBreadcrumb, { props: { path: 'a/b/c', rootPath: '/' } });
        const buttons = w.findAll('button');
        expect(buttons.map(b => b.text() || b.attributes('aria-label'))).toEqual(['Root folder', 'a', 'b']);
        expect(w.find('[aria-current="location"]').text()).toBe('c');
        await buttons[0].trigger('click');
        await buttons[2].trigger('click');
        expect(w.emitted('navigate')).toEqual([['/'], ['a/b']]);
    });
});

describe('SortHeader', () => {
    it('is a button that emits its column and names the sort state', async () => {
        const w = mount(SortHeader, { props: { label: 'Name', column: 'name', sortColumn: 'size' } });
        expect(w.element.tagName).toBe('BUTTON');
        expect(w.attributes('aria-label')).toBe('Sort by Name');
        await w.setProps({ sortColumn: 'name', direction: 'desc' });
        expect(w.attributes('aria-label')).toBe('Name, sorted descending');
        await w.trigger('click');
        expect(w.emitted('sort')).toEqual([['name']]);
    });
});

describe('ColormapDropdown', () => {
    const colormaps = [{ id: 'gray', name: 'Gray', colors: ['#000', '#fff'] }, 'viridis', 'magma'];

    it('opens on ArrowDown, moves with the arrows and picks with Enter', async () => {
        const w = mount(ColormapDropdown, { props: { colormaps, modelValue: 'gray' }, attachTo: document.body });
        const trigger = w.find('button');
        expect(trigger.attributes('aria-expanded')).toBe('false');
        await trigger.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();
        const list = w.find('[role="listbox"]');
        expect(trigger.attributes('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(list.element);
        expect(list.attributes('aria-activedescendant')).toBe(w.findAll('[role="option"]')[0].attributes('id'));
        await list.trigger('keydown', { key: 'ArrowDown' });
        await list.trigger('keydown', { key: 'Enter' });
        expect(w.emitted('update:modelValue')).toEqual([['viridis']]);
        expect(w.find('[role="listbox"]').exists()).toBe(false);
        expect(document.activeElement).toBe(trigger.element);
        w.unmount();
    });

    it('closes on Escape without choosing', async () => {
        const w = mount(ColormapDropdown, { props: { colormaps }, attachTo: document.body });
        await w.find('button').trigger('click');
        await nextTick();
        await w.find('[role="listbox"]').trigger('keydown', { key: 'Escape' });
        expect(w.find('[role="listbox"]').exists()).toBe(false);
        expect(w.emitted('update:modelValue')).toBeUndefined();
        w.unmount();
    });
});

describe('HistogramChart', () => {
    const mountChart = () => mount(HistogramChart, {
        props: { data: { counts: [1, 2, 3], edges: [0, 50, 100] }, min: 10, max: 90 },
        global: { stubs: { Chart: true } }
    });

    it('has two keyboard sliders that apply the range when the key is released', async () => {
        const w = mountChart();
        const [min, max] = w.findAll('[role="slider"]');
        expect(min.attributes('aria-label')).toBe('Range minimum');
        expect(min.attributes('aria-valuenow')).toBe('10');
        await min.trigger('keydown', { key: 'ArrowRight' });
        await min.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
        expect(min.attributes('aria-valuenow')).toBe('21');
        expect(w.emitted('update:range')).toBeUndefined();
        await min.trigger('keyup', { key: 'ArrowRight' });
        expect(w.emitted('update:range')).toEqual([[{ min: 21, max: 90 }]]);
        // The handles keep 1% apart and stay in the data range
        await min.trigger('keydown', { key: 'End' });
        await max.trigger('keydown', { key: 'End' });
        expect(Number(min.attributes('aria-valuenow'))).toBe(89);
        expect(Number(max.attributes('aria-valuenow'))).toBe(100);
    });
});

describe('RasterProfileChart', () => {
    const profile = {
        totalLength: 20, min: 1, max: 3, mean: 2,
        samples: [{ distance: 0, value: 1 }, { distance: 10, value: 3 }, { distance: 20, value: null }]
    };

    it('is a slider over the samples: focus, arrows and End pick one, blur clears it', async () => {
        const w = mount(RasterProfileChart, { props: { profile } });
        const svg = w.find('svg');
        expect(svg.attributes('role')).toBe('slider');
        await svg.trigger('focus');
        await svg.trigger('keydown', { key: 'ArrowRight' });
        await svg.trigger('keydown', { key: 'End' });
        await svg.trigger('blur');
        expect(w.emitted('activeSample').map(([s]) => s && s.distance)).toEqual([0, 10, 20, null]);
    });

    it('clears the map marker when the pointer leaves', async () => {
        const w = mount(RasterProfileChart, { props: { profile } });
        await w.find('svg').trigger('focus');
        await w.find('svg').trigger('mouseleave');
        expect(w.emitted('activeSample').at(-1)).toEqual([null]);
    });
});
