/**
 * The Properties window (FR-EXP-25): the dataset root shows readable rows and keeps its raw metadata behind a toggle; a
 * selection of several items has a window of the size of its content and lists the names with the selection summary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';
import EntryProperties from './EntryProperties.vue';
import { useDatasetSessionStore } from '@/stores/datasetSession';

vi.mock('@/libs/api/sharedRegistry', () => ({ default: { isLoggedIn: () => true, features: { get: () => false, value: () => null } } }));

const T = ddb.entry.type;
const WindowStub = {
    props: ['sizeClass', 'fixedSize', 'height', 'width'],
    template: '<div class="window-stub" :data-size-class="sizeClass" :data-fixed="fixedSize" :data-height="height" :data-width="width"><slot /></div>'
};
const root = {
    label: 'T Explorer Copy', path: 'ddb://h/o/d',
    entry: {
        path: 'ddb://h/o/d', type: T.DRONEDB, size: 42050000, mtime: 1700000000,
        properties: { entries: 16, meta: { name: { id: 'aa11-guid', data: 'T Explorer Copy', mtime: 1700000000 }, visibility: { id: 'bb22-guid', data: 1, mtime: 1700000000 } } }
    }
};
const file = name => ({ label: name, path: `ddb://h/o/d/${name}`, entry: { path: name, type: T.IMAGE, size: 1048576 } });

let wrapper;
let pinia;
const mountWith = files => {
    wrapper = mount(EntryProperties, { props: { files }, attachTo: document.body, global: { plugins: [PrimeVue, pinia], stubs: { Window: WindowStub } } });
    return flushPromises();
};
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('EntryProperties of the dataset root', () => {
    it('shows Visibility: Unlisted and the name, and no id', async () => {
        await mountWith([root]);
        const rows = wrapper.findAll('tbody tr').map(tr => tr.findAll('td').map(td => td.text()));
        expect(rows).toContainEqual(['Visibility', 'Unlisted']);
        expect(rows).toContainEqual(['Name', 'T Explorer Copy']);
        expect(wrapper.text()).not.toContain('guid');
    });

    it('shows a Created row once the page has read the creation date of the dataset, and the entry count with its number format', async () => {
        useDatasetSessionStore().setCreationDate('2026-03-04T10:30:15Z');
        await mountWith([root]);
        const rows = wrapper.findAll('tbody tr').map(tr => tr.findAll('td').map(td => td.text()));
        expect(rows.map(r => r[0])).toContain('Created');
        expect(rows.find(r => r[0] === 'Created')[1]).toMatch(/2026/);
        expect(rows).toContainEqual(['Entries', '16']);
    });

    it('has no Created row before the creation date is read', async () => {
        await mountWith([root]);
        expect(wrapper.findAll('tbody tr').map(tr => tr.findAll('td')[0].text())).not.toContain('Created');
    });

    it('shows the raw metadata on request, and hides it again', async () => {
        await mountWith([root]);
        const toggle = () => wrapper.find('button.raw-toggle');
        expect(toggle().text()).toBe('Show raw metadata');
        await toggle().trigger('click');
        expect(toggle().text()).toBe('Hide raw metadata');
        expect(toggle().attributes('aria-pressed')).toBe('true');
        expect(wrapper.text()).toContain('aa11-guid');
        await toggle().trigger('click');
        expect(wrapper.text()).not.toContain('aa11-guid');
    });

    it('has no toggle for a file', async () => {
        await mountWith([file('a.jpg')]);
        expect(wrapper.find('button.raw-toggle').exists()).toBe(false);
    });
});

describe('EntryProperties of several items', () => {
    const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg', 'g.jpg'].map(file);

    it('is a window of the size of its content, not the 80 % one of a single file', async () => {
        await mountWith(files);
        expect(wrapper.find('.window-stub').attributes()).toMatchObject({ 'data-size-class': 'dialog-md', 'data-fixed': 'true' });
        wrapper.unmount();
        await mountWith([file('a.jpg')]);
        expect(wrapper.find('.window-stub').attributes()).toMatchObject({ 'data-fixed': 'false', 'data-height': '80%', 'data-width': '40%' });
    });

    it('lists the first names and how many more, with the count and the total size of the selection summary', async () => {
        await mountWith(files);
        expect(wrapper.find('.multi-count').text()).toBe('7 items selected — 7 MB');
        expect(wrapper.findAll('.multi-names li').map(li => li.text())).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'and 2 more']);
    });
});
