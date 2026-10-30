/**
 * The button beside the List/Map switch counts the datasets that have no location and opens a
 * window that lists them, each row a link to its dataset, searchable when there are many.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import UnlocatedDatasetsButton from './UnlocatedDatasetsButton.vue';

const group = (org, datasets, orgName) => ({ org, orgName, datasets });
const ds = (slug, bbox, name) => ({ slug, name, bbox });
const unlocated = count => Array.from({ length: count }, (_, i) => ds(`ds-${i}`, null, `Dataset ${i}`));

const stubs = {
    HubWindow: { template: '<div class="window"><slot /></div>' },
    Window: { template: '<div class="window"><slot /></div>' },
    // jsdom has no layout, so the real scroller renders no row
    VirtualScroller: { props: ['items'], template: '<div class="rows"><template v-for="(item, index) in items" :key="index"><slot :item="item" :index="index" /></template></div>' },
    RouterLink: { props: ['to'], template: '<a class="rl" :data-to="JSON.stringify(to)"><slot /></a>' }
};

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

function render(props) {
    wrapper = mount(UnlocatedDatasetsButton, { props, global: { plugins: [PrimeVue], stubs } });
    return wrapper;
}
const openWindow = () => wrapper.find('button').trigger('click');
const names = () => wrapper.findAll('.udb-name').map(e => e.text());

describe('UnlocatedDatasetsButton', () => {
    const groups = [group('acme', [ds('a', [1, 1, 2, 2], 'A'), ds('none', null, 'No place'), ds('zero', [0, 0, 0, 0], null)], 'Acme')];

    it('shows nothing while every dataset has a location', () => {
        render({ groups: [group('a', [ds('a1', [1, 1, 2, 2])])] });
        expect(wrapper.find('button').exists()).toBe(false);
    });

    it('counts the datasets without a location, and opens the window that lists them', async () => {
        render({ groups });
        const button = wrapper.find('button');
        expect(button.text()).toContain('2');
        expect(button.attributes('aria-label')).toBe('2 datasets have no location');
        expect(wrapper.find('.window').exists()).toBe(false);

        await openWindow();
        expect(names()).toEqual(['No place', 'zero']);
        expect(JSON.parse(wrapper.find('.rl').attributes('data-to'))).toEqual({ name: 'ViewDataset', params: { org: 'acme', ds: 'none' } });
    });

    it('shows the slug when the name is not it, and the organization only when asked', async () => {
        render({ groups });
        await openWindow();
        expect(wrapper.findAll('.udb-row').map(row => row.find('.udb-detail').exists() ? row.find('.udb-detail').text() : null)).toEqual(['none', null]);

        await wrapper.setProps({ showOrganization: true });
        expect(wrapper.findAll('.udb-detail').map(e => e.text())).toEqual(['Acme · none', 'Acme']);
    });

    it('follows the groups as they arrive', async () => {
        render({ groups: [] });
        expect(wrapper.find('button').exists()).toBe(false);
        await wrapper.setProps({ groups });
        expect(wrapper.find('button').attributes('aria-label')).toBe('2 datasets have no location');
    });

    it('closes the window when a dataset is opened', async () => {
        render({ groups });
        await openWindow();
        await wrapper.find('.rl').trigger('click');
        expect(wrapper.find('.window').exists()).toBe(false);
    });

    it('searches by name, slug or organization once the list is long', async () => {
        render({ groups: [group('acme', unlocated(3), 'Acme')] });
        await openWindow();
        expect(wrapper.find('input').exists()).toBe(false);
        wrapper.unmount();

        render({ groups: [group('acme', unlocated(7), 'Acme'), group('beta', [ds('roof', null, 'Roof')], 'Beta Corp')], showOrganization: true });
        await openWindow();
        const search = wrapper.find('input');
        await search.setValue('dataset 6');
        expect(names()).toEqual(['Dataset 6']);
        await search.setValue('ds-1');
        expect(names()).toEqual(['Dataset 1']);
        await search.setValue('beta');
        expect(names()).toEqual(['Roof']);
        await search.setValue('nothing like it');
        expect(names()).toEqual([]);
        expect(wrapper.text()).toContain('No datasets match');
    });
});
