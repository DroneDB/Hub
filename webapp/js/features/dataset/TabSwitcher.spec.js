import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TabSwitcher from './TabSwitcher.vue';

const tabs = [{ label: 'Files', key: 'explorer', icon: 'fa-regular fa-folder' }, { label: 'Map', key: 'map', icon: 'fa-solid fa-map' }];
const mountTabs = () => mount(TabSwitcher, {
    props: { tabs },
    slots: { explorer: '<p>files</p>', map: '<p>map</p>' },
    global: { plugins: [PrimeVue] }
});

describe('TabSwitcher', () => {
    it('activates a tab given in the props by key', async () => {
        const w = mountTabs();
        expect(w.vm.activeTab).toBe('explorer');
        w.vm.activateTab('map');
        expect(w.vm.activeTab).toBe('map');
        expect(w.emitted('tabChange').at(-1)).toEqual(['map']);
        w.unmount();
    });

    it('names a tab by its label alone: the icon glyph is hidden from screen readers', () => {
        const w = mount(TabSwitcher, {
            props: { tabs: [...tabs, { label: 'Settings', key: 'settings', icon: 'fa-solid fa-gear', hideLabel: true }] },
            global: { plugins: [PrimeVue] }
        });
        const strip = w.findAll('[role="tab"]');
        expect(strip.map(t => t.find('i').attributes('aria-hidden'))).toEqual(['true', 'true', 'true']);
        expect(strip[1].text()).toBe('Map');
        expect(strip[1].attributes('aria-label')).toBeUndefined();
        // A tab without its label is named by it all the same
        expect(strip[2].attributes('aria-label')).toBe('Settings');
        w.unmount();
    });

    it('ignores an unknown key', () => {
        const w = mountTabs();
        w.vm.activateTab('nope');
        expect(w.vm.activeTab).toBe('explorer');
        w.unmount();
    });
});
